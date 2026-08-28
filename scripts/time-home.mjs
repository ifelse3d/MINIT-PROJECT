// How long does the HOME page take to come back from the server?
//
// J, 2026-08-28: 「refresh 了 LOADING超慢」. The home page is force-dynamic and
// had grown to four sequential awaits (agm -> org flags -> usage -> the new
// status-line figures), so every visit paid four database round trips end to
// end. This measures the server's own think time (responseStart - requestStart,
// i.e. TTFB with the network subtracted as far as the browser can tell), so the
// before/after of putting those reads in one wave is a number, not a claim.
//
// Run against a warm dev server:  node scripts/time-home.mjs
// Creates one clearly-labelled test user + org, deletes both afterwards.
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
// BASE=https://minit-project.vercel.app node scripts/time-home.mjs  -> times PRODUCTION
const BASE = process.env.BASE || "http://localhost:3000";
const RUNS = 7;

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
const TEST_EMAIL = "zzz-time-home@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ TIMING 测速社团（可删）";

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
  const existing = (Array.isArray(list.users) ? list.users : []).find(
    (u) => u.email === TEST_EMAIL,
  );
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

async function clickByText(page, text) {
  for (const el of await page.$$("button")) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (t.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
}

const run = async () => {
  const userId = await ensureUser();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(45000);
  await page.setViewport({ width: 1366, height: 820 });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
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
  await clickByText(page, "创建组织");

  // POLL, do not sleep a fixed six seconds: against production the round trip
  // is slower than on localhost, and a fixed wait reported "org was not
  // created" for an org that had in fact been created (and then leaked it).
  let orgId = null;
  for (let i = 0; i < 20 && !orgId; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org was not created");

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
      { org_id: orgId, amount_cents: 500000, donated_at: today, purpose: "ZZZ timing" },
    ]),
  });

  // Warm the route so the dev server's compile is not in the numbers.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });

  const samples = [];
  for (let i = 0; i < RUNS; i++) {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const ms = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      return nav ? nav.responseStart - nav.requestStart : null;
    });
    if (ms !== null) samples.push(ms);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  console.log("server think time (ms), sorted:", samples.map((s) => Math.round(s)).join(" "));
  console.log(`MEDIAN ${Math.round(median)}ms   MEAN ${Math.round(mean)}ms   n=${samples.length}`);

  await rest(`/donations?org_id=eq.${orgId}`, { method: "DELETE" });
  await rest(`/minutes_docs?org_id=eq.${orgId}`, { method: "DELETE" });
  await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
  await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
  await admin(`/users/${userId}`, { method: "DELETE" });
  await browser.close();
};

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
