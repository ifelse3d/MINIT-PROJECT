// 130 §9 — the floating panel's PAPERCLIP (90's other half; 119 A-6):
//
//   on a page that is not the home screen, open MinitAI, attach a photo,
//   send → MinitAI cannot place it and ASKS (one-tap answers) → answer
//   "meeting notes" → the card says it was read and offers "open and check"
//   → /minutes opens on the handed reading (the same one-shot courier the
//   home page's box uses).
//
// 🔴 NO VENDOR CALL, NO MONEY: /api/intake is intercepted and answered with
// a canned reading, keyed on the kind the app actually sent (read from the
// FormData). The real client code runs. Purpose-made test org, deleted at
// the end.
//
//   E2E_BASE=http://localhost:3100 node scripts/e2e-panel-clip-130.mjs
import { readFileSync, writeFileSync } from "node:fs";
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

const TEST_EMAIL = "zzz-e2e-panel-clip-130@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
// Already uppercase: the create form uppercases as you type (C-4, 拍板 33),
// and the REST lookups below must match what actually got stored.
const ORG_NAME = "ZZZ E2E 面板夹档测试社团（可删）";
// 125: E2E_BASE lets the suite run against a server on another port (port 3000 was held by an unrelated dev server on 2026-09-08).
const BASE = process.env.E2E_BASE || "http://localhost:3000";

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
  return (await res.json()).id;
}

async function clickByText(page, selector, text, { exact = false } = {}) {
  const els = await page.$$(selector);
  for (const el of els) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (exact ? t === text : t.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
}


/** A 1×1 PNG — nothing here ever asks anyone to READ it. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const field = (value, snippet) => ({ value, confidence: "check", source_ref: { location: "photo 1", snippet } });
const CANNED_UNKNOWN = { kind: "unknown" };
const CANNED = {
  kind: "meeting_notes",
  page: "/minutes",
  fileName: "page.png",
  storagePath: null,
  extraction: {
    meeting_type: field("committee", "Mesyuarat Jawatankuasa"),
    meeting_date: field("2026-05-20", "20/5/2026"),
    meeting_venue: field("Dewan Contoh Klip", "Dewan Contoh Klip"),
    attendees: [],
    resolutions: [{ text: field("Contoh keputusan", "Contoh keputusan") }],
    figures: [],
    office_bearers: [],
  },
};

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
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
    window.__intakeCalls = [];
    const realFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : input?.url ?? "";
        if (url.includes("/api/intake") && init?.body instanceof FormData) {
          const kind = String(init.body.get("kind") ?? "");
          window.__intakeCalls.push({ kind: kind || null });
          init.headers = { ...(init.headers ?? {}), "x-shot-kind": kind };
        }
      } catch {}
      return realFetch.call(this, input, init);
    };
  });
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.url().includes("/api/intake") && req.method() === "POST") {
      const kind = req.headers()["x-shot-kind"] ?? "";
      void req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(kind === "" ? CANNED_UNKNOWN : CANNED),
      });
      return;
    }
    void req.continue();
  });
  let orgId = null;
  const has = (t) => page.evaluate((x) => (document.body.innerText || "").includes(x), t);
  const waitText = (t, ms = 15000) =>
    page
      .waitForFunction((x) => (document.body.innerText || "").includes(x), { timeout: ms }, t)
      .then(() => true)
      .catch(() => false);
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', TEST_EMAIL);
    await page.type('input[type="password"]', TEST_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
    await page.click('[data-probe="road-manual"]');
    await new Promise((r) => setTimeout(r, 300));
    await page.type('input[name="name"]', ORG_NAME);
    await clickByText(page, "button", "创建组织");
    await new Promise((r) => setTimeout(r, 6000));
    const found = await (await rest(`/orgs?select=id&name=eq.${encodeURIComponent(ORG_NAME)}`)).json();
    orgId = found?.[0]?.id ?? null;
    check("org created", orgId !== null);

    // A page that is NOT the chat screen — the launcher lives there.
    await page.goto(`${BASE}/money`, { waitUntil: "networkidle2" });
    await page.waitForSelector('button[aria-label="MinitAI"]', { timeout: 15000 });
    await page.click('button[aria-label="MinitAI"]');
    await page.waitForSelector('[data-probe="panel-attach"]', { timeout: 15000 });
    check("the floating panel has a paperclip", true);

    const file = path.join(ROOT, "eval", "reports", "panel-clip-130.png");
    writeFileSync(file, TINY_PNG);
    const input = await page.$('aside input[type="file"]');
    check("the panel has a file input", input !== null);
    await input.uploadFile(file);
    await page.waitForSelector('[data-probe="panel-staged"]', { timeout: 15000 });
    check("the file is staged, visible, before anything is sent", true);
    const calls0 = await page.evaluate(() => window.__intakeCalls.length);
    check("staging sends NOTHING (no charge before the tap)", calls0 === 0, `${calls0} call(s)`);

    await page.click('[data-probe="panel-send-file"]');
    check("MinitAI could not place the page and ASKS", await waitText("是哪一种"));
    const calls1 = await page.evaluate(() => window.__intakeCalls);
    check(
      "the first send carried no kind (classifier road)",
      calls1.length === 1 && calls1[0].kind === null,
      JSON.stringify(calls1),
    );

    await clickByText(page, "button", "会议笔记");
    check("the card says it was read", await waitText("读好了"));
    const calls2 = await page.evaluate(() => window.__intakeCalls);
    check(
      "the answer re-sends WITH the kind (no second classify)",
      calls2.length === 2 && calls2[1].kind === "meeting_notes",
      JSON.stringify(calls2),
    );
    check("the card offers 'open and check'", await has("打开核对"));
    check(
      "the staged strip is gone after the read",
      (await page.$('[data-probe="panel-staged"]')) === null,
    );

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}),
      clickByText(page, "a", "打开核对"),
    ]);
    await new Promise((r) => setTimeout(r, 1500));
    check("'open and check' lands on /minutes", page.url().includes("/minutes"), page.url());
    check("/minutes opens on the handed reading (the courier worked)", await waitText("Dewan Contoh Klip"));
  } finally {
    if (orgId) {
      await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
    }
    await admin(`/users/${userId}`, { method: "DELETE" });
    await browser.close();
  }
  console.log("page errors:", pageErrors.length, pageErrors.slice(0, 5));
  console.log(failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures.join("; ")}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
