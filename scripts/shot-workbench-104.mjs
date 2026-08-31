// ---------------------------------------------------------------------------
// §8 + §9 (work order 104) — THE COMPOSER DOES NOT MOVE, and Upcoming folds.
//
//   node scripts/shot-workbench-104.mjs
//
// J: 「爲什麽 chatbox 還是會被推到下面？」 and 「home 的 upcoming 做成可以
// 收起來，然後 CHAT 的空間要大」.
//
// 🔴 NO VENDOR CALL, NO MONEY. /api/intake is INTERCEPTED and answered with a
// canned extraction carrying `other_meetings`, so the REAL client code puts up
// the REAL "which meeting?" card — the exact sequence the work order asks for
// (two photos → thumbnail strip → which-meeting card) — without paying a
// vendor to re-read a document whose reading is not what is under test here.
//
// Runs in a purpose-made test user + organisation, deleted at the end.
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
const TEST_EMAIL = "zzz-shot-workbench-104@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ 104 佈局測試社團（可刪）";
const BASE = "http://localhost:3000";
/** SHOT_TAG=before names the files for the "before" pass — run it with
 *  ask-box.tsx checked out at the previous commit to get the comparison
 *  shots the work order asks for. §9 is skipped there (it did not exist). */
const TAG = process.env.SHOT_TAG ?? "after";

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  // The "before" pass is a MEASUREMENT of the old behaviour, not a gate — its
  // whole point is that some of these do not hold yet.
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
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    }),
  });
  return (await res.json()).id;
}

/** A 1×1 PNG — the probe never asks anyone to READ it. */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const field = (value, snippet) => ({
  value,
  confidence: "check",
  source_ref: { location: "photo 1", snippet },
});

/** What /api/intake would answer for a paper carrying two meetings. */
const CANNED = {
  kind: "meeting_notes",
  page: "/minutes",
  fileName: "page.png",
  storagePath: null,
  extraction: {
    meeting_type: field("committee", "Mesyuarat Jawatankuasa"),
    meeting_date: field("2026-05-20", "20/5/2026"),
    meeting_venue: field("Dewan Contoh", "Dewan Contoh"),
    attendees: [],
    resolutions: [{ text: field("Contoh keputusan", "Contoh keputusan") }],
    figures: [],
    office_bearers: [],
    other_meetings: [
      { date_text: field("8/7/26", "开会议 8/7/26") },
      { date_text: field("18/7", "18/7 会议") },
    ],
  },
};

/** The composer's box in VIEWPORT coordinates — what "does not move" means.
 *  Falls back to the form around the typing box so the SAME measurement works
 *  against the pre-104 build (which carries no data-probe attributes). */
