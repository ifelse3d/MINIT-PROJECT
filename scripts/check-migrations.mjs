// READ-ONLY. Asks the live database which migrations are actually in it, by
// probing for one signature column per migration through PostgREST.
// Nothing is written.  Usage:  npm run check:migrations
//
// 2026-08-20: moved here from tmp/. It is the acceptance gate for the new
// Supabase project (docs/新树迁移计划.md step 3), and tmp/ is not carried into
// the new tree - the verifier would have been left behind in the old one.
// The .env.local path used to be hardcoded to C:/dev/minit, which would have
// silently checked the OLD database from inside the new tree. It is now
// resolved relative to this file.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log(`no SUPABASE_URL / SERVICE_ROLE_KEY in ${envPath}`);
  process.exit(1);
}
console.log(`asking: ${url}\n`);

const probes = [
  ["20260708000000 init", "orgs", "id"],
  ["20260719000000 phase7 auth+RLS", "orgs", "is_demo"],
  ["20260719150000 ai_usage quota", "orgs", "monthly_free_quota"],
  ["20260726000000 P0-2 client_id + receipt lock", "donations", "client_id"],
  ["20260730000000 receipt series", "orgs", "receipt_prefix"],
  ["20260803000000 ai_usage cost", "ai_usage", "cost_micros"],
  ["20260819000000 org_glossary", "org_glossary", "term"],
  ["20260819010000 committee name_official", "committee_roster", "name_official"],
  ["20260820000000 meeting types + draft", "minutes_docs", "meeting_type_label"],
  ["20260820000000 meeting types + draft", "minutes_docs", "extraction"],
  ["20260821000000 ai_usage refunded_at", "ai_usage", "refunded_at"],
  ["20260822000000 minutes search (pgvector)", "minutes_embeddings", "model"],
  ["20260822000000 minutes search (pgvector)", "minutes_docs", "embedded_at"],
  ["20260825000000 calendar+custody+deadline writable", "events_meetings", "client_id"],
  ["20260825000000 calendar+custody+deadline writable", "remittance_batches", "collector_name"],
  ["20260825000000 calendar+custody+deadline writable", "deadlines", "client_id"],
  ["20260826000000 member groups", "member_groups", "group_name"],
  ["20260827000000 donations collector_name", "donations", "collector_name"],
  ["20260828000000 minutes_docs client_id", "minutes_docs", "client_id"],
  ["20260829000000 orgs needs_einvois", "orgs", "needs_einvois"],
  ["20260830000000 orgs plan", "orgs", "plan"],
  ["20260831000000 app_errors", "app_errors", "route"],
  ["20260902000000 invites + org type", "invites", "code"],
  ["20260902000000 invites + org type", "orgs", "org_type"],
  ["20260902000000 invites + org type", "orgs", "ppm_no"],
  ["20260903000000 final sprint: in-kind donations", "donations", "kind"],
  ["20260903000000 final sprint: in-kind donations", "donations", "item_desc"],
  ["20260903000000 final sprint: claim flow", "expenses", "status"],
  ["20260903000000 final sprint: claim flow", "expenses", "claimant_user_id"],
  ["20260903000000 final sprint: feedback", "feedback", "message"],
  ["20260903000000 final sprint: per-user usage", "ai_usage", "user_id"],
  ["20260903000000 final sprint: platform admins", "credit_grants", "granted_by"],
  ["20260904000000 payment method", "donations", "payment_method"],
  ["20260904000000 payment method: transfer proof", "donations", "transfer_proof_path"],
  ["20260905000000 record times: donations.created_at", "donations", "created_at"],
  ["20260905000000 custody batch details", "remittance_batches", "recorded_at"],
  ["20260906000000 custody donation-id link", "remittance_batches", "client_donation_ids"],
  ["20260906000000 glossary languages", "org_glossary", "lang"],
  ["20260906000000 templates", "org_templates", "label"],
];

const headers = { apikey: key, Authorization: `Bearer ${key}` };

for (const [label, table, column] of probes) {
  const r = await fetch(`${url}/rest/v1/${table}?select=${column}&limit=1`, { headers });
  const ok = r.status === 200;
  const body = ok ? "" : (await r.text()).slice(0, 90).replace(/\s+/g, " ");
  console.log(
    `${ok ? "[ APPLIED  ]" : "[ NOT YET  ]"} ${label.padEnd(46)} ${table}.${column}${ok ? "" : "   " + body}`,
  );
}

