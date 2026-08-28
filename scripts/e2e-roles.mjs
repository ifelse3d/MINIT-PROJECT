// End-to-end ROLE + SAMPLE smoke (Stage W-3, work order 24), against the real
// dev server + database, inside purpose-made test users/org deleted at the end:
//
//   B-4  a collector CANNOT issue receipts — the server refuses and the screen
//        names who to ask (invite code generated in Settings, redeemed on
//        /orgs/join, so the whole invite path is exercised on the way)
//   0-1  the worked example is view-only: it cannot be saved into a real
//        organisation's history
//
// No AI is called anywhere in this flow.
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

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

const ADMIN_EMAIL = "zzz-e2e-roles-admin@example.com";
const COLLECTOR_EMAIL = "zzz-e2e-roles-collector@example.com";
const PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
// Already uppercase: the create form uppercases as you type (C-4, 拍板 33),
// and the REST lookups below must match what actually got stored.
const ORG_NAME = "ZZZ E2E 角色测试社团（可删）";
const BASE = "http://localhost:3000";

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}

const H = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
};
async function admin(pathname, opts = {}) {
  return fetch(`${SUPA_URL}/auth/v1/admin${pathname}`, { ...opts, headers: { ...H, ...(opts.headers ?? {}) } });
}
async function rest(pathname, opts = {}) {
  return fetch(`${SUPA_URL}/rest/v1${pathname}`, { ...opts, headers: { ...H, ...(opts.headers ?? {}) } });
}

