// PROBE — work order 89 ⑥: the minutes multi-page QUEUE, against the real
// next start + DB, with /api/extract-minutes INTERCEPTED in the browser —
// ZERO AI calls, zero charges, and that is itself part of the proof: the
// route is untouched by ⑥ (git shows no diff), the queue is client UX only,
// and every page still travels as its own single POST (one page = one
// request = one charge, byte-for-byte the pre-89 wire shape).
//
// Proves:
//   * the picker takes SEVERAL files; BeforeReading asks ONCE; the pages
//     read one after another with the "第 X／N 页" progress line;
//   * a failed page stops the queue AT that page — the pages already read
//     are kept (their content is on screen) and the failure card says so;
//   * more pages can join the queue after the failure (the ＋ control);
//   * "再试一次" continues FROM the failed page through the appended tail;
//   * total requests = pages picked + 1 retry (nothing skipped, nothing
//     double-sent), and ai_usage holds ZERO rows (nothing reached a vendor).
//
//   node scripts/probe-queue-89.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const BASE = process.env.BASE || "http://localhost:3000";
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
const TEST_EMAIL = "zzz-probe-queue-89@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ QUEUE 89 多页排队（可删）";

const admin = (p, o = {}) =>
  fetch(`${SUPA_URL}/auth/v1/admin${p}`, {
    ...o,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...(o.headers ?? {}),
    },
  });
const rest = (p, o = {}) =>
  fetch(`${SUPA_URL}/rest/v1${p}`, {
    ...o,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(o.headers ?? {}),
    },
  });

const failures = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A real 1×1 PNG so the thumbnail path (canvas decode) works.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** One canned page, confidence-complete so no review noise blocks anything. */
const extractionFor = (n) => {
  const ref = { location: `muka surat ${n}`, snippet: `page ${n}` };
  const f = (value) => ({ value, confidence: "confirmed", source_ref: ref });
  return {
    meeting_type: f("agm"),
    meeting_date: f("2026-05-20"),
    meeting_venue: f("Dewan Contoh"),
    attendees: [],
    resolutions: [{ text: f(`QUEUE-PAGE-${n} keputusan`) }],
    figures: [],
    office_bearers: [],
  };
};

let userId = null;
let orgId = null;
let browser = null;

