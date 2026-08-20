// ---------------------------------------------------------------------------
// PHASE 7 DEMO SEED — `npm run seed:demo`
//
// Creates a complete, ANONYMISED "Demo Mode" portfolio so judges and new
// users can see the whole system working with real database rows:
//
//   Pertubuhan Demo Minit (HQ)          ← is_demo = true
//   ├─ Cawangan Utara (Demo)
//   └─ Cawangan Selatan (Demo)
//
//   demo-hq@minit.example        hq_admin  at HQ  → sees all three orgs
//   demo-cawangan@minit.example  secretary at Cawangan Utara → sees only it
//   demo-auditor@minit.example   auditor_readonly at HQ + Cawangan Selatan
//                                → sees exactly those two, read-only
//
// Plus sample donations with sequential receipts, one confirmed minutes doc,
// and one stored upload per org — so RLS, history AND delete-organisation
// can all be demonstrated on real data.
//
// PDPA: every name, amount and document here is FICTIONAL (from the app's
// sample-data modules). Safe to show publicly. Never seed real donor data.
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
// Idempotent-ish: refuses to run if a demo org already exists.
// ---------------------------------------------------------------------------

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { allocateReceiptNos } from "../src/lib/receipts";
import { sampleRegisterDonations } from "../src/lib/sample-ledger";
import { sampleMeetingExtraction } from "../src/lib/sample-data";
import { renderMinutesDraftBm } from "../src/lib/minutes-draft";
import { maskName } from "../src/lib/mask";

const ROOT = path.resolve(__dirname, "..");

// --- minimal .env.local loader (same pattern as eval/run-eval.ts) ----------
function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawVal.replace(/^["']|["']$/g, "");
  }
}

const DEMO_PASSWORD = "MinitDemo#2026";
const DEMO_USERS = [
  { email: "demo-hq@minit.example", name: "Pentadbir Demo", role: "hq_admin" },
  { email: "demo-cawangan@minit.example", name: "Setiausaha Demo", role: "secretary" },
  { email: "demo-auditor@minit.example", name: "Juruaudit Demo", role: "auditor_readonly" },
] as const;

