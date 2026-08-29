// One-off look at the phone chat panel BEFORE work order 82 K3 surgery.
// Seeds a transcript (zero AI), opens the sheet at 375×812, saves screenshots.
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
const TEST_EMAIL = "zzz-shot-k3-82@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ K3 截图（可删）";
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

async function run() {
  // sweep + user
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
    page.setDefaultTimeout(45000);
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("minit.lang.v2", "zh");
        document.cookie = "minit-lang=zh;path=/";
      } catch {}
    });
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', TEST_EMAIL);
    await page.type('input[type="password"]', TEST_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
    await page.type('input[name="name"]', ORG_NAME);
    const btns = await page.$$("button");
    for (const b of btns) {
      const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
      if (t.includes("创建组织")) { await b.click(); break; }
    }
    await new Promise((r) => setTimeout(r, 6000));
    const orgRows = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)).json();
    const orgId = orgRows?.[0]?.id;
    const longAnswer =
      "e-Invois pack boleh dibuat di halaman Wang.\n" +
      Array.from({ length: 20 }, (_, i) => `说明第 ${i + 1} 行，让答案变长一点，像真的答案。`).join("\n");
    const turns = [
      { role: "user", text: "macam mana nak buat e-invois?" },
      { role: "assistant", text: longAnswer, button: { href: "/money/einvois?dari=ai", bm: "Wang: e-Invois", zh: "钱区：e-Invois", en: "Money: e-Invois" }, sources: null, lookups: null },
    ];
    await page.evaluate(
      ({ key, t }) => localStorage.setItem(key, JSON.stringify(t)),
      { key: `minit:${userId}:${orgId}:chat.panel.v1`, t: turns },
    );

    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 900));
    const launcher = await page.$('button[aria-label="MinitAI"]');
    await launcher.click();
    await new Promise((r) => setTimeout(r, 1400));
    await page.screenshot({ path: path.join(OUT, "k3-after-mobile-conversation.png") });
    // Empty-state view: clear key first
    await page.evaluate((key) => localStorage.removeItem(key), `minit:${userId}:${orgId}:chat.panel.v1`);
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 900));
    const l2 = await page.$('button[aria-label="MinitAI"]');
    if (l2) { await l2.click(); await new Promise((r) => setTimeout(r, 1400)); }
    await page.screenshot({ path: path.join(OUT, "k3-after-mobile-empty.png") });
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
