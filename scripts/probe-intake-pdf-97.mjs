// Work order 97 Stage 1: a PDF through the HOME DOOR, end to end, real vendor.
//
// The 2026-08-30 incident: classify runs on openai, and openai.ts wrapped every
// file as `input_image` — a PDF got a 400 before any model ran (app_errors
// fingerprint a53557e2c89a6e2d, three orgs in one evening; the matching
// ai_usage rows had no tokens, no model, refunded within ~1s). Photos worked,
// Office files worked (converted to text first), constitutions worked
// (LONG_DOC=gemini) — ONLY a PDF at the home door died, every time.
//
// This probe is the missing coverage: a small (2-page) text PDF of meeting
// notes goes into the ask box on the real home page against local `next start`
// + real DB + real vendor keys. It proves:
//
//   1. classify succeeds on the PDF (the exact broken shape),
//   2. the extract takes over and the browser lands on the review page,
//   3. ai_usage holds a classify_upload row AND an extract row, both with
//      cost recorded and NEITHER refunded (the incident's fingerprint was
//      classify rows refunded in ~1s with no tokens).
//
// Cost: 1 classify + 1 extract on a 2-page PDF ≈ well under US$0.05
// (authorized by work order 97, Stage 1 only). ZZZ org/user deleted in finally.
//
//   node scripts/probe-intake-pdf-97.mjs
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { PDFDocument, StandardFonts } from "pdf-lib";

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
const TEST_EMAIL = "zzz-probe-intakepdf@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE INTAKE PDF 97（可删）";
const PDF_PATH = path.join(os.tmpdir(), "zzz-97-minit-mesyuarat.pdf");

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

/** A 2-page text PDF of BM meeting notes — small, real, ASCII-safe. */
async function buildPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = [
    [
      "MINIT MESYUARAT JAWATANKUASA",
      "Persatuan Contoh ZZZ 97",
      "",
      "Tarikh: 15 Ogos 2026",
      "Masa: 8.30 malam",
      "Tempat: Dewan Orang Ramai Taman Contoh",
      "",
      "Hadir:",
      "1. Ahmad bin Abu (Pengerusi)",
      "2. Siti binti Rahman (Setiausaha)",
      "3. Lim Ah Kow (Bendahari)",
      "",
      "Agenda 1: Ucapan Pengerusi",
      "Pengerusi mengalu-alukan kehadiran semua ahli.",
    ],
    [
      "Agenda 2: Aktiviti Kelas Komputer",
      "Mesyuarat meluluskan anggaran RM 300",
      "untuk kelas komputer bulan September.",
      "",
      "Agenda 3: Hal-hal Lain",
      "Tiada.",
      "",
      "Mesyuarat ditangguhkan pada 10.00 malam.",
      "",
      "Disediakan oleh,",
      "Siti binti Rahman (Setiausaha)",
    ],
  ];
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    lines.forEach((l, i) => {
      page.drawText(l, {
        x: 60,
        y: 780 - i * 26,
        size: l === l.toUpperCase() && l.length > 10 ? 14 : 12,
        font: i === 0 ? bold : font,
      });
    });
  }
  return doc.save();
}

let userId = null;
let orgId = null;
let browser = null;

