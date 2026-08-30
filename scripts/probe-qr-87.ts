// probe-qr-87 — the receipt QR, end to end, against the REAL app (work order
// 87 ①): a purpose-made ZZZ org + receipt, the real /money/history download
// button clicked in headless Chrome, the downloaded PDF's QR extracted FROM
// THE BYTES (content-stream interpreter) and decoded by a real decoder
// (jsQR), the decoded URL opened, and the verify page's promises checked:
//
//   1. download path: the PDF a treasurer downloads carries a scannable QR
//   2. the same POST /api/receipt-pdf serves the WhatsApp-attach and print
//      flows (receipt-actions.tsx / register-receipts.tsx call the same
//      door) — fetched in-page and decoded again
//   3. the QR's URL opens WITHOUT login and shows org name + date + amount
//   4. 🔴 the page NEVER shows the donor's name (Hard Rule 5)
//   5. a tampered token = "this system did not issue this" + report channel
//   6. screenshots as evidence: eval/reports/proof-87-qr-*.png, including a
//      PNG of the QR itself pulled OUT of the PDF (scan it with your phone)
//
// Zero AI calls. Needs `next start` on :3000 with the real DB (e2e
// convention). ZZZ org/user deleted in finally, leftovers swept at start.
//
// Run:  npx tsx scripts/probe-qr-87.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { qrMatrixFromPdf } from "../src/lib/qr-in-pdf";
import { rasterizeQrMatrix } from "../src/lib/receipt-qr";

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
const CONTACT = env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";

const TEST_EMAIL = "zzz-probe-qr87@example.com";
const PASSWORD = "Qr87#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ QR87 探针社团（可删）";
const DONOR = "ZZZ Donor Rahsia Betul"; // must NEVER appear on the verify page
const BASE = "http://localhost:3000";
const OUT = path.join(ROOT, "eval", "reports");

const failures: string[] = [];
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}

const H = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};
const admin = (p: string, o: RequestInit = {}) =>
  fetch(`${SUPA_URL}/auth/v1/admin${p}`, { ...o, headers: { ...H, ...(o.headers as object ?? {}) } });
const rest = (p: string, o: RequestInit = {}) =>
  fetch(`${SUPA_URL}/rest/v1${p}`, { ...o, headers: { ...H, ...(o.headers as object ?? {}) } });

