// Work order 97 — the zero-AI UI contract probe for Stages 4/5/7, against
// local `next start` + the real DB. What it pins:
//
//   §4  sidebar rows GONE (交现金 / 现有资金 / 组织与分会) while their routes
//       live; /money/balance redirects to /money/report; the balance card
//       (eye-hidden) sits at the top of the statement.
//   §3d sidebar row 条文全文 gone; /constitution/clauses still answers.
//   §5  "Manage receipts" row gone (railOnly); Receipt history carries the
//       door to /money/receipts; recording an expense ends at the "this
//       row's receipt" card; with migration 40 NOT applied the "no receipt"
//       button fails OPEN with the honest migration-40 sentence; zero
//       ai_usage rows the whole way (nothing here is an AI road).
//   §7  the settings nav shows no System check row to a non-operator and
//       /settings/system tells them where the impersonation report went;
//       /settings/feedback carries it; /settings/members at 375px has NO
//       horizontal overflow even with a long-email member (the J 8/30
//       broken phone page).
//
// Zero AI, zero vendor calls. ZZZ user/org deleted in finally.
//
//   node scripts/probe-ui-97.mjs
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
const HAS_CONTACT = Boolean(env.NEXT_PUBLIC_CONTACT_EMAIL);
// Long on purpose: an email is one unbreakable token — the §7 overflow bug.
const TEST_EMAIL = "zzz-probe-ui97-very-long-member-email-address@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE UI97（可删）";

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
  // §1 (work order 104): /orgs/new opens on a FORK now — "I have the
  // constitution" or "I'll type it myself". One tap to the form these
  // scripts have always driven; a no-op wherever there is no fork.
  await page.evaluate(() =>
    document.querySelector('[data-probe="road-manual"]')?.click(),
  );
  await new Promise((r) => setTimeout(r, 250));
  await page.type('input[name="name"]', ORG_NAME);
  for (const el of await page.$$("button")) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (t.includes("创建组织")) {
      await el.click();
      break;
    }
  }
  for (let i = 0; i < 30 && !orgId; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // === §4 + §3d + §5: the menu contract ===================================
  // Read /more, not the desktop rail: the sidebar's groups are closed-by-
  // default dropdowns (their children are not in innerText), while /more
  // renders every visible child flat — SAME source (visibleGroupChildren),
  // so the contract is identical.
  await page.goto(`${BASE}/more`, { waitUntil: "networkidle2" });
  const sidebarText = await page.evaluate(() => document.body.innerText ?? "");
  check("sidebar has NO 交现金 row (§4)", !sidebarText.includes("交现金"));
  check("sidebar has NO 现有资金 row (§4)", !sidebarText.includes("现有资金"));
  check("sidebar has NO 组织与分会 row (§4)", !sidebarText.includes("组织与分会"));
  check("sidebar has NO 条文全文 row (§3d)", !sidebarText.includes("条文全文"));
  check("sidebar has NO 开收据 · 管理 row (§5)", !sidebarText.includes("开收据 · 管理"));
  check("sidebar still lists 财报", sidebarText.includes("财报"));
  check("sidebar still lists 收据历史", sidebarText.includes("收据历史"));
  check("sidebar still lists 章程", sidebarText.includes("章程"));

  // === §4: /money/balance redirects; the card tops the statement ==========
  await page.goto(`${BASE}/money/balance`, { waitUntil: "networkidle2" });
  // The redirect arrives as a 200 + client-side navigation (Next serves the
  // RSC redirect and the router follows) — wait for the LANDING, not the
  // response (first run died on "execution context destroyed" right here).
  await page
    .waitForFunction(() => location.pathname === "/money/report", { timeout: 15000 })
    .catch(() => {});
  check(
    "/money/balance lands on /money/report (§4)",
    page.url().includes("/money/report"),
    page.url(),
  );
  // Wait for the statement TABLE, not the section title — the title streams
  // first and the first probe run read a half-streamed page.
  await page
    .waitForFunction(
      () => (document.body.innerText || "").includes("PENERIMAAN"),
      { timeout: 30000 },
    )
    .catch(() => {});
  const reportText = await page.evaluate(() => document.body.innerText || "");
  console.log("report body head:", reportText.slice(0, 300).replace(/\n/g, " | "));
  check("statement page shows 现有资金 block (§4)", reportText.includes("现有资金"));
  check("the amount starts hidden (RM ••••••)", reportText.includes("RM ••••••"));
  check("the reveal button is there (看金额)", reportText.includes("看金额"));

  // === §3d: the clauses route still answers (citation anchor) =============
  await page.goto(`${BASE}/constitution/clauses`, { waitUntil: "networkidle2" });
  const clausesText = await page.evaluate(() => document.body.innerText || "");
  check(
    "/constitution/clauses route alive (§3d)",
    clausesText.includes("章程") &&
      (clausesText.includes("还没有读过") || clausesText.includes("条")),
  );

  // === §5: Receipt history carries the register door ======================
  await page.goto(`${BASE}/money/history`, { waitUntil: "networkidle2" });
  const histText = await page.evaluate(() => document.body.innerText || "");
  check("Receipt history shows the register door (§5)", histText.includes("整本登记簿"));
  await page.evaluate(() => {
    const a = [...document.querySelectorAll("a")].find((x) =>
      (x.textContent ?? "").includes("整本登记簿"),
    );
    a?.click();
  });
  await page
    .waitForFunction(() => location.pathname === "/money/receipts", { timeout: 15000 })
    .catch(() => {});
  check(
    "the door lands on /money/receipts (§5)",
    (await page.evaluate(() => location.pathname)) === "/money/receipts",
  );

  // === §5: recording an expense ends at "this row's receipt" ==============
  await page.goto(`${BASE}/money/expenses`, { waitUntil: "networkidle2" });
  await page.type('input[placeholder*="礼堂墙漆"]', "ZZZ 探针开支（可删）");
  await page.type('input[placeholder="120.00"]', "12.34");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("记进开支簿"),
    );
    b?.click();
  });
  await page.waitForSelector('[data-probe="expense-receipt-ask"]', { timeout: 20000 });
  const askText = await page.evaluate(
    () => document.querySelector('[data-probe="expense-receipt-ask"]')?.textContent ?? "",
  );
  check(
    "the last-step receipt card appears after saving (§5)",
    askText.includes("这一笔的单据") && askText.includes("12.34"),
    askText.slice(0, 120),
  );
  // Migration 40 is expected NOT applied yet — "no receipt" must fail OPEN
  // with the honest sentence. (Once J applies 40 this branch flips: the row
  // then shows 没有单据（已如实记录）; both outcomes are accepted, and which
  // one ran is printed.)
  await page.evaluate(() => {
    const card = document.querySelector('[data-probe="expense-receipt-ask"]');
    const b = [...(card?.querySelectorAll("button") ?? [])].find((x) =>
      (x.textContent ?? "").includes("没有单据"),
    );
    b?.click();
  });
  const noReceiptOutcome = await page
    .waitForFunction(
      () => {
        const t = document.body.innerText || "";
        if (t.includes("migration 40")) return "db_behind";
        if (t.includes("没有单据（已如实记录）")) return "recorded";
        return false;
      },
      { timeout: 20000, polling: 500 },
    )
    .then((h) => h.jsonValue())
    .catch(() => "neither");
  console.log(`"no receipt" outcome: ${noReceiptOutcome}`);
  check(
    '"no receipt" answers honestly either way (§5)',
    noReceiptOutcome === "db_behind" || noReceiptOutcome === "recorded",
    String(noReceiptOutcome),
  );

  // === §7: System check row hidden; report moved to Feedback ==============
  await page.goto(`${BASE}/settings/display`, { waitUntil: "networkidle2" });
  const settingsNavText = await page.evaluate(() => {
    const navs = [...document.querySelectorAll('nav[aria-label="Settings"]')];
    return navs.map((n) => n.innerText).join("\n");
  });
  check(
    "settings nav shows NO 系统检查 to a non-operator (§7)",
    !settingsNavText.includes("系统检查"),
  );
  check("settings nav still shows 反馈", settingsNavText.includes("反馈"));

  await page.goto(`${BASE}/settings/system`, { waitUntil: "networkidle2" });
  const sysText = await page.evaluate(() => document.body.innerText || "");
  check(
    "/settings/system tells a non-operator where to go (§7)",
    sysText.includes("平台管理员") && sysText.includes("反馈"),
  );

  await page.goto(`${BASE}/settings/feedback`, { waitUntil: "networkidle2" });
  const fbText = await page.evaluate(() => document.body.innerText || "");
  if (HAS_CONTACT) {
    check("Feedback page carries 检举冒用 (§7)", fbText.includes("检举冒用"));
  } else {
    console.log("[SKIP] 检举冒用 block — NEXT_PUBLIC_CONTACT_EMAIL not set locally");
  }

  // === §7: /settings/members at 375px — NO horizontal overflow ============
  await page.setViewport({ width: 375, height: 812 });
  await page.goto(`${BASE}/settings/members`, { waitUntil: "networkidle2" });
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("成员"),
    { timeout: 15000 },
  );
  const overflow = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  check(
    "375px /settings/members has NO horizontal overflow (§7)",
    overflow.scrollW <= overflow.clientW + 1,
    `scrollWidth ${overflow.scrollW} vs clientWidth ${overflow.clientW}`,
  );
  const memberShown = await page.evaluate(() =>
    (document.body.innerText || "").includes("zzz-probe-ui97"),
  );
  check("the long-email member is on the page (the overflow bait)", memberShown);

  // === zero AI the whole way ==============================================
  const usage = await (await rest(`/ai_usage?org_id=eq.${orgId}&select=id`)).json();
  check(
    "ai_usage has 0 rows (zero AI probe)",
    Array.isArray(usage) && usage.length === 0,
    JSON.stringify(usage).slice(0, 100),
  );

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
          `/expenses?org_id=eq.${orgId}`,
          `/ai_usage?org_id=eq.${orgId}`,
          `/app_errors?org_id=eq.${orgId}`,
          `/uploads?org_id=eq.${orgId}`,
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
