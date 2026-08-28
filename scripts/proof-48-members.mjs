// 工作单 48 第二案 — the after picture. Replays the tester's exact steps on
// localhost against the FIXED build:
//   1. press Import with an empty box → the old form refusal appears
//   2. switch to the Photo/PDF road and hand it a 6MB PDF (the tester's
//      scanned roster) → the client-side transport gate refuses it honestly
//   3. screenshot: ONE red box, in three languages, saying the file is too
//      big and what to do — not "…", and not stacked on the old refusal.
// ZZZ user + org, deleted in finally (probe-prod pattern).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
const TEST_EMAIL = "zzz-proof-48@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROOF 48（可删）";
const OUT_DIR = path.join(ROOT, "eval/reports");
const BIG_PDF = path.join(OUT_DIR, "zzz-big-roster.pdf");

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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  // A 6MB "scanned roster": header + junk. Only the SIZE matters — the new
  // client gate must refuse it before any request is made.
  writeFileSync(
    BIG_PDF,
    Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(6 * 1024 * 1024, 7)]),
  );

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
  await page.setViewport({ width: 1366, height: 900 });
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
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click('button[type="submit"]'),
  ]);

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

  await page.goto(`${BASE}/members`, { waitUntil: "networkidle2" });

  const clickByText = async (needle) => {
    for (const el of await page.$$("button")) {
      const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
      if (t.includes(needle)) {
        await el.click();
        return true;
      }
    }
    return false;
  };

  // 1. open the import panel, press Import with an EMPTY box → old refusal
  if (!(await clickByText("一次过带进来"))) throw new Error("import toggle not found");
  await new Promise((r) => setTimeout(r, 400));
  await clickByText("加进名单");
  await new Promise((r) => setTimeout(r, 1200));

  // 2. the tester's road: Photo/PDF mode, hand it the 6MB PDF
  await clickByText("照片 / PDF");
  await new Promise((r) => setTimeout(r, 400));
  const input = await page.$('input[type="file"][accept="image/*,application/pdf"]');
  if (!input) throw new Error("AI file input not found");
  await input.uploadFile(BIG_PDF);
  await new Promise((r) => setTimeout(r, 1500));

  // 3. what does the screen say now?
  const boxes = await page.$$eval(".border-red-300", (els) =>
    els.map((e) => (e.innerText || "").replace(/\s+/g, " ").trim()),
  );
  console.log(`red boxes on screen: ${boxes.length}`);
  for (const b of boxes) console.log("  ▸", b.slice(0, 160));

  const shot = path.join(OUT_DIR, "proof-48-members-big-pdf.png");
  await page.screenshot({ path: shot, fullPage: true });
  console.log("screenshot:", shot);

  const ok =
    boxes.length === 1 &&
    boxes[0].includes("太大") &&
    !boxes[0].includes("…") &&
    !boxes[0].includes("请先贴上");
  console.log(
    ok
      ? "PROOF OK — one red box, honest words, old refusal replaced."
      : "PROOF FAILED — read the boxes above.",
  );
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((e) => {
    console.error("SCRIPT ERROR:", e.message);
    process.exitCode = 2;
  })
  .finally(async () => {
    if (orgId) {
      for (const p of [
        `/members_roles?org_id=eq.${orgId}`,
        `/fence_usage?org_id=eq.${orgId}`,
        `/orgs?id=eq.${orgId}`,
      ]) {
        await rest(p, { method: "DELETE" }).catch(() => {});
      }
    }
    if (userId) await admin(`/users/${userId}`, { method: "DELETE" }).catch(() => {});
    if (browser) await browser.close();
    console.log("cleaned up");
  });
