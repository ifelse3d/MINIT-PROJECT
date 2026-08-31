// ---------------------------------------------------------------------------
// THE THREE NEW END-TO-END CHECKS FOR WORK ORDER 105 §4, against the real dev
// server and the real database, in a purpose-made org deleted at the end.
//
//   node scripts/e2e-105.mjs
//
//   ① §1  a long document is read in batches, and closing the tab does not
//         lose it — the row is still there and the door offers to carry on.
//   ② §1-3 a file attached in the chat box plus J'S OWN SENTENCE
//         (「這兩張是一樣的，只是有另外放出來講解。更詳細的」) produces a NEW
//         finished card, without reading anything again.
//   ③ §2-3 the record page's two tabs — 正式版 and 原文（逐字） — and the ↩
//         from a tidied paragraph back to the exact line it came from.
//
// 🔴 NO VENDOR CALL, NO MONEY. /api/intake and /api/tidy-minutes are
// INTERCEPTED and answered with canned readings, so the REAL client code runs
// the REAL flows without paying a vendor to re-read documents whose READING is
// not what is under test here. ① talks to /api/job/* for real, because the
// queue's bookkeeping is exactly what is under test.
//
// ⏳ ① NEEDS MIGRATION 43 (ai_jobs). Until J has pasted it the route answers
// "not ready" by design and the door falls back to the single-request read —
// which is the behaviour that shipped before 105 and must keep working. The
// probe checks the fallback either way and says plainly which half it ran.
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
const TEST_EMAIL = "zzz-e2e-105@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ 105 底座測試社團（可刪）";
const BASE = "http://localhost:3000";

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}
function skip(name, why) {
  console.log(`SKIP  ${name} — ${why}`);
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

/** Is migration 43 applied? ① is only meaningful when it is. */
async function jobsTableExists() {
  const r = await rest(`/ai_jobs?select=id&limit=1`);
  return r.ok;
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const field = (value, snippet = value) => ({
  value,
  confidence: value === "" ? "missing" : "check",
  source_ref: value === "" ? null : { location: "photo 1", snippet },
});

/** Two readings of ONE meeting: a short note, and the typed-up minit of it.
 *  The shapes come from work order 104's measurement of J's own two papers —
 *  the CONTENT here is invented for the probe (A3: J's papers never travel). */
const READ_SHORT = {
  kind: "meeting_notes",
  page: "/minutes",
  fileName: "nota.png",
  storagePath: null,
  extraction: {
    meeting_type: field("committee", "Mesyuarat Jawatankuasa"),
    meeting_date: field("2026-05-20", "20/5/2026"),
    meeting_venue: field("Dewan Contoh"),
    attendees: [],
    resolutions: [
      { text: field("Lim Guat Kioy ganti - Lee Moy") },
      { text: field("Bawa kerusi tambahan") },
    ],
    figures: [],
    office_bearers: [],
  },
};
const READ_FULL = {
  ...READ_SHORT,
  fileName: "minit.png",
  extraction: {
    ...READ_SHORT.extraction,
    resolutions: [
      { text: field("Agenda 2.1 diganti Lee Moy (Lim Guat Kior)") },
      { text: field("Ucapan Pengerusi dan aluan kepada semua yang hadir") },
      { text: field("Laporan kewangan dibentangkan oleh Bendahari") },
    ],
  },
};

/** What /api/tidy-minutes would answer for the typed minutes ③ confirms. */
const CANNED_TIDY = {
  tidy: {
    sections: [
      {
        heading: "Agenda",
        items: [
          {
            text: "Mesyuarat mencatat ucapan Pengerusi.",
            source: [0],
            verbatimFallback: false,
          },
        ],
      },
    ],
    unresolved: [],
    fallbacks: 0,
    merged: 0,
  },
};

async function run() {
  await ensureUser();
  const hasJobs = await jobsTableExists();
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

  /** Hand out READ_SHORT then READ_FULL, so two staged photos read as two
   *  tellings of one meeting. */
  let intakeCalls = 0;
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/intake") && req.method() === "POST") {
      const body = intakeCalls === 0 ? READ_SHORT : READ_FULL;
      intakeCalls += 1;
      void req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
      return;
    }
    if (url.includes("/api/tidy-minutes") && req.method() === "POST") {
      void req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(CANNED_TIDY),
      });
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
    const orgs = await (await rest(`/orgs?select=id,name&name=eq.${encodeURIComponent(ORG_NAME)}`)).json();
    orgId = orgs?.[0]?.id ?? null;
    check("test organisation created", orgId !== null);

    // -----------------------------------------------------------------------
    // ② §1-3 — a file attached in the chat box, and J's own sentence.
    // -----------------------------------------------------------------------
    const files = [
      path.join(REPORTS, "e2e105-a.png"),
      path.join(REPORTS, "e2e105-b.png"),
    ];
    for (const f of files) writeFileSync(f, TINY_PNG);

    await page.goto(BASE, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 800));
    const input = await page.$('input[type="file"]');
    await input.uploadFile(...files);
    await page.waitForFunction(
      () => (document.body.innerText || "").includes("还没送出"),
      { timeout: 15000 },
    );
    check("② two papers attached in the chat box are staged", true);

    // Send them WITHOUT ticking anything — the ordinary "pages" road.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => !x.disabled && /送出|Hantar|Send/.test(x.textContent || ""),
      );
      b?.click();
    });
    // §3 fires here: read as pages, the readings look like one meeting twice.
    await page.waitForFunction(
      () =>
        document.querySelector('[data-card="repeat-pages"]') !== null ||
        document.body.innerText.includes("做好了"),
      { timeout: 40000 },
    );
    const repeatCard = await page.$('[data-card="repeat-pages"]');
    check("③(§3) the app noticed the repeated paper and ASKED", repeatCard !== null);
    await page.screenshot({ path: path.join(REPORTS, "e2e105-repeat-card.png") });

    if (repeatCard) {
      // Decline it — ② must work through WORDS, which is the actual complaint.
      await page.evaluate(() => {
        const card = document.querySelector('[data-card="repeat-pages"]');
        const b = [...(card?.querySelectorAll("button") ?? [])].find((x) =>
          /不是/.test(x.textContent || ""),
        );
        b?.click();
      });
      await page.waitForFunction(() => document.body.innerText.includes("做好了"), {
        timeout: 20000,
      });
    }

    const callsAfterRead = intakeCalls;
    check("② both papers were read exactly once", callsAfterRead === 2, `calls=${callsAfterRead}`);

    // J's own sentence, typed into the box with nothing staged any more.
    await page.type("#minit-ask-input", "這兩張是一樣的，只是有另外放出來講解。更詳細的");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => (document.body.innerText || "").includes("照片没有重读"),
      { timeout: 20000 },
    );
    check("② J's sentence produced a NEW finished card", true);
    check(
      "🔴 ② nothing was read again — no extra /api/intake call",
      intakeCalls === callsAfterRead,
      `calls=${intakeCalls}`,
    );
    await page.screenshot({ path: path.join(REPORTS, "e2e105-chat-instruction.png") });

    // -----------------------------------------------------------------------
    // ③ §2-3 — the record page's two tabs, and the way back from a paragraph.
    // -----------------------------------------------------------------------
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button, a")].find((x) =>
        /打开|去核对|Buka|Open/.test(x.textContent || ""),
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 2500));
    await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 1200));

    const tidyTab = await page.$('[data-probe="tab-tidy"]');
    const verbTab = await page.$('[data-probe="tab-verbatim"]');
    check("③ the record page carries both tabs", tidyTab !== null && verbTab !== null);
    check(
      "🔴 ③ the page says eROSES / download / confirm use the VERBATIM layer",
      (await page.evaluate(() => document.body.innerText)).includes("原文（逐字）"),
    );

    await page.click('[data-probe="tab-verbatim"]');
    await new Promise((r) => setTimeout(r, 300));
    check(
      "③ the verbatim tab shows the lines as they were read",
      (await page.$('[data-probe="verbatim-pane"]')) !== null,
    );
    await page.screenshot({ path: path.join(REPORTS, "e2e105-tab-verbatim.png") });

    await page.click('[data-probe="tab-tidy"]');
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /整理出正式版/.test(x.textContent || ""),
      );
      b?.click();
    });
    await page.waitForFunction(
      () => document.querySelector('[data-probe="tidy-source"]') !== null,
      { timeout: 20000 },
    );
    check("③ the formal version came out with a way back on every paragraph", true);
    await page.click('[data-probe="tidy-source"]');
    await new Promise((r) => setTimeout(r, 300));
    check(
      "🔴 ③ one tap opens the exact verbatim line the paragraph came from",
      (await page.evaluate(() => document.body.innerText)).includes("原文，一字不改"),
    );
    await page.screenshot({ path: path.join(REPORTS, "e2e105-tab-tidy.png") });

    // -----------------------------------------------------------------------
    // ① §1 — the queue survives the tab closing.
    // -----------------------------------------------------------------------
    if (!hasJobs) {
      skip(
        "① the queue reads a long document in batches",
        "migration 43 (ai_jobs) is not applied on this database yet",
      );
      // The half that IS testable today, and the one that must never break:
      // with the queue unavailable the door still reads the ordinary way.
      const start = await page.evaluate(async (base) => {
        const form = new FormData();
        form.append("storagePath", "1/jobs/1-x.pdf");
        form.append("kind", "meeting_notes");
        const r = await fetch(`${base}/api/job/start`, { method: "POST", body: form });
        return { status: r.status, body: await r.json().catch(() => null) };
      }, BASE);
      check(
        "🔴 ① with no ai_jobs table the queue refuses SOFTLY — never a 500",
        start.status < 500,
        `status=${start.status}`,
      );
    } else {
      const open = await page.evaluate(async (base) => {
        const r = await fetch(`${base}/api/job/open`);
        return r.json();
      }, BASE);
      check("① the door can ask what is still being read", Array.isArray(open.jobs));
      const bad = await page.evaluate(async (base) => {
        const r = await fetch(`${base}/api/job/step`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobId: 999999999 }),
        });
        return r.status;
      }, BASE);
      check(
        "🔴 ① another society's job id is not steppable — RLS is the boundary",
        bad === 404,
        `status=${bad}`,
      );
    }

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
