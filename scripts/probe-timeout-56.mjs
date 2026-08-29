// D0-2 (工作单 56, 拍板 5): "The AI took too long" — READ-ONLY diagnosis.
//
// J hit that sentence uploading a constitution on 2026-08-29. That sentence is
// the VendorTimeoutError → 504 path (vendor-failure.ts), which refunds. This
// probe reads the evidence trail before anything is changed:
//
//   1. app_errors  — recent rows for the extract routes: code column carries
//                    the error NAME (VendorTimeoutError vs VendorOutput-
//                    TruncatedError vs unreadable_twice), so no guessing.
//   2. ai_usage    — recent refunded rows for J's orgs (15/58/91): action,
//                    model, cost, when.
//
// Zero writes, zero AI calls. Service role, local .env.local.
//   node scripts/probe-timeout-56.mjs
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = "C:/dev/minit-v2";
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env.local"), "utf-8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const SUPA_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const rest = async (p) => {
  const res = await fetch(`${SUPA_URL}/rest/v1${p}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) throw new Error(`${p} → ${res.status} ${await res.text()}`);
  return res.json();
};

const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

console.log("== app_errors (last 7 days, extract/intake routes) ==");
const errors = await rest(
  `/app_errors?select=created_at,route,code,message_hash,org_id` +
    `&created_at=gte.${since}` +
    `&route=in.("/api/extract-constitution","/api/extract-minutes","/api/extract-ledger","/api/intake","/api/import-roster","/api/extract-expense")` +
    `&order=created_at.desc&limit=50`,
);
for (const e of errors) {
  console.log(
    `${e.created_at}  org=${e.org_id ?? "-"}  ${e.route}  code=${e.code ?? "-"}  #${e.message_hash}`,
  );
}
if (errors.length === 0) console.log("(none)");

console.log("\n== ai_usage refunded rows (last 7 days, orgs 15/58/91) ==");
const refunds = await rest(
  `/ai_usage?select=id,created_at,org_id,action,model,provider,cost_micros,refunded_at` +
    `&created_at=gte.${since}&org_id=in.(15,58,91)&refunded_at=not.is.null` +
    `&order=created_at.desc&limit=50`,
);
for (const r of refunds) {
  console.log(
    `${r.created_at}  org=${r.org_id}  ${r.action}  ${r.provider ?? "-"}/${r.model ?? "-"}  cost_micros=${r.cost_micros ?? "-"}  refunded=${r.refunded_at}`,
  );
}
if (refunds.length === 0) console.log("(none)");

console.log("\n== ai_usage extract_constitution rows (last 7 days, all orgs) ==");
const consti = await rest(
  `/ai_usage?select=id,created_at,org_id,action,model,cost_micros,refunded_at` +
    `&created_at=gte.${since}&action=eq.extract_constitution&order=created_at.desc&limit=30`,
);
for (const r of consti) {
  console.log(
    `${r.created_at}  org=${r.org_id}  ${r.model ?? "-"}  cost_micros=${r.cost_micros ?? "-"}  refunded=${r.refunded_at ?? "no"}`,
  );
}
if (consti.length === 0) console.log("(none)");