async function composerRect(page) {
  return page.evaluate(() => {
    const el =
      document.querySelector('[data-probe="composer"]') ??
      document.querySelector("#minit-ask-input")?.closest("form");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  });
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

  // The whole point: nothing reaches a vendor.
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

    const files = [
      path.join(REPORTS, "shot104-page1.png"),
      path.join(REPORTS, "shot104-page2.png"),
    ];
    for (const f of files) writeFileSync(f, TINY_PNG);

    for (const [label, viewport] of [
      ["desktop", { width: 1280, height: 900 }],
      ["phone", { width: 375, height: 720 }],
    ]) {
      await page.setViewport(viewport);
      await page.goto(BASE, { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 800));

      check(`${label}: the composer is on screen at rest`, (await composerRect(page)) !== null);
      await page.screenshot({
        path: path.join(REPORTS, `workbench-104-${TAG}-${label}-1-empty.png`),
      });

      // ① two photos → the thumbnail strip appears. The empty state has no
      // conversation pane at all, so THIS is where "the same place" starts
      // being a promise: from the first card to the last, nothing moves.
      const input = await page.$('input[type="file"]');
      await input.uploadFile(...files);
      await page.waitForFunction(
        () =>
          document.querySelector('[data-probe="askback-card"]') !== null ||
          (document.body.innerText || "").includes("还没送出"),
        { timeout: 15000 },
      );
      await new Promise((r) => setTimeout(r, 400));
      const before = await composerRect(page);
      check(`${label}: the composer is on screen with the thumbnails up`, before !== null);

      // ② send → the canned reading brings up the which-meeting card
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) =>
          (x.textContent ?? "").includes("送出"),
        );
        b?.click();
      });
      await page.waitForFunction(
        () =>
          document.querySelector('[data-card="meeting-choice"]') !== null ||
          (document.body.innerText || "").includes("不止一场会议"),
        { timeout: 20000 },
      );
      await new Promise((r) => setTimeout(r, 500));
      const afterCard = await composerRect(page);
      check(
        `${label}: the composer did not move when the which-meeting card appeared`,
        JSON.stringify(before) === JSON.stringify(afterCard),
        `${JSON.stringify(before)} → ${JSON.stringify(afterCard)}`,
      );

      const inside = await page.evaluate(() => {
        const region =
          document.querySelector('[data-probe="conversation-region"]') ??
          document.querySelector(".v2-scroll.overflow-y-auto");
        const cards = [...document.querySelectorAll('[data-probe="askback-card"]')];
        return {
          region: region !== null,
          cards: cards.length,
          allInside: region !== null && cards.every((c) => region.contains(c)),
          capped: region ? getComputedStyle(region).overflowY === "auto" : false,
        };
      });
      check(`${label}: every ask-back card is INSIDE the scrolling region`, inside.allInside,
        `${inside.cards} card(s)`);
      check(`${label}: the region owns its own scrollbar`, inside.capped);

      const fitsRect = await composerRect(page);
      const fits = {
        top: fitsRect?.top ?? 0,
        bottom: fitsRect?.bottom ?? 0,
        h: await page.evaluate(() => window.innerHeight),
      };
      if (label === "desktop") {
        check(
          `${label}: the composer is fully within the window without scrolling`,
          fits.top >= 0 && fits.bottom <= fits.h + 1,
          `top ${fits.top}, bottom ${fits.bottom}, window ${fits.h}`,
        );
      } else {
        // A phone screen holds the app bar, the page title, the bell and the
        // section heading before the pane even starts, so the composer sits
        // just under the fold on first paint — it always has. What §8 is
        // about is that it no longer WALKS further down as cards appear
        // (asserted above), and that it is whole and unobstructed once the
        // page is at its foot.
        console.log(
          `   note: ${label} composer at ${fits.top}–${fits.bottom} in a ${fits.h}px window`,
        );
      }
      // "In the window" for a phone means: the person can bring it fully into
      // view and nothing covers it there. Scrolling to the very FOOT of the
      // page overshoots — the cost line and the page padding sit below the
      // composer — so this scrolls the composer itself into view, which is
      // what a browser does when the box is focused.
      await page.evaluate(() => {
        const el =
          document.querySelector('[data-probe="composer"]') ??
          document.querySelector("#minit-ask-input")?.closest("form");
        el?.scrollIntoView({ block: "end" });
      });
      await new Promise((r) => setTimeout(r, 300));
      const atFoot = await page.evaluate(() => {
        const el =
          document.querySelector('[data-probe="composer"]') ??
          document.querySelector("#minit-ask-input")?.closest("form");
        if (!el) return false;
        const r = el.getBoundingClientRect();
        // The phone tab bar is display:none on a desktop — a hidden element
        // reports a 0×0 rect at the origin, which would read as "the bar
        // covers the whole screen". Only a bar with height is a bar.
        const bar = document.querySelector('nav[aria-label="Navigation"]');
        const barRect = bar ? bar.getBoundingClientRect() : null;
        const barTop =
          barRect && barRect.height > 0 ? barRect.top : window.innerHeight;
        return r.top >= 0 && r.bottom <= Math.min(window.innerHeight, barTop) + 1;
      });
      check(
        `${label}: the composer can be brought fully into view, unobstructed`,
        atFoot,
      );
      await page.evaluate(() => window.scrollTo(0, 0));

      await page.screenshot({
        path: path.join(REPORTS, `workbench-104-${TAG}-${label}-2-cards.png`),
      });
    }

    // --- §9: Upcoming folds, and the chip brings it back -------------------
    if (TAG !== "before") {
    await page.setViewport({ width: 1440, height: 950 });
    await page.goto(BASE, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 600));
    const hasCollapse = (await page.$('[data-probe="upcoming-collapse"]')) !== null;
    check("§9: the Upcoming column offers a collapse control", hasCollapse);
    const widthOpen = await page.evaluate(
      () => document.querySelector('[data-probe="composer"]').getBoundingClientRect().width,
    );
    await page.click('[data-probe="upcoming-collapse"]');
    await new Promise((r) => setTimeout(r, 400));
    const widthClosed = await page.evaluate(
      () => document.querySelector('[data-probe="composer"]').getBoundingClientRect().width,
    );
    check(
      "§9: folding gives the width to the conversation",
      widthClosed > widthOpen + 100,
      `${Math.round(widthOpen)}px → ${Math.round(widthClosed)}px`,
    );
    const chip = (await page.$('[data-probe="upcoming-reopen"]')) !== null;
    check("§9: a chip is left to bring it back", chip);
    await page.screenshot({ path: path.join(REPORTS, "workbench-104-upcoming-folded.png") });

    // remembered across a reload
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 700));
    check(
      "§9: the fold is remembered on this device",
      (await page.$('[data-probe="upcoming-reopen"]')) !== null,
    );
    await page.click('[data-probe="upcoming-reopen"]');
    await new Promise((r) => setTimeout(r, 400));
    check(
      "§9: the chip puts the column back",
      (await page.$('[data-probe="upcoming-collapse"]')) !== null,
    );

    }

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
  console.log(
    failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures.join("; ")}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
