// ---------------------------------------------------------------------------
// §1 (work order 105) — WHAT THE QUEUE LOOKS LIKE: the price gate, the
// progress bar, the finished card, and the "carry on where you left off" card.
//
//   node scripts/shot-queue-105.mjs
//
// 🔴 NO VENDOR CALL, NO MONEY, AND NO DATABASE. /api/intake, /api/job/start,
// /api/job/step and /api/job/open are INTERCEPTED, so the REAL client code
// draws the REAL cards without a vendor reading anything and without needing
// migration 43 to be applied first. What this proves is what J will SEE; what
// it does not prove is the server chain behind it — that is stated in the
// report rather than implied by a pretty picture.
//
// Screenshots go to eval/reports/ (git-ignored).
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";
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
const TEST_EMAIL = "zzz-shot-queue-105@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ 105 排隊截圖社團（可刪）";
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
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
  });
  return (await res.json()).id;
}

/** A 12-page PDF — the real client splitter must see a real page count. */
async function makePdf(pages) {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

const field = (value, snippet = value) => ({
  value,
  confidence: "check",
  source_ref: { location: "photo 1", snippet },
});

const CLASSIFY = { kind: "meeting_notes", classifyOnly: true, fileName: "minit panjang.pdf" };

const START = {
  available: true,
  jobId: 4242,
  kind: "meeting_notes",
  fileName: "minit panjang.pdf",
  totalPages: 12,
  totalBatches: 3,
  estimate: { pages: 12, batches: 3, actions: 3, quotaPct: 20, seconds: 38 },
};

/** Three batches: two in progress, then the finished document. */
function stepBody(n) {
  const base = {
    jobId: 4242,
    batchesDone: n,
    totalBatches: 3,
    totalPages: 12,
    percent: Math.round((n / 3) * 100),
    actionsCharged: n,
    kind: "meeting_notes",
    fileName: "minit panjang.pdf",
  };
  if (n < 3) return { ...base, status: "reading" };
  return {
    ...base,
    status: "done",
    storagePath: null,
    extraction: {
      meeting_type: field("committee", "Mesyuarat Jawatankuasa"),
      meeting_date: field("2026-05-20", "20/5/2026"),
      meeting_venue: field("Dewan Contoh"),
      attendees: [],
      resolutions: [
        { text: field("Ucapan Pengerusi dan aluan kepada semua yang hadir") },
        { text: field("Laporan kewangan dibentangkan oleh Bendahari") },
      ],
      figures: [],
      office_bearers: [],
    },
  };
}

async function run() {
  await ensureUser();
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

  let steps = 0;
  let openJobs = { jobs: [] };
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    const json = (body) =>
      void req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.includes("/api/intake") && req.method() === "POST") return json(CLASSIFY);
    if (url.includes("/api/job/start")) return json(START);
    if (url.includes("/api/job/open")) return json(openJobs);
    if (url.includes("/api/job/step")) {
      steps += 1;
      const n = Math.min(steps, 3);
      // A real batch takes ~12 seconds. The canned one takes none, and a
      // progress bar nobody can photograph is a progress bar nobody can
      // check — so the reply is held back long enough to be SEEN.
      setTimeout(() => json(stepBody(n)), 1500);
      return;
    }
    void req.continue();
  });

  let orgId = null;
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
    const orgs = await (
      await rest(`/orgs?select=id&name=eq.${encodeURIComponent(ORG_NAME)}`)
    ).json();
    orgId = orgs?.[0]?.id ?? null;

    // --- ① the price gate ---------------------------------------------------
    const pdfPath = path.join(REPORTS, "queue105-long.pdf");
    writeFileSync(pdfPath, await makePdf(12));

    await page.goto(BASE, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 800));
    const input = await page.$('input[type="file"]');
    await input.uploadFile(pdfPath);
    await page.waitForFunction(() => (document.body.innerText || "").includes("还没送出"), {
      timeout: 15000,
    });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => !x.disabled && /送出|Hantar|Send/.test(x.textContent || ""),
      );
      b?.click();
    });
    await page.waitForFunction(
      () => document.querySelector('[data-card="queue-gate"]') !== null,
      { timeout: 30000 },
    );
    check("① the queue's price gate appears before anything is charged", true);
    const gateText = await page.evaluate(
      () => document.querySelector('[data-card="queue-gate"]')?.innerText ?? "",
    );
    check("① it says the pages, the parts and the share of the quota", /12 页/.test(gateText) && /3 批/.test(gateText) && /20%/.test(gateText), gateText.replace(/\s+/g, " ").slice(0, 120));
    check(
      "🔴 ① it says closing the page is safe",
      /关掉这一页/.test(gateText),
    );
    // 🔴 104 §5's rule, kept: exactly ONE percentage on screen. The staged
    // strip guesses from the file count; the gate knows the page count. Two
    // of them at once is two numbers calling each other liars.
    const pageText = await page.evaluate(() => document.body.innerText);
    const pcts = (pageText.match(/(\d+)% 的本月用量|本月用量的 (\d+)%/g) ?? []).length;
    check("🔴 ① only ONE quota percentage is on screen at the gate", pcts === 1, `found=${pcts}`);
    await page.screenshot({ path: path.join(REPORTS, "queue-105-1-gate.png") });

    // --- ② the progress bar -------------------------------------------------
    await page.evaluate(() => {
      const card = document.querySelector('[data-card="queue-gate"]');
      const b = [...(card?.querySelectorAll("button") ?? [])].find((x) =>
        /开始读/.test(x.textContent || ""),
      );
      b?.click();
    });
    await page.waitForFunction(
      () =>
        (document.querySelector('[data-probe="queue-progress"]')?.innerText ?? "").includes(
          "第 2／3 批",
        ),
      { timeout: 20000 },
    );
    const progressText = await page.evaluate(
      () => document.querySelector('[data-probe="queue-progress"]')?.innerText ?? "",
    );
    check(
      "② the progress card says which part it is on, and that leaving is safe",
      /第 2／3 批/.test(progressText) && /可以关掉这一页/.test(progressText),
      progressText.replace(/\s+/g, " ").slice(0, 90),
    );
    const duringText = await page.evaluate(() => document.body.innerText);
    const duringPcts = (duringText.match(/(\d+)% 的本月用量|本月用量的 (\d+)%/g) ?? []).length;
    check(
      "🔴 ② no stale percentage is left on screen while the queue reads",
      duringPcts === 0,
      `found=${duringPcts}`,
    );
    await page.screenshot({ path: path.join(REPORTS, "queue-105-2-progress.png") });

    // --- ③ the finished card ------------------------------------------------
    await page.waitForFunction(() => (document.body.innerText || "").includes("做好了"), {
      timeout: 30000,
    });
    check("③ the finished product card arrives when the last batch lands", true);
    await page.screenshot({ path: path.join(REPORTS, "queue-105-3-done.png") });

    // --- ④ "carry on where you left off" -----------------------------------
    openJobs = {
      jobs: [
        {
          jobId: 4243,
          kind: "meeting_notes",
          fileName: "minit panjang.pdf",
          batchesDone: 1,
          totalBatches: 3,
          totalPages: 12,
          percent: 33,
        },
      ],
    };
    await page.goto(BASE, { waitUntil: "networkidle2" });
    await page.waitForFunction(
      () => document.querySelector('[data-card="queue-pickup"]') !== null,
      { timeout: 20000 },
    );
    const pickText = await page.evaluate(
      () => document.querySelector('[data-card="queue-pickup"]')?.innerText ?? "",
    );
    check(
      "🔴 ④ coming back offers to carry on, and says the read pages are not charged again",
      /第 1／3 批/.test(pickText) && /不会重扣/.test(pickText),
      pickText.replace(/\s+/g, " ").slice(0, 120),
    );
    await page.screenshot({ path: path.join(REPORTS, "queue-105-4-pickup.png") });

    console.log("page errors:", pageErrors.length, pageErrors);
    check("no page errors", pageErrors.length === 0);
  } finally {
    if (orgId) await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
    await browser.close();
  }
  console.log(failures.length === 0 ? "\nALL CHECKS PASSED" : `\nFAILED: ${failures.join(", ")}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
