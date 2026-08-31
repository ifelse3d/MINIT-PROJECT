// PROBE — work order 82 K0 (run BEFORE any surgery): when the chat panel is
// closed and reopened, does the conversation survive?
//
// J's observation (61 §1-1): "面板關掉再開，之前的對話就不見了". The code says
// the transcript lives in SCOPED localStorage (minit:<user>:<org>:chat.panel.v1,
// F-4) and should survive. This probe reproduces the gesture on both surfaces
// and settles which story is true — the answer decides the fate of the
// "Clear conversation" button (82 §3).
//
// Zero AI: the transcript is seeded straight into localStorage, exactly like
// probe-i3-81. ZZZ org + user, deleted at the end.
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

const TEST_EMAIL = "zzz-probe-k0-82@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ K0 面板重开测试（可删）";
const BASE = "http://localhost:3000";
const MARKER = "K0-独一无二的答案句-7391";

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

const fakeTurns = [
  { role: "user", text: "resit macam mana?" },
  { role: "assistant", text: `Jawapan ujian. ${MARKER}`, button: null, sources: null, lookups: null },
];

async function markerVisible(page) {
  return page.evaluate(
    (m) => document.body.innerText.includes(m),
    MARKER,
  );
}

async function openPanel(page) {
  const launcher = await page.$('button[aria-label="MinitAI"]');
  if (!launcher) return false;
  await launcher.click();
  await new Promise((r) => setTimeout(r, 1200));
  return true;
}

async function closePanelViaX(page) {
  // The X is icon-only; its accessible name is the aria-label.
  const btns = await page.$$("aside button");
  for (const b of btns) {
    const label = await b.evaluate((n) => n.getAttribute("aria-label") ?? "");
    if (/关闭|Tutup|Close/i.test(label)) {
      await b.click();
      await new Promise((r) => setTimeout(r, 900));
      return true;
    }
  }
  return false;
}

async function testSurface(page, label, { mobile }) {
  if (mobile) {
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  } else {
    await page.setViewport({ width: 1280, height: 900 });
  }
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));

  check(`${label}: launcher opens`, await openPanel(page));
  check(`${label}: seeded conversation renders`, await markerVisible(page));

  // 1) close via the X, reopen.
  check(`${label}: X closes the panel`, await closePanelViaX(page));
  check(`${label}: closed = conversation off screen`, !(await markerVisible(page)));
  check(`${label}: reopen`, await openPanel(page));
  check(`${label}: conversation SURVIVES close→reopen`, await markerVisible(page));

  if (mobile) {
    // 2) phone-only: tap OUTSIDE the sheet (the transparent backdrop), reopen.
    await page.mouse.click(187, 40); // top of the screen, above the sheet
    await new Promise((r) => setTimeout(r, 900));
    const closed = !(await markerVisible(page));
    check(`${label}: tap outside closes the sheet`, closed);
    if (closed) {
      check(`${label}: reopen after tap-outside`, await openPanel(page));
      check(`${label}: conversation SURVIVES tap-outside→reopen`, await markerVisible(page));
    }
  }

  // 3) full page reload, then open.
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  // Desktop rail may auto-restore (OPEN_KEY); if not open, open it.
  if (!(await markerVisible(page))) await openPanel(page);
  check(`${label}: conversation SURVIVES full reload`, await markerVisible(page));
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

    // Seed the PANEL transcript (scoped key), zero AI.
    await page.evaluate(
      ({ key, turns }) => localStorage.setItem(key, JSON.stringify(turns)),
      { key: `minit:${userId}:${orgId}:chat.panel.v1`, turns: fakeTurns },
    );

    await testSurface(page, "desktop rail (1280×900)", { mobile: false });
    await testSurface(page, "phone sheet (375×812)", { mobile: true });

    // Side question (a plausible root of J's report): the HOME box and the
    // panel are two DIFFERENT conversations by design (two keys). Confirm the
    // home box does NOT show the panel's transcript.
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 800));
    const inHomeFlow = await page.evaluate((m) => {
      // Is any element carrying the marker OUTSIDE the assistant panel?
      const nodes = Array.from(document.querySelectorAll("p, div, span"));
      return nodes.some(
        (n) =>
          n.childElementCount === 0 &&
          (n.textContent ?? "").includes(m) &&
          n.closest("aside") === null,
      );
    }, MARKER);
    check("home box does NOT share the panel transcript (two keys by design)", !inHomeFlow);

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
