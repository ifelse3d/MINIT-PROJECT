// 130 §5 — the CALENDAR's events after the device store became a
// useSyncExternalStore (src/lib/local-events.ts / use-local-events.ts):
//
//   add on /calendar/add  → the event is on /calendar without a reload
//   reload                → it is still there (the store hydrates it)
//   home page             → "Upcoming" lists it (same store, other door)
//   delete on /calendar   → gone, and stays gone after a reload
//
// No AI is called anywhere in this flow. Purpose-made test org, deleted at
// the end.
//
//   E2E_BASE=http://localhost:3100 node scripts/e2e-calendar-130.mjs
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

const TEST_EMAIL = "zzz-e2e-calendar-130@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
// Already uppercase: the create form uppercases as you type (C-4, 拍板 33),
// and the REST lookups below must match what actually got stored.
const ORG_NAME = "ZZZ E2E 日历测试社团（可删）";
// 125: E2E_BASE lets the suite run against a server on another port (port 3000 was held by an unrelated dev server on 2026-09-08).
const BASE = process.env.E2E_BASE || "http://localhost:3000";

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}

async function admin(pathname, opts = {}) {
  return fetch(`${SUPA_URL}/auth/v1/admin${pathname}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
}
async function rest(pathname, opts = {}) {
  return fetch(`${SUPA_URL}/rest/v1${pathname}`, {
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

async function clickByText(page, selector, text, { exact = false } = {}) {
  const els = await page.$$(selector);
  for (const el of els) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (exact ? t === text : t.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
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
  await page.setViewport({ width: 1280, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });
  let orgId = null;
  const TITLE = "ZZZ 130 日历测试晚宴";
  const has = (t) => page.evaluate((x) => (document.body.innerText || "").includes(x), t);
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', TEST_EMAIL);
    await page.type('input[type="password"]', TEST_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
    await page.click('[data-probe="road-manual"]');
    await new Promise((r) => setTimeout(r, 300));
    await page.type('input[name="name"]', ORG_NAME);
    await clickByText(page, "button", "创建组织");
    await new Promise((r) => setTimeout(r, 6000));
    const found = await (
      await rest(`/orgs?select=id&name=eq.${encodeURIComponent(ORG_NAME)}`)
    ).json();
    orgId = found?.[0]?.id ?? null;
    check("org created", orgId !== null);

    // --- add ---------------------------------------------------------------
    await page.goto(`${BASE}/calendar/add`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 600));
    const inputs = await page.$$("form input");
    // The manual quick-add form: [title, date, time] — the last form on the page.
    const forms = await page.$$("form");
    const form = forms[forms.length - 1];
    const fields = await form.$$("input");
    check("quick-add form has three fields", fields.length === 3, `${fields.length} (page has ${inputs.length} inputs)`);
    await fields[0].type(TITLE);
    // Tomorrow: the home "Upcoming" shows the FIVE nearest items, and the standard
    // deadlines can fill five slots inside a month — a date a month out proves nothing.
    const tomorrowIso = new Date(Date.now() + 1 * 86400000).toISOString().slice(0, 10);
    await fields[1].focus();
    await page.evaluate(
      (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      fields[1],
      tomorrowIso,
    );
    await fields[2].type("7:30 malam");
    await new Promise((r) => setTimeout(r, 200));
    await clickByText(page, "button", "添加", { exact: false });
    await new Promise((r) => setTimeout(r, 800));
    check("add page counts the addition", await has("完成"), "no 完成 (n) link");

    // --- on /calendar, no reload needed; then reload ------------------------
    await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 800));
    check("the event is on /calendar", await has(TITLE));
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 800));
    check("the event survives a reload (store hydrates it)", await has(TITLE));

    // --- the home page's Upcoming reads the same store ------------------------
    await page.goto(BASE, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 900));
    // The home page folds "Upcoming" away (109 §2): on a phone it is the app
    // bar's bell (upcoming-bell), on a desktop the "⏰ N" reopen pill
    // (upcoming-reopen). Count and list both come from the same store. Click
    // whichever is VISIBLE, once it is there (a cold dev route takes a moment).
    const bellClicked = await page
      .waitForFunction(
        () => {
          const b = [
            ...document.querySelectorAll('[data-probe="upcoming-bell"], [data-probe="upcoming-reopen"]'),
          ].find((el) => el.getClientRects().length > 0);
          if (!b) return false;
          b.click();
          return true;
        },
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    const bellInfo = await page.evaluate(() =>
      JSON.stringify(
        [...document.querySelectorAll('[data-probe="upcoming-bell"], [data-probe="upcoming-reopen"]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), rects: el.getClientRects().length, text: (el.textContent ?? "").slice(0, 20) };
        }),
      ),
    );
    check("home has a visible Upcoming door (bell or reopen pill)", bellClicked, bellInfo);
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: "C:/dev/minit-v2/eval/reports/e2e-calendar-130-home.png" });
    check("home Upcoming (behind that door) lists the event", await has(TITLE));

    // --- delete on /calendar, stays gone -------------------------------------
    await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 800));
    const opened = await page.evaluate((t) => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        (x.getAttribute("aria-label") ?? "").includes(`删除活动 ${t}`),
      );
      b?.click();
      return b !== undefined;
    }, TITLE);
    check("delete button found", opened);
    await new Promise((r) => setTimeout(r, 500));
    const confirmed = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const b = [...(dialog?.querySelectorAll("button") ?? [])].find((x) =>
        /删除|Padam|Delete/.test(x.textContent ?? "") && !/取消|Batal|Cancel/.test(x.textContent ?? ""),
      );
      b?.click();
      return b !== undefined;
    });
    check("delete confirmed in the app's own dialog", confirmed);
    // Gone from the page — the store told every subscriber — within a
    // bounded wait, not after a guessed sleep.
    const gone = await page
      .waitForFunction((t) => !(document.body.innerText || "").includes(t), { timeout: 10000 }, TITLE)
      .then(() => true)
      .catch(() => false);
    await page.screenshot({ path: "C:/dev/minit-v2/eval/reports/e2e-calendar-130-after-delete.png" });
    check("the event is gone without a reload", gone);
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 800));
    check("…and stays gone after a reload", !(await has(TITLE)));
  } finally {
    if (orgId) {
      await rest(`/events_meetings?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
    }
    await admin(`/users/${userId}`, { method: "DELETE" });
    await browser.close();
  }
  console.log("page errors:", pageErrors.length, pageErrors.slice(0, 5));
  console.log(failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures.join("; ")}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
