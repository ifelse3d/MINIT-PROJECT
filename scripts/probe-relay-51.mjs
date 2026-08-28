// A-4 (工作单 51): does the Storage relay actually carry a >4.5MB PDF end to
// end on THIS build? Proves the whole chain through the real UI:
//
//   /minutes file input → prepareUploadForSend (browser: PDF too big for the
//   request body → upload STRAIGHT to Supabase Storage, RLS-scoped) →
//   POST /api/extract-minutes with storagePath → server downloads, DELETES
//   the relay object, reads with the vendor → extraction lands in the
//   workspace.
//
// Run against LOCAL `next start` (BASE=http://localhost:3000 by default) with
// the real DB + real vendor key. Costs ONE extract action on a throwaway ZZZ
// org (~US$0.005 — a one-page TEXT PDF; the 5.5MB is an inert attachment the
// vendor never tokenises). Everything is deleted in the finally block.
//
//   node scripts/probe-relay-51.mjs
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import puppeteer from "puppeteer-core";
import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";

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
const TEST_EMAIL = "zzz-probe-relay@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE 大PDF直传（可删）";

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
const listStorage = async (prefix) => {
  const res = await fetch(`${SUPA_URL}/storage/v1/object/list/uploads`, {
    method: "POST",
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix, limit: 100 }),
  });
  return res.json();
};

const failures = [];
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
};

/** One-page LEGIBLE BM meeting note as real PDF text, inflated past Vercel's
 *  ~4.5MB cap by an inert random attachment (random bytes defeat Flate). */
async function buildBigPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [
    "Minit Mesyuarat Jawatankuasa",
    "Persatuan Contoh ZZZ (ujian sistem)",
    "",
    "Tarikh: 12 Ogos 2026",
    "Masa: 8:30 malam",
    "Tempat: Dewan Orang Ramai Taman Contoh",
    "",
    "Hadir:",
    "1. Ahmad bin Abu (Pengerusi)",
    "2. Siti binti Rahman (Setiausaha)",
    "3. Lim Ah Kow (Bendahari)",
    "",
    "Keputusan:",
    "1. Meluluskan anggaran RM 500 untuk gotong-royong bulan depan.",
    "2. Mesyuarat akan datang: 12 September 2026.",
  ];
  lines.forEach((l, i) => {
    page.drawText(l, { x: 50, y: 780 - i * 28, size: 14, font });
  });
  await doc.attach(crypto.randomBytes(5_500_000), "zzz-inflation.bin", {
    mimeType: "application/octet-stream",
    description: "random padding to exceed the 4.5MB transport cap",
  });
  return doc.save({ useObjectStreams: false });
}

/** A-3: a real (minimal) .pptx of the same fictional meeting — proves the
 *  server-side PowerPoint → text → extraction path with one cheap action. */
async function buildPptx() {
  const zip = new JSZip();
  const paras = [
    "Minit Mesyuarat Jawatankuasa - Persatuan Contoh ZZZ (ujian sistem)",
    "Tarikh: 12 Ogos 2026, 8:30 malam, Dewan Orang Ramai Taman Contoh",
    "Hadir: Ahmad bin Abu (Pengerusi), Siti binti Rahman (Setiausaha), Lim Ah Kow (Bendahari)",
    "Keputusan: Meluluskan anggaran RM 500 untuk gotong-royong bulan depan.",
    "Mesyuarat akan datang: 12 September 2026.",
  ];
  const body = paras.map((p) => `<a:p><a:r><a:t>${p}</a:t></a:r></a:p>`).join("");
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
      ` xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
      `<p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  );
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

let userId = null;
let orgId = null;
let browser = null;
const pdfPath = path.join(os.tmpdir(), "zzz-relay-big.pdf");

