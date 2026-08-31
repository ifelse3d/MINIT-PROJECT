// Eyeball shots for the 2026-08-28 DESIGN pass: the canvas gradient that was
// being painted and then covered up, the four rebuilt home cards with their
// live status lines, and the sign-in panel's real app icon + brand hierarchy.
// Seeds three unsigned minutes drafts and two donations so the status lines
// have real numbers to print. Same ZZZ test user/org pattern as e2e-minutes;
// everything is deleted afterwards.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const OUT = path.join(ROOT, "eval", "reports", "shots-design-20260828b");
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
const TEST_EMAIL = "zzz-shots-design-20260828b@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ DESIGN2 版面测试社团（可删）";
const BASE = "http://localhost:3000";

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

async function clickByText(page, selector, text) {
  const els = await page.$$(selector);
  for (const el of els) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (t.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
}

const shot = async (page, name, { full = true } = {}) => {
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: path.join(OUT, name), fullPage: full });
  console.log("shot", name);
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
  await page.setViewport({ width: 1366, height: 820 });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  // --- 1. the sign-in page, before anyone is logged in ---------------------
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await shot(page, "1-login-desktop.png", { full: false });

  await page.setViewport({ width: 390, height: 780 });
  await page.reload({ waitUntil: "networkidle2" });
  await shot(page, "2-login-mobile.png", { full: false });
  await page.setViewport({ width: 1366, height: 820 });

  // --- 2. sign in and make an organisation ---------------------------------
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
  await clickByText(page, "button", "创建组织");
  await new Promise((r) => setTimeout(r, 6000));

  const orgRow = await (
    await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
  ).json();
  const orgId = orgRow[0]?.id;
  if (!orgId) throw new Error("org was not created");

  // --- 3. the home page with NOTHING in it (a brand-new society) -----------
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await shot(page, "3-home-empty.png");

  // --- 4. seed so the status lines have numbers ----------------------------
  const today = new Date().toISOString().slice(0, 10);
  await rest(`/minutes_docs`, {
    method: "POST",
    body: JSON.stringify(
      [1, 2, 3].map(() => ({
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

  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await shot(page, "4-home-with-numbers.png");

  // The hover lift + the arrow that slides in — the thing that says "click me".
  const card = await page.$("a.home-card");
  if (card) {
    await card.hover();
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({
      path: path.join(OUT, "5-home-card-hover.png"),
      clip: { x: 0, y: 120, width: 1000, height: 420 },
    });
    console.log("shot 5-home-card-hover.png");
  }

  // --- 5. dark mode: four hues that are readable on a dark card ------------
  await page.evaluate(() => localStorage.setItem("minit.theme.v1", "dark"));
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await shot(page, "6-home-dark.png");
  await page.evaluate(() => localStorage.setItem("minit.theme.v1", "light"));

  // --- 6. the phone -------------------------------------------------------
  await page.setViewport({ width: 390, height: 780 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await shot(page, "7-home-mobile.png");
  await page.setViewport({ width: 1366, height: 820 });

  // --- 7. a couple of ordinary pages, to check the new radius scale --------
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await shot(page, "8-minutes.png");
  await page.goto(`${BASE}/money`, { waitUntil: "networkidle2" });
  await shot(page, "9-money.png");
  await page.goto(`${BASE}/money/balance`, { waitUntil: "networkidle2" });
  await shot(page, "10-funds.png");

  // --- 8. the measurements, so this is not an eyeball claim ---------------
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  const measured = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const root = document.querySelector(".v2-root");
    const card = document.querySelector(".home-card");
    const before = root ? getComputedStyle(root, "::before") : null;
    return {
      tokens: {
        xs: cs.getPropertyValue("--v2-r-xs").trim(),
        sm: cs.getPropertyValue("--v2-r-sm").trim(),
        md: cs.getPropertyValue("--v2-r-md").trim(),
        lg: cs.getPropertyValue("--v2-r-lg").trim(),
        pill: cs.getPropertyValue("--v2-r-pill").trim(),
      },
      htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      rootBackground: root ? getComputedStyle(root).backgroundColor : null,
      gradientLayer: before ? before.backgroundImage.slice(0, 60) : null,
      cardRadius: card ? getComputedStyle(card).borderRadius : null,
      cardBorder: card ? getComputedStyle(card).border : null,
      statusLines: [...document.querySelectorAll(".home-card .stat")].map((n) =>
        (n.textContent ?? "").trim(),
      ),
    };
  });
  console.log("MEASURED", JSON.stringify(measured, null, 2));

  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  console.log("page errors:", errors.length);

  // --- cleanup -------------------------------------------------------------
  await rest(`/donations?org_id=eq.${orgId}`, { method: "DELETE" });
  await rest(`/minutes_docs?org_id=eq.${orgId}`, { method: "DELETE" });
  await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
  await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
  await admin(`/users/${userId}`, { method: "DELETE" });
  await browser.close();
  console.log("shots written to", OUT);
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
