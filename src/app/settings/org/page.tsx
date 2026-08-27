import { ROLE_LABEL, labelFor } from "@/lib/status-labels";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Tri } from "@/components/language-provider";
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { dayIsoMalaysia } from "@/lib/history";
import { can } from "@/lib/roles";
import { listInvites, listMembers } from "../member-actions";
import { MembersRows } from "../members-rows";
import { DeleteOrgSection } from "../delete-org-section";
import { DeleteRegisterSection } from "../delete-register-section";
import { EinvoisRows } from "../einvois-rows";
import { ReceiptSeriesRows } from "../receipt-series-rows";
import { SettingsRow, SettingsSection } from "../ui";

// ---------------------------------------------------------------------------
// /settings/org — the ORGANISATION's settings (§1-13, work order 32).
//
// /settings was one 3161px page holding the account, the display, the org,
// members & invites, tax, receipt letters, e-Invois, feedback and two danger
// zones. Split per CLAUDE.md rule 13 (one step, one page):
//   /settings          your account & how the app looks
//   /settings/org      THIS — the organisation: identity, tax, members,
//                      e-Invois switch, receipt letters, glossary, deletes
//   /settings/plan     plan & usage (unchanged)
//   /settings/feedback the feedback channel
// Nothing was deleted in the split — every block of the long page has a new
// home (the old→new mapping is in the work-order report).
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";

const TAX_LABEL: Record<string, { bm: string; zh: string; en: string }> = {
  none: { bm: "Tiada", zh: "无", en: "None" },
  s44_6: {
    bm: "Diluluskan s.44(6)",
    zh: "已获 s.44(6) 批准",
    en: "Approved s.44(6)",
  },
  pure_religious: {
    bm: "Keagamaan semata-mata",
    zh: "纯宗教用途",
    en: "Pure religious",
  },
};

/**
 * The org's receipt letters, and whether they are still changeable.
 * Two cheap reads rather than one join: the count is a HEAD request (no rows
 * come back, so no donor data crosses the wire — Hard Rule 5), and "has this
 * org ever issued a receipt" is exactly the condition freeze_receipt_series()
 * uses, so the UI and the trigger agree by construction.
 */
async function loadReceiptSeries(
  orgId: number,
): Promise<{ prefix: string; frozen: boolean } | null> {
  const supabase = await getSupabaseServer();
  const [{ data: org }, { count }] = await Promise.all([
    supabase.from("orgs").select("receipt_prefix").eq("id", orgId).maybeSingle(),
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId),
  ]);
  if (!org) return null;
  return { prefix: org.receipt_prefix as string, frozen: (count ?? 0) > 0 };
}

