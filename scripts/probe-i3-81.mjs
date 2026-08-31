// PROBE — work order 81 I3: the purple action button inside a "Tanya Minit"
// answer must actually take the page to its destination (tester: pressed it,
// nothing happened). Reproduces the tester's conditions — PHONE viewport,
// LONG answer, button inside the answer bubble — with a fabricated
// transcript seeded straight into the panel's scoped localStorage (zero AI).
//
// For each surface (phone sheet, desktop docked rail) it reports what
// element actually sits at the button's centre (the click-interception
// diagnosis) and then clicks and asserts the URL really changes to
// /money/einvois. Runs in a ZZZ org + user, deleted at the end.
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

const TEST_EMAIL = "zzz-probe-i3-81@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ I3 死按钮测试（可删）";
const BASE = "http://localhost:3000";
const TARGET = "/money/einvois";

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

async function sweepLeftovers() {
  const rows = await (
    await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
  ).json();
  for (const r of Array.isArray(rows) ? rows : []) {
    await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
  }
}

async function clickByText(page, selector, text) {
  const els = await page.$$(selector);
  for (const el of els) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (t.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
}

/** The panel transcript the tester would have had: a long answer with the
 *  whitelisted einvois action button on it. */
function fakeTurns() {
  const longAnswer =
    "e-Invois pack boleh dibuat di halaman Wang.\n" +
    Array.from({ length: 28 }, (_, i) => `Langkah penerangan baris ${i + 1} untuk menjadikan jawapan ini panjang seperti jawapan sebenar.`).join("\n");
  return [
    { role: "user", text: "macam mana nak buat e-invois?" },
    {
      role: "assistant",
      text: longAnswer,
      button: { href: `${TARGET}?dari=ai`, bm: "Wang: e-Invois", zh: "钱区：e-Invois", en: "Money: e-Invois" },
      sources: null,
      lookups: null,
    },
  ];
}

/** What is at the button's centre? The interception diagnosis. */
async function diagnoseAt(page, box) {
  return page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const chain = [];
      let n = el;
      while (n && chain.length < 5) {
        chain.push(
          `${n.tagName.toLowerCase()}${n.className && typeof n.className === "string" ? "." + n.className.split(" ").slice(0, 3).join(".") : ""}`,
        );
        n = n.parentElement;
      }
      return { top: chain[0] ?? "nothing", chain: chain.join(" > "), insideLink: Boolean(el?.closest('a[href*="einvois"]')) };
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
}

async function testSurface(page, label, { mobile }) {
  if (mobile) {
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  } else {
    await page.setViewport({ width: 1280, height: 900 });
  }
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));

  // Open the floating assistant.
  const opened = await page.$('button[aria-label="MinitAI"]');
  check(`${label}: launcher present`, opened !== null);
  if (!opened) return;
  await opened.click();
  await new Promise((r) => setTimeout(r, 1200)); // spring animation

  // The seeded answer's action button.
  const links = await page.$$('a[href*="einvois"]');
  let button = null;
  for (const l of links) {
    const t = (await l.evaluate((n) => n.textContent ?? "")).trim();
    if (t.includes("e-Invois")) button = l;
  }
  check(`${label}: action button rendered`, button !== null);
  if (!button) return;

  await button.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await new Promise((r) => setTimeout(r, 500));
  const box = await button.boundingBox();
  check(`${label}: button has a hit box`, box !== null && box.width > 0 && box.height > 0, JSON.stringify(box));
  if (!box) return;
  const diag = await diagnoseAt(page, box);
  console.log(`${label}: elementFromPoint → ${diag.chain}`);
  check(`${label}: nothing covers the button`, diag.insideLink, `top: ${diag.top}`);

  // The tester's actual gesture: a click at the button's coordinates.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await new Promise((r) => setTimeout(r, 2500));
  check(`${label}: click NAVIGATED to ${TARGET}`, page.url().includes(TARGET), page.url());
}

async function run() {
  await sweepLeftovers();
  const userId = await ensureUser();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);
    await page.setViewport({ width: 1280, height: 900 });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("minit.lang.v2", "zh");
        document.cookie = "minit-lang=zh;path=/";
      } catch {}
    });

    // sign in + org
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
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
    await clickByText(page, "button", "创建组织");
    await new Promise((r) => setTimeout(r, 6000));
    const orgRows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)
    ).json();
    const orgId = orgRows?.[0]?.id ?? null;
    check("org created + id found", orgId !== null, String(orgId));

    // Seed the panel's SCOPED transcript (minit:<user>:<org>:chat.panel.v1)
    // with the long answer + button, so no AI is called.
    await page.evaluate(
      ({ key, turns }) => localStorage.setItem(key, JSON.stringify(turns)),
      { key: `minit:${userId}:${orgId}:chat.panel.v1`, turns: fakeTurns() },
    );

    await testSurface(page, "phone sheet (375×812)", { mobile: true });
    await testSurface(page, "desktop rail (1280×900)", { mobile: false });

    check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  } finally {
    try {
      const rows = await (
        await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
      ).json();
      for (const r of Array.isArray(rows) ? rows : []) {
        await rest(`/members_roles?org_id=eq.${r.id}`, { method: "DELETE" }).catch(() => {});
        await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
      }
      const list = await (await admin(`/users?page=1&per_page=100`)).json();
      const u = (list.users ?? []).find((x) => x.email === TEST_EMAIL);
      if (u) await admin(`/users/${u.id}`, { method: "DELETE" });
    } catch (e) {
      console.log("cleanup issue:", String(e).slice(0, 200));
    }
    await browser.close();
  }

  console.log(failures.length === 0 ? "\nALL CHECKS PASSED" : `\n${failures.length} FAILURE(S): ${failures.join(", ")}`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
