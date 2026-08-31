// PROBE — work order 81 I1/I2 acceptance, against the real next start + DB:
//
//   * a synthetic 21-page constitution PDF goes through the REAL /constitution
//     UI and is read in segments (the browser splits it; each segment its own
//     request) — the segmented progress line ("第 X／6 段") must appear and
//     the merged result must contain the LAST page's clause;
//   * ai_usage holds EXACTLY FIVE extract_constitution rows — D47 (work
//     order 89 ⑧): actions(21) = ceil(min(21,20)/5) + 1 = 5, charged as the
//     read progresses — none refunded, with the vendor cost accumulated
//     onto exactly ONE of them (the seed row; the others are the member's
//     quota deductions, cost NULL);
//   * fence_usage shows pages_uploaded = 5 — the A6 exception: min(21, 5),
//     UNTOUCHED by D47 (a different meter);
//   * the estimate line prices the read as 扣 5 次 before it starts.
//
// Costs a few cents of real vendor credit (about 6 small text-PDF reads).
// Runs inside a purpose-made ZZZ org + user, both deleted at the end.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { PDFDocument, StandardFonts } from "pdf-lib";

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

const TEST_EMAIL = "zzz-probe-i1-81@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ I1 分段读章程测试（可删）";
const BASE = "http://localhost:3000";
const PAGES = 21; // → 6 segments of ≤4 pages

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

/** Same-name leftovers from an earlier failed run poison every lookup —
 *  sweep them BEFORE starting (STATE §6 trap). */
async function sweepLeftovers() {
  const rows = await (
    await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
  ).json();
  for (const r of Array.isArray(rows) ? rows : []) {
    await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
  }
}

/** A fictional 21-page BM constitution, one clause per page, in plain text —
 *  cheap to read, and page 21's heading is unique so the MERGE is provable. */
async function makePdf() {
  const HEADINGS = [
    "NAMA DAN ALAMAT", "TUJUAN", "KEAHLIAN", "YURAN", "MESYUARAT AGUNG",
    "JAWATANKUASA", "TUGAS PENGERUSI", "TUGAS SETIAUSAHA", "TUGAS BENDAHARI",
    "PEMERIKSA KIRA-KIRA", "KEWANGAN", "TAHUN KEWANGAN", "NOTIS MESYUARAT",
    "KORUM", "UNDIAN", "PINDAAN PERLEMBAGAAN", "PENASIHAT", "TATATERTIB",
    "PENAUNG", "LARANGAN",
  ];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  for (let i = 1; i <= PAGES; i++) {
    const page = pdf.addPage([595, 842]);
    const heading = i === PAGES ? "PEMBUBARAN" : HEADINGS[(i - 1) % HEADINGS.length];
    page.drawText(`FASAL ${i} — ${heading}`, { x: 60, y: 760, size: 16, font: bold });
    const lines = [
      `Fasal ${i}.1: Peruntukan ${heading.toLowerCase()} bagi Pertubuhan Ujian`,
      `ZZZ ditetapkan oleh mesyuarat agung tahunan dan hendaklah dipatuhi`,
      `oleh semua ahli pertubuhan pada setiap masa.`,
      ``,
      `Fasal ${i}.2: Sebarang perubahan kepada fasal ini mesti diluluskan`,
      `dalam mesyuarat agung dengan undian dua pertiga ahli yang hadir.`,
    ];
    lines.forEach((line, j) => {
      page.drawText(line, { x: 60, y: 710 - j * 22, size: 12, font });
    });
    page.drawText(`muka surat ${i}`, { x: 60, y: 60, size: 10, font });
  }
  const bytes = await pdf.save();
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), "minit-i1-")), "undang-undang-ujian-21ms.pdf");
  writeFileSync(file, Buffer.from(bytes));
  console.log(`synthetic PDF: ${file} (${(bytes.length / 1024).toFixed(0)} KB, ${PAGES} pages)`);
  return file;
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

