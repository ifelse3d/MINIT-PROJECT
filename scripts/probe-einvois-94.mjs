// PROBE — work order 94 §4-5 acceptance: the D49 e-Invois BETA gate, against
// the real next start + DB. ZERO AI calls; a throwaway ZZZ user + org,
// deleted in the finally.
//
// The org's needs_einvois is set TRUE by REST before any assertion — the
// strongest case: an organisation that switched e-Invois on BEFORE the gate.
// A non-operator member of that org must still see nothing:
//
//   ① no e-Invois row in the rail or on /more (and no BETA pill anywhere —
//     the pill only exists on entries this account cannot see);
//   ② no e-Invois settings row in the settings sub-sidebar;
//   ③ the home chat chips carry no e-Invois chip (a chip must never cost
//     quota, and behind the gate that one would go to the model);
//   ④ the calendar shows no e-Invois month-end deadline;
//   ⑤ /money/einvois and /settings/einvois render the 404 screen with none
//     of their own content (status stays 200 — loading.tsx streams);
//   ⑥ POST /api/einvois-xlsx → 404, no spreadsheet;
//   ⑦ /minutes/document shows no 批款与 e-Invois 状态 panel;
//   ⑧ after all of it, orgs.needs_einvois is STILL true — the gate hides,
//     it never rewrites data;
//   ⑨ ai_usage has ZERO rows — this probe never reaches a vendor.
//
// [SKIP — by design] the operator-positive half (panel visible, BETA pills
// visible, RM10,000 threshold wording): the probe cannot sign in as a real
// ADMIN_EMAILS account without J's credentials. The threshold arithmetic and
// trilingual findings are pinned by the 22 einvois-governance unit tests;
// the visible half is J's own-account check in the work-order §6 list.
//
//   node scripts/probe-einvois-94.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const BASE = process.env.BASE || "http://localhost:3000";
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
const TEST_EMAIL = "zzz-probe-einvois-94@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ EINVOIS 94 闸测试（可删）";

const admin = (p, o = {}) =>
  fetch(`${SUPA_URL}/auth/v1/admin${p}`, {
    ...o,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(o.headers ?? {}),
    },
  });
const rest = (p, o = {}) =>
  fetch(`${SUPA_URL}/rest/v1${p}`, {
    ...o,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(o.headers ?? {}),
    },
  });

const failures = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let userId = null;
let orgId = null;
let browser = null;

