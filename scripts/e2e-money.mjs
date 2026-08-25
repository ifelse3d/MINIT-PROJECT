// End-to-end check of tonight's riskiest changes (2026-08-25), against the
// REAL dev server + REAL database, inside a purpose-made test org that is
// deleted at the end:
//
//   S0-2  issueReceipts → issue_receipts() RPC (numbers from the DB, idempotent)
//   S0-1  /api/receipt-pdf serves a PDF from receiptNo alone (server look-up)
//   R-5   the ≥8-row register renders as the list view
//   F-4   a fresh page load hydrates the register back from the database
//
// Uses the same admin-API helpers as scripts/screenshots.mjs. Only ever
// touches the "ZZZ e2e" test user/org it creates; deletes them afterwards.
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

const TEST_EMAIL = "zzz-e2e-money@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ e2e 测试社团（可删）";
const BASE = "http://localhost:3000";

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}

async function admin(pathname, opts = {}) {
  return fetch(`${SUPA_URL}/auth/v1/admin${pathname}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
}
async function rest(pathname, opts = {}) {
  return fetch(`${SUPA_URL}/rest/v1${pathname}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers ?? {}),
    },
  });
}

async function ensureUser() {
  const list = await (await admin(`/users?page=1&per_page=100`)).json();
  const users = Array.isArray(list.users) ? list.users : [];
  const existing = users.find((u) => u.email === TEST_EMAIL);
  if (existing) {
    await admin(`/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }),
    });
    return existing.id;
  }
  const res = await admin(`/users`, {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  });
  const body = await res.json();
  return body.id;
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

async function run() {
  const userId = await ensureUser();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 1280, height: 900 });
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));

  // language: settle on 中文 so the picker never intercepts clicks
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  // --- sign in -------------------------------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  check("sign in lands on /", page.url() === `${BASE}/`);

  // --- create the test org -------------------------------------------------
  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  await page.type('input[name="name"]', ORG_NAME);
  await clickByText(page, "button", "创建组织");
  await new Promise((r) => setTimeout(r, 6000));
  // A-4 (2026-08-25): creating an org (no constitution attached) lands HOME
  // with the "what next" card, no longer on the constitution page.
  check("org creation lands home with the welcome card", page.url().includes("welcome=1"));

  // --- type 9 donations in (TypeDonations grid) ----------------------------
  await page.goto(`${BASE}/money/receipts`, { waitUntil: "networkidle2" });
  // Open the typed-collection grid (collapsed behind its own button).
  await clickByText(page, "button", "打字输入整份名单");
  await new Promise((r) => setTimeout(r, 800));

  // The grid: name + amount per row; typing in a row makes a fresh blank row.
  for (let i = 1; i <= 9; i++) {
    const nameInputs = await page.$$('input[aria-label^="捐款人"]');
    const amountInputs = await page.$$('input[inputmode="decimal"]');
    if (nameInputs.length === 0 || amountInputs.length === 0) break;
    await nameInputs[nameInputs.length - 1].type(`测试捐款人${i}`);
    await amountInputs[amountInputs.length - 1].type("10");
    await new Promise((r) => setTimeout(r, 250));
  }
  // add-to-register button
  const added = await clickByText(page, "button", "加进名册");
  await new Promise((r) => setTimeout(r, 1500));
  const bodyText = await page.evaluate(() => document.body.innerText);
  const rowsIn = /9 笔|9 筆|9 donation/.test(bodyText) || bodyText.includes("测试捐款人9");
  check("9 typed donations reach the register", added && rowsIn);

  // R-5: list view with search box appears at >= 8 rows
  const hasSearch = await page.$('input[placeholder*="搜索姓名"]');
  check("R-5 list view (search box) at >=8 rows", Boolean(hasSearch));

  // --- issue receipts through the RPC --------------------------------------
  await clickByText(page, "button", "生成正式收据");
  await new Promise((r) => setTimeout(r, 600));
  await clickByText(page, "button", "是，生成收据");
  await new Promise((r) => setTimeout(r, 4000));
  let text = await page.evaluate(() => document.body.innerText);

  // S0-2: default-prefix guidance should appear first for a brand-new org
  const askedPrefix = text.includes("开第一张收据之前") || text.includes("MIN 继续");
  check("S0-2 needs_prefix guidance appears for a fresh org", askedPrefix);
  if (askedPrefix) {
    await clickByText(page, "button", "就用 MIN 继续");
    await new Promise((r) => setTimeout(r, 5000));
    text = await page.evaluate(() => document.body.innerText);
  }
  const issued = /MIN-\d{4}-0001/.test(text);
  check("S0-2 receipts issued via the RPC (MIN-YYYY-0001 visible)", issued);
  const savedNote = text.includes("收据已保存到组织历史");
  check("issue reports 'saved to history' (DB path, not local)", savedNote);

  // --- S0-1: the PDF comes back from the receipt number alone --------------
  const m = text.match(/MIN-\d{4}-\d{4,}/);
  if (m) {
    const pdfRes = await page.evaluate(async (receiptNo) => {
      const r = await fetch("/api/receipt-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptNo }),
      });
      return { status: r.status, type: r.headers.get("content-type") ?? "" };
    }, m[0]);
    check("S0-1 /api/receipt-pdf 200 + application/pdf from receiptNo alone",
      pdfRes.status === 200 && pdfRes.type.includes("pdf"), `status=${pdfRes.status}`);
    const forged = await page.evaluate(async () => {
      const r = await fetch("/api/receipt-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptNo: "MIN-2099-9999" }),
      });
      return r.status;
    });
    check("S0-1 unknown receiptNo → 404 (no invented PDF)", forged === 404, `status=${forged}`);
  } else {
    check("S0-1 receipt number found on page", false);
  }

  // --- S0-1b: the month-end e-Invois file from month alone ------------------
  {
    const month = new Date().toISOString().slice(0, 7);
    const ok = await page.evaluate(async (m) => {
      const r = await fetch("/api/einvois-xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: m, fileIndex: 0 }),
      });
      return { status: r.status, type: r.headers.get("content-type") ?? "" };
    }, month);
    check("S0-1 /api/einvois-xlsx 200 + xlsx from month alone (server data)",
      ok.status === 200 && ok.type.includes("spreadsheet"), `status=${ok.status}`);
    const empty = await page.evaluate(async () => {
      const r = await fetch("/api/einvois-xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: "2020-01", fileIndex: 0 }),
      });
      return r.status;
    });
    check("S0-1 empty month → 4xx, never an invented tax file",
      empty >= 400 && empty < 500, `status=${empty}`);
  }

  // --- F-4: a hard reload hydrates the register from the DB ----------------
  await page.evaluate(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("minit:")) localStorage.removeItem(k);
    }
  });
  await page.goto(`${BASE}/money/receipts`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2500));
  const afterReload = await page.evaluate(() => document.body.innerText);
  check("F-4 register hydrates from the DB after local wipe",
    /MIN-\d{4}-0001/.test(afterReload));

  // --- receipts really are in the database ---------------------------------
  const orgRow = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
  const orgId = orgRow[0]?.id;
  const countReceipts = async () => {
    const r = await rest(`/receipts?org_id=eq.${orgId}&select=id`);
    return (await r.json()).length;
  };
  const n1 = await countReceipts();
  check("receipts row count matches 9", n1 === 9, `count=${n1}`);

  // --- fresh-session sign-in: OrgChip must agree with the server -----------
  // A brand-new browser session (no cookies, no localStorage) signing into an
  // account that already owns an org has no minit_active_org cookie, so the
  // server resolves the org by falling back to the first membership. The
  // sidebar OrgChip runs the same fallback client-side — it must show the org
  // name, never "填写您的机构名称" next to a header printing that very name.
  {
    const ctx = await browser.createBrowserContext();
    const fresh = await ctx.newPage();
    fresh.setDefaultTimeout(30000);
    await fresh.setViewport({ width: 1280, height: 900 });
    fresh.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));
    await fresh.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("minit.lang.v2", "zh");
        document.cookie = "minit-lang=zh;path=/";
      } catch {}
    });
    await fresh.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await fresh.type('input[type="email"]', TEST_EMAIL);
    await fresh.type('input[type="password"]', TEST_PASSWORD);
    await Promise.all([
      fresh.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
      fresh.click('button[type="submit"]'),
    ]);
    // The chip resolves asynchronously — poll until it settles.
    let freshText = "";
    for (let i = 0; i < 20; i++) {
      freshText = await fresh.evaluate(() => document.body.innerText);
      if (freshText.includes("您正在记录的机构")) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    check(
      "fresh-session OrgChip shows the org, not 'name your organisation'",
      freshText.includes("您正在记录的机构") &&
        freshText.includes(ORG_NAME) &&
        !freshText.includes("填写您的机构名称"),
    );
    await ctx.close();
  }

  // --- delete the org through Settings (typed confirmation) ----------------
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle2" });
  // EXACT text: "删除…" is the org-delete opener; a loose match hits the
  // register-delete opener ("删除登记簿…") that sits above it.
  const openers = await page.$$("button");
  for (const b of openers) {
    const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
    if (t === "删除…") {
      await b.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 500));
  const confirmInputs = await page.$$('input[name="confirmName"]');
  if (confirmInputs.length > 0) {
    await confirmInputs[0].type(ORG_NAME);
    await clickByText(page, "button", "永久删除");
    await new Promise((r) => setTimeout(r, 8000));
  } else {
    console.log("NOTE: confirmName input not found (org-delete form did not open)");
  }
  const orgsLeft = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
  if (orgsLeft.length > 0) {
    // Fall back to direct cleanup so nothing is ever left behind.
    for (const o of orgsLeft) {
      await rest(`/receipts?org_id=eq.${o.id}`, { method: "DELETE" });
      await rest(`/donations?org_id=eq.${o.id}`, { method: "DELETE" });
      await rest(`/members_roles?org_id=eq.${o.id}`, { method: "DELETE" });
      await rest(`/orgs?id=eq.${o.id}`, { method: "DELETE" });
    }
    console.log("NOTE: settings delete flow did not remove the org; cleaned up directly");
  } else {
    check("delete-organisation flow removed the org", true);
  }
  await admin(`/users/${userId}`, { method: "DELETE" });

  await browser.close();
  console.log("page errors:", consoleErrors.length, consoleErrors.slice(0, 5));
  console.log(failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures.join("; ")}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch(async (e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
