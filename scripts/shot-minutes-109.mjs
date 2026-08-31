// ---------------------------------------------------------------------------
// §3 (work order 109) — THE STEP RAIL FITS ONE ROW, THE DOCUMENT GETS THE PAGE.
//
//   node scripts/shot-minutes-109.mjs                  (the "after" pass)
//   SHOT_TAG=before node scripts/shot-minutes-109.mjs  (measure the old build)
//
// J: 「步驟條收窄，不要在手機上換行變兩層」and 「step 3 的文件框不要固定小
// 高度再自己捲——它是這頁的主角，給它主要的高度」.
//
// 🔴 NO VENDOR CALL, NO MONEY. /api/intake is INTERCEPTED with a canned
// reading, so the REAL review page opens on a REAL extraction — the screen a
// person lands on after MinitAI reads their notes — without paying anybody.
// (The page's own worked example is not enough here: the document preview and
// its DRAF stamp only render for a real reading, `isReal` in notes-review.)
//
// What it measures rather than eyeballs:
//   1. on a 375px phone every pill in the step rail shares one row (the pills'
//      y offsets are equal) — the old rail wrapped into two storeys;
//   2. the document box on /minutes is taller than the 384px window it used
//      to scroll inside;
//   3. the DRAF stamp is lighter ink than it was, and still there.
// ---------------------------------------------------------------------------
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
const TEST_EMAIL = "zzz-shot-minutes-109@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ 109 精靈測試社團（可刪）";
const BASE = "http://localhost:3000";
const TAG = process.env.SHOT_TAG ?? "after";

/** A 1×1 PNG — nothing here ever asks anyone to READ it. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const field = (value, snippet) => ({
  value,
  confidence: "check",
  source_ref: { location: "photo 1", snippet },
});

/** One meeting, several items — enough document for the preview box and its
 *  DRAF stamp to be real things on the page. */
