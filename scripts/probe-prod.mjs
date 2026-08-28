// WHERE does production get slow? (J, 2026-08-28: 「LOADING超慢 ... 現在直接LOAD不出」)
//
// Walks the same path a person walks — /login, sign in, /orgs/new, then the
// home page a few times — and prints how long EACH step took, instead of dying
// on the first timeout with no idea which one it was. Read-only apart from the
// clearly-labelled ZZZ test user and org, both deleted in a finally block so a
// timeout cannot leak them (an earlier run did exactly that).
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const BASE = process.env.BASE || "https://minit-project.vercel.app";
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
const TEST_EMAIL = "zzz-probe-prod@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE 线上诊断（可删）";

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

const step = async (label, fn) => {
  const t0 = Date.now();
  try {
    const out = await fn();
    console.log(`  ${String(Date.now() - t0).padStart(6)}ms  ${label}`);
    return out;
  } catch (e) {
    console.log(`  ${String(Date.now() - t0).padStart(6)}ms  ${label}   ⛔ ${e.message}`);
    return null;
  }
};

let userId = null;
let orgId = null;
let browser = null;

async function main() {
  console.log("probing", BASE);
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
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);
  await page.setViewport({ width: 1366, height: 820 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) console.log(`      HTTP ${r.status()} ${r.url()}`);
  });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  await step("GET /login", () => page.goto(`${BASE}/login`, { waitUntil: "networkidle2" }));
  await step("sign in", async () => {
    await page.type('input[type="email"]', TEST_EMAIL);
    await page.type('input[type="password"]', TEST_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }),
      page.click('button[type="submit"]'),
    ]);
  });
  console.log("      landed on", page.url());

  await step("GET /orgs/new", () =>
    page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" }),
  );
  await step("create org (click + poll)", async () => {
    await page.type('input[name="name"]', ORG_NAME);
    for (const el of await page.$$("button")) {
      const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
      if (t.includes("创建组织")) {
        await el.click();
        break;
      }
    }
    for (let i = 0; i < 30 && !orgId; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const rows = await (
        await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
      ).json();
      orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
    }
    if (!orgId) throw new Error("org never appeared");
  });
  if (!orgId) return;

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
      { org_id: orgId, amount_cents: 500000, donated_at: today, purpose: "ZZZ probe" },
    ]),
  });

  console.log("  -- the home page, four times --");
  const seen = [];
  page.on("response", (r) => {
    try {
      const h = r.headers();
      seen.push({
        url: r.url(),
        type: r.request().resourceType(),
        len: Number(h["content-length"] || 0),
      });
    } catch {}
  });
  for (let i = 0; i < 4; i++) {
    await step(`GET / (${i + 1}) full load`, async () => {
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      const t = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0];
        const slow = performance
          .getEntriesByType("resource")
          .map((r) => ({ n: r.name.split("/").pop().slice(0, 44), d: Math.round(r.duration) }))
          .sort((a, b) => b.d - a.d)
          .slice(0, 5);
        return {
          ttfb: Math.round(n.responseStart - n.requestStart),
          responseEnd: Math.round(n.responseEnd - n.requestStart),
          domInteractive: Math.round(n.domInteractive),
          domContentLoaded: Math.round(n.domContentLoadedEventEnd),
          load: Math.round(n.loadEventEnd),
          resources: performance.getEntriesByType("resource").length,
          slow,
        };
      });
      console.log(
        `        ttfb ${t.ttfb} | html done ${t.responseEnd} | interactive ${t.domInteractive} | DCL ${t.domContentLoaded} | load ${t.load} | ${t.resources} files`,
      );
      console.log(
        "        slowest:",
        t.slow.map((r) => `${r.n} ${r.d}ms`).join(" · "),
      );
    });
  }
  const big = seen.filter((r) => r.len > 0).sort((a, b) => b.len - a.len).slice(0, 8);
  console.log("  biggest with a declared length:");
  for (const r of big)
    console.log(`      ${String(Math.round(r.len / 1024)).padStart(6)} KB  ${r.type}  ${r.url.replace(BASE, "")}`);

  const text = await page.evaluate(() => document.body.innerText.slice(0, 220));
  console.log("  home page says:", JSON.stringify(text.replace(/\s+/g, " ")));
  console.log("  page errors:", errors.length, errors.slice(0, 3));
}

main()
  .catch((e) => console.error("PROBE ERROR:", e.message))
  .finally(async () => {
    // Always clean up, including after a timeout.
    if (orgId) {
      await rest(`/donations?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/minutes_docs?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
    }
    if (userId) await admin(`/users/${userId}`, { method: "DELETE" });
    if (browser) await browser.close();
    console.log("cleaned up");
  });
