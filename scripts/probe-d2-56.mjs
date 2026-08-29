// D2 (工作单 56): the three new surfaces, proven through the real UI against
// local `next start` + the real DB — WHICH DOES NOT HAVE migrations 34/35
// yet, so this is the fail-open proof (D8) as well as the render proof:
//
//   /members          — the Juruaudit card renders, shows the honest
//                       "migration 34" line, page does not white-screen.
//   /settings/general — the Maklumat Am card renders with the "migration 35"
//                       line; derived counts print.
//   /filings/laporan  — the generator page renders; pressing "起草" on an
//                       org with no activities answers the honest "nothing
//                       to report" sentence, and ai_usage stays EMPTY (the
//                       refusal costs nothing — checked in the database).
//
// Zero AI cost. ZZZ org/user deleted in finally.
//   node scripts/probe-d2-56.mjs
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
const TEST_EMAIL = "zzz-probe-d2@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE D2 四个洞（可删）";

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
  await page.type('input[name="name"]', ORG_NAME);
  for (const el of await page.$$("button")) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (t.includes("创建组织")) {
      await el.click();
      break;
    }
  }
  for (let i = 0; i < 20 && !orgId; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // Is migration 34 applied on this database? The probe reports honestly
  // either way (fail-open when missing, real storage when present).
  const auditorsProbe = await rest(`/auditors?select=id&limit=1`);
  const m34Applied = auditorsProbe.status === 200;
  console.log(`migration 34 on this DB: ${m34Applied ? "APPLIED" : "not yet"}`);

  // --- /members: the Juruaudit card ---------------------------------------
  await page.goto(`${BASE}/members`, { waitUntil: "networkidle2" });
  let text = await page.evaluate(() => document.body.innerText || "");
  check("/members renders the auditors card", text.includes("审计员名单"));
  check(
    m34Applied
      ? "auditors card shows no db-behind note (34 applied)"
      : "auditors card says migration 34 honestly (fail-open)",
    m34Applied ? !text.includes("migration 34") : text.includes("migration 34"),
  );
  check(
    "/members did not white-screen",
    text.includes("理事名单"),
  );

  // --- /settings/general: Maklumat Am -------------------------------------
  await page.goto(`${BASE}/settings/general`, { waitUntil: "networkidle2" });
  text = await page.evaluate(() => document.body.innerText || "");
  // zh locale renders the zh title line ("基本资料（eROSES）").
  check("/settings/general renders Maklumat Am", text.includes("基本资料"));
  check("derived counts printed", /职位数 \d+ 人/.test(text), text.slice(0, 0));
  const m35Applied = !text.includes("migration 35");
  console.log(`migration 35 on this DB (per UI): ${m35Applied ? "APPLIED" : "not yet"}`);

  // --- /filings/laporan: the generator, empty-org honest refusal ----------
  await page.goto(`${BASE}/filings/laporan`, { waitUntil: "networkidle2" });
  text = await page.evaluate(() => document.body.innerText || "");
  check("/filings/laporan renders", text.includes("活动报告"));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("起草"),
    );
    b?.click();
  });
  await page.waitForFunction(
    () => {
      const red = document.querySelector("[class*='border-red']");
      return !!(red && (red.textContent ?? "").trim().length > 5);
    },
    { timeout: 30000, polling: 500 },
  );
  const refusal = await page.evaluate(
    () => document.querySelector("[class*='border-red']")?.textContent ?? "",
  );
  check(
    "empty org gets the honest 'nothing to report' sentence",
    refusal.includes("没有内容可以写") || refusal.includes("先在日历"),
    refusal.slice(0, 120),
  );
  const usage = await (await rest(`/ai_usage?org_id=eq.${orgId}&select=id`)).json();
  check(
    "the refusal cost NOTHING (ai_usage empty)",
    Array.isArray(usage) && usage.length === 0,
    `rows=${Array.isArray(usage) ? usage.length : "?"}`,
  );

  // --- /filings links to the generator ------------------------------------
  await page.goto(`${BASE}/filings`, { waitUntil: "networkidle2" });
  text = await page.evaluate(() => document.body.innerText || "");
  check("/filings links to the Laporan generator", text.includes("生成活动报告"));

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  console.log(failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures.join("; ")}`);
}

main()
  .catch((e) => {
    console.error("PROBE ERROR:", e.message);
    failures.push("probe threw");
  })
  .finally(async () => {
    try {
      if (orgId) {
        for (const p of [
          `/auditors?org_id=eq.${orgId}`,
          `/org_bank_accounts?org_id=eq.${orgId}`,
          `/ai_usage?org_id=eq.${orgId}`,
          `/app_errors?org_id=eq.${orgId}`,
          `/members_roles?org_id=eq.${orgId}`,
          `/fence_usage?org_id=eq.${orgId}`,
          `/orgs?id=eq.${orgId}`,
        ]) {
          await rest(p, { method: "DELETE" }).catch(() => {});
        }
        const left = await (await rest(`/orgs?id=eq.${orgId}&select=id`)).json().catch(() => null);
        console.log(
          Array.isArray(left) && left.length === 0
            ? "org deleted cleanly"
            : `⚠ org row may remain: ${JSON.stringify(left)}`,
        );
      }
      if (userId) await admin(`/users/${userId}`, { method: "DELETE" }).catch(() => {});
    } finally {
      if (browser) await browser.close();
      console.log("cleaned up");
      process.exitCode = failures.length === 0 ? 0 : 1;
    }
  });