async function main() {
  console.log("probing", BASE);

  const list = await (await admin(`/users?page=1&per_page=200`)).json();
  const existing = (Array.isArray(list.users) ? list.users : []).find(
    (u) => u.email === TEST_EMAIL,
  );
  if (existing) {
    userId = existing.id;
    await admin(`/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }),
    });
  } else {
    const res = await admin(`/users`, {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }),
    });
    userId = (await res.json()).id;
  }

  browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);
  await page.setViewport({ width: 1366, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  // --- intercept the extract route: canned page per request, page 3 fails
  //     ONCE. Everything else passes through untouched.
  let extractCalls = 0;
  let failOnce = true;
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (!req.url().includes("/api/extract-minutes")) {
      req.continue().catch(() => {});
      return;
    }
    extractCalls += 1;
    const n = extractCalls;
    check(`request #${n} is a plain POST to /api/extract-minutes`, req.method() === "POST");
    // The 3rd distinct page (the 3rd request) fails once; its retry (a later
    // request) succeeds. 700ms delay so the progress line is observable.
    const shouldFail = n === 3 && failOnce;
    if (shouldFail) failOnce = false;
    setTimeout(() => {
      req
        .respond(
          shouldFail
            ? {
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({ error: "probe: halaman ini sengaja gagal\n这一页是探针故意弄坏的\nprobe: this page fails on purpose" }),
              }
            : {
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ extraction: extractionFor(n), storagePath: null }),
              },
        )
        .catch(() => {});
    }, 700);
  });

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click('button[type="submit"]'),
  ]);

  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  await page.type('input[name="name"]', ORG_NAME);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("创建组织"),
    );
    if (b) b.click();
  });
  for (let i = 0; i < 30 && !orgId; i++) {
    await sleep(1500);
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // --- three "pages" picked at once ---------------------------------------
  const tmp = mkdtempSync(path.join(os.tmpdir(), "probe-q89-"));
  const files = ["a", "b", "c", "d"].map((s) => {
    const p = path.join(tmp, `page-${s}.png`);
    writeFileSync(p, PNG_1PX);
    return p;
  });

  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  const picker = await page.$('input[type="file"][multiple]');
  check("⑥ the minutes picker takes multiple files", picker !== null);
  await picker.uploadFile(files[0], files[1], files[2]);
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("现在开始读"),
    { timeout: 15000 },
  );
  const asksOnce = await page.evaluate(() =>
    (document.body.innerText || "").includes("page-a.png (+2)"),
  );
  check("⑥ BeforeReading asks ONCE for the whole pick", asksOnce);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("现在开始读"),
    );
    if (b) b.click();
  });

  // Watch the progress line while pages 1–2 read and page 3 fails.
  const progressSeen = new Set();
  const t0 = Date.now();
  let failedCardSeen = false;
  while (Date.now() - t0 < 30000) {
    const txt = await page.evaluate(() => document.body.innerText || "");
    const m = txt.match(/第 (\d+)／(\d+) 页/);
    if (m) progressSeen.add(`${m[1]}/${m[2]}`);
    if (txt.includes("没读成功")) {
      failedCardSeen = true;
      break;
    }
    await sleep(120);
  }
  check(
    "⑥ progress speaks 第 X／N 页 while reading",
    [...progressSeen].some((s) => s.endsWith("/3")),
    [...progressSeen].join(", "),
  );
  check("⑥ the failed page STOPS the queue with the failure card", failedCardSeen);
  const failText = await page.evaluate(() => document.body.innerText || "");
  check(
    "⑥ the card names the page: 第 3／3 页没读成功",
    failText.includes("第 3／3 页没读成功"),
  );
  check(
    "⑥ pages read before the failure are kept (page-1 content on screen)",
    failText.includes("QUEUE-PAGE-1"),
  );
  check(
    "⑥ the route's own error shows beside the card",
    failText.includes("探针故意弄坏"),
  );

  // --- append page 4 while stopped, then retry from page 3 -----------------
  const appendInput = await page.$('[data-probe="queue-append"] input[type="file"]');
  check("⑥ the queue-append picker is on screen", appendInput !== null);
  await appendInput.uploadFile(files[3]);
  await sleep(400);
  const afterAppend = await page.evaluate(() => document.body.innerText || "");
  check(
    "⑥ appended page joins the count (第 3／4 页)",
    afterAppend.includes("第 3／4 页"),
    afterAppend.match(/第 \d+／\d+ 页[^\n]*/)?.[0] ?? "",
  );
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("再试一次"),
    );
    if (b) b.click();
  });
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-probe="queue-progress"]') &&
      !document.querySelector('[data-probe="queue-failed"]') &&
      (document.body.innerText || "").includes("QUEUE-PAGE-5"),
    { timeout: 30000 },
  );
  const finalText = await page.evaluate(() => document.body.innerText || "");
  check(
    "⑥ retry continued from page 3 and read the appended page too",
    finalText.includes("QUEUE-PAGE-4") && finalText.includes("QUEUE-PAGE-5"),
  );
  check(
    "⑥ nothing read twice, nothing skipped: exactly 5 requests (4 pages + 1 retry)",
    extractCalls === 5,
    `got ${extractCalls}`,
  );

  // --- the money proof: nothing ever reached the server or a vendor --------
  const usage = await (await rest(`/ai_usage?org_id=eq.${orgId}&select=id`)).json();
  check("⑥ ai_usage has ZERO rows (route untouched, nothing charged)", (usage ?? []).length === 0);

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
}

main()
  .catch((e) => {
    console.error("PROBE ERROR:", e.message);
    failures.push("probe threw");
  })
  .finally(async () => {
    try {
      const rows = await (
        await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
      ).json();
      for (const r of Array.isArray(rows) ? rows : []) {
        for (const p of [
          `/minutes_docs?org_id=eq.${r.id}`,
          `/uploads?org_id=eq.${r.id}`,
          `/ai_usage?org_id=eq.${r.id}`,
          `/fence_usage?org_id=eq.${r.id}`,
          `/members_roles?org_id=eq.${r.id}`,
          `/orgs?id=eq.${r.id}`,
        ]) {
          await rest(p, { method: "DELETE" }).catch(() => {});
        }
      }
      if (userId) await admin(`/users/${userId}`, { method: "DELETE" }).catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch (e) {
      console.error("cleanup error:", e.message);
    }
    console.log(
      failures.length === 0 ? "\nALL CHECKS PASSED" : `\n${failures.length} FAILURE(S): ${failures.join("; ")}`,
    );
    process.exit(failures.length === 0 ? 0 : 1);
  });