async function main() {
  console.log("probing", BASE);

  const list = await (await admin(`/users?page=1&per_page=200`)).json();
  const existing = (Array.isArray(list.users) ? list.users : []).find(
    (u) => u.email === TEST_EMAIL,
  );
  if (existing) {
    userId = existing.id;
    await admin(`/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }),
    });
  } else {
    const res = await admin(`/users`, {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
    });
    userId = (await res.json()).id;
  }

  browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: 1366, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  // §1 (work order 104): /orgs/new opens on a FORK now — "I have the
  // constitution" or "I'll type it myself". One tap to the form these
  // scripts have always driven; a no-op wherever there is no fork.
  await page.evaluate(() =>
    document.querySelector('[data-probe="road-manual"]')?.click(),
  );
  await new Promise((r) => setTimeout(r, 250));
  await page.type('input[name="name"]', ORG_NAME);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("创建组织"),
    );
    if (b) b.click();
  });
  for (let i = 0; i < 30 && !orgId; i++) {
    await sleep(1500);
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // The strongest case: this org switched e-Invois ON (by REST — the UI door
  // is itself behind the gate now, which is the point).
  const flip = await rest(`/orgs?id=eq.${orgId}`, {
    method: "PATCH",
    body: JSON.stringify({ needs_einvois: true }),
  });
  check("setup: needs_einvois set true by REST", flip.ok);

  // ① the home page: rail + drawer carry no e-Invois entry, no BETA pill.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  const homeText = await page.evaluate(() => document.body.innerText);
  const homeHrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? ""),
  );
  check(
    "① no /money/einvois or /settings/einvois link on the home shell",
    !homeHrefs.some((h) => h.startsWith("/money/einvois") || h.startsWith("/settings/einvois")),
  );
  check("① no BETA pill anywhere on the home shell", !/\bBETA\b/.test(homeText));
  // ③ chips: the two free chips are offered, the e-Invois one is not.
  check(
    "③ chips: 年度呈报 & 收据 present, e-Invois chip absent",
    homeText.includes("年度呈报什么时候要交") &&
      homeText.includes("在哪里做收据") &&
      !homeText.includes("e-Invois 是什么"),
  );

  // ① /more: same contract on the phone surface.
  await page.goto(`${BASE}/more`, { waitUntil: "networkidle2" });
  const moreHrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? ""),
  );
  check(
    "① /more lists no e-Invois entry",
    !moreHrefs.some((h) => h.startsWith("/money/einvois") || h.startsWith("/settings/einvois")),
  );

  // ② the settings sub-sidebar: no e-Invois row.
  await page.goto(`${BASE}/settings/display`, { waitUntil: "networkidle2" });
  const settingsHrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? ""),
  );
  check(
    "② settings sub-sidebar has no /settings/einvois row",
    !settingsHrefs.some((h) => h.startsWith("/settings/einvois")),
  );

  // ④ the calendar: no e-Invois month-end deadline for a non-operator.
  await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle2" });
  await sleep(1000);
  const calText = await page.evaluate(() => document.body.innerText);
  check(
    "④ calendar shows no e-Invois month-end deadline",
    !calText.includes("e-Invois") && !calText.includes("电子发票整合"),
  );

  // ⑤ the two gated pages render the 404 screen, none of their own content.
  const readPage = async (u) => {
    await page.goto(`${BASE}${u}`, { waitUntil: "networkidle2" });
    return page.evaluate(() => document.body.innerText);
  };
  const moneyEinvois = await readPage("/money/einvois");
  check(
    "⑤ /money/einvois → 404 screen, no pack content",
    /could not be found|404/.test(moneyEinvois) && !moneyEinvois.includes("e-Invois"),
  );
  const settingsEinvois = await readPage("/settings/einvois");
  check(
    "⑤ /settings/einvois → 404 screen, no switch",
    /could not be found|404/.test(settingsEinvois) && !settingsEinvois.includes("LHDN"),
  );

  // ⑥ the export API is fail-closed server-side.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  const api = await page.evaluate(async () => {
    const r = await fetch("/api/einvois-xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: "2026-08", fileIndex: 0 }),
    });
    return { status: r.status, type: r.headers.get("content-type") ?? "" };
  });
  check(
    "⑥ POST /api/einvois-xlsx → 404, no spreadsheet",
    api.status === 404 && !api.type.includes("spreadsheet"),
    `status=${api.status}`,
  );

  // ⑦ the workspace document page carries no audit panel.
  const docText = await readPage("/minutes/document");
  check(
    "⑦ /minutes/document shows no 批款与 e-Invois 状态 panel",
    !docText.includes("批款与 e-Invois 状态") && !docText.includes("Kelulusan wang"),
  );

  // ⑧ the gate hid everything, and rewrote nothing.
  const after = await (
    await rest(`/orgs?id=eq.${orgId}&select=needs_einvois`)
  ).json();
  check(
    "⑧ orgs.needs_einvois still true (the gate hides, never rewrites)",
    Array.isArray(after) && after[0]?.needs_einvois === true,
    JSON.stringify(after),
  );

  // ⑨ zero AI: the whole probe never reached a vendor.
  const usage = await (
    await rest(`/ai_usage?org_id=eq.${orgId}&select=action`)
  ).json();
  check("⑨ ai_usage has ZERO rows", Array.isArray(usage) && usage.length === 0, JSON.stringify(usage));

  check("no page errors", pageErrors.length === 0, JSON.stringify(pageErrors));

  console.log(
    "\n[SKIP — by design] operator-positive half (panel + BETA pills + RM10,000 wording):",
  );
  console.log(
    "needs a real ADMIN_EMAILS session — pinned by the 22 unit tests; the visible half is J's §6 ② check.",
  );

  if (failures.length) {
    console.log("\nFAILURES:", failures.join(" | "));
    process.exitCode = 1;
  } else {
    console.log("\nALL CHECKS PASSED");
  }
}

async function cleanup() {
  try {
    if (orgId) {
      // The app's own delete path is not under test here; REST-delete the
      // org tree the same way the other ZZZ probes do.
      for (const t of [
        "ai_usage",
        "fence_usage",
        "constitutions",
        "minutes_docs",
        "members_roles",
        "deadlines",
        "events_meetings",
      ]) {
        await rest(`/${t}?org_id=eq.${orgId}`, { method: "DELETE" }).catch(() => {});
      }
      await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" }).catch(() => {});
    }
    if (userId) await admin(`/users/${userId}`, { method: "DELETE" }).catch(() => {});
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

main()
  .catch((e) => {
    console.error("PROBE CRASHED:", e);
    process.exitCode = 1;
  })
  .finally(cleanup);
