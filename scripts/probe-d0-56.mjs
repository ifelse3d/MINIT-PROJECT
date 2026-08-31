// D0 (工作单 56): the three J-tested fixes, proven through the REAL UI against
// local `next start` + real DB + real vendor key. What it proves:
//
//   D0-1  /constitution is A-5 now: photo+PDF together REFUSED (0 cost);
//         two photos stage with thumbnails; NOTHING is sent until the person
//         presses the send button (double confirm — request counter at 0);
//         both photos then read as pages of ONE constitution and merge.
//   D0-2  the CONTOH 8-page constitution — the exact shape that died with
//         "The AI took too long" (VendorTimeoutError, org 91, 8/29) — reads
//         to completion under the new 45s long attempt. Elapsed time printed.
//   D0-3  a >4MB .pptx rides the Storage relay through the /minutes door end
//         to end (the relay upload is observed on the wire, the relay object
//         is deleted after the read); a >12MB .pptx is refused AT THE DOOR
//         with the honest sentence, zero vendor calls.
//
// Cost: ~4 AI reads on a throwaway ZZZ org (2 photo pages + 8-page CONTOH +
// 1 pptx ≈ US$0.04, authorized by 拍板 5's "reproduce with CONTOH").
// Fence pages spent: 11 of the trial 20. Everything is deleted in finally.
//
//   node scripts/probe-d0-56.mjs
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import puppeteer from "puppeteer-core";
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
const TEST_EMAIL = "zzz-probe-d0@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE D0 章程多张（可删）";
const CONTOH_PDF = path.join(ROOT, "public/contoh/undang-undang-tubuh-contoh.pdf");

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

/** A .pptx whose text is one legible BM slide, inflated by an incompressible
 *  media blob so the whole file crosses the given size. */
