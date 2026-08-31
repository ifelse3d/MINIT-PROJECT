// ---------------------------------------------------------------------------
// §1 (work order 104) — THE SIGN-UP FORK, end to end, against the real dev
// server, the real database and the real AI vendor, inside a purpose-made test
// user + organisation that is DELETED at the end (same shape as e2e-minutes).
//
//   npx tsx --version not needed; run with:
//     node scripts/probe-createorg-104.mjs <path-to-constitution.pdf>
//
// What it proves, in J's own words 「一進來一定要填寫名字」:
//   1. /orgs/new opens on the FORK — no organisation-name box on screen.
//   2. "I have the constitution" puts the upload ABOVE the name box.
//   3. The name box is optional there (the document supplies it).
//   4. After the read, the NAME BOX HOLDS THE FULL REGISTERED NAME — the
//      §1 acceptance, and the thing that used to come back as "Persatuan".
//   5. "I don't have it, I'll type" is ONE tap to the old form, name first.
//
// COST: one constitution read. The script sends only the FIRST FOUR PAGES
// (CONSTITUTION_SEGMENT_PAGES — segment 1, where the identity is printed), so
// this is one vendor call, not a whole book.
//
// PRIVACY (A3): the document path is an ARGUMENT and the trimmed excerpt is
// written to eval/reports/ (git-ignored). Screenshots go there too.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { PDFDocument } from "pdf-lib";

const ROOT = "C:/dev/minit-v2";
const REPORTS = path.join(ROOT, "eval", "reports");
const SEGMENT_PAGES = 4; // = CONSTITUTION_SEGMENT_PAGES

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

const TEST_EMAIL = "zzz-probe-createorg-104@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const BASE = "http://localhost:3000";

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
  const list = await (await admin(`/users?page=1&per_page=200`)).json();
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
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    }),
  });
  return (await res.json()).id;
}

/** Segment 1 of the document — the pages the identity is printed on. */
async function firstSegment(srcPath) {
  const doc = await PDFDocument.load(readFileSync(srcPath), {
    updateMetadata: false,
    ignoreEncryption: true,
  });
  const total = doc.getPageCount();
  const take = Math.min(total, SEGMENT_PAGES);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(
    doc,
    Array.from({ length: take }, (_, i) => i),
  );
  for (const p of pages) out.addPage(p);
  const dest = path.join(REPORTS, "createorg-104-segment1.pdf");
  writeFileSync(dest, Buffer.from(await out.save()));
  return { dest, total, take };
}

async function run() {
  const src = process.argv[2];
  if (!src || !existsSync(src)) {
    console.error("usage: node scripts/probe-createorg-104.mjs <constitution.pdf>");
    process.exit(2);
  }
  const seg = await firstSegment(src);
  console.log(`document: ${seg.total} pages · sending pages 1-${seg.take}`);

  const userId = await ensureUser();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 1280, height: 1000 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  let orgId = null;
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', TEST_EMAIL);
    await page.type('input[type="password"]', TEST_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
      page.click('button[type="submit"]'),
    ]);

    // --- 1. the fork is the first thing on the page ------------------------
    await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
    const fork = await page.evaluate(() => ({
      nameBox: document.querySelector('input[name="name"]') !== null,
      constitutionRoad: document.querySelector('[data-probe="road-constitution"]') !== null,
      manualRoad: document.querySelector('[data-probe="road-manual"]') !== null,
    }));
    check("① no organisation-name box on the first screen", !fork.nameBox);
    check("① the fork offers the constitution road", fork.constitutionRoad);
    check("① the fork offers the type-it-myself road", fork.manualRoad);
    await page.screenshot({
      path: path.join(REPORTS, "createorg-104-1-fork.png"),
      fullPage: true,
    });

    // --- 5. the manual road is ONE tap to the old form ---------------------
    await page.click('[data-probe="road-manual"]');
    await new Promise((r) => setTimeout(r, 300));
    const manual = await page.evaluate(() => {
      const name = document.querySelector('input[name="name"]');
      const fileInput = document.querySelector('input[type="file"]');
      return {
        hasName: name !== null,
        required: name ? name.required : false,
        // In the old form the file box is the LAST field.
        fileAfterName:
          name && fileInput
            ? !!(name.compareDocumentPosition(fileInput) &
                Node.DOCUMENT_POSITION_FOLLOWING)
            : false,
      };
    });
    check("⑤ manual road: one tap to the name box", manual.hasName);
    check("⑤ manual road: the name is still required", manual.required);
    check("⑤ manual road: the constitution box stays LAST", manual.fileAfterName);

    // --- 2/3. the constitution road puts the document first -----------------
    await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
    await page.click('[data-probe="road-constitution"]');
    await new Promise((r) => setTimeout(r, 300));
    const road = await page.evaluate(() => {
      const name = document.querySelector('input[name="name"]');
      const fileInput = document.querySelector('input[type="file"]');
      return {
        required: name ? name.required : true,
        fileBeforeName:
          name && fileInput
            ? !!(fileInput.compareDocumentPosition(name) &
                Node.DOCUMENT_POSITION_FOLLOWING)
            : false,
      };
    });
    check("② the upload sits ABOVE the name box", road.fileBeforeName);
    check("③ the name box is optional on this road", !road.required);
    await page.screenshot({
      path: path.join(REPORTS, "createorg-104-2-road.png"),
      fullPage: true,
    });

    // --- 4. attach, create, read, and read the NAME BOX back ---------------
    const input = await page.$('input[type="file"]');
    await input.uploadFile(seg.dest);
    await new Promise((r) => setTimeout(r, 800));
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[type="submit"]')].find(
        (x) => !x.disabled,
      );
      if (!b) return false;
      b.click();
      return true;
    });
    check("④ create-and-read is offered", clicked);

    // The read runs after the org exists; a 4-page segment is one call.
    await page.waitForSelector('[data-probe="identity-name"]', { timeout: 120000 });
    const readBack = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      return {
        name: q('[data-probe="identity-name"]')?.value ?? "",
        ppm: q('[data-probe="identity-ppm"]')?.value ?? "",
        address: q('[data-probe="identity-address"]')?.textContent?.trim() ?? "",
      };
    });
    console.log("   name box   :", readBack.name);
    console.log("   ppm box    :", readBack.ppm);
    console.log("   address    :", readBack.address);
    check(
      "④ the NAME BOX holds a full registered name (not 'Persatuan')",
      readBack.name.length > 12 && readBack.name.toLowerCase() !== "persatuan",
      readBack.name,
    );
    check("④ the registration number came back too", readBack.ppm !== "");
    check("④ the address came back whole (postcode present)", /\d{5}/.test(readBack.address));
    await page.screenshot({
      path: path.join(REPORTS, "createorg-104-3-identity.png"),
      fullPage: true,
    });

    const found = await (
      await rest(`/orgs?select=id,name&order=id.desc&limit=5`)
    ).json();
    const mine = (found ?? []).find((o) => String(o.name).startsWith("PERTUBUHAN BARU"));
    orgId = mine?.id ?? null;
    if (!orgId) {
      const byUser = await (
        await rest(`/members_roles?select=org_id&user_id=eq.${userId}`)
      ).json();
      orgId = byUser?.[0]?.org_id ?? null;
    }
  } finally {
    if (orgId) {
      await rest(`/constitutions?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/ai_usage?org_id=eq.${orgId}`, { method: "DELETE" });
      await rest(`/uploads?org_id=eq.${orgId}`, { method: "DELETE" });
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
