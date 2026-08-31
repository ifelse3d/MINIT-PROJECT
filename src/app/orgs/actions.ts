"use server";

// Server actions for organisation management (Phase 7).
//
// WHY THE SERVICE-ROLE CLIENT APPEARS HERE: a brand-new user cannot INSERT
// into orgs/members_roles themselves (no RLS insert policy on orgs — on
// purpose), because they are not a member of anything yet. So the server
// verifies the session first, then does the insert with the service key.
// PDPA: nothing here is ever logged.
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/db/supabase";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { setActiveOrgCookie } from "@/lib/active-org";
import { planById } from "@/lib/plans";

export type OrgActionState = { error: string | null; ok: boolean };

// ---------------------------------------------------------------------------
// P0-3 — HOW MANY ORGANISATIONS ONE ACCOUNT MAY CREATE.
//
// Every org carries its own `monthly_free_quota` (15 AI actions since
// migration 20260901000000 — J 2026-08-25): creating orgs in a loop would
// mint free AI, so creation is capped.
//
// §1-14 (work order 69, J 2026-08-29 深夜拍板): the old "at most 3 root orgs,
// counted through members_roles" check was BLOCKING people it should not have
// (J's three orgs sit under three different accounts and it refused anyway).
// Per J: rip it out without diagnosing it, and replace it with the simplest
// possible rule — a FREE account creates ONE top-level organisation, counted
// by orgs.created_by (one query, no clever logic). A second root needs a paid
// plan, activated by a human (the same road as plan activation). Being
// INVITED into somebody else's organisation never affects it, because an
// invite never writes created_by. Branches are untouched (HQ+cawangan is the
// pilot's core).
//
// The overall administered-orgs cap (20, branches included) stays: it is the
// anti-abuse guard on the free-AI loop, not the rule that misfired.
// ---------------------------------------------------------------------------
// NOT exported: a "use server" module may only export async functions, and
// `next build` is the only one of the four gates that catches it (tsc and
// vitest both pass). If another file ever needs these numbers, they move to a
// plain module — they do not get an `export` here.
const MAX_ORGS_PER_USER = 20;

const ERR = {
  login:
    "Sila log masuk semula / 请重新登入 / Please log in again",
  name:
    "Nama pertubuhan diperlukan / 请填写机构名称 / Organisation name is required",
  notAdmin:
    "Hanya pentadbir pertubuhan induk boleh menambah cawangan / 只有总机构的管理员才能添加分会 / Only an administrator of the parent organisation can add a branch",
  failed:
    "Tidak berjaya — cuba lagi / 没有成功 —— 请再试一次 / Something went wrong — please try again",
  // §1-14: the free plan opens ONE root org; more is a paid-plan conversation.
  needPaidForMoreRoots:
    "Akaun percuma boleh membuka SATU pertubuhan induk sahaja. Untuk pertubuhan kedua, perlukan pelan berbayar — hubungi MinitAI. / " +
    "免费帐号只能开 1 个总机构。要开第二个需要付费方案 —— 请联络 MinitAI。 / " +
    "A free account can create ONE top-level organisation. A second needs a paid plan — contact MinitAI.",
  receiptPrefix:
    "Guna 2 hingga 8 huruf besar atau nombor, bermula dengan huruf (contoh: PSHKL) / " +
    "请用 2 至 8 个大写英文字母或数字，第一个要是字母（例如：PSHKL） / " +
    "Use 2 to 8 capital letters or digits, starting with a letter (e.g. PSHKL)",
  receiptFrozen:
    "Pertubuhan ini sudah mengeluarkan resit, jadi huruf resit tidak boleh ditukar lagi / " +
    "这个机构已经开过收据了，收据字号不能再改 / " +
    "This organisation has already issued receipts, so the receipt letters can no longer be changed",
  tooManyOrgs:
    `Akaun ini sudah menguruskan ${MAX_ORGS_PER_USER} pertubuhan dan cawangan — itu hadnya. Hubungi kami untuk menaikkannya. / ` +
    `这个帐号管理的机构与分会已经有 ${MAX_ORGS_PER_USER} 个，到上限了。需要提高请联络我们。 / ` +
    `This account already administers ${MAX_ORGS_PER_USER} organisations and branches, which is the limit. Contact us to raise it.`,
};

