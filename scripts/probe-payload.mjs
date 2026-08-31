// WHY does a tester's photo upload say "could not reach the AI assistant"?
// (工作单 48, 2026-08-28: tester 上传照片 → aiUnavailable，可 app_errors/ai_usage
// 零痕迹。头号嫌疑：Vercel serverless 请求体 ~4.5MB 硬上限，超过直接回
// 413 FUNCTION_PAYLOAD_TOO_LARGE——HTML/纯文字，不是我们的 JSON——所以
// 浏览器只好显示后备句，而伺服器根本没被叫到。)
//
// This probe PROVES or KILLS that suspicion, before any code is changed:
//   1. sign in as a ZZZ test user on production, create a throwaway org
//   2. POST a 5–7.5MB JPEG (canvas noise — under OUR 8MB MAX_BYTES, over
//      Vercel's 4.5MB) to /api/extract-minutes → expect 413 / non-JSON.
//      Costs nothing: the request never reaches our code, let alone a vendor.
//   3. POST a <300KB canvas-drawn BM meeting note as the control → expect the
//      normal pipeline (burns ONE action on the ZZZ org — authorised, ≤$0.05).
//   4. print the org's ai_usage rows so the actual cost is on the record.
//   5. delete everything (storage object, rows, org, user) in a finally block.
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const BASE = process.env.BASE || "https://minit-project.vercel.app";
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
const TEST_EMAIL = "zzz-probe-payload@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE 大照片诊断（可删）";

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

let userId = null;
let orgId = null;
let browser = null;
let storedPath = null; // storage object the control upload may create