const CANNED = {
  kind: "meeting_notes",
  page: "/minutes",
  fileName: "page.png",
  storagePath: null,
  extraction: {
    meeting_type: field("committee", "Mesyuarat Jawatankuasa"),
    meeting_date: field("2026-05-20", "20/5/2026"),
    meeting_venue: field("Dewan Contoh", "Dewan Contoh"),
    attendees: [
      { name: field("Ahmad bin Ali", "Ahmad"), role: field("", "") },
      { name: field("Tan Mei Ling", "Tan"), role: field("", "") },
    ],
    resolutions: [
      { text: field("Mesyuarat bersetuju membeli dua kipas siling untuk dewan.", "beli kipas") },
      { text: field("Yuran tahunan kekal RM24 bagi tahun 2026.", "yuran RM24") },
      { text: field("Gotong-royong dewan diadakan pada 12 Julai 2026.", "gotong-royong 12/7") },
    ],
    figures: [],
    office_bearers: [],
    other_meetings: [],
  },
};

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok && TAG !== "before") failures.push(name);
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
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
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
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.url().includes("/api/intake") && req.method() === "POST") {
      void req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(CANNED),
      });
      return;
    }
    void req.continue();
  });

  const file = path.join(REPORTS, "shot109m-page1.png");
  writeFileSync(file, TINY_PNG);

  /** The "before" pass's numbers, when there are any — the same
   *  before/after contract shot-layout-109.mjs uses. */
  const BASELINE = path.join(REPORTS, "minutes-109-before.json");
  const baseline = existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, "utf-8"))
    : null;

  let orgId = null;
  const measured = {};
  try {
    await page.setViewport({ width: 1280, height: 900 });
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
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[type="submit"]')].find((x) => !x.disabled);
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 6000));

    /** Hand the home door a page, let the canned reader answer, and follow
     *  the finished-product card into the review page — exactly the route a
     *  person takes, with the vendor replaced by a fixture. */
    async function openReading() {
      await page.goto(BASE, { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 900));
      const input = await page.$('input[type="file"]');
      await input.uploadFile(file);
      await page.waitForFunction(
        () => document.querySelector('[data-probe="askback-card"]') !== null,
        { timeout: 15000 },
      );
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) =>
          (x.textContent ?? "").includes("送出"),
        );
        b?.click();
      });
      await page.waitForFunction(
        () => document.querySelector('[data-probe="product-card"]') !== null,
        { timeout: 25000 },
      );
      await page.click('[data-probe="product-card"]');
      await page.waitForFunction(() => location.pathname.startsWith("/minutes"), {
        timeout: 20000,
      });
      await new Promise((r) => setTimeout(r, 2000));
      return page.url().includes("/minutes");
    }

    for (const [label, viewport] of [
      ["phone", { width: 375, height: 812 }],
      ["desktop", { width: 1280, height: 900 }],
    ]) {
      await page.setViewport(viewport);
      const opened = await openReading();
      check(`${label}: the reading lands on the review page (no vendor call)`, opened);
      await page.screenshot({
        path: path.join(REPORTS, `minutes-109-${TAG}-${label}-1-wizard.png`),
      });

      // ---- 1. the step rail on one row ----------------------------------
      const rail = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label]:has(ol)') ?? document.querySelector("nav ol")?.closest("nav");
        const pills = [...(nav?.querySelectorAll("a") ?? [])];
        const tops = pills.map((p) => Math.round(p.getBoundingClientRect().top));
        return {
          pills: pills.length,
          rows: new Set(tops).size,
          height: nav ? Math.round(nav.getBoundingClientRect().height) : 0,
        };
      });
      check(
        `${label}: the step rail is ONE row`,
        rail.pills >= 3 && rail.rows === 1,
        `${rail.pills} pills on ${rail.rows} row(s), rail ${rail.height}px tall`,
      );

      // ---- 2. the document box, and 3. the stamp -------------------------
      const doc = await page.evaluate(() => {
        const pre = [...document.querySelectorAll("pre")].find(
          (p) => (p.textContent ?? "").length > 80,
        );
        // The fallback is for the "before" build, which has no data-probe on
        // the stamp (104's rule: a probe that cannot run against the old code
        // cannot prove the old code was worse). `.pop()` takes the INNERMOST
        // match — the wrapper around the stamp has the same textContent and
        // would answer with the page's ordinary ink colour.
        const stamp =
          document.querySelector('[data-probe="draf-stamp"]') ??
          [...document.querySelectorAll("span")]
            .filter((x) => (x.textContent ?? "").trim() === "DRAF")
            .pop();
        return {
          box: pre ? Math.round(pre.getBoundingClientRect().height) : 0,
          maxH: pre ? getComputedStyle(pre).maxHeight : "",
          stamp: stamp ? getComputedStyle(stamp).color : "",
        };
      });
      // Against the MEASURED old build, not against a remembered number: the
      // old cap was max-h-96, which is 24rem — 408px at this app's default
      // root size, not the 384px a reader of the class name would assume.
      const wasBox = baseline?.[label]?.doc?.box ?? 0;
      check(
        `${label}: the document box is taller than the box it replaced`,
        TAG === "before" ? doc.box > 0 : wasBox > 0 && doc.box > wasBox * 1.2,
        `${wasBox || "?"}px → ${doc.box}px (max-height ${doc.maxH})`,
      );
      // The old stamp was text-red-500/40. "Lighter" has to be a NUMBER or it
      // is an opinion, so read the alpha off the computed colour and hold it
      // under a third. Two spellings, because Tailwind v4 computes colours in
      // oklab: "oklab(L a b / 0.22)" and the older "rgba(r, g, b, 0.22)".
      const alpha = Number(
        (/\/\s*([\d.]+)\s*\)\s*$/.exec(doc.stamp) ??
          /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(doc.stamp))?.[1] ?? "1",
      );
      check(
        `${label}: the DRAF stamp is still there, in ink you can read through`,
        alpha > 0 && alpha < 0.3,
        `${doc.stamp} (alpha ${alpha}, was 0.4)`,
      );
      measured[label] = { rail, doc };

      // ---- step 3, the finished document --------------------------------
      await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 1200));
      await page.screenshot({
        path: path.join(REPORTS, `minutes-109-${TAG}-${label}-2-document.png`),
      });
    }

    writeFileSync(
      path.join(REPORTS, `minutes-109-${TAG}.json`),
      JSON.stringify(measured, null, 2),
    );

    const found = await (
      await rest(`/orgs?select=id,name&name=eq.${encodeURIComponent(ORG_NAME)}`)
    ).json();
    orgId = found?.[0]?.id ?? null;
  } finally {
    if (orgId) {
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
