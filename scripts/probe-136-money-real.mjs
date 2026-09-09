// 136 §2-5 — ONE REAL READ of the Money line, end to end, with screenshots.
//
// Two synthetic pages (no personal data) go in through the HOME DOOR exactly
// as J would do it on stage:
//   1. eval/cases/case-05-ledger-jun/input.png — a printed donation ledger:
//      home → product card → /money (every row badged income) → transfer on
//      one row → add to register → /money/issue → receipts → the PDF.
//   2. eval/cases/case-11-ledger-agm-summary/input.png — the AGM KEWANGAN
//      block: home → /money → yellow summary card + income/expense/balance
//      badges + the total folded → "record as spending" → /money/expenses
//      pre-filled (nothing saved).
// Real AI: 2 × (classify + extract) ≈ US$0.02–0.06. Screenshots land in
// eval/reports/ (git-ignored). Throw-away user + org, removed at the end.
//
//   node scripts/probe-136-money-real.mjs          (dev server on :3000)
//   E2E_BASE=http://localhost:3100 node scripts/probe-136-money-real.mjs
//   ONLY=A | ONLY=B                                 (one of the two flows)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const root = process.cwd();
const env = Object.fromEntries(
  readFileSync(path.join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const SUPA_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SERVICE) throw new Error("SUPABASE_URL / SERVICE_ROLE_KEY missing in .env.local");
const TEST_EMAIL = "zzz-probe136@example.com";
const TEST_PASSWORD = "Probe136!pass";
const ORG_NAME = "zzz probe136 money";
const BASE = process.env.E2E_BASE || "http://localhost:3000";
const OUT = path.join(root, "eval", "reports");
mkdirSync(OUT, { recursive: true });

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures.push(name);
}
async function admin(pathname, opts = {}) {
  return fetch(`${SUPA_URL}/auth/v1/admin${pathname}`, {
    ...opts,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
}
async function rest(pathname, opts = {}) {
  return fetch(`${SUPA_URL}/rest/v1${pathname}`, {
    ...opts,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(opts.headers || {}) },
  });
}
async function ensureUser() {
  const list = await (await admin(`/users?page=1&per_page=100`)).json();
  const users = Array.isArray(list.users) ? list.users : [];
  const existing = users.find((u) => u.email === TEST_EMAIL);
  if (existing) {
    await admin(`/users/${existing.id}`, { method: "PUT", body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }) });
    return existing.id;
  }
  const res = await admin(`/users`, { method: "POST", body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }) });
  return (await res.json()).id;
}
async function removeOrgs() {
  const rows = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
  for (const o of Array.isArray(rows) ? rows : []) {
    for (const t of ["receipts", "expenses", "donations", "members_roles"]) {
      await rest(`/${t}?org_id=eq.${o.id}`, { method: "DELETE" });
    }
    await rest(`/orgs?id=eq.${o.id}`, { method: "DELETE" });
  }
}
async function clickVisible(page, selector) {
  for (const el of await page.$$(selector)) {
    if (await el.evaluate((n) => n.offsetParent !== null)) {
      await el.click();
      return true;
    }
  }
  return false;
}
async function clickByText(page, selector, text) {
  for (const el of await page.$$(selector)) {
    const t = await el.evaluate((n) => n.textContent ?? "");
    const shown = await el.evaluate((n) => n.offsetParent !== null);
    if (shown && t.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `136-real-${name}.png`), fullPage: true });
const visible = (page, sel) =>
  page.evaluate((q) => [...document.querySelectorAll(q)].filter((el) => el.offsetParent !== null).length, sel);
const badgeKinds = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-probe="ledger-kind-badge"]')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => `${el.dataset.kind}:${el.dataset.confidence}`),
  );

/** Home door: stage one file, press Enter, wait for the product card. */
async function readThroughHomeDoor(page, file, label) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await sleep(800);
  const input = await page.$('[data-probe="chat-screen"] input[type="file"]');
  check(`${label}: home box has its file input`, Boolean(input));
  if (!input) return false;
  await input.uploadFile(file);
  await sleep(800);
  await shot(page, `${label}-0-staged`);
  // The conversation persists across reads: an earlier product card is still
  // on the page, so wait for a NEW card, then open the newest one.
  const before = (await page.$$('[data-probe="product-card"]')).length;
  await page.focus("#minit-ask-input");
  await page.keyboard.press("Enter");
  const t0 = Date.now();
  let cards = [];
  while (Date.now() - t0 < 150000) {
    cards = await page.$$('[data-probe="product-card"]');
    if (cards.length > before) break;
    const err = await page.evaluate(() => document.body.innerText.includes("读取失败") || document.body.innerText.includes("Could not"));
    if (err) break;
    await sleep(1500);
  }
  const card = cards.length > before;
  check(`${label}: MinitAI read it and offered the product card (${Math.round((Date.now() - t0) / 1000)}s)`, card);
  await shot(page, `${label}-1-home-card`);
  if (!card) {
    console.log("BODY:", (await page.evaluate(() => document.body.innerText)).slice(0, 1500));
    return false;
  }
  await cards[cards.length - 1].click();
  await sleep(2500);
  check(`${label}: the card opens /money`, page.url().includes("/money"), page.url());
  return true;
}