async function ensureUser(email) {
  const list = await (await admin(`/users?page=1&per_page=100`)).json();
  const existing = (list.users ?? []).find((u) => u.email === email);
  if (existing) {
    await admin(`/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
    });
    return existing.id;
  }
  const res = await admin(`/users`, {
    method: "POST",
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  return (await res.json()).id;
}

async function clickByText(page, selector, text) {
  const els = await page.$$(selector);
  for (const el of els) {
    const t = await el.evaluate((n) => n.textContent ?? "");
    if (t.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bodyText = (page) => page.evaluate(() => document.body.innerText);

async function newPage(browser) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
      localStorage.setItem("minit.firstrun.v1", "done");
    } catch {}
  });
  return page;
}

async function signIn(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function cleanup() {
  const orgs = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
  for (const o of orgs) {
    await rest(`/orgs?id=eq.${o.id}`, { method: "DELETE" });
  }
  const list = await (await admin(`/users?page=1&per_page=100`)).json();
  for (const email of [ADMIN_EMAIL, COLLECTOR_EMAIL]) {
    const u = (list.users ?? []).find((x) => x.email === email);
    if (u) await admin(`/users/${u.id}`, { method: "DELETE" });
  }
}

async function run() {
  await ensureUser(ADMIN_EMAIL);
  await ensureUser(COLLECTOR_EMAIL);

  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const errors = [];

  try {
    // --- the admin: org + a collector invite code --------------------------
    const a = await newPage(browser);
    a.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await signIn(a, ADMIN_EMAIL);
    await a.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
    await a.type('input[name="name"]', ORG_NAME);
    await clickByText(a, "button", "创建组织");
    await sleep(6000);
    check("admin created the org", a.url().includes("welcome=1"));

    // /settings/members, not /settings: the settings section was split into
    // sub-routes (CLAUDE.md rule 13, "one step, one page") and the invite form
    // moved with it. This script kept visiting the old address and had been
    // failing these two checks ever since — found 2026-08-28.
    await a.goto(`${BASE}/settings/members`, { waitUntil: "networkidle2" });
    const roleSel = await a.$('select[name="role"]');
    check("invite form present in Settings", Boolean(roleSel));
    if (roleSel) await roleSel.select("collector");
    await clickByText(a, "button", "生成邀请码");
    await sleep(3000);
    const codeMatch = (await bodyText(a)).match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/);
    check("collector invite code generated", Boolean(codeMatch), codeMatch?.[0] ?? "no code on page");
    if (!codeMatch) throw new Error("no invite code — cannot continue");
    const code = codeMatch[0];

    // --- the collector joins with the code ---------------------------------
    const c = await newPage(browser);
    c.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await signIn(c, COLLECTOR_EMAIL);
    await c.goto(`${BASE}/orgs/join`, { waitUntil: "networkidle2" });
    await c.type('input[name="code"]', code);
    await c.type('input[name="name"]', "测试收款人");
    await clickByText(c, "button", "加入");
    // The success box shows ~1.2s then the form navigates home itself; either
    // sight of the welcome text or landing home with the org named counts.
    let joined = false;
    for (let i = 0; i < 10 && !joined; i++) {
      await sleep(1000);
      const txt = await bodyText(c);
      joined =
        txt.includes("欢迎加入") ||
        (c.url() === `${BASE}/` && txt.includes(ORG_NAME));
    }
    check("collector joined via the invite code", joined);
    // Let the form's own window.location.assign("/") land before navigating
    // anywhere else — a goto issued mid-redirect gets ERR_ABORTED.
    for (let i = 0; i < 8 && c.url() !== `${BASE}/`; i++) await sleep(1000);

    // --- B-4: the collector tries to issue receipts ------------------------
    await c.goto(`${BASE}/money/receipts`, { waitUntil: "networkidle2" });
    await clickByText(c, "button", "打字输入整份名单");
    await sleep(800);
    const nameInputs = await c.$$('input[aria-label^="捐款人"]');
    const amountInputs = await c.$$('input[inputmode="decimal"]');
    check("collector can reach the typing grid", nameInputs.length > 0);
    if (nameInputs.length > 0) {
      await nameInputs[nameInputs.length - 1].type("测试捐款人");
      await amountInputs[amountInputs.length - 1].type("10");
      await sleep(300);
      await clickByText(c, "button", "加进名册");
      await sleep(1200);
    }
    await clickByText(c, "button", "生成正式收据");
    await sleep(600);
    await clickByText(c, "button", "是，生成收据");
    await sleep(4000);
    const afterIssue = await bodyText(c);
    check(
      "B-4 collector is refused, told whose job it is",
      afterIssue.includes("您的角色不能开收据"),
    );
    // Scoped to THIS org — the database may hold other organisations' real
    // receipts, which are none of this test's business.
    const orgRows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
    ).json();
    const orgId = orgRows[0]?.id;
    const receipts = orgId
      ? await (await rest(`/receipts?org_id=eq.${orgId}&select=id&limit=1`)).json()
      : null;
    check(
      "B-4 nothing was written to receipts",
      Array.isArray(receipts) && receipts.length === 0,
      `rows=${Array.isArray(receipts) ? receipts.length : "?"}`,
    );

    // --- W-2 (work order 27): the claim flow, as the roles see it ----------
    // A collector may SUBMIT a claim; the decide controls (approve / reject /
    // mark paid) are the treasurer's and must not render for them. On a
    // database behind migration 25 the submit comes back as the honest
    // "db_behind" sentence — also a pass, recorded as such; after J applies
    // the migration this same script exercises the real submit.
    await c.goto(`${BASE}/money/expenses`, { waitUntil: "networkidle2" });
    const expensesText = await bodyText(c);
    check(
      "W-2 collector sees the claim form, not the treasurer's tools",
      expensesText.includes("交报销") &&
        !expensesText.includes("等您处理") &&
        !expensesText.includes("社团开支"),
    );
    const descInput = await c.$('input[placeholder*="礼堂墙漆"]');
    const amtInput = await c.$('input[placeholder="120.00"]');
    let claimOk = false;
    if (descInput && amtInput) {
      await descInput.type("测试报销：白漆两桶");
      await amtInput.type("45");
      await clickByText(c, "button", "交上去");
      await sleep(3000);
      const afterClaim = await bodyText(c);
      claimOk = afterClaim.includes("报销交上去了");
      const dbBehind = afterClaim.includes("migration 25");
      check(
        "W-2 collector can submit a claim (or is told the DB is behind, honestly)",
        claimOk || dbBehind,
        claimOk ? "submitted" : dbBehind ? "db_behind — becomes the real path after migration 25" : "neither message",
      );
      const collectorButtons = await c.evaluate(() =>
        [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim()),
      );
      check(
        "W-2 decide controls do not render for a collector",
        !collectorButtons.some(
          (t) => t === "✓ 批准" || t.includes("标「已付款」") || t.includes("确认退回"),
        ),
      );
    } else {
      check("W-2 claim form inputs found", false);
    }
    // The other half — the treasurer DECIDING — only exists once the claim
    // row exists (post-migration): admin sees the pending list and approves.
    if (claimOk) {
      await a.goto(`${BASE}/money/expenses`, { waitUntil: "networkidle2" });
      const adminSees = (await bodyText(a)).includes("等您处理");
      check("W-2 the admin sees the pending claim", adminSees);
      if (adminSees) {
        await clickByText(a, "button", "批准");
        await sleep(2500);
        check(
          "W-2 approving moves the claim to approved-unpaid",
          (await bodyText(a)).includes("已批准"),
        );
      }
    }

    // --- 0-1: the worked example is view-only ------------------------------
    await a.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
    await clickByText(a, "button", "看一个做好的示范");
    await sleep(1200);
    const sampleBanner = (await bodyText(a)).includes("这是示范内容");
    check("sample banner announces view-only", sampleBanner);

    // Stage 0-1's mechanism is button ABSENCE, not no-op clicks: a sample row
    // renders no Correct/Edit/absent controls at all. So the probe is: sample
    // content is visible, and zero editing controls exist for it.
    const sampleState = await a.evaluate(() => {
      const text = document.body.innerText;
      const buttons = [...document.querySelectorAll("button")].map(
        (b) => b.textContent ?? "",
      );
      return {
        rowsVisible: text.includes("majlis makan malam amal"),
        editControls: buttons.filter(
          (t) => t.includes("没错") || t.includes("修改") || t.includes("笔记里没写"),
        ).length,
      };
    });
    check(
      "0-1 sample rows are visible with ZERO edit controls",
      sampleState.rowsVisible && sampleState.editControls === 0,
      `rows=${sampleState.rowsVisible} controls=${sampleState.editControls}`,
    );

    // The sample is React state, DELIBERATELY never persisted (0-1) — a full
    // page load would clear it, which is itself correct behaviour. Navigate
    // the SPA way, through the rail link, like a person would.
    await a.click('a[href="/minutes/document"]');
    await sleep(1500);
    const docState = await a.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        (b.textContent ?? "").includes("保存到历史"),
      );
      return {
        saveButton: btn ? (btn.disabled ? "disabled" : "ENABLED") : "absent",
        text: document.body.innerText,
      };
    });
    // Two correct shapes: the sample's amber fields keep the page in its
    // not-ready state (no save button at all), or — if the sample ever ships
    // fully confirmed — the button must be disabled. ENABLED is the failure.
    check(
      "0-1 sample cannot be saved to history",
      docState.saveButton !== "ENABLED",
      `save button ${docState.saveButton}`,
    );
  } finally {
    await browser.close();
    await cleanup();
  }

  console.log("page errors:", errors.length, JSON.stringify(errors.slice(0, 3)));
  if (failures.length > 0 || errors.length > 0) {
    console.log("FAILED:", failures.join(" | "));
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED");
}

run().catch(async (e) => {
  console.error("E2E-ROLES CRASHED:", e);
  await cleanup().catch(() => {});
  process.exit(1);
});
