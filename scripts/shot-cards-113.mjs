// ---------------------------------------------------------------------------
// WORK ORDER 113 — THE HOME PAGE'S ENTRY CARDS, MEASURED.
//
//   node scripts/shot-cards-113.mjs                 (the gate)
//   SHOT_TAG=before node scripts/shot-cards-113.mjs (photograph the old build)
//
// J: 「這個 HOME 一定要改…你做成 CARD…開始聊天后那些 card 就會收起來」.
//
// What the work order asks to be MEASURED rather than felt:
//   §1  each of the six cards lands somewhere real (6);
//   §1  cards 1–3 carry the kind into /api/intake, and a plain drop still
//       classifies (4);
//   §2  the cards leave when the conversation starts, leave ZERO height
//       behind, become unreachable while away, and come back after
//       "Clear conversation" (4);
//   §4  the composer's y is IDENTICAL in four states at three widths, and
//       the conversation area never drops below what 110 recorded (15).
//
// 🔴 NO VENDOR CALL, NO MONEY. /api/intake is INTERCEPTED and answered with a
// canned reading (the same canned meeting 109 used), and every question asked
// here is one the PREPARED layer answers for free. The real client code runs;
// nobody pays to re-read a document whose reading is not under test.
//
// Runs in a purpose-made test user + organisation, deleted at the end.
// Screenshots and the measurement JSON go to eval/reports/ (git-ignored).
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
const TEST_EMAIL = "zzz-shot-cards-113@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ 113 入口卡測試社團（可刪）";
// 126: port 3000 may be taken by J's other project — e2e runs on E2E_BASE.
const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const TAG = process.env.SHOT_TAG ?? "after";

/** 🔴 §4-2: the floors 110 recorded for the conversation area. Not a ratio —
 *  an absolute number this build is not allowed to go under. */
// 130 §8: the phone floor rises by the bell row (44 + 12) it gave back.
const REGION_FLOOR = { desktop: 604, wide: 784, phone: 503 };

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

/** 130 §6 (re-taught after 116 removed the which-meeting card): what
 *  /api/intake answers when the request carries NO kind — MinitAI "cannot
 *  place the page" and ASKS, with one-tap answers. That ask-back card is
 *  state 3. Nothing is read, nothing is charged. */
const CANNED_UNKNOWN = { kind: "unknown" };

/** What /api/intake answers once a kind is known (a card was pressed, or the
 *  person answered the ask-back): one plain meeting reading — ONE decision,
 *  so two pages of it never look like "the same meeting twice" (105 §3's
 *  repeat-pages card needs two). The finished-product card is state 4. */
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
  },
};

/** The composer's box and the pane's visible height, in VIEWPORT coordinates —
 *  the same measurement shot-layout-109 takes, so the two agree by
 *  construction rather than by hand. */
async function measure(page) {
  return page.evaluate(() => {
    const el =
      document.querySelector('[data-probe="composer"]') ??
      document.querySelector("#minit-ask-input")?.closest("form");
    const region =
      document.querySelector('[data-probe="conversation-region"]') ??
      document.querySelector("main .v2-scroll.overflow-y-auto");
    const r = el ? el.getBoundingClientRect() : null;
    const rr = region ? region.getBoundingClientRect() : null;
    const shell = document.querySelector('[data-probe="entry-cards-shell"]');
    const sr = shell ? shell.getBoundingClientRect() : null;
    return {
      composer: r
        ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }
        : null,
      region: rr
        ? Math.round(Math.min(rr.bottom, window.innerHeight) - Math.max(rr.top, 0))
        : 0,
      cards: sr ? Math.round(sr.height) : null,
      innerHeight: window.innerHeight,
    };
  });
}

const same = (a, b) => a && b && a.top === b.top && a.bottom === b.bottom;

/** Everything this probe needs to see from inside the page. */
function instrument() {
  // 1. The file chooser: record the open, and never let a native dialog
  //    happen in a headless browser.
  window.__pickerOpens = [];
  const realClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === "file") {
      window.__pickerOpens.push(Date.now());
      return;
    }
    return realClick.call(this);
  };
  // 2. Speech recognition: this browser has none, and card 4 correctly hides
  //    itself without one. Give it a fake ear that only counts.
  window.__speechStarts = 0;
  class FakeRecognition {
    constructor() {
      this.lang = "";
      this.interimResults = false;
      this.continuous = false;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
    }
    start() {
      window.__speechStarts++;
    }
    stop() {
      if (this.onend) this.onend();
    }
  }
  window.SpeechRecognition = FakeRecognition;
  // 3. What actually went to /api/intake — read from the FormData itself, so
  //    the assertion is about the request the app made, not about a body a
  //    proxy re-serialised.
  window.__intakeCalls = [];
  const realFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.includes("/api/intake") && init?.body instanceof FormData) {
        window.__intakeCalls.push({
          kind: init.body.get("kind") ?? null,
          context: init.body.get("context") ?? null,
        });
        // 130 §6: the interceptor answers by what was actually sent.
        init.headers = { ...(init.headers ?? {}), "x-shot-kind": String(init.body.get("kind") ?? "") };
      }
    } catch {}
    return realFetch.call(this, input, init);
  };
  try {
    localStorage.setItem("minit.lang.v2", "zh");
    document.cookie = "minit-lang=zh;path=/";
  } catch {}
}