async function main() {
  console.log("probing", BASE);

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

  // --- sign in, create the throwaway org (same walk as probe-prod) ---------
  browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);
  await page.setViewport({ width: 1366, height: 820 });
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
  // §1 (work order 104): /orgs/new opens on a FORK now — "I have the
  // constitution" or "I'll type it myself". One tap to the form these
  // scripts have always driven; a no-op wherever there is no fork.
  await page.evaluate(() =>
    document.querySelector('[data-probe="road-manual"]')?.click(),
  );
  await new Promise((r) => setTimeout(r, 250));
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
  console.log("org", orgId, "created; active org set by the create flow");
  // Land on the app shell so same-origin fetches carry the session cookies.
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });

  // --- the two probes, built and POSTed INSIDE the page --------------------
  // (Blobs stay in the browser; only status/headers/body text come back out.)
  const SKIP_SMALL = process.env.SKIP_SMALL === "1";
  const probe = await page.evaluate(async (skipSmall) => {
    const post = async (blob, name, { path = "/api/extract-minutes", field = "photo", type = "image/jpeg" } = {}) => {
      const form = new FormData();
      form.append(field, new File([blob], name, { type }));
      const t0 = Date.now();
      try {
        const res = await fetch(path, { method: "POST", body: form });
        const text = await res.text();
        let storagePath = null;
        let hasExtraction = false;
        try {
          const j = JSON.parse(text);
          storagePath = j.storagePath ?? null;
          hasExtraction = !!j.extraction;
        } catch {}
        return {
          sentBytes: blob.size,
          ms: Date.now() - t0,
          status: res.status,
          contentType: res.headers.get("content-type"),
          bodyStart: text.slice(0, 300),
          bodyIsJson: (() => { try { JSON.parse(text); return true; } catch { return false; } })(),
          hasExtraction,
          storagePath,
        };
      } catch (e) {
        return { sentBytes: blob.size, ms: Date.now() - t0, status: "FETCH_THREW", error: String(e) };
      }
    };

    // BIG: random noise defeats JPEG compression, so a few megapixels at
    // q=1.0 lands in the 5–7.5MB window (inside our 8MB, over Vercel's 4.5MB).
    const makeNoise = (side) =>
      new Promise((resolve) => {
        const c = document.createElement("canvas");
        c.width = side;
        c.height = side;
        const ctx = c.getContext("2d");
        const img = ctx.createImageData(side, side);
        const a = img.data;
        for (let i = 0; i < a.length; i += 4) {
          a[i] = (Math.random() * 256) | 0;
          a[i + 1] = (Math.random() * 256) | 0;
          a[i + 2] = (Math.random() * 256) | 0;
          a[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        c.toBlob(resolve, "image/jpeg", 1.0);
      });
    let side = 1600;
    let big = await makeNoise(side);
    for (let i = 0; i < 6 && (big.size < 5_000_000 || big.size > 7_500_000); i++) {
      side = Math.round(side * Math.sqrt(6_000_000 / big.size));
      big = await makeNoise(side);
    }

    // SMALL control: a legible fictional BM meeting note, well under 1MB.
    const c = document.createElement("canvas");
    c.width = 1000;
    c.height = 1400;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#111";
    ctx.font = "30px Arial";
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
      "1. Meluluskan anggaran RM 500",
      "   untuk gotong-royong bulan depan.",
      "2. Mesyuarat akan datang: 12 September 2026.",
    ];
    lines.forEach((l, i) => ctx.fillText(l, 60, 90 + i * 56));
    const small = await new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));

    // BIG PDF → /api/import-roster (工作单 48 第二案: the tester's scanned
    // roster PDF). The platform's cap is on the BODY, so a junk-filled PDF
    // proves the same death without a real scan; if it somehow got through,
    // the route's own cheap checks reject it before any AI is called.
    const junk = new Uint8Array(6 * 1024 * 1024);
    for (let off = 0; off < junk.length; off += 65536) {
      crypto.getRandomValues(junk.subarray(off, Math.min(off + 65536, junk.length)));
    }
    const header = new TextEncoder().encode("%PDF-1.4\n");
    const bigPdf = new Blob([header, junk], { type: "application/pdf" });

    const bigResult = await post(big, "zzz-big-noise.jpg");
    const rosterPdfResult = await post(bigPdf, "zzz-big-roster.pdf", {
      path: "/api/import-roster",
      field: "file",
      type: "application/pdf",
    });
    const smallResult = skipSmall
      ? null
      : await post(small, "zzz-small-note.jpg");
    return { big: bigResult, rosterPdf: rosterPdfResult, small: smallResult };
  }, SKIP_SMALL);

  storedPath = probe.small?.storagePath ?? null;

  const show = (label, r) => {
    console.log(`\n--- ${label} ---`);
    console.log(`  sent ${(r.sentBytes / 1024 / 1024).toFixed(2)} MB, took ${r.ms}ms`);
    if (r.status === "FETCH_THREW") {
      console.log(`  fetch THREW: ${r.error}`);
      return;
    }
    console.log(`  HTTP ${r.status}  content-type: ${r.contentType}`);
    console.log(`  body is JSON: ${r.bodyIsJson}  extraction present: ${r.hasExtraction}`);
    console.log(`  body starts: ${JSON.stringify(r.bodyStart)}`);
  };
  show("BIG photo (>4.5MB — the tester's phone photo)", probe.big);
  show("BIG PDF → /api/import-roster (第二案 tester's scanned roster)", probe.rosterPdf);
  if (probe.small) show("SMALL photo (<1MB — the control)", probe.small);

  // --- what did the control actually cost? ---------------------------------
  const usage = await (
    await rest(`/ai_usage?org_id=eq.${orgId}&select=*`)
  ).json();
  console.log(`\nai_usage rows for the ZZZ org: ${Array.isArray(usage) ? usage.length : usage}`);
  if (Array.isArray(usage)) for (const u of usage) console.log(" ", JSON.stringify(u));

  // --- verdict -------------------------------------------------------------
  const blocked = (r) =>
    r.status === "FETCH_THREW" || r.status === 413 || r.bodyIsJson === false;
  console.log("\n=== VERDICT ===");
  console.log(
    blocked(probe.big)
      ? "BIG photo never reached our JSON error path (413/non-JSON/reset) — platform limit CONFIRMED."
      : "BIG photo got a JSON answer from OUR code — platform-limit theory is DEAD, look elsewhere.",
  );
  console.log(
    blocked(probe.rosterPdf)
      ? "BIG roster PDF died the same platform death — 第二案 shares the root cause."
      : "BIG roster PDF got a JSON answer from OUR code — 第二案 has a different transport story.",
  );
  if (probe.small) {
    console.log(
      probe.small.status === 200 && probe.small.hasExtraction
        ? "SMALL photo went through the whole AI pipeline — the AI itself is fine."
        : `SMALL photo did NOT succeed (status ${probe.small.status}) — read its body above; the problem is deeper than payload size.`,
    );
  }
}

main()
  .catch((e) => console.error("PROBE ERROR:", e.message))
  .finally(async () => {
    // Always clean up, including after a timeout (probe-prod pattern).
    if (storedPath) {
      await fetch(`${SUPA_URL}/storage/v1/object/uploads/${storedPath}`, {
        method: "DELETE",
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      }).catch(() => {});
    }
    if (orgId) {
      for (const p of [
        `/uploads?org_id=eq.${orgId}`,
        `/ai_usage?org_id=eq.${orgId}`,
        `/app_errors?org_id=eq.${orgId}`,
        `/minutes_docs?org_id=eq.${orgId}`,
        `/donations?org_id=eq.${orgId}`,
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
    if (browser) await browser.close();
    console.log("cleaned up");
  });