async function main() {
  console.log("probing", BASE);
  const pdfBytes = await buildBigPdf();
  writeFileSync(pdfPath, pdfBytes);
  console.log(`built ${(pdfBytes.length / 1024 / 1024).toFixed(2)}MB one-page PDF`);
  check("PDF is over the 4.5MB transport cap", pdfBytes.length > 4.5 * 1024 * 1024);

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

  // --- sign in + throwaway org (probe-payload walk) ------------------------
  browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);
  await page.setViewport({ width: 1366, height: 820 });
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
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // --- A-3: a .pptx through the intake door (forced kind, one action) ------
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  const pptxB64 = (await buildPptx()).toString("base64");
  const pptxResult = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append(
      "file",
      new File([bytes], "zzz-minit.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    );
    form.append("kind", "meeting_notes");
    const res = await fetch("/api/intake", { method: "POST", body: form });
    const text = await res.text();
    let hasExtraction = false;
    try {
      hasExtraction = !!JSON.parse(text).extraction;
    } catch {}
    return { status: res.status, hasExtraction, bodyStart: text.slice(0, 200) };
  }, pptxB64);
  check(
    "pptx read end-to-end (A-3)",
    pptxResult.status === 200 && pptxResult.hasExtraction,
    `HTTP ${pptxResult.status} ${pptxResult.bodyStart}`,
  );

  // --- the relay walk, through the REAL minutes door -----------------------
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  const input = await page.$('input[type="file"]');
  if (!input) throw new Error("no file input on /minutes");
  await input.uploadFile(pdfPath);

  // BeforeReading appears — start the read without pre-filled facts.
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").includes("现在开始读")),
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("现在开始读"));
    b?.click();
  });
  console.log("reading started (browser should relay via Storage)…");

  // Wait for the read to finish: the source label 📄 appears, or a red error.
  const outcome = await page
    .waitForFunction(
      () => {
        const text = document.body.innerText || "";
        if (text.includes("zzz-relay-big.pdf") && !text.includes("AI 读取中")) return "done";
        const red = document.querySelector(".border-red-300, [class*='border-red']");
        if (red && (red.textContent ?? "").trim().length > 10 && !text.includes("AI 读取中"))
          return "error:" + (red.textContent ?? "").slice(0, 300);
        return false;
      },
      { timeout: 120000, polling: 1000 },
    )
    .then((h) => h.jsonValue());
  console.log("outcome:", outcome);
  check("big PDF was read through the relay", outcome === "done", String(outcome).slice(0, 300));

  // The workspace should now show extracted content (attendees from the PDF).
  const bodyText = await page.evaluate(() => document.body.innerText || "");
  check(
    "extraction reached the workspace",
    bodyText.includes("Ahmad") || bodyText.includes("Siti") || bodyText.includes("Dewan"),
  );

  // --- read it, then clean it: the relay folder must be EMPTY --------------
  const relayLeft = await listStorage(`${orgId}/relay`);
  check(
    "relay object deleted after the read",
    Array.isArray(relayLeft) && relayLeft.filter((o) => o.name !== ".emptyFolderPlaceholder").length === 0,
    JSON.stringify(relayLeft).slice(0, 200),
  );
  // …and the permanent history copy exists (recordUpload re-upload).
  const kept = await listStorage(`${orgId}/meeting_notes`);
  check(
    "permanent copy stored for history",
    Array.isArray(kept) && kept.some((o) => o.name.endsWith("zzz-relay-big.pdf")),
    JSON.stringify(kept).slice(0, 200),
  );

  // --- what did it cost? ---------------------------------------------------
  const usage = await (await rest(`/ai_usage?org_id=eq.${orgId}&select=*`)).json();
  console.log(`ai_usage rows: ${Array.isArray(usage) ? usage.length : usage}`);
  if (Array.isArray(usage)) for (const u of usage) console.log(" ", JSON.stringify(u));

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
        // Wipe every storage object under the org, then the rows, then the org.
        for (const prefix of [`${orgId}/relay`, `${orgId}/meeting_notes`]) {
          const objs = await listStorage(prefix).catch(() => []);
          if (Array.isArray(objs)) {
            for (const o of objs) {
              await fetch(`${SUPA_URL}/storage/v1/object/uploads/${prefix}/${o.name}`, {
                method: "DELETE",
                headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
              }).catch(() => {});
            }
          }
        }
        for (const p of [
          `/uploads?org_id=eq.${orgId}`,
          `/ai_usage?org_id=eq.${orgId}`,
          `/app_errors?org_id=eq.${orgId}`,
          `/minutes_docs?org_id=eq.${orgId}`,
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
        rmSync(pdfPath);
      } catch {}
      console.log("cleaned up");
      process.exitCode = failures.length === 0 ? 0 : 1;
    }
  });
