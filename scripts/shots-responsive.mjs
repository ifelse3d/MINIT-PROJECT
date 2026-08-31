// RESPONSIVE 病歷 (work order 46 §A): every page × four widths × light/dark,
// shot headless so a human (or the next session) can list every broken layout
// BEFORE surgery starts. Same ZZZ test user/org pattern as shots-design-*;
// zero AI credit (no AI routes are touched); everything is deleted afterwards.
//
//   node scripts/shots-responsive.mjs            → full matrix (~250 shots)
//   SHOTS_WIDTHS=1366 node scripts/shots-responsive.mjs
//   SHOTS_ROUTES=money,minutes node scripts/shots-responsive.mjs
//     (NO leading slashes in SHOTS_ROUTES — Git Bash rewrites "/money,…"
//      into C:/Program Files/Git/money, STATE §6. The script adds them.)
//
// Extra, beyond the matrix: the two screens J circled (46 §0) get their own
// proof shots — the sign-out confirm on a SHORT window, and the AI dock open
// at 1366 with the top bar visible above it.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const OUT = path.join(ROOT, "eval", "reports", "shots-responsive");
mkdirSync(OUT, { recursive: true });
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
const TEST_EMAIL = "zzz-shots-responsive@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ RESPONSIVE 版面测试社团（可删）";
const BASE = "http://localhost:3000";

// Width → shorthand used in filenames. 375 phone / 768 tablet / 1366 14"
// laptop / 1920 desktop — J's decided matrix (46 §1).
const ALL_WIDTHS = [
  { w: 375, h: 667, tag: "w375" },
  { w: 768, h: 1024, tag: "w768" },
  { w: 1366, h: 768, tag: "w1366" },
  { w: 1920, h: 1080, tag: "w1920" },
];
// Every real page a member can reach (nav-items.ts, 2026-08-28). No leading
// slash in the names — see the Git Bash note above.
const ALL_ROUTES = [
  "", // home
  "minutes",
  "minutes/attendance",
  "minutes/document",
  "minutes/history",
  "money",
  "money/issue",
  "money/expenses",
  "money/receipts",
  "money/custody",
  "money/report",
  "money/balance",
  "money/history",
  "money/einvois",
  "calendar",
  "filings",
  "constitution",
  "constitution/clauses",
  "members",
  "inbox",
  "history",
  "orgs",
  "agm-pack",
  "search?q=derma",
  "settings",
  "settings/profile",
  "settings/display",
  "settings/security",
  "settings/general",
  "settings/members",
  "settings/receipts",
  "settings/glossary",
  "settings/ai",
  "settings/plan",
  "settings/feedback",
  "settings/danger",
  "more",
];

const widthFilter = (process.env.SHOTS_WIDTHS ?? "").split(",").filter(Boolean);
const WIDTHS = widthFilter.length
  ? ALL_WIDTHS.filter((v) => widthFilter.includes(String(v.w)))
  : ALL_WIDTHS;
const routeFilter = (process.env.SHOTS_ROUTES ?? "").split(",").filter(Boolean);
const ROUTES = routeFilter.length
  ? ALL_ROUTES.filter((r) => routeFilter.some((f) => r === f || r.startsWith(`${f}/`) || (f === "home" && r === "")))
  : ALL_ROUTES;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const userId = await ensureUser();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.setViewport({ width: 1366, height: 768 });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  // --- sign in, make an org, seed a little data so lists are not empty -----
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
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
  const btns = await page.$$("button");
  for (const b of btns) {
    const t = ((await b.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (t.includes("创建组织")) {
      await b.click();
      break;
    }
  }
  await sleep(6000);
  const orgRow = await (
    await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
  ).json();
  const orgId = orgRow[0]?.id;
  if (!orgId) throw new Error("org was not created");

  const today = new Date().toISOString().slice(0, 10);
  await rest(`/minutes_docs`, {
    method: "POST",
    body: JSON.stringify(
      [1, 2].map(() => ({
        org_id: orgId,
        meeting_type: "committee",
        meeting_date: today,
        status: "draft",
      })),
    ),
  });
  await rest(`/donations`, {
    method: "POST",
    body: JSON.stringify([
      { org_id: orgId, amount_cents: 500000, donated_at: today, purpose: "ZZZ test" },
      { org_id: orgId, amount_cents: 345000, donated_at: today, purpose: "ZZZ test" },
    ]),
  });

  // --- the matrix ----------------------------------------------------------
  for (const vp of WIDTHS) {
    await page.setViewport({ width: vp.w, height: vp.h });
    for (const theme of ["light", "dark"]) {
      await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
      await page.evaluate((t) => localStorage.setItem("minit.theme.v1", t), theme);
      for (const route of ROUTES) {
        const url = `${BASE}/${route}`;
        const name = `${vp.tag}-${theme}-${(route || "home").replace(/[/?=]/g, "_")}.png`;
        try {
          await page.goto(url, { waitUntil: "networkidle2" });
          await sleep(500);
          await page.screenshot({ path: path.join(OUT, name), fullPage: true });
          console.log("shot", name);
        } catch (e) {
          console.log("FAILED", name, e.message);
        }
      }
    }
  }

  // --- proof shots for J's two circled problems (46 §0) --------------------
  // 0-1: the sign-out confirm, on a normal AND a deliberately short window.
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(`${BASE}/minutes/attendance`, { waitUntil: "networkidle2" });
  await page.evaluate(() => localStorage.setItem("minit.theme.v1", "light"));
  await page.reload({ waitUntil: "networkidle2" });
  const openSignOut = async () => {
    await page.click('button[aria-haspopup="menu"]');
    await sleep(400);
    const rows = await page.$$('[role="menuitem"]');
    for (const r of rows) {
      const t = ((await r.evaluate((n) => n.textContent ?? "")) || "").trim();
      if (t.includes("退出")) {
        await r.click();
        break;
      }
    }
    await sleep(500);
  };
  await openSignOut();
  await page.screenshot({ path: path.join(OUT, "proof-0-1-signout-1366x768.png") });
  await page.keyboard.press("Escape");
  await sleep(300);
  await page.setViewport({ width: 1366, height: 450 });
  await openSignOut();
  await page.screenshot({ path: path.join(OUT, "proof-0-1-signout-1366x450-short.png") });
  await page.keyboard.press("Escape");
  await sleep(300);

  // 0-2: the AI dock open at 1366 — the top bar must stay whole above it.
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  const launcher = await page.$('button[aria-label="MinitAI"]');
  if (launcher) {
    await launcher.click();
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, "proof-0-2-aidock-1366.png") });
    // and on the phone: the sheet must stop below the bar.
    await page.setViewport({ width: 375, height: 667 });
    await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
    const l2 = await page.$('button[aria-label="MinitAI"]');
    if (l2) {
      await l2.click();
      await sleep(900);
      await page.screenshot({ path: path.join(OUT, "proof-0-2-aisheet-375.png") });
    }
  } else {
    console.log("NOTE: MinitAI launcher not found — dock proof shots skipped");
  }

  console.log("page errors:", pageErrors.length, pageErrors.slice(0, 5));

  // --- cleanup -------------------------------------------------------------
  await rest(`/donations?org_id=eq.${orgId}`, { method: "DELETE" });
  await rest(`/minutes_docs?org_id=eq.${orgId}`, { method: "DELETE" });
  await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
  await rest(`/fence_usage?org_id=eq.${orgId}`, { method: "DELETE" });
  await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
  await admin(`/users/${userId}`, { method: "DELETE" });
  await browser.close();
  console.log("shots written to", OUT);
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
