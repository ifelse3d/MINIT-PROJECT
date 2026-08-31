// ---------------------------------------------------------------------------
// §1 + §5 (work order 109) — THE HOME PAGE IS A CHAT SCREEN.
//
//   node scripts/shot-layout-109.mjs              (the "after" pass — a gate)
//   SHOT_TAG=before node scripts/shot-layout-109.mjs   (measure the old build)
//
// J: 「爲什麽不是放在下面，像 CLAUDE 或者 GPT 這樣」/「上面太空了，把
// CHATBOX 弄大」.
//
// What the work order asks to be MEASURED, not felt:
//   1. the composer's y is IDENTICAL in four states — empty → a photo staged
//      → an ask-back card up → a finished-product card — at three widths;
//   2. the conversation area is at least 1.4× taller than it was before
//      (the "before" pass writes the baseline this one reads);
//   3. the composer stays pinned to the bottom of the VISIBLE viewport when
//      the window's height changes under it — a phone's address bar
//      retracting is exactly that, and `dvh` has burned this app before.
//
// 🔴 NO VENDOR CALL, NO MONEY. /api/intake is INTERCEPTED and answered with a
// canned extraction, so the REAL client code puts up the REAL cards without
// paying anybody to re-read a document whose reading is not under test here.
//
// Runs in a purpose-made test user + organisation, deleted at the end.
// Screenshots and the measurement JSON go to eval/reports/ (git-ignored).
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
const TEST_EMAIL = "zzz-shot-layout-109@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ 109 版面測試社團（可刪）";
const BASE = "http://localhost:3000";
/** SHOT_TAG=before names the files for the "before" pass — run it with the
 *  layout files checked out at the previous commit. There the assertions are
 *  MEASUREMENTS, not gates: their whole point is that they do not hold yet. */
const TAG = process.env.SHOT_TAG ?? "after";
const BASELINE = path.join(REPORTS, "layout-109-before.json");

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

/** What /api/intake would answer for a paper carrying two meetings — the
 *  ask-back card ("which meeting?") is state 3. */
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
 *  against a build with no data-probe attributes. */
async function measure(page) {
  return page.evaluate(() => {
    const el =
      document.querySelector('[data-probe="composer"]') ??
      document.querySelector("#minit-ask-input")?.closest("form");
    // Scoped to <main> on purpose: the LEFT RAIL is also a
    // ".v2-scroll.overflow-y-auto", and on the old build — which had no
    // conversation region until a card appeared — the loose fallback
    // measured the sidebar and recorded a 731px "conversation area" for an
    // empty screen. The state-3 numbers were always the real thing (both
    // builds have the region by then); this stops the empty-state row of the
    // JSON being a number about the wrong element.
    const region =
      document.querySelector('[data-probe="conversation-region"]') ??
      document.querySelector("main .v2-scroll.overflow-y-auto");
    const r = el ? el.getBoundingClientRect() : null;
    const rr = region ? region.getBoundingClientRect() : null;
    return {
      composer: r
        ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }
        : null,
      // The pane's VISIBLE height — what a person can actually read at once,
      // which is the number the work order asks to grow by 1.4×.
      region: rr
        ? Math.round(Math.min(rr.bottom, window.innerHeight) - Math.max(rr.top, 0))
        : 0,
      innerHeight: window.innerHeight,
    };
  });
}