/**
 * Every org this caller administers, at any depth — the same function the RLS
 * policies use, so this can never disagree with what they can actually reach.
 *
 * Returns `null` when the answer could not be established (env not configured,
 * RPC error). `null` is NOT "none": callers must decide what to do about not
 * knowing, and the only safe default is to refuse.
 */
async function adminOrgIdsForCaller(): Promise<Set<number> | null> {
  try {
    const userClient = await getSupabaseServer();
    const { data, error } = await userClient.rpc("accessible_orgs_admin");
    if (error) return null;
    const rows = (data ?? []) as unknown[];
    return new Set(
      rows.map((row) =>
        typeof row === "number"
          ? row
          : Number(Object.values(row as Record<string, unknown>)[0]),
      ),
    );
  } catch {
    return null;
  }
}

// setActiveOrgCookie moved to lib/active-org.ts (K-4) — one copy, shared
// with the invite-code join path.

/**
 * Rename an organisation to the name printed in its own constitution.
 *
 * 2026-08-22, J: "這個不是在 PERLEMBAGAAN 也有那個 NGO 的注冊名字嗎？那不是更好
 * 讓他們直接 UPLOAD，然後給他們看，有什麽要改的才改。"
 *
 * The name typed at sign-up is what somebody remembered; the name in the
 * constitution is the one ROS registered, and it is the one that has to appear
 * on receipts and on the Annual Return. When the two differ, Minit shows both
 * and lets the person pick — this action applies that pick.
 *
 * 🔴 USER-SCOPED CLIENT ON PURPOSE, unlike createOrg above. `orgs_update` (in
 * 20260719000000_phase7_auth_rls.sql) already restricts UPDATE to
 * accessible_orgs_admin(), so RLS is the check — a non-admin's update matches
 * no row and changes nothing. Using the service key here would have meant any
 * signed-in person could rename any society in the database.
 *
 * `name` is the only column touched. The privileged ones (tax status, quota,
 * credits, parent) are guarded by a trigger anyway
 * (20260728000000_lock_org_privileged_columns.sql), which is what makes a
 * plain single-column update safe to expose.
 */
export async function renameOrg(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };

  const raw = String(formData.get("orgId") ?? "");
  if (!/^\d+$/.test(raw)) return { error: ERR.failed, ok: false };
  const orgId = Number(raw);

  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return { error: ERR.name, ok: false };

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("orgs")
    .update({ name })
    .eq("id", orgId)
    .select("id")
    .maybeSingle();
  // No row back = RLS refused (not an admin of this org). Same answer either
  // way: it did not happen. PDPA — nothing logged.
  if (error || !data) return { error: ERR.notAdmin, ok: false };

  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

/**
 * Set the letters this organisation's receipts are numbered with — the "PSH"
 * in PSH-2026-0001.
 *
 * 🔴 EACH BRANCH KEEPS ITS OWN SERIES (J, 2026-08-22: 「我覺得分會各自一套收據，
 * 才能知道是誰發出來的」). That was already true in the database — receipt_no is
 * unique per org_id and issue_receipts() counts within one org — but every org
 * was created with the same default letters, 'MIN', so two branches produced
 * MIN-2026-0001 twice and nothing on the paper said which branch issued it.
 * This is the control that fixes that, and it is why it lives per org rather
 * than per account.
 *
 * 🔴 ONCE A RECEIPT EXISTS, THIS STOPS WORKING — by design, and enforced in the
 * database, not here: `freeze_receipt_series()` in
 * 20260730000000_receipt_series.sql raises an exception on any change after the
 * first receipt. A receipt series is a legal document trail; renumbering it
 * retroactively is how an audit becomes unanswerable. The UI hides the control
 * once receipts exist, and this action still handles the refusal, because the
 * hiding is a courtesy and the trigger is the rule.
 *
 * USER-SCOPED CLIENT, like renameOrg: `orgs_update` restricts UPDATE to
 * accessible_orgs_admin(), so a non-admin matches no row and changes nothing.
 */
