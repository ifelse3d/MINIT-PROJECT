// probe-rls-87 — the ROLE × TABLE × OPERATION permission matrix, measured
// against the LIVE database through PostgREST (work order 87 ②).
//
// WHAT IT PROVES. Six purpose-made users (one per role) in one purpose-made
// ZZZ org try SELECT / INSERT / UPDATE / DELETE on the main tables with the
// ANON key + their own JWT — exactly what the app's user-scoped client does.
// The printout is therefore the database layer's real answer, not the server
// actions' answer.
//
// RUNNABLE BEFORE AND AFTER migration 39:
//   node scripts/probe-rls-87.mjs                  → print the matrix
//   node scripts/probe-rls-87.mjs --expect=before  → also PASS/FAIL against
//                                                    the pre-39 baseline
//   node scripts/probe-rls-87.mjs --expect=after   → J runs THIS right after
//                                                    pasting migration 39
//
// Zero AI calls, zero cost. Test users/org are ZZZ-named, created at start
// (leftovers from a crashed run are swept first — §6: same-name orphans make
// split-brain probes) and deleted in finally, whole batch, by name.
//
// HOW DENIAL IS DETECTED (PostgREST semantics):
//   INSERT  → 201 = allowed; 403/42501 = denied by RLS.
//   UPDATE  → RLS filters silently: 200 with [] body (Prefer:
//             return=representation) = no row was updatable = denied.
//   DELETE  → same silent filtering; a fresh service-seeded victim row per
//             attempt, so one role's success cannot starve the next role's.
//   SELECT  → [] where a seed row exists = denied (policies unchanged by 39:
//             every member still sees the org).
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, "..", ".env.local"), "utf-8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const SUPA_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPA_URL || !SERVICE || !ANON) {
  console.error("missing SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY in .env.local");
  process.exit(1);
}

const EXPECT = (process.argv.find((a) => a.startsWith("--expect=")) ?? "").split("=")[1] ?? null;

const ROLES = ["hq_admin", "secretary", "treasurer", "collector", "committee", "auditor_readonly"];
const ORG_NAME = "ZZZ RLS87 探针社团（可删）";
const PASSWORD = "Rls87#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const emailFor = (role) => `zzz-rls87-${role.replace(/_/g, "-")}@example.com`;

const SH = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const srest = (p, o = {}) => fetch(`${SUPA_URL}/rest/v1${p}`, { ...o, headers: { ...SH, ...(o.headers ?? {}) } });
const sauth = (p, o = {}) => fetch(`${SUPA_URL}/auth/v1/admin${p}`, { ...o, headers: { ...SH, ...(o.headers ?? {}) } });

async function ensureUser(email) {
  const list = await (await sauth(`/users?page=1&per_page=200`)).json();
  const existing = (list.users ?? []).find((u) => u.email === email);
  if (existing) {
    await sauth(`/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
    });
    return existing.id;
  }
  const res = await sauth(`/users`, {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  const body = await res.json();
  if (!body.id) throw new Error(`create user ${email}: ${JSON.stringify(body).slice(0, 200)}`);
  return body.id;
}

async function signIn(email) {
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await r.json();
  if (!body.access_token) throw new Error(`sign in ${email}: ${JSON.stringify(body).slice(0, 200)}`);
  return body.access_token;
}

/** PostgREST as ONE role's user — the app's user-scoped client, verbatim. */
function userRest(token) {
  return (p, o = {}) =>
    fetch(`${SUPA_URL}/rest/v1${p}`, {
      ...o,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(o.headers ?? {}),
      },
    });
}

async function cleanup() {
  // Sweep by NAME, newest first — a crashed run's leftovers included (§6).
  const orgs = await (await srest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc`)).json();
  for (const o of orgs ?? []) await srest(`/orgs?id=eq.${o.id}`, { method: "DELETE" });
  const list = await (await sauth(`/users?page=1&per_page=200`)).json();
  for (const role of ROLES) {
    const u = (list.users ?? []).find((x) => x.email === emailFor(role));
    if (u) await sauth(`/users/${u.id}`, { method: "DELETE" });
  }
}