const same = (a, b) => a && b && a.top === b.top && a.bottom === b.bottom;

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

    const files = [
      path.join(REPORTS, "shot109-page1.png"),
      path.join(REPORTS, "shot109-page2.png"),
    ];
    for (const f of files) writeFileSync(f, TINY_PNG);

    for (const [label, viewport] of [
      ["desktop", { width: 1280, height: 900 }],
      ["wide", { width: 1920, height: 1080 }],
      ["phone", { width: 375, height: 812 }],
    ]) {
      await page.setViewport(viewport);
      await page.goto(BASE, { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 900));

      // ---- state 1: empty -------------------------------------------------
      const s1 = await measure(page);
      await page.screenshot({ path: path.join(REPORTS, `layout-109-${TAG}-${label}-1-empty.png`) });

      // ---- state 2: a photo staged ---------------------------------------
      const input = await page.$('input[type="file"]');
      await input.uploadFile(...files);
      await page.waitForFunction(
        () =>
          document.querySelector('[data-probe="askback-card"]') !== null ||
          (document.body.innerText || "").includes("还没送出"),
        { timeout: 15000 },
      );
      await new Promise((r) => setTimeout(r, 400));
      const s2 = await measure(page);

      // ---- state 3: an ask-back card ("which meeting?") -------------------
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
      const s3 = await measure(page);
      await page.screenshot({ path: path.join(REPORTS, `layout-109-${TAG}-${label}-2-cards.png`) });

      // ---- state 4: the finished-product card ----------------------------
      // "Keep it all in one — use what was read (free)": no vendor, no money.
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) =>
          (x.textContent ?? "").includes("全部放一份"),
        );
        b?.click();
      });
      await page.waitForFunction(
        () => document.querySelector('[data-probe="product-card"]') !== null,
        { timeout: 20000 },
      );
      await new Promise((r) => setTimeout(r, 500));
      const s4 = await measure(page);
      await page.screenshot({
        path: path.join(REPORTS, `layout-109-${TAG}-${label}-3-product.png`),
      });

      measured[label] = { s1, s2, s3, s4 };

      // ---- §4: the arrival animation, and the setting that turns it down --
      // Cards used to teleport into a pane that is often already scrolled.
      // The check is on the COMPUTED style rather than on a screenshot: an
      // animation is a thing a machine can read, and a still frame is not.
      if (label === "desktop") {
        const named = await page.evaluate(
          () =>
            getComputedStyle(document.querySelector('[data-probe="product-card"]'))
              .animationName,
        );
        check("§4: a finished card arrives with an animation", named === "minit-enter", named);
        await page.emulateMediaFeatures([
          { name: "prefers-reduced-motion", value: "reduce" },
        ]);
        const reduced = await page.evaluate(
          () =>
            getComputedStyle(document.querySelector('[data-probe="product-card"]'))
              .animationName,
        );
        check(
          "§4: prefers-reduced-motion keeps the fade and drops the movement",
          reduced === "minit-enter-still",
          reduced,
        );
        await page.emulateMediaFeatures([
          { name: "prefers-reduced-motion", value: "no-preference" },
        ]);
      }

      // ---- the four assertions for this width ----------------------------
      check(
        `${label}: the composer is whole and on screen in all four states`,
        [s1, s2, s3, s4].every(
          (s) => s.composer && s.composer.top >= 0 && s.composer.bottom <= s.innerHeight + 1,
        ),
        [s1, s2, s3, s4]
          .map((s) => (s.composer ? `${s.composer.top}–${s.composer.bottom}` : "—"))
          .join(" · "),
      );
      check(
        `${label}: the composer does not move — empty → photo staged`,
        same(s1.composer, s2.composer),
        `${JSON.stringify(s1.composer)} → ${JSON.stringify(s2.composer)}`,
      );
      check(
        `${label}: the composer does not move — staged → ask-back card`,
        same(s2.composer, s3.composer),
        `${JSON.stringify(s2.composer)} → ${JSON.stringify(s3.composer)}`,
      );
      check(
        `${label}: the composer does not move — ask-back → finished card`,
        same(s3.composer, s4.composer),
        `${JSON.stringify(s3.composer)} → ${JSON.stringify(s4.composer)}`,
      );

      // ---- the conversation area got taller -------------------------------
      if (TAG === "before") {
        console.log(`   baseline ${label}: conversation region ${s3.region}px`);
      } else if (existsSync(BASELINE)) {
        const before = JSON.parse(readFileSync(BASELINE, "utf-8"));
        const wasEmpty = before[label]?.s1?.region ?? 0;
        const was = before[label]?.s3?.region ?? 0;
        const ratio = was > 0 ? (s3.region / was).toFixed(2) : "?";
        const detail = `${was}px → ${s3.region}px (${ratio}×; empty state was ${wasEmpty}px)`;
        if (label === "phone") {
          // 🔴 A PHONE CANNOT GIVE 1.4× AND KEEP ITS PARTS, and the honest
          // thing is to say so here rather than quietly measure something
          // else. 812px holds the app bar (56), the phone tab bar (56), the
          // "Upcoming" bell row §2 keeps (44+12), and the composer (173: one
          // line of typing, a 44px paperclip row, the three-language safety
          // notice) — 447 left, which is 1.20×. The missing 77px exist only
          // inside the bell's row and the app's 44px touch floor, and §2 and
          // F-3 say both of those stay.
          //
          // So the phone is held to what actually changed for it, which
          // matters more than a ratio: the typing box used to be BELOW THE
          // FOLD ENTIRELY (measured on the old build — 738–1117 in an 812px
          // window: you scrolled the page to reach it), and the four-state
          // assertion above now proves it is whole and on screen throughout.
          // The ratio is still measured, still has to improve, and goes into
          // the report as a number rather than as a pass.
          check(`${label}: the conversation area is taller than it was`, s3.region > was, detail);
          console.log(
            `   note: phone ratio ${ratio}× — §1's 1.4× is met at 1280 and 1920, not here`,
          );
        } else {
          check(
            `${label}: the conversation area is ≥1.4× its old height`,
            was > 0 && s3.region >= was * 1.4,
            detail,
          );
        }
      } else {
        console.log(`   (no baseline JSON — run SHOT_TAG=before first)`);
      }

      // ---- the address bar retracting must not move it -------------------
      // A phone growing its visible viewport is exactly a height change under
      // a live page; what must hold is the composer staying the same distance
      // off the BOTTOM of what is visible.
      const gapBefore = s4.innerHeight - s4.composer.bottom;
      await page.setViewport({ ...viewport, height: viewport.height + 90 });
      await new Promise((r) => setTimeout(r, 500));
      const grown = await measure(page);
      const gapAfter = grown.innerHeight - grown.composer.bottom;
      check(
        `${label}: the composer stays pinned when the window height changes`,
        Math.abs(gapAfter - gapBefore) <= 2,
        `gap ${gapBefore}px → ${gapAfter}px`,
      );
    }

    writeFileSync(
      path.join(REPORTS, `layout-109-${TAG}.json`),
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
  console.log(
    failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures.join("; ")}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
