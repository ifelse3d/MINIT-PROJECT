// One-off eyeball shots for the 2026-08-28 review session: the responsive
// home, the new /money/balance, custody's folded history and the login logo,
// all at 1366x768 (the 14" laptop J complained about). Creates the same ZZZ
// test user/org pattern as e2e-money and deletes it afterwards.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const OUT = path.join(ROOT, "eval", "reports", "shots-20260828");
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
const TEST_EMAIL = "zzz-shots-20260828@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ SHOTS 测试社团（可删）";
const BASE = "http://localhost:3000";

const admin = (p, o = {}) =>
  fetch(`${SUPA_URL}/auth/v1/admin${p}`, {
    ...o,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(o.headers ?? {}) },
  });
const rest = (p, o = {}) =>
  fetch(`${SUPA_URL}/rest/v1${p}`, {
    ...o,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(o.headers ?? {}) },
  });

async function ensureUser() {
  const list = await (await admin(`/users?page=1&per_page=100`)).json();
  const existing = (list.users ?? []).find((u) => u.email === TEST_EMAIL);
  if (existing) {
    await admin(`/users/${existing.id}`, { method: "PUT", body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }) });
    return existing.id;
  }
  const res = await admin(`/users`, { method: "POST", body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }) });
  return (await res.json()).id;
}

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: ["--no-first-run", "--disable-gpu"],
});
const page = await browser.newPage();
page.setDefaultTimeout(30000);
await page.setViewport({ width: 1366, height: 768 });
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem("minit.lang.v2", "zh");
    document.cookie = "minit-lang=zh;path=/";
    document.documentElement.classList.add("minit-rail-expanded");
    localStorage.setItem("minit.rail.collapsed", "0");
  } catch {}
});

await ensureUser();

// login page shot (logo size, language dropdown)
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.screenshot({ path: path.join(OUT, "1-login-1366.png") });

// sign in + create org
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
  const t = await b.evaluate((el) => el.textContent ?? "");
  if (t.includes("创建组织")) { await b.click(); break; }
}
await new Promise((r) => setTimeout(r, 6000));

// home at 14" with expanded rail
await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: path.join(OUT, "2-home-1366.png") });

// open the AI dock, then home again — the container-query case
const launcher = await page.$('button[aria-label="MinitAI"]');
if (launcher) {
  await launcher.click();
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(OUT, "3-home-1366-dock-open.png") });
}

// the new balance page
await page.goto(`${BASE}/money/balance`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: path.join(OUT, "4-balance-1366.png") });

// custody (folded history, no rail extras)
await page.goto(`${BASE}/money/custody`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: path.join(OUT, "5-custody-1366.png") });

// clean up: delete the org + user (same REST as e2e-money teardown)
const orgRow = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
if (orgRow[0]?.id) await rest(`/orgs?id=eq.${orgRow[0].id}`, { method: "DELETE" });
const list = await (await admin(`/users?page=1&per_page=100`)).json();
const u = (list.users ?? []).find((x) => x.email === TEST_EMAIL);
if (u) await admin(`/users/${u.id}`, { method: "DELETE" });

await browser.close();
console.log("shots written to", OUT);