export async function setReceiptPrefix(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };

  const raw = String(formData.get("orgId") ?? "");
  if (!/^\d+$/.test(raw)) return { error: ERR.failed, ok: false };
  const orgId = Number(raw);

  // Typed in lower case is the same intent; the check constraint in the
  // migration only accepts capitals, so accept both and store the capitals.
  const prefix = String(formData.get("prefix") ?? "").trim().toUpperCase();
  // Same expression as orgs_receipt_prefix_check. Kept in step deliberately:
  // a client-side rule that is looser than the database's produces an error
  // nobody can act on.
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(prefix)) {
    return { error: ERR.receiptPrefix, ok: false };
  }

  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("orgs")
    .update({ receipt_prefix: prefix })
    .eq("id", orgId)
    .select("id")
    .maybeSingle();

  if (error) {
    // The trigger's message is English-only and mentions the org id, so it is
    // never shown raw (PDPA + it would be unreadable to our users).
    return {
      error: /frozen/i.test(error.message) ? ERR.receiptFrozen : ERR.failed,
      ok: false,
    };
  }
  // No row back = RLS refused: not an admin of this org.
  if (!data) return { error: ERR.notAdmin, ok: false };

  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

/** Switch the org the user is working in. RLS-checked before setting. */
export async function setActiveOrg(formData: FormData): Promise<void> {
  const raw = String(formData.get("orgId") ?? "");
  if (!/^\d+$/.test(raw)) return;
  const orgId = Number(raw);

  // User-scoped client: returns the org only if this user may see it.
  const supabase = await getSupabaseServer();
  const { data: org } = await supabase
    .from("orgs")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return;

  await setActiveOrgCookie(orgId);
  revalidatePath("/", "layout");
}

// 2026-07-29 (P0-1) — `updateOrgCredits` REMOVED ON PURPOSE. DO NOT RE-ADD.
//
// It was a self-service AI-quota grant: the org's own hq_admin set their own
// `extra_credits` balance, which defeated the metering layer entirely.
// Migration `20260728000000_lock_org_privileged_columns.sql` (applied
// 2026-07-29) makes `extra_credits`, `monthly_free_quota`, `tax_exempt_status`
// and `parent_org_id` trigger-protected, so the UPDATE now fails for every
// caller — including a raw browser `PATCH /rest/v1/orgs`. Keeping a server
// action that can only ever fail is an endpoint with no purpose, so it is gone
// and `credit-form.tsx` is display-only.
//
// The one supported way to grant credits (vendor-side, in the SQL editor):
//   select * from minit_admin.grant_ai_credits(<org id>, <delta>);
// Note `service_role` is deliberately NOT granted on `minit_admin.*`, so a
// future admin back-office cannot call it without an explicit decision.

/**
 * Create a new organisation.
 * - Without parentOrgId: a fresh root org; the caller becomes its hq_admin.
 * - With parentOrgId: a branch; caller must be hq_admin over the parent
 *   (their existing HQ role already covers the new branch via the org tree,
 *   so no extra members_roles row is created).
 */