const card = (id) => `[data-probe="entry-card"][data-card="${id}"]`;

/** 130 §6: the conversation survives page changes on purpose (F-4), and a
 *  finished-product card from the previous step folds the entry cards away
 *  (§2) — so every step that needs the CARDS starts from a genuinely empty
 *  conversation. (116 removed the which-meeting card; a reading now lands as
 *  a product card straight away, which is what made this necessary.) */
/** Click an entry card and PROVE its React handler ran: cards 1–3 open the
 *  file chooser, which the instrument records. A click that landed before
 *  hydration opens nothing — then wait and click again (bounded), instead of
 *  uploading with no kind and blaming the app. */
async function pressCard(page, id) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.evaluate(() => {
      window.__pickerOpens = [];
    });
    await page.click(card(id));
    await new Promise((r) => setTimeout(r, 150));
    const opens = await page.evaluate(() => window.__pickerOpens.length);
    if (opens === 1) return attempt;
    await new Promise((r) => setTimeout(r, 400));
  }
  // Say what is in the way before giving up — a screenshot and the element
  // actually under the card's centre.
  const where = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return "card not in DOM";
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const shell = el.closest('[data-probe="entry-cards-shell"]');
    return JSON.stringify({
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      hit: hit ? `${hit.tagName}.${String(hit.className).slice(0, 60)}` : null,
      inert: shell?.hasAttribute("inert") ?? null,
      shellH: shell ? Math.round(shell.getBoundingClientRect().height) : null,
    });
  }, card(id));
  await page.screenshot({ path: path.join(REPORTS, `cards-113-${TAG}-debug-${id}.png`) });
  throw new Error(`card ${id} never opened the chooser — ${where}`);
}

async function freshHome(page) {
  // Navigate FIRST: the previous step's read may still be finishing, and
  // its product card would be written to localStorage right after a clear
  // done on the live page (that race produced a folded, inert card row and
  // "kind: null" in the intake call). A fresh document has nothing in
  // flight; clear there, then load once more.
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.includes("chat.home")) localStorage.removeItem(k);
    }
  });
  await page.goto(BASE, { waitUntil: "networkidle2" });
}

