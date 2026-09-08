// 130 §11 (101 §8 / 119 A-9) — the ADD-TO-ROSTER card pre-fills what the
// notes carried for a new office bearer, and the Negeri is worked out from
// the address by code:
//
//   /members?tambah_nama=…&tambah_ic=…&tambah_kp=…&tambah_alamat=…
//            &tambah_pekerjaan=…&tambah_jawatan=…
//   → every box filled, state derived (Selangor from "43000 Kajang"),
//     the person presses Add → the row saves (with or without migration 46:
//     the column ladder strips what the database does not have yet).
//
// No AI anywhere. Purpose-made test org, deleted at the end.
//
//   E2E_BASE=http://localhost:3100 node scripts/e2e-roster-prefill-130.mjs
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

const TEST_EMAIL = "zzz-e2e-roster-prefill-130@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
// Already uppercase: the create form uppercases as you type (C-4, 拍板 33),
// and the REST lookups below must match what actually got stored.
const ORG_NAME = "ZZZ E2E 名册预填测试社团（可删）";
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
  const val = (name) => page.evaluate((n) => document.querySelector(`input[name="${n}"]`)?.value ?? null, name);
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
    const found = await (await rest(`/orgs?select=id&name=eq.${encodeURIComponent(ORG_NAME)}`)).json();
    orgId = found?.[0]?.id ?? null;
    check("org created", orgId !== null);

    // Fictional person, fictional address.
    const q = new URLSearchParams({
      tambah_nama: "林契约",
      tambah_ic: "LIM CONTOH",
      tambah_kp: "900101-10-1234",
      tambah_alamat: "No. 5, Jalan Contoh 3, 43000 Kajang",
      tambah_pekerjaan: "Guru",
      tambah_jawatan: "Bendahari",
    });
    await page.goto(`${BASE}/members?${q.toString()}`, { waitUntil: "networkidle2" });
    // The pre-fill lands after hydration (setTimeout 0) — wait for the name.
    await page.waitForFunction(
      () => document.querySelector('input[name="personName"]')?.value === "林契约",
      { timeout: 15000 },
    );
    check("name pre-filled", (await val("personName")) === "林契约");
    check("IC name pre-filled", (await val("nameOfficial")) === "LIM CONTOH");
    check("IC number pre-filled", (await val("icNo")) === "900101-10-1234");
    check("address pre-filled", (await val("address")) === "No. 5, Jalan Contoh 3, 43000 Kajang");
    check("occupation pre-filled", (await val("occupation")) === "Guru");
    check("position pre-filled", (await val("position")) === "Bendahari");
    check("Negeri derived from the address by code", (await val("state")) === "Selangor", String(await val("state")));
    check(
      "the derivation is SAID on screen",
      (await page.$('[data-probe="negeri-derived"]')) !== null,
    );

    // Typing a different address moves the derived state with it…
    const addr = await page.$('input[name="address"]');
    await addr.click({ clickCount: 3 });
    await addr.type("Lot 9, Jalan Contoh, 10200 George Town");
    await new Promise((r) => setTimeout(r, 200));
    check("a new address re-derives the state", (await val("state")) === "Pulau Pinang", String(await val("state")));
    // …but a state the person typed themselves is never overwritten.
    const st = await page.$('input[name="state"]');
    await st.click();
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await page.keyboard.press("Backspace");
    await st.type("Johor");
    await addr.click({ clickCount: 3 });
    await addr.type("No. 1, Jalan Contoh, 43000 Kajang");
    await new Promise((r) => setTimeout(r, 200));
    check("a state the person chose stays theirs", (await val("state")) === "Johor", String(await val("state")));

    // The appointment date eROSES needs, then Add.
    const dates = await page.$$('input[name="termStart"]');
    if (dates[0]) await dates[0].type("2026-01-01");
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("form button[type=submit]")].find((x) =>
        (x.textContent ?? "").includes("加进名单"),
      );
      b?.click();
    });
    const added = await page
      .waitForFunction(() => (document.body.innerText || "").includes("加好了"), { timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    check("the row saves (column ladder covers a DB behind migration 46)", added);
    const rows = await (await rest(`/committee_roster?select=person_name,position&org_id=eq.${orgId}`)).json();
    check(
      "the roster holds the row",
      Array.isArray(rows) && rows.some((r) => r.person_name === "林契约" && r.position === "Bendahari"),
      JSON.stringify(rows).slice(0, 200),
    );
  } finally {
    if (orgId) {
      await rest(`/committee_roster?org_id=eq.${orgId}`, { method: "DELETE" });
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