// 2026-08-23 (the function migration) CAN be probed after all — not by looking
// for a column, but by CALLING it. PostgREST exposes a Postgres function as
// POST /rest/v1/rpc/<name>, so an empty database answers 200 with [] when the
// function exists and 404 (PGRST202, "function not found") when it does not.
// This used to be listed under "confirm by eye", which meant nobody did.
// Nothing is written: cari_minit is `stable`, and the query vector is 768 zeros.
{
  const zeros = `[${new Array(768).fill(0).join(",")}]`;
  const r = await fetch(`${url}/rest/v1/rpc/cari_minit`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_org_id: 0,
      p_model: "gemini:gemini-embedding-001",
      p_query: zeros,
      p_limit: 1,
    }),
  });
  const ok = r.status === 200;
  const body = ok ? "" : (await r.text()).slice(0, 120).replace(/\s+/g, " ");
  console.log(
    `${ok ? "[ APPLIED  ]" : "[ NOT YET  ]"} ${"20260823000000 cari_minit() RPC".padEnd(46)} rpc/cari_minit${ok ? "" : "   " + body}`,
  );
}

// 2026-08-20: two of the migrations add NO column that PostgREST can see, so
// "everything above says APPLIED" does NOT mean every file ran. Saying so out
// loud, in the same idiom as npm run status, is cheaper than someone
// concluding the database is complete when two files never executed.
// 2026-08-21: eleven files became thirteen (refunded_at, pgvector).
console.log(`
[ 人眼 ]  These two cannot be probed through PostgREST - they add a trigger and
          a function in a non-public schema, not a column. Confirm by eye in the
          Supabase SQL editor after running them:

            20260728000000_lock_org_privileged_columns.sql
              select tgname from pg_trigger where tgrelid = 'public.orgs'::regclass;

            20260729000000_admin_grant_ai_credits.sql
              select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'minit_admin';

          20260824000000_receipt_no_past_9999.sql only REPLACES a function's
          body, so nothing about it is visible from outside either. It is not
          urgent (an org must issue 9999 receipts in one year to hit the old
          bug) but it is invisible, so check it the same way, by eye:

            select lpad(10000::text, 4, '0');   -- the old behaviour: '1000'
            select case when length(10000::text) >= 4 then 10000::text
                        else lpad(10000::text, 4, '0') end;   -- want '10000'

          and confirm the function itself carries the fix:

            select prosrc like '%case when length(v_seq::text)%'
              from pg_proc where proname = 'issue_receipts';

          Fourteen migration files. The probes above cover eleven of them
          (some probe two different columns of the same migration, on purpose:
          20260822000000 touches two tables and a half-run migration is worth
          catching).

          One more thing 20260822000000 needs that no probe can see: the
          pgvector EXTENSION. If it did not run, check by eye:
            select extname from pg_extension where extname = 'vector';

          20260823000000_cari_minit_rpc.sql IS probed now (the line above,
          rpc/cari_minit) — but the probe can only prove the function EXISTS.
          It cannot see how the function was declared, and that second fact is
          the one that matters. Run this once, by eye, after applying it:

            select proname, prosecdef from pg_proc where proname = 'cari_minit';

          prosecdef MUST be false. true means SECURITY DEFINER, which bypasses
          RLS and would let the assistant read every society's minutes.

          20260901000000_trial_quota_15.sql only changes a column DEFAULT
          (new orgs get 15 free actions/month), which PostgREST cannot see.
          Confirm by eye in the SQL editor — this must print 15:

            select column_default from information_schema.columns
             where table_schema = 'public' and table_name = 'orgs'
               and column_name = 'monthly_free_quota';

          (The file also carries a COMMENTED optional section that lowers
          EXISTING orgs still on the old 100 default — J's call whether to
          uncomment and run it.)`);

// Row counts, so "this page is empty" is answered by data, not by guessing.
console.log("\n--- rows ---");
for (const t of [
  "orgs", "members_roles", "uploads", "minutes_docs", "committee_roster",
  "donations", "receipts", "expenses", "constitutions", "ai_usage",
  "org_glossary", "paste_packs", "remittance_batches", "einvois_packs",
  "events_meetings", "deadlines", "qa_log", "extractions", "reminders", "rsvps",
]) {
  const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, {
    headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
  });
  const range = r.headers.get("content-range") || "?";
  console.log(`${String(range.split("/")[1] ?? "?").padStart(6)}  ${t}`);
}