async function buildPptx(padBytes, fileLabel) {
  const zip = new JSZip();
  const paras = [
    `Taklimat Jawatankuasa - Persatuan Contoh ZZZ (${fileLabel})`,
    "Tarikh: 15 Ogos 2026, Dewan Orang Ramai Taman Contoh",
    "Hadir: Ahmad bin Abu (Pengerusi), Siti binti Rahman (Setiausaha)",
    "Keputusan: Meluluskan anggaran RM 300 untuk kelas komputer.",
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
  if (padBytes > 0) zip.file("ppt/media/noise.bin", crypto.randomBytes(padBytes));
  return zip.generateAsync({ type: "nodebuffer" });
}

let userId = null;
let orgId = null;
let browser = null;
const tmp = (n) => path.join(os.tmpdir(), n);
const FILES = {
  photo1: tmp("zzz-d0-fasal-1-2.png"),
  photo2: tmp("zzz-d0-fasal-3-4.png"),
  bigPptx: tmp("zzz-d0-taklimat-besar.pptx"),
  hugePptx: tmp("zzz-d0-taklimat-gergasi.pptx"),
};

/** Draw one legible constitution page to PNG via the browser's canvas. */
async function drawPage(page, lines, outPath) {
  const dataUrl = await page.evaluate((ls) => {
    const c = document.createElement("canvas");
    c.width = 900;
    c.height = 1200;
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#111111";
    ls.forEach((l, i) => {
      g.font = i === 0 ? "bold 34px Arial" : l.startsWith("Fasal") ? "bold 30px Arial" : "26px Arial";
      g.fillText(l, 60, 90 + i * 60);
    });
    return c.toDataURL("image/png");
  }, lines);
  writeFileSync(outPath, Buffer.from(dataUrl.split(",")[1], "base64"));
}

async function main() {
  console.log("probing", BASE);
  const bigPptx = await buildPptx(5_000_000, "besar");
  writeFileSync(FILES.bigPptx, bigPptx);
  check(
    "big pptx is over the 4MB transport limit",
    bigPptx.length > 4.2 * 1024 * 1024,
    `${(bigPptx.length / 1024 / 1024).toFixed(2)}MB`,
  );
  const hugePptx = await buildPptx(12_800_000, "gergasi");
  writeFileSync(FILES.hugePptx, hugePptx);
  check(
    "huge pptx is over RELAY_MAX_BYTES (12MB)",
    hugePptx.length > 12 * 1024 * 1024,
    `${(hugePptx.length / 1024 / 1024).toFixed(2)}MB`,
  );

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
  // The double-confirm proof and the relay proof both read the wire.
  const wire = { constitutionPosts: 0, minutesPosts: 0, relayUploads: 0 };
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/api/extract-constitution") && r.method() === "POST")
      wire.constitutionPosts++;
    if (u.includes("/api/extract-minutes") && r.method() === "POST") wire.minutesPosts++;
    if (u.includes("/storage/v1/object/uploads/") && u.includes("/relay/")) wire.relayUploads++;
  });
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  // Draw the two constitution "photos" before signing in (any DOM will do).
  await page.goto("about:blank");
  await drawPage(
    page,
    [
      "UNDANG-UNDANG PERTUBUHAN CONTOH ZZZ",
      "",
      "Fasal 1 - Nama",
      "Nama pertubuhan ini ialah Pertubuhan Contoh ZZZ.",
      "",
      "Fasal 2 - Alamat",
      "Alamat berdaftar ialah No. 1, Jalan Contoh,",
      "50000 Kuala Lumpur.",
      "",
      "Muka surat 1",
    ],
    FILES.photo1,
  );
  await drawPage(
    page,
    [
      "UNDANG-UNDANG PERTUBUHAN CONTOH ZZZ",
      "",
      "Fasal 3 - Tujuan",
      "Tujuan pertubuhan ini ialah kebajikan ahli",
      "dan masyarakat setempat.",
      "",
      "Fasal 4 - Keahlian",
      "Keahlian terbuka kepada warganegara Malaysia",
      "yang berumur 18 tahun ke atas.",
      "",
      "Muka surat 2",
    ],
    FILES.photo2,
  );

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
  console.log("org", orgId, "created");

  // === D0-1 ================================================================
  await page.goto(`${BASE}/constitution`, { waitUntil: "networkidle2" });
  const pickInput = async () => {
    const input = await page.$('input[type="file"][multiple]');
    if (!input) throw new Error("no multiple file input on /constitution");
    return input;
  };

  // (a) photo + PDF together → refused wholesale, nothing staged, 0 cost.
  await (await pickInput()).uploadFile(FILES.photo1, CONTOH_PDF);
  await new Promise((r) => setTimeout(r, 1500));
  let text = await page.evaluate(() => document.body.innerText || "");
  check("photo+PDF together is refused (D0-1)", text.includes("只限「照片」"));
  check(
    "the refused mix staged nothing",
    !text.includes("还没送出"),
    "staging strip should be absent",
  );

  // (b) two photos stage; NOTHING is sent until the button (double confirm).
  await (await pickInput()).uploadFile(FILES.photo1, FILES.photo2);
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("这 2 张会当成同一本章程"),
    { timeout: 15000 },
  );
  await new Promise((r) => setTimeout(r, 2500));
  check(
    "staged, and NOT sent before confirm (double confirm)",
    wire.constitutionPosts === 0,
    `extract-constitution POSTs seen: ${wire.constitutionPosts}`,
  );
  const thumbs = await page.$$eval("img[alt$='.png']", (els) => els.length);
  check("both pages show thumbnails", thumbs >= 2, `thumbnails: ${thumbs}`);

  // Press "开始读 —— 共 2 页" (work order 85 ④ relabelled the send button;
  // the estimate line above it is informative only) — now (and only now) the
  // reads run and merge.
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("共 2 页"),
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("开始读"),
    );
    b?.click();
  });
  // ⚠ "条条文已读入" appears after page 1's merge, while page 2 is still
  // reading — wait for the RUN to finish (staging strip and busy line gone),
  // not for the first sign of progress (STATE §6: wait on step-unique text).
  await page.waitForFunction(
    () => {
      const t = document.body.innerText || "";
      const busy = t.includes("正在读") || t.includes("还没送出");
      if (busy) return false;
      if (t.includes("条条文已读入")) return true;
      const red = document.querySelector("[class*='border-red']");
      if (red && (red.textContent ?? "").trim().length > 10) return "error";
      return false;
    },
    { timeout: 150000, polling: 1000 },
  );
  text = await page.evaluate(() => document.body.innerText || "");
  // Clause BODIES sit in collapsed <details> (not in innerText) — assert on
  // the visible clause HEADINGS from each page instead.
  check(
    "two photos read as ONE constitution (merged)",
    text.includes("条条文已读入") &&
      /Nama|Alamat/.test(text) &&
      /Tujuan|Keahlian/.test(text),
    text.includes("条条文已读入") ? "clauses missing page-2 headings" : "read failed",
  );
  check("exactly 2 reads were charged for 2 pages", wire.constitutionPosts === 2);

  // === D0-2 ================================================================
  // The CONTOH 8-page constitution — the exact "AI took too long" shape.
  await (await pickInput()).uploadFile(CONTOH_PDF);
  // ④: the door now counts the PDF's real pages and prices the read up front
  // — "共 8 页" proves both the count and the estimate line are in place.
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("共 8 页"),
    { timeout: 15000 },
  );
  const t0 = Date.now();
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("开始读"),
    );
    b?.click();
  });
  const contohOutcome = await page
    .waitForFunction(
      () => {
        const t = document.body.innerText || "";
        const busy = t.includes("正在读") || t.includes("还没送出");
        if (busy) return false;
        const m = /(\d+)\s*条条文已读入/.exec(t);
        if (m && Number(m[1]) >= 8) return "done";
        const red = document.querySelector("[class*='border-red']");
        if (red && (red.textContent ?? "").trim().length > 10)
          return "error:" + (red.textContent ?? "").slice(0, 200);
        return false;
      },
      { timeout: 150000, polling: 1000 },
    )
    .then((h) => h.jsonValue());
  const contohSecs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`CONTOH read finished in ${contohSecs}s → ${contohOutcome}`);
  check(
    "CONTOH 8-page constitution reads to completion (D0-2)",
    contohOutcome === "done",
    `${contohSecs}s — ${String(contohOutcome).slice(0, 200)}`,
  );
  check(
    "no 'AI took too long' anywhere",
    !(await page.evaluate(() => (document.body.innerText || "").includes("用的时间太长"))),
  );

  // === D0-3 ================================================================
  // (a) >4MB .pptx through the REAL /minutes door — must ride the relay.
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  const minutesInput = await page.$('input[type="file"]');
  if (!minutesInput) throw new Error("no file input on /minutes");
  await minutesInput.uploadFile(FILES.bigPptx);
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").includes("现在开始读")),
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("现在开始读"));
    b?.click();
  });
  const pptxOutcome = await page
    .waitForFunction(
      () => {
        const t = document.body.innerText || "";
        if (t.includes("zzz-d0-taklimat-besar.pptx") && !t.includes("AI 读取中")) return "done";
        const red = document.querySelector("[class*='border-red']");
        if (red && (red.textContent ?? "").trim().length > 10 && !t.includes("AI 读取中"))
          return "error:" + (red.textContent ?? "").slice(0, 200);
        return false;
      },
      { timeout: 120000, polling: 1000 },
    )
    .then((h) => h.jsonValue());
  check(
    "big pptx read end-to-end through the door (D0-3)",
    pptxOutcome === "done",
    String(pptxOutcome).slice(0, 200),
  );
  check("the pptx actually rode the Storage relay", wire.relayUploads >= 1);
  const bodyText = await page.evaluate(() => document.body.innerText || "");
  check(
    "pptx text reached the workspace",
    /Ahmad|Siti|Dewan|kelas komputer/.test(bodyText),
  );
  const relayLeft = await listStorage(`${orgId}/relay`);
  check(
    "relay object deleted after the read",
    Array.isArray(relayLeft) &&
      relayLeft.filter((o) => o.name !== ".emptyFolderPlaceholder").length === 0,
    JSON.stringify(relayLeft).slice(0, 200),
  );

  // (b) >12MB .pptx → refused AT THE DOOR, zero vendor calls.
  const minutesPostsBefore = wire.minutesPosts;
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  const input2 = await page.$('input[type="file"]');
  await input2.uploadFile(FILES.hugePptx);
  await page.waitForFunction(
    () => [...document.querySelectorAll("button")].some((b) => (b.textContent ?? "").includes("现在开始读")),
    { timeout: 20000 },
  );
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("现在开始读"));
    b?.click();
  });
  await page.waitForFunction(
    () => {
      const red = document.querySelector("[class*='border-red']");
      return !!(red && (red.textContent ?? "").includes("太大"));
    },
    { timeout: 30000, polling: 500 },
  );
  const hugeError = await page.evaluate(
    () => document.querySelector("[class*='border-red']")?.textContent ?? "",
  );
  check(
    ">12MB pptx refused with the honest Office sentence",
    hugeError.includes("太大") && /Word|PowerPoint/.test(hugeError),
    hugeError.slice(0, 160),
  );
  check(
    "the refusal never reached the API (no charge)",
    wire.minutesPosts === minutesPostsBefore,
    `minutes POSTs: ${wire.minutesPosts} vs ${minutesPostsBefore}`,
  );

  // --- the doorway limit note is actually AT the doors ---------------------
  check("/minutes door states the 12MB limit", bodyText.includes("12MB"));
  await page.goto(`${BASE}/constitution`, { waitUntil: "networkidle2" });
  const constiText = await page.evaluate(() => document.body.innerText || "");
  check("/constitution door states the 12MB limit", constiText.includes("12MB"));

  // --- what did it cost? ---------------------------------------------------
  const usage = await (await rest(`/ai_usage?org_id=eq.${orgId}&select=action,cost_micros,refunded_at`)).json();
  if (Array.isArray(usage)) {
    const total = usage.reduce((a, u) => a + (u.cost_micros ?? 0), 0);
    console.log(
      `ai_usage: ${usage.length} rows, US$${(total / 1e6).toFixed(4)} total`,
      JSON.stringify(usage),
    );
    check("no refunded rows (nothing failed silently)", usage.every((u) => !u.refunded_at));
  }

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
        for (const prefix of [
          `${orgId}/relay`,
          `${orgId}/meeting_notes`,
          `${orgId}/constitution`,
        ]) {
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
          `/constitutions?org_id=eq.${orgId}`,
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
      for (const f of Object.values(FILES)) {
        try {
          rmSync(f);
        } catch {}
      }
      console.log("cleaned up");
      process.exitCode = failures.length === 0 ? 0 : 1;
    }
  });
