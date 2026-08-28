// One proof shot for work order 46 §1B: the home page at 1366 WITH the AI
// dock open wide — the task cards must answer to the content column (fewer
// columns), not the window (no skinny towers). ZZZ pattern, deleted after.
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
const TEST_EMAIL = "zzz-shots-dock@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ DOCK 版面测试社团（可删）";
const BASE = "http://localhost:3000";

const admin = (p, o = {}) =>
  fetch(`${SUPA_URL}/auth/v1/admin${p}`, {
    ...o,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  });
const rest = (p, o = {}) =>
  fetch(`${SUPA_URL}/rest/v1${p}`, {
    ...o,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });

async function run() {
  const list = await (await admin(`/users?page=1&per_page=100`)).json();
  const existing = (list.users ?? []).find((u) => u.email === TEST_EMAIL);
  let userId;
  if (existing) {
    await admin(`/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }),
    });
    userId = existing.id;
  } else {
    const r = await admin(`/users`, {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
    });
    userId = (await r.json()).id;
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
      // Widest allowed rail at 1366 per the new clamp: 1366-248-380 = 640 capped.
      localStorage.setItem("minit.ai-dock.width", "640");
    } catch {}
  });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  await page.type('input[name="name"]', ORG_NAME);
  for (const b of await page.$$("button")) {
    const t = ((await b.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (t.includes("创建组织")) {
      await b.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 6000));
  const orgRow = await (
    await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
  ).json();
  const orgId = orgRow[0]?.id;

  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  const launcher = await page.$('button[aria-label="MinitAI"]');
  if (launcher) {
    await launcher.click();
    await new Promise((r) => setTimeout(r, 1200));
  }
  await page.screenshot({ path: path.join(OUT, "proof-1B-home-dock-open-1366.png") });
  console.log("shot proof-1B-home-dock-open-1366.png");

  if (orgId) {
    await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
    await rest(`/fence_usage?org_id=eq.${orgId}`, { method: "DELETE" });
    await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
  }
  await admin(`/users/${userId}`, { method: "DELETE" });
  await browser.close();
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
