// ---------------------------------------------------------------------------
// §5 (work order 104) — THE QUOTA LINE, in J's own state.
//
//   node scripts/shot-quota-104.mjs
//
// J's Plan page on 2026-08-31 read "100% used · 0% left" beside "+607% extra
// credits", on an account that could still do 91 things. This builds exactly
// that state in a throwaway organisation — monthly allowance 15, all 15 used,
// 91 top-up credits — and photographs the Plan page and the AI meter.
//
// Zero AI: the 15 ai_usage rows are written straight in with the service key
// (the same key the refund path uses; the privileged-column trigger lets the
// service role through by design). The organisation and the user are deleted
// at the end.
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const REPORTS = path.join(ROOT, "eval", "reports");
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
const TEST_EMAIL = "zzz-shot-quota-104@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ 104 額度測試社團（可刪）";
const BASE = "http://localhost:3000";

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}
async function admin(p, opts = {}) {
  return fetch(`${SUPA_URL}/auth/v1/admin${p}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
}
async function rest(p, opts = {}) {
  return fetch(`${SUPA_URL}/rest/v1${p}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers ?? {}),
    },
  });
}
async function ensureUser() {
  const list = await (await admin(`/users?page=1&per_page=200`)).json();
  const existing = (list.users ?? []).find((u) => u.email === TEST_EMAIL);
  if (existing) {
    await admin(`/users/${existing.id}`, {
      method: "PUT",
      body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }),
    });
    return existing.id;
  }
  const res = await admin(`/users`, {
    method: "POST",
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    }),
  });
  return (await res.json()).id;
}

async function run() {
  const userId = await ensureUser();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 1100, height: 950 });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  let orgId = null;
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', TEST_EMAIL);
    await page.type('input[type="password"]', TEST_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
    await page.evaluate(() =>
      document.querySelector('[data-probe="road-manual"]')?.click(),
    );
    await new Promise((r) => setTimeout(r, 250));
    await page.type('input[name="name"]', ORG_NAME);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[type="submit"]')].find(
        (x) => !x.disabled,
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 6000));

    const rows = await (
      await rest(`/orgs?select=id&name=eq.${encodeURIComponent(ORG_NAME)}`)
    ).json();
    orgId = rows?.[0]?.id ?? null;
    if (!orgId) throw new Error("test org not found");

    // J's state, exactly: 15 a month, all 15 spent, 91 credits in hand.
    await rest(`/orgs?id=eq.${orgId}`, {
      method: "PATCH",
      body: JSON.stringify({ monthly_free_quota: 15, extra_credits: 91 }),
    });
    await rest(`/ai_usage`, {
      method: "POST",
      body: JSON.stringify(
        Array.from({ length: 15 }, () => ({ org_id: orgId, action: "chat_turn" })),
      ),
    });

    await page.goto(`${BASE}/settings/plan`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 600));
    const plan = await page.evaluate(() => document.body.innerText || "");
    check(
      "§5 the Plan page no longer prints '+607% 充值额度'",
      !/\+\s*\d+%\s*(充值额度|kredit tambahan|extra credits)/.test(plan),
    );
    check(
      "§5 it does not claim 0% left while the org can still work",
      !/0%\s*(还剩|baki|left)/.test(plan),
      (plan.match(/\d+%\s*已用[^\n]*/) ?? ["(line not found)"])[0].trim(),
    );
    await page.screenshot({
      path: path.join(REPORTS, "quota-104-plan.png"),
      fullPage: true,
    });

    await page.goto(`${BASE}/settings/ai`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 500));
    const meter = await page.evaluate(() => document.body.innerText || "");
    check(
      "§5 the AI meter shows one pair of percentages, no raw credit count",
      !/(充值额度|kredit tambahan|extra credits)/.test(meter),
      (meter.match(/\d+%\s*已用[^\n]*/) ?? ["(line not found)"])[0].trim(),
    );
    await page.screenshot({
      path: path.join(REPORTS, "quota-104-meter.png"),
      fullPage: true,
    });
  } finally {
    if (orgId) {
      await rest(`/ai_usage?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
    }
    await admin(`/users/${userId}`, { method: "DELETE" });
    await browser.close();
  }
  console.log(
    failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures.join("; ")}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