// --------------------------------------------------------------------------
// The tables under test. seed = the row the SELECT/UPDATE ops aim at;
// insertRow(role) must satisfy per-table unique constraints for every role;
// update = a harmless field change; victimRow() = a fresh row for DELETE.
// donationId is filled in at runtime (receipts need a parent donation).
// --------------------------------------------------------------------------
let ORG = 0;
let seedDonationId = 0;
let einvoisMonthCounter = 0;
const iso = "2030-01-01T12:00:00+08:00";
const TABLES = [
  {
    name: "minutes_docs",
    group: "minutes",
    row: () => ({ org_id: ORG, meeting_type: "committee", draft_md: "probe" }),
    update: { draft_md: "probe-updated" },
  },
  {
    name: "committee_roster",
    group: "minutes",
    row: () => ({ org_id: ORG, position: "Probe", person_name: "Probe Person" }),
    update: { person_name: "Probe Person 2" },
  },
  {
    name: "auditors",
    group: "minutes",
    row: () => ({ org_id: ORG, person_name: "Probe Auditor" }),
    update: { status: "inactive" },
  },
  {
    name: "donations",
    group: "money_collect",
    row: () => ({ org_id: ORG, amount_cents: 100 }),
    update: { purpose: "probe" },
  },
  {
    name: "org_templates",
    group: "money_collect",
    row: (tag) => ({ org_id: ORG, kind: "income_purpose", label: `Probe ${tag}` }),
    update: { kind: "income_purpose" },
  },
  {
    name: "remittance_batches",
    group: "custody", // I/U = money_collect set; DELETE = treasurer/hq only
    row: () => ({ org_id: ORG }),
    update: { confirmed_by_hq: "Probe HQ" },
  },
  {
    name: "receipts",
    group: "money_write",
    needsDonation: true,
    row: (tag, donationId) => ({
      org_id: ORG,
      receipt_no: `ZZZ-${tag}-${Math.random().toString(36).slice(2, 8)}`,
      donation_id: donationId,
    }),
    update: { delivered_via: "print" },
    // No user may delete a receipt in EITHER world: 20260726 already dropped
    // receipts_delete (gap-free series), and 39 keeps it dropped.
    deleteDeniedAlways: true,
  },
  {
    name: "einvois_packs",
    group: "money_write",
    // unique (org_id, month): a fresh far-future month per attempt.
    row: () => {
      const n = einvoisMonthCounter++;
      return {
        org_id: ORG,
        month: `${2030 + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}-01`,
        consolidated_json: {},
      };
    },
    update: { xlsx_storage_path: "probe" },
  },
  {
    name: "org_bank_accounts",
    group: "admin",
    row: () => ({ org_id: ORG, bank_name: "Probe Bank", account_no: "1234567890" }),
    update: { account_no: "0987654321" },
  },
  {
    name: "events_meetings",
    group: "writable", // control: 39 deliberately leaves these membership-wide
    row: () => ({ org_id: ORG, title: "Probe Event", starts_at: iso, kind: "activity" }),
    update: { venue_text: "Probe Venue" },
  },
  {
    name: "expenses",
    group: "writable", // control: claim submission is open to all writers
    row: () => ({ org_id: ORG, description: "Probe Expense", amount_cents: 100 }),
    update: { category: "probe" },
  },
];

// Who may WRITE each group — the two worlds this probe can be asked to expect.
const WRITERS = {
  before: {
    minutes: ["hq_admin", "secretary", "treasurer", "collector", "committee"],
    money_collect: ["hq_admin", "secretary", "treasurer", "collector", "committee"],
    custody: ["hq_admin", "secretary", "treasurer", "collector", "committee"],
    money_write: ["hq_admin", "secretary", "treasurer", "collector", "committee"],
    admin: ["hq_admin", "secretary", "treasurer", "collector", "committee"],
    writable: ["hq_admin", "secretary", "treasurer", "collector", "committee"],
  },
  after: {
    minutes: ["hq_admin", "secretary"],
    money_collect: ["hq_admin", "treasurer", "collector"],
    custody: ["hq_admin", "treasurer", "collector"],
    money_write: ["hq_admin", "treasurer"],
    admin: ["hq_admin"],
    writable: ["hq_admin", "secretary", "treasurer", "collector", "committee"],
  },
};
function expected(mode, table, role, op) {
  if (op === "select") return true; // reads stay membership-wide, both worlds
  if (table.deleteDeniedAlways && op === "delete") return false;
  if (mode === "after" && table.name === "remittance_batches" && op === "delete") {
    return ["hq_admin", "treasurer"].includes(role);
  }
  return WRITERS[mode][table.group].includes(role);
}

const failures = [];
function record(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}

async function seedRow(table, tag = "seed") {
  const donationId = table.needsDonation
    ? (await (await srest(`/donations`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ org_id: ORG, amount_cents: 50 }),
      })).json())[0].id
    : seedDonationId;
  const res = await srest(`/${table.name}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(table.row(tag, donationId)),
  });
  const body = await res.json();
  if (!Array.isArray(body) || !body[0]?.id) {
    throw new Error(`seed ${table.name}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body[0].id;
}