export default async function OrgSettingsPage() {
  const active = await getActiveOrg();
  const receiptSeries = active ? await loadReceiptSeries(active.id) : null;
  // B-3: the member & invite card, admins only. Both lists degrade to [] when
  // the invites migration has not run yet; pressing "generate" then says so.
  const isAdmin = active !== null && can(active.role, "manage_org");
  const [members, invites] = isAdmin
    ? await Promise.all([listMembers(active.id), listInvites(active.id)])
    : [[], []];

  return (
    <div className="mx-auto w-full max-w-2xl pb-10">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">
        <Tri bm="Pertubuhan & resit" zh="机构与收据" en="Organisation & receipts" />
      </h1>

      <div className="flex flex-col gap-8">
        <SettingsSection title={<Tri bm="Pertubuhan" zh="机构" en="Organisation" />}>
          <SettingsRow
            label={<Tri bm="Pertubuhan aktif" zh="当前机构" en="Active organisation" />}
            help={
              <Tri
                bm="Nama ini dicetak pada setiap resit, minit dan dokumen rasmi yang Minit hasilkan untuk anda."
                zh="这个名字会印在 Minit 帮您做的每一张收据、每一份会议记录和每一份官方文件上。"
                en="This name is printed on every receipt, minutes document and official document Minit makes for you."
              />
            }
          >
            {active ? (
              <div className="flex flex-col gap-2">
                <p className="flex flex-wrap items-center gap-2 text-base font-medium">
                  {active.name}
                  {active.isDemo && (
                    <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                      DEMO
                    </Badge>
                  )}
                  {active.role && (
                    <span className="text-sm font-normal text-muted-foreground">
                      <Tri {...labelFor(ROLE_LABEL, active.role)} />
                    </span>
                  )}
                </p>
                <Link
                  href="/orgs"
                  className="w-fit text-base underline underline-offset-4"
                >
                  <Tri
                    bm="Tukar pertubuhan, atau tambah cawangan"
                    zh="切换机构，或添加分会"
                    en="Switch organisation, or add a branch"
                  />{" "}
                  →
                </Link>
              </div>
            ) : (
              <Link href="/orgs" className="text-base underline underline-offset-4">
                <Tri
                  bm="Pilih atau cipta pertubuhan dahulu"
                  zh="请先选择或创建组织"
                  en="Choose or create an organisation first"
                />{" "}
                →
              </Link>
            )}
          </SettingsRow>

          {active && (
            <SettingsRow
              label={<Tri bm="Status cukai" zh="税务状态" en="Tax status" />}
              sub={
                <Tri
                  bm="Tidak boleh ditukar sendiri"
                  zh="不能自己更改"
                  en="Cannot be changed here"
                />
              }
            >
              <div className="flex flex-col gap-2">
                <p className="text-base font-medium">
                  {TAX_LABEL[active.taxExemptStatus] ? (
                    <Tri {...TAX_LABEL[active.taxExemptStatus]} />
                  ) : (
                    active.taxExemptStatus
                  )}
                </p>
                {active.taxExemptStatus === "none" && (
                  <p className="rounded-md border-2 border-amber-300 bg-amber-50 p-3 text-sm font-medium leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                    ⚠{" "}
                    <Tri
                      bm="Tiada status s.44(6), jadi resit anda TIDAK boleh menyebut pelepasan cukai — dan Minit tidak akan mencetaknya. s.44(6) ialah kelulusan LHDN yang mesti diluluskan dahulu."
                      zh="没有 s.44(6) 身份，所以您的收据不可以写「可扣税」—— Minit 也不会印上去。s.44(6) 是税务局（LHDN）的批准，必须先获批。"
                      en="No s.44(6) status, so your receipts must NOT mention tax relief — and Minit will not print it. s.44(6) is an LHDN approval that has to be granted first."
                    />
                  </p>
                )}
              </div>
            </SettingsRow>
          )}

          {/* B-3: members & invite codes — the admin's door. */}
          {isAdmin && <MembersRows members={members} invites={invites} />}

          {/* R-6: whether the optional e-Invois pages show at all. */}
          {active && <EinvoisRows />}

          {active && receiptSeries && (
            <ReceiptSeriesRows
              orgId={active.id}
              prefix={receiptSeries.prefix}
              frozen={receiptSeries.frozen}
              year={Number(dayIsoMalaysia(new Date().toISOString())!.slice(0, 4))}
            />
          )}

          {/* 2026-08-19 — the org's own vocabulary. The one thing a society can
              do to make the AI better at its papers, and the answer to "why did
              it spell our member's name wrong". */}
          <SettingsRow
            label={<Tri bm="Perkataan Kami" zh="我们的词库" en="Our Words" />}
            help={
              <Tri
                bm="Ajar Minit nama dan istilah pertubuhan anda, supaya ia membacanya dengan tepat dan menulisnya sama setiap kali."
                zh="教 Minit 你们社团的人名和专门用词 —— 读的时候不容易认错，写出来每次都一样。"
                en="Teach Minit your organisation's names and terms, so it reads them accurately and writes them the same way every time."
              />
            }
          >
            <Link href="/glossary" className="text-base underline underline-offset-4">
              <Tri bm="Buka senarai perkataan" zh="打开词库" en="Open the glossary" /> →
            </Link>
          </SettingsRow>
        </SettingsSection>

        {/* R-5: "delete the register on this device" — behind a typed
            confirmation, same as before the split. */}
        {active && <DeleteRegisterSection orgName={active.name} />}

        {active && active.role === "hq_admin" && (
          <DeleteOrgSection orgId={active.id} orgName={active.name} />
        )}
      </div>
    </div>
  );
}