// A 1×1 transparent PNG — a real storage object without any real content.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  loadEnvLocal();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tiada dalam .env.local / missing from .env.local",
    );
    process.exit(1);
  }
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Refuse to double-seed.
  const { data: existing } = await admin
    .from("orgs")
    .select("id, name")
    .eq("is_demo", true)
    .limit(1);
  if (existing && existing.length > 0) {
    console.log(
      `Demo sudah wujud / demo already seeded (org "${existing[0].name}").\n` +
        "Untuk seed semula: padam org demo melalui Tetapan → Padam pertubuhan, kemudian jalankan semula.\n" +
        "To re-seed: delete the demo org via Settings → Delete organisation, then run again.",
    );
    return;
  }

  // 1 — demo login accounts -------------------------------------------------
  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (data?.user) {
      userIds[u.email] = data.user.id;
      continue;
    }
    if (error) {
      // Probably exists from an earlier seed — find it.
      const { data: list } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      const found = list?.users.find((x) => x.email === u.email);
      if (!found) {
        console.error(`Gagal mencipta akaun demo / could not create demo account: ${u.email}`);
        process.exit(1);
      }
      userIds[u.email] = found.id;
    }
  }
  console.log("✓ 3 akaun demo / demo accounts");

  // 2 — org tree -------------------------------------------------------------
  const { data: hq, error: hqError } = await admin
    .from("orgs")
    .insert({
      name: "Pertubuhan Demo Minit (HQ)",
      is_demo: true,
      languages: ["ms", "zh", "en"],
    })
    .select("id")
    .single();
  if (hqError || !hq) {
    console.error("Gagal mencipta HQ demo / could not create demo HQ");
    process.exit(1);
  }
  const { data: branches, error: branchError } = await admin
    .from("orgs")
    .insert([
      { name: "Cawangan Utara (Demo)", parent_org_id: hq.id, is_demo: true },
      { name: "Cawangan Selatan (Demo)", parent_org_id: hq.id, is_demo: true },
    ])
    .select("id, name");
  if (branchError || !branches || branches.length !== 2) {
    console.error("Gagal mencipta cawangan demo / could not create demo branches");
    process.exit(1);
  }
  const [utara, selatan] = branches;
  console.log("✓ HQ + 2 cawangan / branches");

  // 3 — memberships (this is what the RLS demo hinges on) --------------------
  const { error: memberError } = await admin.from("members_roles").insert([
    { org_id: hq.id, user_id: userIds["demo-hq@minit.example"], name: "Pentadbir Demo", role: "hq_admin" },
    { org_id: utara.id, user_id: userIds["demo-cawangan@minit.example"], name: "Setiausaha Demo", role: "secretary" },
    // Auditor: EXACT org assignments — HQ and Selatan, NOT Utara.
    { org_id: hq.id, user_id: userIds["demo-auditor@minit.example"], name: "Juruaudit Demo", role: "auditor_readonly" },
    { org_id: selatan.id, user_id: userIds["demo-auditor@minit.example"], name: "Juruaudit Demo", role: "auditor_readonly" },
    // A collector person WITHOUT a login (people can exist before accounts).
    { org_id: utara.id, name: "Pemungut Demo", role: "collector" },
  ]);
  if (memberError) {
    console.error("Gagal mencipta keahlian demo / could not create demo memberships");
    process.exit(1);
  }
  console.log("✓ keahlian / memberships");

  // 4 — donations + sequential receipts (HQ and Cawangan Utara) --------------
  async function seedMoney(orgId: number, rows: typeof sampleRegisterDonations) {
    const { data: donations, error } = await admin
      .from("donations")
      .insert(
        rows.map((r) => ({
          org_id: orgId,
          donor_name: r.donorName,
          donor_phone: r.donorPhone,
          donor_masked: maskName(r.donorName),
          amount_cents: r.amountCents,
          purpose: r.purpose,
          donated_at: r.donatedAtIso,
          custody_status: r.custodyStatus,
        })),
      )
      .select("id");
    if (error || !donations) throw new Error("donations seed failed");

    const year = Number(rows[0]?.donatedAtIso?.slice(0, 4)) || new Date().getFullYear();
    const nos = allocateReceiptNos([], donations.length, { prefix: "MIN", year });
    const { data: receipts, error: receiptError } = await admin
      .from("receipts")
      .insert(
        donations.map((d, i) => ({
          org_id: orgId,
          receipt_no: nos[i],
          donation_id: d.id,
        })),
      )
      .select("id, donation_id");
    if (receiptError || !receipts) throw new Error("receipts seed failed");
    for (const r of receipts) {
      await admin.from("donations").update({ receipt_id: r.id }).eq("id", r.donation_id);
    }
  }
  await seedMoney(hq.id, sampleRegisterDonations.slice(0, 3));
  await seedMoney(utara.id, sampleRegisterDonations.slice(3));
  console.log("✓ derma + resit berurutan / donations + sequential receipts");

  // 5 — one confirmed minutes document at HQ ---------------------------------
  const minutesMd = renderMinutesDraftBm(sampleMeetingExtraction, {
    orgName: "Pertubuhan Demo Minit (HQ)",
    confirmedBy: { name: "Pentadbir Demo", dateIso: new Date().toISOString().slice(0, 10) },
  });
  await admin.from("minutes_docs").insert({
    org_id: hq.id,
    meeting_type: "committee",
    meeting_date: sampleMeetingExtraction.meeting_date.value || null,
    final_md: minutesMd,
    status: "confirmed",
    confirmed_by: "Pentadbir Demo",
    confirmed_at: new Date().toISOString(),
  });
  console.log("✓ minit mesyuarat / minutes doc");

  // 6 — one stored upload per org (real storage objects for the delete demo) -
  for (const org of [{ id: hq.id }, { id: utara.id }, { id: selatan.id }]) {
    const storagePath = `${org.id}/meeting_notes/demo-nota.png`;
    const { error: upError } = await admin.storage
      .from("uploads")
      .upload(storagePath, TINY_PNG, { contentType: "image/png" });
    if (upError) {
      console.error(
        "Amaran / warning: bucket 'uploads' tiada? Jalankan migrasi Fasa 7 dahulu / missing? Run the Phase 7 migration first.",
      );
      break;
    }
    await admin.from("uploads").insert({
      org_id: org.id,
      filename: "demo-nota.png",
      storage_path: storagePath,
      kind: "meeting_notes",
      status: "done",
    });
  }
  console.log("✓ fail storan / storage objects");

  console.log(`
SELESAI / DONE — Demo Mode sedia. Log masuk / log in with:

  hq_admin           demo-hq@minit.example
  secretary (Utara)  demo-cawangan@minit.example
  auditor (baca sahaja / read-only)  demo-auditor@minit.example

  Kata laluan / password (semua / all): ${DEMO_PASSWORD}
`);
}

main().catch(() => {
  // PDPA: no raw error contents (they can quote row data). Fail plainly.
  console.error("Seed gagal / seed failed — semak sambungan Supabase dan migrasi / check the Supabase connection and migrations.");
  process.exit(1);
});