async function run() {
  await sweepLeftovers();
  await ensureUser();
  const pdfPath = await makePdf();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  let orgId = null;
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

    // sign in + org
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
    check("org created", page.url().includes("/orgs/welcome"), page.url());
    const orgRows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)
    ).json();
    orgId = orgRows?.[0]?.id ?? null;
    check("org id found", orgId !== null, String(orgId));

    // --- the segmented read through the real /constitution UI --------------
    await page.goto(`${BASE}/constitution`, { waitUntil: "networkidle2" });
    const input = await page.$('input[type="file"]');
    check("file input present", input !== null);
    await input.uploadFile(pdfPath);
    await new Promise((r) => setTimeout(r, 1200));
    // Work order 85 ④: the send button now counts real pages ("开始读 ——
    // 共 21 页") and an estimate line prices the read before it starts.
    const staged = await page.evaluate(() => document.body.innerText.includes("开始读"));
    check("PDF staged, nothing sent yet (D0-1)", staged);
    const priced = await page.evaluate(() => document.body.innerText.includes("共 21 页"));
    check("estimate line prices the 21 pages before the read (④)", priced);
    // D47 (89 ⑧): the price on the line is the page formula, said up front.
    const pricedActions = await page.evaluate(() =>
      document.body.innerText.includes("会扣 5 次 AI 用量"),
    );
    check("estimate line says 会扣 5 次 AI 用量 (D47)", pricedActions);

    // Press send, then watch the progress line: the browser must split the
    // 21 pages into 6 segments and SAY which one it is on.
    const segmentsSeen = new Set();
    const started = Date.now();
    await clickByText(page, "button", "开始读");
    let doneText = "";
    while (Date.now() - started < 5 * 60_000) {
      const txt = await page.evaluate(() => document.body.innerText);
      const m = txt.match(/第 (\d+)／(\d+) 段/);
      if (m) segmentsSeen.add(`${m[1]}/${m[2]}`);
      if (txt.includes("条条文已读入")) {
        doneText = txt;
        break;
      }
      if (txt.includes("没读成功") || txt.includes("再试一次")) {
        doneText = txt;
        break;
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`read finished in ${secs}s · progress seen: ${[...segmentsSeen].join(", ")}`);
    check("segmented progress shown (多段)", segmentsSeen.size >= 2, [...segmentsSeen].join(","));
    check(
      "every progress line says /6 segments",
      [...segmentsSeen].every((s) => s.endsWith("/6")),
    );
    const clausesLine = doneText.match(/(\d+)\s*条条文已读入/);
    check("clauses landed", clausesLine !== null, clausesLine?.[0] ?? doneText.slice(0, 200));
    const clauseCount = clausesLine ? Number(clausesLine[1]) : 0;
    check("most of the 21 clauses read", clauseCount >= 18, String(clauseCount));
    // The LAST page's unique heading proves the tail segments were merged in.
    // Case-insensitive: the model normalises "PEMBUBARAN" → "Pembubaran"
    // (first run tripped exactly on that), and either casing is the clause.
    const hasLastPage = await page.evaluate(() =>
      /pembubaran|fasal 21/i.test(document.body.innerText),
    );
    check("page 21's clause is in the merged book", hasLastPage);

    // --- billing (D47): actions(21) = 5, following the read ----------------
    const usage = await (
      await rest(`/ai_usage?org_id=eq.${orgId}&select=action,cost_micros,input_tokens,output_tokens,refunded_at`)
    ).json();
    console.log("ai_usage rows:", JSON.stringify(usage));
    const constitutionRows = usage.filter((r) => r.action === "extract_constitution");
    check("exactly FIVE extract_constitution actions (D47: 21 pages)", constitutionRows.length === 5, `${constitutionRows.length}`);
    check("no other actions charged", usage.length === constitutionRows.length, `${usage.length}`);
    check("none of them refunded", constitutionRows.every((r) => r.refunded_at == null));
    const costed = constitutionRows.filter((r) => (r.cost_micros ?? 0) > 0);
    check(
      "vendor cost accumulated onto exactly ONE row (the seed row)",
      costed.length === 1 && (costed[0]?.output_tokens ?? 0) > 0,
      `costed rows=${costed.length} cost_micros=${costed[0]?.cost_micros} out=${costed[0]?.output_tokens}`,
    );

    // --- the A6 fence: 21 pages cost the lifetime meter exactly 5 ----------
    const fence = await (
      await rest(`/fence_usage?org_id=eq.${orgId}&select=pages_uploaded,docs_made,clean_downloads`)
    ).json();
    console.log("fence_usage:", JSON.stringify(fence));
    check("fence pages_uploaded = 5 (min(21,5), A6)", fence?.[0]?.pages_uploaded === 5, JSON.stringify(fence));

    check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  } finally {
    // --- cleanup: the ZZZ org and user leave nothing behind ----------------
    try {
      const rows = await (
        await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
      ).json();
      for (const r of Array.isArray(rows) ? rows : []) {
        await rest(`/uploads?org_id=eq.${r.id}`, { method: "DELETE" }).catch(() => {});
        await rest(`/minutes_docs?org_id=eq.${r.id}`, { method: "DELETE" }).catch(() => {});
        await rest(`/members_roles?org_id=eq.${r.id}`, { method: "DELETE" }).catch(() => {});
        await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
      }
      const userId2 = await (await admin(`/users?page=1&per_page=100`)).json();
      const u = (userId2.users ?? []).find((x) => x.email === TEST_EMAIL);
      if (u) await admin(`/users/${u.id}`, { method: "DELETE" });
    } catch (e) {
      console.log("cleanup issue (manual sweep may be needed):", String(e).slice(0, 200));
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
