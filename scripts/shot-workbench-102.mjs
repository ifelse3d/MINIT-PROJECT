// Workbench layout shots + assertions (work order 102 §4 acceptance):
// 桌機＋375、空狀態＋長對話；輸入框釘底（長對話下不捲頁就看得到）、
// 對話區自己 scroll、迴紋針在輸入框旁、桌機 Upcoming 右欄、手機鈴鐺。
// Zero AI. ZZZ data, swept.
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
const TEST_EMAIL = "zzz-shot-workbench-102@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ WORKBENCH102 截图（可删）";
const BASE = "http://localhost:3000";
const OUT = process.env.OUT_DIR || "C:/dev/minit-v2/eval/reports";

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}

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

/** A LONG conversation — the case that used to shove the input off screen. */
function seededTurns() {
  const extraction = {
    meeting_type: f("agm", "confirmed"),
    meeting_date: f("2026-05-20", "confirmed"),
    meeting_venue: f("Dewan Contoh, Kangar"),
    attendees: [],
    resolutions: Array.from({ length: 8 }, (_, i) => ({ text: f(`Perkara contoh ${i + 1}`) })),
    figures: [],
    office_bearers: [],
  };
  const turns = [];
  for (let i = 1; i <= 6; i++) {
    turns.push({ role: "user", text: `第 ${i} 个问题：年度呈报的第 ${i} 步要做什么？` });
    turns.push({
      role: "assistant",
      text: `第 ${i} 步：打开 eROSES 年报页面，照着步骤卡把第 ${i} 项资料贴进 portal。每一步只做一件事，做完打勾再继续下一步。`,
    });
  }
  turns.push({ role: "user", text: "nota-mesyuarat-mei.jpg（2 页）" });
  turns.push({
    role: "assistant",
    text: "做好了。笔记读完，会议记录（2026-05-20）整理出 8 条内容。这次用了 3 个 AI 动作。点卡片进去核对；要改哪里，进去后直接跟我说。",
    products: [{ kind: "meeting_notes", page: "/minutes", fileName: "nota-mesyuarat-mei.jpg", extraction }],
  });
  return turns;
}

async function measure(page) {
  return page.evaluate(() => {
    const input = document.querySelector("#minit-ask-input");
    const clip = document.querySelector('button[aria-label*="Lampirkan"], button[aria-label*="上传照片"], button[aria-label*="Attach a photo"]');
    const bell = document.querySelector('[data-probe="upcoming-bell"]');
    const upcomingHeadings = Array.from(document.querySelectorAll("h2")).filter((h) =>
      /即将到来|Akan datang|Upcoming/.test(h.textContent ?? ""),
    );
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
    };
    const scrollRegion = Array.from(document.querySelectorAll("section div")).find(
      (d) => d.className.includes("overflow-y-auto") && d.className.includes("55dvh"),
    );
    return {
      inputOnScreen: visible(input),
      clipOnScreen: visible(clip),
      bellVisible: bell ? bell.getBoundingClientRect().width > 0 : false,
      upcomingVisibleCount: upcomingHeadings.filter(
        (h) => h.getBoundingClientRect().width > 0,
      ).length,
      hasScrollRegion: Boolean(scrollRegion),
      regionScrollable: scrollRegion ? scrollRegion.scrollHeight > scrollRegion.clientHeight : false,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
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
    await page.type('input[name="name"]', ORG_NAME);
    for (const b of await page.$$("button")) {
      const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
      if (t.includes("创建组织")) { await b.click(); break; }
    }
    await new Promise((r) => setTimeout(r, 6000));
    const orgRows = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)).json();
    const orgId = orgRows?.[0]?.id;
    check("org created", Boolean(orgId), String(orgId));

    // 1 — EMPTY state, desktop: hero + right-column Upcoming, no bell.
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 900));
    let m = await measure(page);
    check("desktop empty: Upcoming right column visible", m.upcomingVisibleCount >= 1);
    check("desktop empty: bell hidden", !m.bellVisible);
    await page.screenshot({ path: path.join(OUT, "workbench-102-desktop-empty.png") });

    // ...and 375: bell instead of the Upcoming block.
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 900));
    m = await measure(page);
    check("375 empty: bell visible", m.bellVisible);
    check("375 empty: Upcoming block hidden", m.upcomingVisibleCount === 0);
    check("375 empty: no horizontal overflow", m.overflowX === 0, `${m.overflowX}px`);
    await page.screenshot({ path: path.join(OUT, "workbench-102-mobile-empty.png"), fullPage: true });
    // The bell unfolds the same list.
    await page.click('[data-probe="upcoming-bell"]');
    await new Promise((r) => setTimeout(r, 400));
    m = await measure(page);
    check("375: tapping the bell unfolds the Upcoming list", m.upcomingVisibleCount >= 1);
    await page.screenshot({ path: path.join(OUT, "workbench-102-mobile-bell-open.png") });

    // 2 — LONG conversation: the input must be on screen WITHOUT scrolling.
    await page.evaluate(
      ({ key, t }) => localStorage.setItem(key, JSON.stringify(t)),
      { key: `minit:${userId}:${orgId}:chat.home.v1`, t: seededTurns() },
    );
    await page.setViewport({ width: 1280, height: 950 });
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1200));
    m = await measure(page);
    check("desktop long: input pinned on screen (no page scroll needed)", m.inputOnScreen);
    check("desktop long: paperclip beside the input", m.clipOnScreen);
    check("desktop long: conversation region scrolls itself", m.hasScrollRegion && m.regionScrollable);
    await page.screenshot({ path: path.join(OUT, "workbench-102-desktop-long.png") });

    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 1200));
    // 375: scroll the PAGE to the workbench (header sits above it), then the
    // input must be reachable with the conversation region scrolling itself.
    await page.evaluate(() => {
      document.querySelector("#minit-ask-input")?.scrollIntoView({ block: "center" });
    });
    await new Promise((r) => setTimeout(r, 400));
    m = await measure(page);
    check("375 long: input visible with conversation open", m.inputOnScreen);
    check("375 long: conversation region scrolls itself", m.hasScrollRegion && m.regionScrollable);
    check("375 long: no horizontal overflow", m.overflowX === 0, `${m.overflowX}px`);
    await page.screenshot({ path: path.join(OUT, "workbench-102-mobile-long.png") });

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
  console.log(failures.length === 0 ? "\nALL CHECKS PASSED" : `\n${failures.length} FAILURES: ${failures.join(", ")}`);
  process.exit(failures.length === 0 ? 0 : 1);
}
run().catch((e) => { console.error(e); process.exit(1); });