async function run() {
  const userId = await ensureUser();
  await removeOrgs();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 1280, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  try {
    // --- sign in, make the throw-away org ----------------------------------
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', TEST_EMAIL);
    await page.type('input[type="password"]', TEST_PASSWORD);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }), page.click('button[type="submit"]')]);
    await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
    await page.click('[data-probe="road-manual"]');
    await sleep(300);
    await page.type('input[name="name"]', ORG_NAME);
    await clickByText(page, "button", "创建组织");
    await sleep(6000);
    check("org created", page.url().includes("/orgs/welcome"), page.url());

    // --- 1. the donation ledger (case-05) ----------------------------------
    const only = process.env.ONLY ?? "";
    const okA = only === "B" ? false : await readThroughHomeDoor(page, path.join(root, "eval/cases/case-05-ledger-jun/input.png"), "A");
    if (okA) {
      await sleep(1000);
      let kinds = await badgeKinds(page);
      check("A: every row badged income by MinitAI", kinds.length > 0 && kinds.every((k) => k === "income:confirmed"), kinds.join(","));
      const addText = await page.evaluate(() =>
        [...document.querySelectorAll("button")].filter((b) => b.offsetParent !== null && b.textContent.includes("加入登记")).map((b) => b.textContent.trim())[0] ?? "");
      check("A: add-to-register counts the rows", /\(\d+\)/.test(addText) && !addText.includes("(0)"), addText);
      await shot(page, "A-2-money-badges");
      // One row by bank transfer, the rest cash (default).
      await clickByText(page, "button", "转账");
      await sleep(300);
      await clickByText(page, "button", "加入登记");
      await sleep(2000);
      const body = await page.evaluate(() => document.body.innerText);
      check("A: rows land in this round", /这一轮已记 \d+ 笔/.test(body));
      await shot(page, "A-3-added-round");
      // --- receipts for this round ---
      await page.goto(`${BASE}/money/issue`, { waitUntil: "networkidle2" });
      await sleep(1200);
      await clickByText(page, "button", "生成正式收据");
      await sleep(600);
      await clickByText(page, "button", "是，生成收据");
      await sleep(4000);
      let text = await page.evaluate(() => document.body.innerText);
      if (text.includes("开第一张收据之前") || text.includes("MIN 继续")) {
        await clickByText(page, "button", "就用 MIN 继续");
        await sleep(5000);
        text = await page.evaluate(() => document.body.innerText);
      }
      const m = text.match(/MIN-\d{4}-\d{4,}/);
      check("A: receipts issued (MIN-YYYY-0001)", Boolean(m), m ? m[0] : "");
      await shot(page, "A-4-receipts");
      if (m) {
        const pdf = await page.evaluate(async (receiptNo) => {
          const r = await fetch("/api/receipt-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receiptNo }) });
          const buf = new Uint8Array(await r.arrayBuffer());
          let bin = "";
          for (const b of buf) bin += String.fromCharCode(b);
          return { status: r.status, type: r.headers.get("content-type") ?? "", b64: btoa(bin) };
        }, m[0]);
        check("A: receipt PDF 200 application/pdf", pdf.status === 200 && pdf.type.includes("pdf"), `status=${pdf.status}`);
        if (pdf.status === 200) writeFileSync(path.join(OUT, "136-real-A-5-receipt.pdf"), Buffer.from(pdf.b64, "base64"));
      }
    }

    // --- 2. the AGM financial summary (case-11) ----------------------------
    const okB = only === "A" ? false : await readThroughHomeDoor(page, path.join(root, "eval/cases/case-11-ledger-agm-summary/input.png"), "B");
    if (okB) {
      await sleep(1000);
      const kinds = await badgeKinds(page);
      check("B: summary card (no donor on the page) shows", (await visible(page, '[data-probe="ledger-summary-notice"]')) === 1);
      check("B: badges income/expense/balance present", kinds.some((k) => k.startsWith("income")) && kinds.some((k) => k.startsWith("expense")) && kinds.some((k) => k.startsWith("balance")), kinds.join(","));
      const totalsLine = await page.evaluate(() => document.querySelector('[data-probe="ledger-totals-line"]')?.textContent ?? "");
      check("B: the Jumlah row is folded", totalsLine.includes("已隐藏"), totalsLine);
      const addText = await page.evaluate(() =>
        [...document.querySelectorAll("button")].filter((b) => b.offsetParent !== null && b.textContent.includes("加入登记")).map((b) => b.textContent.trim())[0] ?? "");
      check("B: nothing can enter the register (no donor named)", addText.includes("(0)"), addText);
      await shot(page, "B-2-money-summary-badges");
      const went = await clickVisible(page, '[data-probe="ledger-to-expense"]');
      await sleep(2000);
      check("B: record-as-spending → /money/expenses", went && page.url().includes("/money/expenses"), page.url());
      check("B: pre-fill notice shown", (await visible(page, '[data-probe="expense-prefill-notice"]')) === 1);
      const prefilled = await page.evaluate(() => ({
        amount: document.querySelector('input[inputmode="decimal"]')?.value ?? "",
        desc: [...document.querySelectorAll("input")].map((i) => i.value).find((v) => /礼堂|dewan|晚宴|开销/i.test(v)) ?? "",
      }));
      check("B: amount and purpose pre-filled", prefilled.amount !== "" && prefilled.desc !== "", JSON.stringify(prefilled));
      await shot(page, "B-3-expense-prefill");
    }
  } finally {
    await browser.close();
    await removeOrgs();
    await admin(`/users/${userId}`, { method: "DELETE" });
  }
  console.log("page errors:", pageErrors.length, pageErrors.slice(0, 5));
  console.log(failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures.join("; ")}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
