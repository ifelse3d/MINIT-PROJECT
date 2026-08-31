// Workbench screenshots (work order 100 §3 acceptance: 桌機＋375 手機寬).
// Seeds a finished conversation with a product card (zero AI), shoots the
// empty hero and the conversation state at both widths. ZZZ data, swept.
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
const TEST_EMAIL = "zzz-shot-workbench-100@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ WORKBENCH 截图（可删）";
const BASE = "http://localhost:3000";
const OUT = process.env.OUT_DIR || "C:/dev/minit-v2/eval/reports";

async function admin(p, opts = {}) {
  return fetch(`${SUPA_URL}/auth/v1/admin${p}`, {
    ...opts,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
}
async function rest(p, opts = {}) {
  return fetch(`${SUPA_URL}/rest/v1${p}`, {
    ...opts,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(opts.headers ?? {}) },
  });
}

const f = (v, c = "check") => ({ value: v, confidence: c, source_ref: c === "missing" ? null : { location: "photo 1", snippet: v } });
const miss = () => ({ value: "", confidence: "missing", source_ref: null });

function seededTurns() {
  const extraction = {
    meeting_type: f("agm", "confirmed"),
    meeting_date: f("2026-05-20", "confirmed"),
    meeting_venue: f("Dewan Contoh, Kangar"),
    attendees: [],
    resolutions: Array.from({ length: 8 }, (_, i) => ({ text: f(`Perkara contoh ${i + 1}`) })),
    figures: [
      { description: f("Kutipan derma bulanan"), amount_cents: { value: 83000, confidence: "check", source_ref: { location: "photo 1", snippet: "RM830" } } },
    ],
    office_bearers: [
      { position: f("Pengerusi"), person_name: f("Contoh Satu") },
      { position: f("Setiausaha"), person_name: f("Contoh Dua") },
    ],
  };
  const ledger = {
    page_title: miss(),
    rows: [
      { donor_name: miss(), donor_phone: miss(), amount_cents: { value: 83000, confidence: "check", source_ref: { location: "photo 1", snippet: "RM830" } }, purpose: f("Kutipan derma bulanan"), donated_at: miss() },
    ],
  };
  return [
    { role: "user", text: "nota-mesyuarat-mei.jpg（2 页）" },
    {
      role: "assistant",
      text: "做好了。笔记读完，会议记录（2026-05-20）整理出 8 条内容。我还看到 1 笔钱 —— 想一起记账就点第二张卡。这次用了 3 个 AI 动作。点卡片进去核对；要改哪里，进去后直接跟我说。",
      products: [
        { kind: "meeting_notes", page: "/minutes", fileName: "nota-mesyuarat-mei.jpg", extraction },
        { kind: "ledger_page", page: "/money", fileName: "nota-mesyuarat-mei.jpg", offer: true, extraction: ledger },
      ],
    },
  ];
}

async function run() {
  const rows0 = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
  for (const r of rows0 ?? []) await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
  const list = await (await admin(`/users?page=1&per_page=100`)).json();
  let userId = (list.users ?? []).find((u) => u.email === TEST_EMAIL)?.id;
  if (userId) {
    await admin(`/users/${userId}`, { method: "PUT", body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }) });
  } else {
    const res = await admin(`/users`, { method: "POST", body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }) });
    userId = (await res.json()).id;
  }

  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("minit.lang.v2", "zh");
        document.cookie = "minit-lang=zh;path=/";
      } catch {}
    });
    await page.setViewport({ width: 1280, height: 950 });
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await page.type('input[type="email"]', TEST_EMAIL);
    await page.type('input[type="password"]', TEST_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${BASE}/orgs/new`, { waitUntil: "domcontentloaded" });
    // §1 (work order 104): /orgs/new opens on a FORK now — "I have the
    // constitution" or "I'll type it myself". One tap to the form these
    // scripts have always driven; a no-op wherever there is no fork.
    await page.evaluate(() =>
      document.querySelector('[data-probe="road-manual"]')?.click(),
    );
    await new Promise((r) => setTimeout(r, 250));
    await page.type('input[name="name"]', ORG_NAME);
    const btns = await page.$$("button");
    for (const b of btns) {
      const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
      if (t.includes("创建组织")) { await b.click(); break; }
    }
    await new Promise((r) => setTimeout(r, 6000));
    const orgRows = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)).json();
    const orgId = orgRows?.[0]?.id;

    // 1 — empty hero, desktop + mobile
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: path.join(OUT, "workbench-100-desktop-empty.png") });
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: path.join(OUT, "workbench-100-mobile-empty.png"), fullPage: true });

    // 2 — a finished conversation with product cards
    await page.evaluate(
      ({ key, t }) => localStorage.setItem(key, JSON.stringify(t)),
      { key: `minit:${userId}:${orgId}:chat.home.v1`, t: seededTurns() },
    );
    await page.setViewport({ width: 1280, height: 950 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: path.join(OUT, "workbench-100-desktop-products.png") });
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: path.join(OUT, "workbench-100-mobile-products.png"), fullPage: true });

    // sanity: no horizontal overflow at 375
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log("375 horizontal overflow px:", overflow);
    console.log("saved shots to", OUT);
  } finally {
    try {
      const rows = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
      for (const r of rows ?? []) {
        await rest(`/members_roles?org_id=eq.${r.id}`, { method: "DELETE" }).catch(() => {});
        await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
      }
      const l = await (await admin(`/users?page=1&per_page=100`)).json();
      const u = (l.users ?? []).find((x) => x.email === TEST_EMAIL);
      if (u) await admin(`/users/${u.id}`, { method: "DELETE" });
    } catch {}
    await browser.close();
  }
}
run().catch((e) => { console.error(e); process.exitCode = 1; });