export async function createOrg(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await getSessionUser();
  if (!user) return { error: ERR.login, ok: false };

  const name = String(formData.get("name") ?? "").trim();
  const yourName = String(formData.get("yourName") ?? "").trim();
  const parentRaw = String(formData.get("parentOrgId") ?? "").trim();
  const parentOrgId = /^\d+$/.test(parentRaw) ? Number(parentRaw) : null;
  // B-5 (2026-08-25, 建議①②): what KIND of organisation, and the optional
  // PPM/ROS registration number (printed on official letterheads, C-1).
  const orgTypeRaw = String(formData.get("orgType") ?? "");
  const orgType = orgTypeRaw === "committee" ? "committee" : "registered";
  const ppmNo = String(formData.get("ppmNo") ?? "").trim().slice(0, 64);
  // C-1 (work order 27, 拍板⑤): the plan the person CHOSE. Recording it is
  // all that happens — quotas and features change only when a human activates
  // the plan via the admin path (the privileged-columns trigger blocks any
  // user-side update; this insert runs under service_role, which is the same
  // exemption createOrg already relies on). Anything unexpected → trial.
  const planRaw = String(formData.get("plan") ?? "");
  // "plus" (102 §0-5) rides the same strip-retry ladder as the others: a
  // database whose orgs_plan_check predates migration 42 refuses the value,
  // the ladder drops the column, and the org lands as trial — the wish is
  // re-statable, never a failed signup.
  const plan =
    planRaw === "standard" || planRaw === "plus" || planRaw === "hq"
      ? planRaw
      : "trial";

  if (!name) return { error: ERR.name, ok: false };

  const admin = getSupabase(); // service role — see file header

  // --- P0-3: the caps, before anything is written -------------------------
  // Ask the DATABASE which orgs this caller administers — the same function
  // the RLS policies use, so the answer cannot disagree with what they can
  // actually reach.
  const adminIds = await adminOrgIdsForCaller();

  if (adminIds === null) {
    // We could not establish what this account already administers. A brand
    // new account with no memberships at all is the ONE case where that is
    // expected and harmless (there is nothing to exceed), so their first org
    // still goes through. Anyone else is refused rather than waved past — a
    // cap that fails open is not a cap.
    const { count: memberships } = await admin
      .from("members_roles")
      .select("org_id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((memberships ?? 0) > 0) return { error: ERR.failed, ok: false };
  } else if (adminIds.size >= MAX_ORGS_PER_USER) {
    return { error: ERR.tooManyOrgs, ok: false };
  }

  if (parentOrgId === null) {
    // A ROOT org — §1-14, THE ONE QUERY: how many root orgs did this account
    // CREATE? (created_by, migration 38 — invitations never write it, so
    // being invited anywhere can never affect this count.) The plan of the
    // roots already created decides the allowance (all plans currently 1;
    // a paid second org is activated by a human raising the plan).
    let created: { data: unknown[] | null; error: { message?: string } | null } =
      await admin
        .from("orgs")
        .select("id, plan")
        .eq("created_by", user.id)
        .is("parent_org_id", null);
    if (created.error && /\bplan\b/i.test(created.error.message ?? "")) {
      // Ladder: a database without orgs.plan still counts (plans read trial).
      created = await admin
        .from("orgs")
        .select("id")
        .eq("created_by", user.id)
        .is("parent_org_id", null);
    }
    if (!created.error && created.data) {
      const roots = created.data as { id: number; plan?: string | null }[];
      const allowed = Math.max(
        1,
        ...roots.map((o) => planById((o.plan as string) ?? "trial").maxRootOrgs),
      );
      if (roots.length >= allowed) {
        return { error: ERR.needPaidForMoreRoots, ok: false };
      }
    } else if (
      created.error &&
      !/created_by|schema cache|column/i.test(created.error.message ?? "")
    ) {
      // A real database failure (not "the column is not there yet") — refuse
      // rather than wave past a cap we could not evaluate.
      return { error: ERR.failed, ok: false };
    }
    // created_by missing (migration 38 not applied) = fail-open (D8): the
    // old mis-firing check is GONE either way — J: 拆掉就没得乱. The report
    // tells J loudly that the 1-root rule starts counting once 38 is applied.
  } else {
    // A BRANCH. The caller must administer the parent.
    if (adminIds === null || !adminIds.has(parentOrgId)) {
      return { error: ERR.notAdmin, ok: false };
    }
  }
  // ------------------------------------------------------------------------

  // The org_type/ppm_no columns arrive with migration 20260902000000 and
  // orgs.plan with 20260830000000. Sending a column PostgREST does not know
  // fails the WHOLE insert, so if a migration has not run yet, retry with the
  // columns the database has — creating the organisation must never depend on
  // tomorrow's migration (STATE §6). The dropped values are the safe defaults
  // anyway ('registered' / 'trial'; a plan wish lost this way is re-statable
  // on /settings/plan by contacting us, never silently upgraded).
  const extendedRow: Record<string, unknown> = { name, parent_org_id: parentOrgId };
  if (orgType !== "registered") extendedRow.org_type = orgType;
  if (ppmNo !== "") extendedRow.ppm_no = ppmNo;
  if (plan !== "trial") extendedRow.plan = plan;
  // §1-14 (migration 38): who opened it — what the one-root-per-free-account
  // rule counts. Dropped by the retry below while the DB is behind.
  extendedRow.created_by = user.id;
  let { data: org, error: orgError } = await admin
    .from("orgs")
    .insert(extendedRow)
    .select("id")
    .single();
  if (
    orgError &&
    /org_type|ppm_no|plan|created_by|schema cache/i.test(orgError.message ?? "")
  ) {
    const retry = await admin
      .from("orgs")
      .insert({ name, parent_org_id: parentOrgId })
      .select("id")
      .single();
    org = retry.data;
    orgError = retry.error;
  }
  if (orgError || !org) return { error: ERR.failed, ok: false };

  if (parentOrgId === null) {
    const { error: memberError } = await admin.from("members_roles").insert({
      org_id: org.id,
      user_id: user.id,
      name: yourName || user.email || "hq_admin",
      role: "hq_admin",
    });
    if (memberError) {
      // Don't leave an ownerless org behind.
      await admin.from("orgs").delete().eq("id", org.id);
      return { error: ERR.failed, ok: false };
    }
  }

  await setActiveOrgCookie(org.id);
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}