async function cleanup() {
  const orgs = (await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc`)).json()) as { id: number }[];
  for (const o of orgs ?? []) await rest(`/orgs?id=eq.${o.id}`, { method: "DELETE" });
  const list = (await (await admin(`/users?page=1&per_page=200`)).json()) as { users?: { id: string; email: string }[] };
  const u = (list.users ?? []).find((x) => x.email === TEST_EMAIL);
  if (u) await admin(`/users/${u.id}`, { method: "DELETE" });
}

/** PDF bytes → decoded QR text (or null), via the content-stream extractor
 *  and a REAL decoder — never by trusting the generator. */
function decodeQr(pdf: Uint8Array): { url: string | null; matrix: boolean[][] | null } {
  const matrix = qrMatrixFromPdf(pdf);
  if (!matrix) return { url: null, matrix: null };
  const { data, width, height } = rasterizeQrMatrix(matrix);
  const hit = jsQR(data, width, height);
  return { url: hit ? hit.data : null, matrix };
}

function saveQrPng(matrix: boolean[][], file: string) {
  const { data, width, height } = rasterizeQrMatrix(matrix);
  const png = new PNG({ width, height });
  png.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  writeFileSync(file, PNG.sync.write(png));
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  await cleanup(); // sweep same-name leftovers first (§6)

  // --- seed: org, admin member, donation, receipt (service role) -----------
  const createUser = await admin(`/users`, {
    method: "POST",
    body: JSON.stringify({ email: TEST_EMAIL, password: PASSWORD, email_confirm: true }),
  });
  const userId = ((await createUser.json()) as { id?: string }).id;
  if (!userId) throw new Error("could not create test user");
  const org = ((await (await rest(`/orgs`, { method: "POST", body: JSON.stringify({ name: ORG_NAME }) })).json()) as { id: number }[])[0];
  await rest(`/members_roles`, {
    method: "POST",
    body: JSON.stringify({ org_id: org.id, user_id: userId, name: "Probe Bendahari", role: "hq_admin" }),
  });
  const donation = ((await (await rest(`/donations`, {
    method: "POST",
    body: JSON.stringify({
      org_id: org.id,
      donor_name: DONOR,
      amount_cents: 12345,
      purpose: "Derma probe",
      donated_at: "2026-08-30",
    }),
  })).json()) as { id: number }[])[0];
  const receiptNo = "ZZZ-2026-0001";
  await rest(`/receipts`, {
    method: "POST",
    body: JSON.stringify({ org_id: org.id, receipt_no: receiptNo, donation_id: donation.id }),
  });

  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--no-first-run", "--disable-gpu"],
  });
  const errors: string[] = [];
  try {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.setViewport({ width: 1280, height: 900 });
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("minit.lang.v2", "zh");
        document.cookie = "minit-lang=zh;path=/";
        localStorage.setItem("minit.firstrun.v1", "done");
      } catch {}
    });

    // --- sign in -----------------------------------------------------------
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', TEST_EMAIL);
    await page.type('input[type="password"]', PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
      page.click('button[type="submit"]'),
    ]);

    // --- path 1: the real /money/history download button --------------------
    // The button's downloadFromApi() fetches POST /api/receipt-pdf and hands
    // the blob to the browser; capturing the RESPONSE of that real click is
    // the same bytes the file on disk would hold, without headless-download
    // machinery in the way.
    await page.goto(`${BASE}/money/history`, { waitUntil: "networkidle2" });
    // Hook the last step of the REAL download path: downloadFromApi() hands
    // its blob to URL.createObjectURL just before the browser saves it — the
    // stashed blob IS the file the treasurer's disk would receive.
    await page.evaluate(() => {
      const orig = URL.createObjectURL.bind(URL);
      (window as unknown as { __qr87blobs: Blob[] }).__qr87blobs = [];
      URL.createObjectURL = ((b: Blob) => {
        (window as unknown as { __qr87blobs: Blob[] }).__qr87blobs.push(b);
        return orig(b);
      }) as typeof URL.createObjectURL;
    });
    const clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const b = btns.find((x) => /收据 PDF|Resit PDF|Receipt PDF/.test(x.textContent ?? ""));
      if (!b) return false;
      (b as HTMLButtonElement).click();
      return true;
    });
    check("history page shows the receipt's download button", clicked);
    let downloadedB64: string | null = null;
    for (let i = 0; i < 60 && !downloadedB64; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      downloadedB64 = await page.evaluate(async () => {
        const blobs = (window as unknown as { __qr87blobs?: Blob[] }).__qr87blobs ?? [];
        if (blobs.length === 0) return null;
        const buf = new Uint8Array(await blobs[0].arrayBuffer());
        let s = "";
        for (let j = 0; j < buf.length; j += 1) s += String.fromCharCode(buf[j]);
        return btoa(s);
      });
    }
    const downloaded = downloadedB64 ? Uint8Array.from(Buffer.from(downloadedB64, "base64")) : null;
    check("download path: the real click produced the PDF bytes", downloaded !== null);

    let verifyUrl: string | null = null;
    if (downloaded) {
      const { url, matrix } = decodeQr(downloaded);
      check("download path: QR extracted from PDF bytes decodes", url !== null, url ?? "no QR found");
      check("download path: QR URL points at /verify/resit", (url ?? "").includes("/verify/resit?t="), url ?? "");
      verifyUrl = url;
      if (matrix) saveQrPng(matrix, path.join(OUT, "proof-87-qr-from-pdf.png"));
    }

    // --- path 2+3: the shared door (WhatsApp attach + print use the same
    // POST /api/receipt-pdf — receipt-actions.tsx / register-receipts.tsx) --
    const b64 = await page.evaluate(async (no) => {
      const res = await fetch("/api/receipt-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptNo: no }),
      });
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i += 1) s += String.fromCharCode(buf[i]);
      return btoa(s);
    }, receiptNo);
    check("shared door: /api/receipt-pdf serves the PDF in-session", b64 !== null);
    if (b64) {
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const { url } = decodeQr(bytes);
      check("shared door: QR decodes to the same verify URL", url !== null && url === verifyUrl, url ?? "");
    }

    // --- the verify page, logged OUT (a donor has no account) ---------------
    const anonCtx = await browser.createBrowserContext();
    const anon = await anonCtx.newPage();
    await anon.setViewport({ width: 480, height: 900 }); // a phone did the scanning
    if (verifyUrl) {
      await anon.goto(verifyUrl, { waitUntil: "networkidle2" });
      const text = await anon.evaluate(() => document.body.innerText);
      check("verify page opens without login (no redirect to /login)", !anon.url().includes("/login"));
      check("verify page names the receipt number", text.includes(receiptNo));
      check("verify page names the org", text.includes(ORG_NAME));
      check("verify page shows the amount", text.includes("RM123.45"));
      check("verify page shows the date", text.includes("2026-08-30"));
      check("🔴 donor name NOT on the page (Hard Rule 5)", !text.includes(DONOR) && !text.includes("Rahsia"));
      check(
        "disclaimer on the page (not a certificate of identity)",
        /不证明该社团的身份|TIDAK mengesahkan identiti/.test(text),
      );
      await anon.screenshot({ path: path.join(OUT, "proof-87-qr-verify-ok.png") as `${string}.png`, fullPage: true });

      // tampered token → honest refusal + report channel
      const bad = verifyUrl.replace(/t=([^&]+)/, (_m, t: string) => {
        const flipped = t.slice(0, -4) + (t.endsWith("AAAA") ? "BBBB" : "AAAA");
        return `t=${flipped}`;
      });
      await anon.goto(bad, { waitUntil: "networkidle2" });
      const badText = await anon.evaluate(() => document.body.innerText);
      check("tampered token: 'not issued by this system'", /没有开过|TIDAK pernah mengeluarkan/.test(badText));
      check("tampered token: page does NOT claim verified", !badText.includes(receiptNo));
      if (CONTACT) {
        check("tampered token: report channel shown", badText.includes(CONTACT));
      } else {
        console.log("NOTE  NEXT_PUBLIC_CONTACT_EMAIL unset in this env — report line hidden by design");
      }
      await anon.screenshot({ path: path.join(OUT, "proof-87-qr-verify-bad.png") as `${string}.png`, fullPage: true });
    }

    check("zero page errors", errors.length === 0, errors.join(" | "));
  } finally {
    await browser.close();
  }
}

async function main() {
  let code = 0;
  try {
    await run();
  } catch (e) {
    console.error("PROBE CRASHED:", e);
    code = 1;
  } finally {
    await cleanup();
    console.log("ZZZ cleanup done.");
  }
  if (failures.length > 0) {
    console.log(`\n${failures.length} FAILURES`);
    code = 1;
  } else {
    console.log("\nALL CHECKS PASSED");
  }
  process.exit(code);
}

void main();