async function main() {
  console.log("probing", BASE);
  writeFileSync(PDF_PATH, await buildPdf());

  // --- ZZZ user ------------------------------------------------------------
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
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);
  await page.setViewport({ width: 1366, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

  // Read the /api/intake reply off the wire — the probe's central evidence.
  const intakeReplies = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/intake") && r.request().method() === "POST") {
      const body = await r.json().catch(() => null);
      intakeReplies.push({ status: r.status(), body });
    }
  });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  // --- sign in + throwaway org --------------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log("signed in, landed on", page.url());

  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  await page.type('input[name="name"]', ORG_NAME);
  for (const el of await page.$$("button")) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (t.includes("创建组织")) {
      await el.click();
      break;
    }
  }
  for (let i = 0; i < 30 && !orgId; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // --- the PDF through the home door ---------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
  const input = await page.$('input[type="file"]');
  if (!input) throw new Error("no file input on the home page");
  await input.uploadFile(PDF_PATH);
  // Staged — now press 送出 (the ask box's one Send button).
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("zzz-97-minit-mesyuarat.pdf"),
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("送出"),
    );
    b?.click();
  });

  // The whole chain: classify (PDF!) → extract → PRODUCT CARD in the
  // conversation (100 S3: the workbench no longer teleports — the finished
  // piece is a card, and opening it is the navigation).
  const t0 = Date.now();
  await page
    .waitForFunction(
      () => {
        const card = document.querySelector('[data-probe="product-card"]');
        if (card) return "card:" + (card.getAttribute("data-kind") ?? "?");
        const red = document.querySelector("[class*='border-red']");
        if (red && (red.textContent ?? "").trim().length > 10)
          return "error:" + (red.textContent ?? "").slice(0, 200);
        return false;
      },
      { timeout: 150000, polling: 1000 },
    )
    .then((h) => h.jsonValue())
    .then((outcome) => {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`intake finished in ${secs}s → ${outcome}`);
      check(
        "the workbench produced a product card (extract finished)",
        String(outcome).startsWith("card:"),
        String(outcome).slice(0, 200),
      );
    });

  // Opening the card IS the hand-off: it must land on the review page.
  await page.click('[data-probe="product-card"]');
  await page
    .waitForFunction(
      () => (location.pathname !== "/" ? "landed:" + location.pathname : false),
      { timeout: 30000, polling: 500 },
    )
    .then((h) => h.jsonValue())
    .then((outcome) => {
      check(
        "opening the card landed on a review page",
        String(outcome).startsWith("landed:"),
        String(outcome).slice(0, 200),
      );
    });

  // --- the wire: classify + extract both answered --------------------------
  check("exactly one /api/intake POST", intakeReplies.length === 1, `saw ${intakeReplies.length}`);
  const reply = intakeReplies[0];
  check("intake replied 200", reply?.status === 200, `status ${reply?.status}`);
  const kind = reply?.body?.kind;
  check(
    "classify placed the PDF (kind is a handled kind)",
    kind === "meeting_notes" || kind === "ledger_page" || kind === "constitution",
    `kind=${kind}`,
  );
  check("the extraction came back", !!reply?.body?.extraction);
  console.log("kind:", kind, "· provider:", reply?.body?.provider);

  // --- ai_usage: charged, priced, NOT refunded ------------------------------
  const usage = await (
    await rest(`/ai_usage?org_id=eq.${orgId}&select=action,model,cost_micros,refunded_at`)
  ).json();
  check("ai_usage rows exist", Array.isArray(usage) && usage.length >= 2, JSON.stringify(usage).slice(0, 300));
  if (Array.isArray(usage)) {
    const classify = usage.find((u) => u.action === "classify_upload");
    const extract = usage.find((u) => u.action?.startsWith("extract_"));
    check("classify_upload row exists", !!classify);
    check(
      "classify row has a model and a cost (the incident rows had neither)",
      !!classify?.model && classify?.cost_micros != null,
      JSON.stringify(classify),
    );
    check("classify row NOT refunded", !classify?.refunded_at);
    check("extract row exists", !!extract, JSON.stringify(usage));
    check("extract row NOT refunded", !extract?.refunded_at);
    const total = usage.reduce((a, u) => a + (u.cost_micros ?? 0), 0);
    console.log(`ai_usage: ${usage.length} rows, US$${(total / 1e6).toFixed(4)} total`, JSON.stringify(usage));
  }

  // --- app_errors: the incident fingerprint must NOT reappear ---------------
  const errs = await (
    await rest(`/app_errors?org_id=eq.${orgId}&select=route,code,message_hash`)
  ).json();
  check(
    "no app_errors for this org (no 400 from the vendor)",
    Array.isArray(errs) && errs.length === 0,
    JSON.stringify(errs).slice(0, 200),
  );

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  console.log(failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures.join("; ")}`);
}

main()
  .catch((e) => {
    console.error("PROBE ERROR:", e.message);
    failures.push("probe threw");
  })
  .finally(async () => {
    try {
      if (orgId) {
        for (const p of [
          `/uploads?org_id=eq.${orgId}`,
          `/ai_usage?org_id=eq.${orgId}`,
          `/app_errors?org_id=eq.${orgId}`,
          `/minutes_docs?org_id=eq.${orgId}`,
          `/minutes_drafts?org_id=eq.${orgId}`,
          `/members_roles?org_id=eq.${orgId}`,
          `/fence_usage?org_id=eq.${orgId}`,
          `/orgs?id=eq.${orgId}`,
        ]) {
          await rest(p, { method: "DELETE" }).catch(() => {});
        }
        const left = await (await rest(`/orgs?id=eq.${orgId}&select=id`)).json().catch(() => null);
        console.log(
          Array.isArray(left) && left.length === 0
            ? "org deleted cleanly"
            : `⚠ org row may remain: ${JSON.stringify(left)}`,
        );
      }
      if (userId) await admin(`/users/${userId}`, { method: "DELETE" }).catch(() => {});
    } finally {
      if (browser) await browser.close();
      try {
        rmSync(PDF_PATH);
      } catch {}
      console.log("cleaned up");
      process.exitCode = failures.length === 0 ? 0 : 1;
    }
  });
