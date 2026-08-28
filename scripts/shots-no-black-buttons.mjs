// J, 2026-08-28: 「裏面不要有任何黑色的按鈕，都換成紫色的」.
//
// Screenshots the pages J showed, and — more usefully — WALKS every button on
// every page and reports any whose background is a dark solid, so "there are
// no black buttons left" is a check rather than a claim. Overlays and scrims
// (bg-black/50 behind a modal) are ignored on purpose: they are not buttons.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const BASE = process.env.BASE || "http://localhost:3000";
const OUT = path.join(ROOT, "eval", "reports", "shots-no-black-buttons");
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
const TEST_EMAIL = "zzz-noblack@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ NOBLACK 按钮检查（可删）";

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

let userId = null;
let orgId = null;
let browser = null;

/** Every button-ish element whose background is a dark, opaque solid. */
async function darkButtons(page) {
  return page.evaluate(() => {
    const out = [];
    const nodes = document.querySelectorAll(
      'button, label, a[href], [role="button"], input[type="submit"]',
    );
    for (const el of nodes) {
      const cs = getComputedStyle(el);
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      const [r, g, b, a = "1"] = m[1].split(",").map((v) => parseFloat(v));
      if (Number(a) < 0.9) continue; // a scrim, not a fill
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      // Dark AND not violet: a violet fill has clearly more blue than red.
      if (lum < 0.35 && !(b > r + 40)) {
        const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 46);
        out.push(`${cs.backgroundColor}  "${text}"`);
      }
    }
    return out;
  });
}

async function main() {
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
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "en");
      document.cookie = "minit-lang=en;path=/";
    } catch {}
  });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  await page.type('input[name="name"]', ORG_NAME);
  for (const el of await page.$$("button")) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (t.includes("Create organisation") || t.includes("创建组织")) {
      await el.click();
      break;
    }
  }
  for (let i = 0; i < 20 && !orgId; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org was not created");

  const routes = [
    ["/", "1-home"],
    ["/minutes", "2-minutes"],
    ["/money", "3-money"],
    ["/money/expenses", "4-expenses"],
    ["/money/receipts", "5-receipts"],
    ["/members", "6-members"],
    ["/calendar", "7-calendar"],
    ["/settings", "8-settings"],
  ];
  let total = 0;
  for (const [route, name] of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
    const dark = await darkButtons(page);
    total += dark.length;
    console.log(`${route.padEnd(18)} ${dark.length === 0 ? "no dark buttons" : "⛔ " + dark.length}`);
    for (const d of dark) console.log("      " + d);
  }
  console.log(total === 0 ? "\nPASS — no dark solid buttons on any page walked" : `\nFAIL — ${total} dark buttons`);
}

main()
  .catch((e) => console.error("SCRIPT ERROR:", e.message))
  .finally(async () => {
    if (orgId) {
      await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
    }
    if (userId) await admin(`/users/${userId}`, { method: "DELETE" });
    if (browser) await browser.close();
    console.log("cleaned up");
  });