async function clickText(page, text) {
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes(t),
    );
    b?.click();
    return b !== undefined;
  }, text);
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
  await page.evaluateOnNewDocument(instrument);

  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.url().includes("/api/intake") && req.method() === "POST") {
      // The page's own fetch wrapper copies the FormData's "kind" into a
      // header, so the canned answer follows what the app actually sent:
      // no kind → "which kind is this?"; a kind → the reading.
      const kind = req.headers()["x-shot-kind"] ?? "";
      void req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(kind === "" ? CANNED_UNKNOWN : CANNED),
      });
      return;
    }
    void req.continue();
  });

  const measured = {};
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

    const found = await (
      await rest(`/orgs?select=id,name&name=eq.${encodeURIComponent(ORG_NAME)}`)
    ).json();
    orgId = found?.[0]?.id ?? null;
    if (!orgId) throw new Error("the test organisation was not created");

    // 🔴 Card 6 only exists when there IS half-finished work — so make some.
    // One row, service-role, in the org this probe deletes at the end.
    await rest(`/minutes_drafts`, {
      method: "POST",
      body: JSON.stringify({
        org_id: orgId,
        client_key: "shot-cards-113",
        title: "ZZZ 113",
        payload: {},
      }),
    });

    const files = [path.join(REPORTS, "shot113-page1.png")];
    for (const f of files) writeFileSync(f, TINY_PNG);

    // 🔴 THE "BEFORE" PASS ONLY PHOTOGRAPHS. Run with the layout files
    // checked out at 109's last commit, there are no cards to press and no
    // §1/§2 behaviour to assert — the whole point of the pass is that none of
    // it exists yet. It takes the four shots §5 asks for in pairs and stops.
    if (TAG === "before") {
      for (const [label, viewport] of [
        ["desktop", { width: 1280, height: 900 }],
        ["phone", { width: 375, height: 812 }],
      ]) {
        await page.setViewport(viewport);
        await page.evaluate(() => {
          for (const k of Object.keys(localStorage)) {
            if (k.includes("chat.home")) localStorage.removeItem(k);
          }
        });
        await page.goto(BASE, { waitUntil: "networkidle2" });
        await new Promise((r) => setTimeout(r, 900));
        const empty = await measure(page);
        await page.screenshot({
          path: path.join(REPORTS, `cards-113-before-${label}-1-empty.png`),
        });
        console.log(
          `   before ${label}: composer ${empty.composer?.top}–${empty.composer?.bottom}, conversation ${empty.region}px`,
        );
        // The same free question the "after" pass asks, typed into the box —
        // the old build has no chip to press for it.
        await page.type("#minit-ask-input", "年度呈报什么时候要交？");
        await clickText(page, "问");
        await page.waitForFunction(
          () => (document.body.innerText || "").includes("eROSES"),
          { timeout: 15000 },
        );
        await new Promise((r) => setTimeout(r, 700));
        await page.screenshot({
          path: path.join(REPORTS, `cards-113-before-${label}-2-sent.png`),
        });
      }
      return;
    }

    // =====================================================================
    // §1 — the six cards, and where each one lands
    // =====================================================================
    await page.goto(BASE, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({
      path: path.join(REPORTS, `cards-113-${TAG}-desktop-1-empty.png`),
    });

    const present = await page.evaluate(
      () =>
        [...document.querySelectorAll('[data-probe="entry-card"]')].map(
          (e) => e.dataset.card,
        ),
      );
    check(
      "§1: all six cards are on the empty home page",
      JSON.stringify(present) ===
        JSON.stringify([
          "meeting_notes",
          "money",
          "constitution",
          "dictate",
          "ask",
          "resume",
        ]),
      present.join(","),
    );

    for (const [id, label] of [
      ["meeting_notes", "card 1 (notes from a meeting)"],
      ["money", "card 2 (money that came in)"],
      ["constitution", "card 3 (the constitution)"],
    ]) {
      await page.evaluate(() => {
        window.__pickerOpens = [];
      });
      await page.click(card(id));
      await new Promise((r) => setTimeout(r, 150));
      const opens = await page.evaluate(() => window.__pickerOpens.length);
      check(`§1: ${label} opens the file chooser`, opens === 1, `${opens} open(s)`);
    }

    await page.evaluate(() => {
      window.__speechStarts = 0;
    });
    await page.click(card("dictate"));
    await new Promise((r) => setTimeout(r, 200));
    const starts = await page.evaluate(() => window.__speechStarts);
    check("§1: card 4 (just came out of a meeting) opens the microphone", starts === 1, `${starts}`);

    await page.click(card("ask"));
    await new Promise((r) => setTimeout(r, 250));
    const chips = await page.evaluate(
      () => document.querySelectorAll('[data-probe="entry-question"]').length,
    );
    check("§1: card 5 (ask one question) unfolds the common questions", chips >= 2, `${chips} chips`);

    const resumeHref = await page.evaluate(
      () => document.querySelector('[data-probe="entry-card"][data-card="resume"]')?.getAttribute("href"),
    );
    check(
      "§1: card 6 (carry on) goes back to the half-finished work",
      resumeHref === "/minutes/drafts",
      String(resumeHref),
    );

    // A LOOK IN THE DARK. Six new cards is six new colour decisions, and the
    // app has a dark theme that a phone in a temple hall at night will be in.
    // Not an assertion — a photograph, so a human can see it.
    await page.evaluate(() => {
      localStorage.setItem("minit.theme.v1", "dark");
    });
    await page.goto(BASE, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({
      path: path.join(REPORTS, `cards-113-${TAG}-desktop-1-empty-dark.png`),
    });
    await page.evaluate(() => {
      localStorage.setItem("minit.theme.v1", "light");
    });

    // =====================================================================
    // §1 — the pre-marked kind actually travels to /api/intake
    // =====================================================================
    for (const [id, expected] of [
      ["meeting_notes", "meeting_notes"],
      ["money", "ledger_page"],
      ["constitution", "constitution"],
    ]) {
      await freshHome(page);
      await new Promise((r) => setTimeout(r, 700));
      await pressCard(page, id);
      const input = await page.$('input[type="file"]');
      await input.uploadFile(...files);
      await page.waitForFunction(
        () => document.querySelector('[data-probe="askback-card"]') !== null,
        { timeout: 15000 },
      );
      await new Promise((r) => setTimeout(r, 300));
      await clickText(page, "送出");
      await page.waitForFunction(() => (window.__intakeCalls ?? []).length > 0, {
        timeout: 20000,
      });
      const calls = await page.evaluate(() => window.__intakeCalls);
      check(
        `§1: pressing "${id}" sends kind=${expected} — the classify step is skipped`,
        calls.length === 1 && calls[0].kind === expected,
        JSON.stringify(calls),
      );
    }

    // The classifier is NOT deleted: a paper that simply arrives is still
    // asked about. This is the assertion that keeps the shortcut a shortcut.
    await freshHome(page);
    await new Promise((r) => setTimeout(r, 700));
    {
      const input = await page.$('input[type="file"]');
      await input.uploadFile(...files);
      await page.waitForFunction(
        () => document.querySelector('[data-probe="askback-card"]') !== null,
        { timeout: 15000 },
      );
      await clickText(page, "送出");
      await page.waitForFunction(() => (window.__intakeCalls ?? []).length > 0, {
        timeout: 20000,
      });
      const calls = await page.evaluate(() => window.__intakeCalls);
      check(
        "§1: a paper dropped in WITHOUT a card is still classified (no forced kind)",
        calls.length === 1 && (calls[0].kind === null || calls[0].kind === ""),
        JSON.stringify(calls),
      );
    }

    // =====================================================================
    // §2 — the cards get out of the way, and come back
    // =====================================================================
    await freshHome(page);
    await new Promise((r) => setTimeout(r, 900));
    const openHeight = (await measure(page)).cards;
    check("§2: the cards are on screen while the conversation is empty", openHeight > 100, `${openHeight}px`);

    // One free question (the prepared layer answers it — no vendor, no money).
    await page.click(card("ask"));
    await new Promise((r) => setTimeout(r, 250));
    await page.click('[data-probe="entry-question"]');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-probe="conversation-region"] p').length > 1,
      { timeout: 15000 },
    );
    await new Promise((r) => setTimeout(r, 900));
    const afterSend = await measure(page);
    await page.screenshot({
      path: path.join(REPORTS, `cards-113-${TAG}-desktop-2-sent.png`),
    });
    check(
      "§2: once the conversation starts the cards leave NO height behind",
      afterSend.cards === 0,
      `${afterSend.cards}px`,
    );
    const reachable = await page.evaluate(() => {
      const shell = document.querySelector('[data-probe="entry-cards-shell"]');
      if (!shell) return "missing";
      const btn = shell.querySelector("button");
      if (!btn) return "no button";
      // `inert` is what makes a collapsed row unreachable by Tab and by a
      // screen reader; a zero-height row that is still focusable is a trap.
      btn.focus();
      return document.activeElement === btn ? "focusable" : "unreachable";
    });
    check(
      "§2: the folded cards cannot be reached by keyboard or screen reader",
      reachable === "unreachable",
      reachable,
    );

    // …and "Clear conversation" brings them back.
    await clickText(page, "清除对话");
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const b = [...(dialog?.querySelectorAll("button") ?? [])].find((x) =>
        (x.textContent ?? "").includes("清除对话"),
      );
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 900));
    const afterClear = (await measure(page)).cards;
    check(
      "§2: «Clear conversation» brings the cards back",
      afterClear > 100,
      `${afterClear}px`,
    );

    // =====================================================================
    // §4 — 🔴 THE THING THIS CHANGE IS NOT ALLOWED TO BREAK
    // =====================================================================
    for (const [label, viewport] of [
      ["desktop", { width: 1280, height: 900 }],
      ["wide", { width: 1920, height: 1080 }],
      ["phone", { width: 375, height: 812 }],
    ]) {
      await page.setViewport(viewport);
      // 🔴 STATE 1 HAS TO BE GENUINELY EMPTY, at every width. The
      // conversation survives page changes on purpose (F-4), so the previous
      // width's finished-work card is still in localStorage when the next
      // one opens — and "empty state, with the cards" would silently have
      // been measured and photographed with a conversation in it. Found by
      // looking at the phone screenshot, not by a failing assertion.
      await freshHome(page);
      await new Promise((r) => setTimeout(r, 900));
      const cardsUp = await page.evaluate(
        () =>
          document.querySelectorAll('[data-probe="entry-card"]').length > 0 &&
          document.querySelector('[data-probe="entry-cards-shell"]')
            .getBoundingClientRect().height > 100,
      );
      check(`§4 ${label}: state 1 really is the empty state, cards and all`, cardsUp);

      // state 1: empty — WITH THE SIX CARDS ON SCREEN
      const s1 = await measure(page);
      if (label === "phone") {
        await page.screenshot({
          path: path.join(REPORTS, `cards-113-${TAG}-phone-1-empty.png`),
        });
        // 130 §8: is the THIRD row of cards (ask / carry on) whole on screen
        // above the composer without scrolling? MEASURED, not gated: the bell
        // row gave 56px back (447 → 506px of conversation) and the third row
        // still ends ~103px below the composer at 375×812 — its titles wrap
        // to two lines on a phone, and the heading block above the cards is
        // ~100px. Reaching it means a shorter phone card or a shorter
        // heading, which is a design call (report 131 §8), not a side effect
        // of moving a bell. The number is printed so the next change can be
        // measured against it.
        const thirdRow = await page.evaluate(() => {
          const composer = document.querySelector('[data-probe="composer"]')?.getBoundingClientRect();
          const rows = ["ask", "resume"].map((id) => {
            const el = document.querySelector(`[data-probe="entry-card"][data-card="${id}"]`);
            if (!el) return `${id}: missing`;
            const r = el.getBoundingClientRect();
            const ok = r.top >= 0 && composer !== undefined && r.bottom <= composer.top + 1;
            return `${id}: ${Math.round(r.top)}–${Math.round(r.bottom)}${ok ? "" : " NOT WHOLE"}`;
          });
          return { ok: rows.every((x) => !x.includes("NOT") && !x.includes("missing")), detail: rows.join(" · ") + ` (composer top ${Math.round(composer?.top ?? -1)})` };
        });
        console.log(
          `   note: 130 §8 third row of cards ${thirdRow.ok ? "IS" : "is NOT"} whole above the composer — ${thirdRow.detail}`,
        );
      }

      // state 2: a photo staged (the cards fold away here)
      const input = await page.$('input[type="file"]');
      await input.uploadFile(...files);
      await page.waitForFunction(
        () => document.querySelector('[data-probe="askback-card"]') !== null,
        { timeout: 15000 },
      );
      await new Promise((r) => setTimeout(r, 500));
      const s2 = await measure(page);
      if (label === "phone")
        await page.screenshot({
          path: path.join(REPORTS, `cards-113-${TAG}-phone-2-sent.png`),
        });

      // state 3: an ask-back card ("which kind of page is this?")
      await clickText(page, "送出");
      await page.waitForFunction(
        () => (document.body.innerText || "").includes("是哪一种"),
        { timeout: 20000 },
      );
      await new Promise((r) => setTimeout(r, 500));
      const s3 = await measure(page);

      // state 4: the finished-work card (answer "meeting notes" — the canned
      // reading comes back; no vendor)
      await clickText(page, "会议笔记");
      await page.waitForFunction(
        () => document.querySelector('[data-probe="product-card"]') !== null,
        { timeout: 20000 },
      );
      await new Promise((r) => setTimeout(r, 500));
      const s4 = await measure(page);
      measured[label] = { s1, s2, s3, s4 };

      check(
        `§4 ${label}: the composer is whole and on screen in all four states`,
        [s1, s2, s3, s4].every(
          (s) => s.composer && s.composer.top >= 0 && s.composer.bottom <= s.innerHeight + 1,
        ),
        [s1, s2, s3, s4]
          .map((s) => (s.composer ? `${s.composer.top}–${s.composer.bottom}` : "—"))
          .join(" · "),
      );
      check(
        `§4 ${label}: the cards do not move the composer — empty(cards) → photo staged`,
        same(s1.composer, s2.composer),
        `${JSON.stringify(s1.composer)} → ${JSON.stringify(s2.composer)}`,
      );
      check(
        `§4 ${label}: the composer does not move — staged → ask-back card`,
        same(s2.composer, s3.composer),
        `${JSON.stringify(s2.composer)} → ${JSON.stringify(s3.composer)}`,
      );
      check(
        `§4 ${label}: the composer does not move — ask-back → finished card`,
        same(s3.composer, s4.composer),
        `${JSON.stringify(s3.composer)} → ${JSON.stringify(s4.composer)}`,
      );
      check(
        `§4 ${label}: the conversation area is not shorter than 110 recorded (${REGION_FLOOR[label]}px)`,
        s3.region >= REGION_FLOOR[label],
        `${s3.region}px`,
      );
    }

    writeFileSync(
      path.join(REPORTS, `cards-113-${TAG}.json`),
      JSON.stringify(measured, null, 2),
    );
  } finally {
    if (orgId) {
      await rest(`/minutes_drafts?org_id=eq.${orgId}`, { method: "DELETE" });
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
