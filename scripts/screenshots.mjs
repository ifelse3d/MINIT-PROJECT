// Overnight screenshot runner (Stage W). Drives the local dev server with the
// system Chrome via puppeteer-core. Creates ONE clearly-labelled test user +
// org, screenshots the redesigned app at 360/768/1280, then deletes both.
// Secrets: read from .env.local, never printed.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const OUT = process.env.SHOTS_OUT ?? path.join(ROOT, "competition/screenshots");
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
if (!SUPA_URL || !SERVICE) {
  console.error("missing supabase env");
  process.exit(1);
}

const TEST_EMAIL = "zzz-overnight-shots@example.com";
const TEST_PASSWORD = "Shot#" + Math.random().toString(36).slice(2, 10) + "Aa1";

async function admin(pathname, opts = {}) {
  const res = await fetch(`${SUPA_URL}/auth/v1/admin${pathname}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  return res;
}

async function findTestUser() {
  const res = await admin(`/users?page=1&per_page=100`);
  const body = await res.json();
  const users = body.users ?? body ?? [];
  return (Array.isArray(users) ? users : []).find((u) => u.email === TEST_EMAIL) ?? null;
}

async function ensureTestUser() {
  const existing = await findTestUser();
  if (existing) {
    // reset the password so this run can sign in
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
  const body = await res.json();
  if (!res.ok) {
    console.error("create user failed", res.status);
    process.exit(1);
  }
  return body.id;
}

async function deleteTestUser(id) {
  const res = await admin(`/users/${id}`, { method: "DELETE" });
  console.log("delete user:", res.status);
}

// PostgREST with service key, for cleanup of the test org.
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

const BASE = "http://localhost:3000";
const DARK = process.argv.includes("--dark");
const SUFFIX = DARK ? "-dark" : "";
const ORG_NAME = "ZZZ 测试社团（截图用，可删）";

async function run() {
  const userId = await ensureTestUser();
  console.log("test user ready");

  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + String(e).slice(0, 200)));
  if (DARK) {
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem("minit.theme.v1", "dark"); } catch {}
    });
  }

  // Pre-set the language cookie + choice so the first-run picker is not in
  // front of every screenshot (we screenshot the picker separately).
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });

  // 0. the first-run language picker itself (once, desktop)
  await page.screenshot({ path: path.join(OUT, `s-lang-picker-1280${SUFFIX}.png`) });

  // choose 中文 to dismiss
  const zhBtn = await page.$$("button");
  for (const b of zhBtn) {
    const txt = await b.evaluate((el) => el.textContent ?? "");
    if (txt.includes("以中文使用")) {
      await b.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 400));

  // 1. login page at three widths
  for (const [w, h, tag] of [[360, 800, "360"], [768, 1024, "768"], [1280, 900, "1280"]]) {
    await page.setViewport({ width: w, height: h });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.screenshot({ path: path.join(OUT, `s-login-${tag}${SUFFIX}.png`) });
  }

  // 2. sign in
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log("signed in, at", page.url());

  // 3. home WITHOUT an org (the single-card state)
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await page.screenshot({ path: path.join(OUT, `s-home-no-org-1280${SUFFIX}.png`) });

  // 4. create the test org through the UI
  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  // §1 (work order 104): /orgs/new opens on a FORK now — "I have the
  // constitution" or "I'll type it myself". One tap to the form these
  // scripts have always driven; a no-op wherever there is no fork.
  await page.evaluate(() =>
    document.querySelector('[data-probe="road-manual"]')?.click(),
  );
  await new Promise((r) => setTimeout(r, 250));
  await page.type('input[name="name"]', ORG_NAME);
  const allBtns = await page.$$("button");
  for (const b of allBtns) {
    const txt = await b.evaluate((el) => el.textContent ?? "");
    if (txt.includes("创建组织")) {
      await b.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 6000));
  console.log("after create, at", page.url());
  await page.screenshot({ path: path.join(OUT, `s-onboarding-1280${SUFFIX}.png`) });

  // 5. the pages, at three widths
  const shots = process.env.SHOTS_ROUTES
    ? process.env.SHOTS_ROUTES.split(",").map((raw) => {
        const r = raw.startsWith("/") ? raw : `/${raw}`; // Git Bash mangles leading slashes
        return [r, r.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home"];
      })
    : [
        ["/", "home"],
        ["/minutes", "minutes"],
        ["/money", "money"],
        ["/money/receipts", "receipts"],
        ["/more", "more"],
        ["/settings", "settings"],
        ["/settings/plan", "plan"],
        ["/filings", "filings"],
      ];
  for (const [w, h, tag] of [[360, 800, "360"], [768, 1024, "768"], [1280, 900, "1280"]]) {
    await page.setViewport({ width: w, height: h });
    for (const [route, name] of shots) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: path.join(OUT, `s-${name}-${tag}${SUFFIX}.png`) });
    }
    console.log("done width", tag);
  }

  await browser.close();

  // 6. cleanup: delete the test org's rows, then the user. The org was created
  //    by this script minutes ago and holds no real data.
  const orgRes = await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`);
  const orgs = await orgRes.json();
  for (const o of Array.isArray(orgs) ? orgs : []) {
    await rest(`/members_roles?org_id=eq.${o.id}`, { method: "DELETE" });
    const del = await rest(`/orgs?id=eq.${o.id}`, { method: "DELETE" });
    console.log("delete org", o.id, del.status);
  }
  await deleteTestUser(userId);
  console.log("cleanup done");
  console.log("console errors seen:", consoleErrors.length);
  for (const e of consoleErrors.slice(0, 12)) console.log("  -", e);
}

run().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