async function run() {
  console.log(`asking: ${SUPA_URL}`);
  console.log(`mode: ${EXPECT ? `matrix + expectations (--expect=${EXPECT})` : "matrix only"}\n`);
  if (EXPECT && !WRITERS[EXPECT]) {
    console.error(`--expect must be "before" or "after"`);
    process.exit(1);
  }

  await cleanup(); // sweep leftovers FIRST — same-name orphans lie (§6)

  // One org, six users, one membership row each.
  const orgRes = await (await srest(`/orgs`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ name: ORG_NAME }),
  })).json();
  ORG = orgRes[0].id;
  const tokens = {};
  for (const role of ROLES) {
    const uid = await ensureUser(emailFor(role));
    await srest(`/members_roles`, {
      method: "POST",
      body: JSON.stringify({ org_id: ORG, user_id: uid, name: `Probe ${role}`, role }),
    });
    tokens[role] = await signIn(emailFor(role));
  }

  // Seeds the SELECT/UPDATE ops aim at (one per table; receipts also get a
  // parent donation; donations seed doubles as that parent elsewhere).
  seedDonationId = await seedRow(TABLES.find((t) => t.name === "donations"));
  const seedIds = { donations: seedDonationId };
  for (const t of TABLES) {
    if (t.name === "donations") continue;
    seedIds[t.name] = await seedRow(t);
  }

  // The matrix: role × table × op.
  const matrix = {};
  for (const role of ROLES) {
    const rest = userRest(tokens[role]);
    matrix[role] = {};
    for (const t of TABLES) {
      const out = {};
      // SELECT — a seed row exists, so [] = denied.
      {
        const r = await rest(`/${t.name}?org_id=eq.${ORG}&select=id&limit=1`);
        const body = await r.json().catch(() => []);
        out.select = r.status === 200 && Array.isArray(body) && body.length > 0;
      }
      // INSERT — 201 = allowed; clean the row up via service on success.
      {
        const donationId = t.needsDonation
          ? (await (await srest(`/donations`, {
              method: "POST",
              headers: { Prefer: "return=representation" },
              body: JSON.stringify({ org_id: ORG, amount_cents: 10 }),
            })).json())[0].id
          : undefined;
        const r = await rest(`/${t.name}`, {
          method: "POST",
          body: JSON.stringify(t.row(`i-${role}`, donationId)),
        });
        const body = await r.json().catch(() => null);
        out.insert = r.status === 201;
        if (out.insert && Array.isArray(body) && body[0]?.id) {
          await srest(`/${t.name}?id=eq.${body[0].id}`, { method: "DELETE" });
        }
        if (donationId && (!out.insert)) {
          await srest(`/donations?id=eq.${donationId}`, { method: "DELETE" });
        }
      }
      // UPDATE — RLS filters silently; representation [] = denied.
      {
        const r = await rest(`/${t.name}?id=eq.${seedIds[t.name]}`, {
          method: "PATCH",
          body: JSON.stringify(t.update),
        });
        const body = await r.json().catch(() => []);
        out.update = r.status === 200 && Array.isArray(body) && body.length > 0;
      }
      // DELETE — fresh service-seeded victim per attempt.
      {
        const victimId = await seedRow(t, `d-${role}`);
        const r = await rest(`/${t.name}?id=eq.${victimId}`, { method: "DELETE" });
        const body = await r.json().catch(() => []);
        out.delete = r.status === 200 && Array.isArray(body) && body.length > 0;
        if (!out.delete) await srest(`/${t.name}?id=eq.${victimId}`, { method: "DELETE" });
      }
      matrix[role][t.name] = out;
    }
  }

  // ---- Print the matrix ----------------------------------------------------
  const OPS = ["select", "insert", "update", "delete"];
  console.log(`\n${"table".padEnd(20)} ${ROLES.map((r) => r.slice(0, 9).padEnd(10)).join("")}  (S/I/U/D: ✓=allowed ·=denied)`);
  for (const t of TABLES) {
    const cells = ROLES.map((role) => {
      const o = matrix[role][t.name];
      return OPS.map((op) => (o[op] ? "✓" : "·")).join("").padEnd(10);
    });
    console.log(`${t.name.padEnd(20)} ${cells.join("")}`);
  }

  // ---- Compare with expectations, if asked (FAIL lines only — 264 PASS
  // lines would bury the one that matters) ----------------------------------
  if (EXPECT) {
    console.log("");
    let checked = 0;
    for (const t of TABLES) {
      for (const role of ROLES) {
        for (const op of OPS) {
          const want = expected(EXPECT, t, role, op);
          const got = matrix[role][t.name][op];
          checked += 1;
          if (got !== want) {
            record(
              `${EXPECT}: ${t.name}.${op} as ${role} → expected ${want ? "allowed" : "denied"}`,
              false,
              `got ${got ? "allowed" : "denied"}`,
            );
          }
        }
      }
    }
    console.log(`${checked} expectations checked, ${failures.length} mismatches`);
  }
}

let exitCode = 0;
try {
  await run();
} catch (e) {
  console.error("PROBE CRASHED:", e);
  exitCode = 1;
} finally {
  await cleanup();
  console.log("\nZZZ cleanup done (org + six users).");
}
if (failures.length > 0) {
  console.log(`\n${failures.length} FAILURES`);
  exitCode = 1;
} else if (EXPECT) {
  console.log("\nALL CHECKS PASSED");
}
process.exit(exitCode);
