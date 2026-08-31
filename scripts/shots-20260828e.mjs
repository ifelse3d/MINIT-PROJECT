// Eyeball shots for the 2026-08-28 EVENING eight-item round: the finished
// document page a save now lands on, the workspace that clears itself, the
// history list whose names open, /filings saying up front that an activity
// meeting is not registered, and the printed PDF's wider signature block.
// Same ZZZ test user/org pattern as e2e-minutes; deleted afterwards.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const OUT = path.join(ROOT, "eval", "reports", "shots-20260828e");
mkdirSync(OUT, { recursive: true });
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
const TEST_EMAIL = "zzz-shots-20260828e@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ SHOTS 晚场测试社团（可删）";
const BASE = "http://localhost:3000";

const admin = (p, o = {}) =>
  fetch(`${SUPA_URL}/auth/v1/admin${p}`, {
    ...o,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(o.headers ?? {}) },
  });
const rest = (p, o = {}) =>
  fetch(`${SUPA_URL}/rest/v1${p}`, {
    ...o,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(o.headers ?? {}) },
  });

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

async function clickByText(page, selector, text, { exact = false } = {}) {
  const els = await page.$$(selector);
  for (const el of els) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (exact ? t === text : t.includes(text)) {
      await el.click();
      return true;
    }
  }
  return false;
}

async function editRow(page, rowLabel, fill) {
  const opened = await page.evaluate((label) => {
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const b of buttons) {
      const t = (b.textContent ?? "").trim();
      if (!["修改", "选一个", "自己填写"].some((x) => t.includes(x))) continue;
      const row = b.closest("div.border-b") ?? b.closest("div");
      if (row && row.textContent?.includes(label)) {
        b.click();
        return true;
      }
    }
    return false;
  }, rowLabel);
  if (!opened) return false;
  await new Promise((r) => setTimeout(r, 400));
  await fill();
  await new Promise((r) => setTimeout(r, 200));
  await clickByText(page, "button", "保存", { exact: true });
  await new Promise((r) => setTimeout(r, 600));
  return true;
}

const shot = async (page, name) => {
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log("shot", name);
};

async function run() {
  const userId = await ensureUser();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 1366, height: 768 });
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

  // --- a typed activity meeting, saved ------------------------------------
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await new Promise((r) => setTimeout(r, 800));
  await editRow(page, "会议类型", async () => {
    await page.evaluate(() => {
      const sel = [...document.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => o.value === "event"),
      );
      if (!sel) return;
      sel.value = "event";
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  await editRow(page, "会议日期", async () => {
    await page.evaluate((val) => {
      const inp = document.querySelector('input[type="date"]');
      if (!inp) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(inp, val);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }, "2026-08-21");
  });
  await editRow(page, "会议地点", async () => {
    await page.keyboard.type("Dewan Shots");
  });
  await page.goto(`${BASE}/minutes/attendance`, { waitUntil: "networkidle2" });
  await page.type('input[placeholder*="打一个名字"]', "Shots Hadir");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 800));

  await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
  await shot(page, "1-document-before-save.png");
  await clickByText(page, "button", "保存到历史");
  await new Promise((r) => setTimeout(r, 5000));
  await shot(page, "2-finished-document-page.png");
  const docUrl = page.url();
  const docId = (docUrl.match(/\/minutes\/history\/(\d+)/) ?? [])[1];
  console.log("finished doc:", docUrl);

  // the workspace after a save — must open ready for the NEXT meeting
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await shot(page, "3-workspace-clean-after-save.png");

  // history list — names are the way in now
  await page.goto(`${BASE}/minutes/history`, { waitUntil: "networkidle2" });
  await shot(page, "4-history-list.png");

  // /filings with the activity meeting selected: the up-front answer
  if (docId) {
    await page.goto(`${BASE}/filings?doc=${docId}`, { waitUntil: "networkidle2" });
    await shot(page, "5-filings-activity-selected.png");
  }

  // the printed PDF (fetched with the page's own session)
  if (docId) {
    const b64 = await page.evaluate(async (id) => {
      const res = await fetch(`/api/minutes-pdf?id=${id}`);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      let s = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return btoa(s);
    }, docId);
    if (b64) {
      writeFileSync(path.join(OUT, "6-minutes.pdf"), Buffer.from(b64, "base64"));
      console.log("shot 6-minutes.pdf");
    } else {
      console.log("PDF fetch FAILED");
    }
  }

  // --- cleanup -------------------------------------------------------------
  const orgRow = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
  const orgId = orgRow[0]?.id;
  if (orgId) {
    await rest(`/minutes_docs?org_id=eq.${orgId}`, { method: "DELETE" });
    await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
    await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
  }
  await admin(`/users/${userId}`, { method: "DELETE" });
  await browser.close();
  console.log("shots written to", OUT);
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
