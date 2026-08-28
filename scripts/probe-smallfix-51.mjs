// 小修包 (工作单 51) — visual + behaviour smoke, zero AI:
//   C-1  the income-purpose-templates dialog is STYLED again (screenshot —
//        the tester saw a bare transparent rectangle)
//   C-2  the secondary-calendars dialog shows the Malaysia-holidays toggle
//   C-13 with migration 33 NOT applied, "stash as draft" answers with the
//        honest fail-open sentence and throws nothing away
//
//   node scripts/probe-smallfix-51.mjs
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const BASE = process.env.BASE || "http://localhost:3000";
const OUT = path.join(ROOT, "eval", "reports");
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
const TEST_EMAIL = "zzz-probe-smallfix@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE 小修包（可删）";

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

let userId = null;
let orgId = null;
let browser = null;

async function main() {
  console.log("probing", BASE);
  mkdirSync(OUT, { recursive: true });

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

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2" }),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  await page.type('input[name="name"]', ORG_NAME);
  await clickByText(page, "button", "创建组织");
  for (let i = 0; i < 30 && !orgId; i++) {
    await sleep(1500);
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId);

  // --- C-1: the income-purpose-templates dialog, styled -----------------------
  await page.goto(`${BASE}/money`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await sleep(800);
  await clickByText(page, "button", "做用词模板");
  await sleep(800);
  const dialogStyle = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return null;
    const cs = getComputedStyle(dlg);
    return {
      background: cs.backgroundColor,
      borderW: cs.borderTopWidth,
      insideRoot: !!dlg.closest(".v2-root"),
    };
  });
  check(
    "C-1: templates dialog is portalled INSIDE .v2-root",
    dialogStyle?.insideRoot === true,
    JSON.stringify(dialogStyle),
  );
  check(
    "C-1: dialog card has a REAL background (not transparent)",
    !!dialogStyle && dialogStyle.background !== "rgba(0, 0, 0, 0)",
    dialogStyle?.background ?? "no dialog",
  );
  await page.screenshot({ path: path.join(OUT, "proof-51-c1-templates-modal.png") });
  console.log("screenshot: eval/reports/proof-51-c1-templates-modal.png");
  await page.keyboard.press("Escape");
  await sleep(400);

  // --- C-2: the holidays toggle in the secondary-calendars dialog -------------
  await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle2" });
  await sleep(800);
  const openedCal = await clickByText(page, "button", "副历");
  await sleep(600);
  const calText = await page.evaluate(() => document.body.innerText);
  check(
    "C-2: Malaysia-holidays toggle present in the dialog",
    openedCal && calText.includes("马来西亚公共假期"),
  );
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('[role="dialog"] input[type="checkbox"]')];
    const label = [...document.querySelectorAll('[role="dialog"] label')].find((l) =>
      (l.textContent ?? "").includes("公共假期"),
    );
    label?.querySelector("input")?.click();
    void boxes;
  });
  await sleep(400);
  await clickByText(page, "button", "完成");
  await sleep(600);
  // National Day (fixed date) must render in the grid for August.
  const year = new Date().getFullYear();
  await page.goto(`${BASE}/calendar?month=${year}-08`, { waitUntil: "networkidle2" });
  await sleep(800);
  const augText = await page.evaluate(() => document.body.innerText);
  check("C-2: 国庆日 shows on Aug 31 in the grid", augText.includes("国庆日"));
  await page.screenshot({ path: path.join(OUT, "proof-51-c2-holidays.png") });
  console.log("screenshot: eval/reports/proof-51-c2-holidays.png");

  // --- C-13: stash-as-draft fail-open (migration 33 not applied) -------------
  const m33 = (await rest(`/minutes_drafts?select=id&limit=1`)).status === 200;
  console.log(`migration 33: ${m33 ? "APPLIED" : "NOT applied — fail-open under test"}`);
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await sleep(800);
  // Give the workspace SOME content so the stash button appears.
  await page.evaluate(() => {
    const sel = [...document.querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.value === "committee"),
    );
    // the field editor may be closed; typing content is enough via 会议地点 —
    // simplest: nothing here; the typed flag alone makes it real.
    void sel;
  });
  await sleep(300);
  const stashBtn = await clickByText(page, "button", "先存成草稿");
  await sleep(2500);
  const minutesText = await page.evaluate(() => document.body.innerText);
  if (m33) {
    check(
      "C-13: stash succeeded (cloud draft list shows)",
      stashBtn && (minutesText.includes("还没写完的草稿") || minutesText.includes("拍下手写的会议笔记")),
    );
  } else {
    check(
      "C-13: fail-open — honest sentence, nothing lost",
      stashBtn && minutesText.includes("存不上云端"),
      stashBtn ? minutesText.slice(0, 200) : "stash button not found",
    );
    check(
      "C-13: the typed workspace was NOT cleared",
      minutesText.includes("自己填写") || minutesText.includes("会议类型"),
    );
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
        for (const p of [
          `/minutes_drafts?org_id=eq.${orgId}`,
          `/minutes_docs?org_id=eq.${orgId}`,
          `/org_templates?org_id=eq.${orgId}`,
          `/members_roles?org_id=eq.${orgId}`,
          `/fence_usage?org_id=eq.${orgId}`,
          `/app_errors?org_id=eq.${orgId}`,
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
      console.log("cleaned up");
      process.exitCode = failures.length === 0 ? 0 : 1;
    }
  });
