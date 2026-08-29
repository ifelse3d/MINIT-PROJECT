// 包H1 (工作单 69): the roster completion — does the real UI do what the
// report says? Walks local `next start` + the real DB — ZERO AI calls. A
// throwaway ZZZ user + org, deleted in the finally block.
//
// Proves (§1 numbers from work order 69):
//   §1-5  "加常见职位" seeds the standard skeleton once — empty names show
//         amber 还没填, pressing it again adds nothing
//   §1-3  a row can be EDITED in place: the seeded Pengerusi gets a name,
//         an IC name, an email and a state through the row's Edit form
//   §1-3  adding a person with email + Negeri works even while migration 37
//         is NOT applied (strip-retry fail-open, D8) — and stores them when
//         it IS applied
//   §1-4  a filled-in NEW-template .xlsx (8 columns incl. Gelaran/E-mel/
//         Negeri/Nota) imports through the same parser, all-or-nothing
//   §1-7  the Title datalist groups by language (zh first under zh UI)
//   §1-8  no 📅 emoji; the long date sentence is gone; the IC hint is short
//   §1-9  the who-can-log-in pointer line is gone
//
//   node scripts/probe-h1-69.mjs
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");

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
const TEST_EMAIL = "zzz-probe-h1@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE H1 名册（可删）";

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

let userId = null;
let orgId = null;
let browser = null;

async function typeInto(page, selector, value) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.value = "";
  }, selector);
  await page.type(selector, value);
}

async function clickButtonWithText(page, text) {
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes(t),
    );
    if (!b) return false;
    b.click();
    return true;
  }, text);
}

/** The members table's own scope — the page has several cards. */
async function tableText(page) {
  return page.evaluate(() => {
    const t = document.querySelector("table");
    return t ? t.innerText : "";
  });
}

async function main() {
  console.log("probing", BASE);

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
  await clickButtonWithText(page, "创建组织");
  for (let i = 0; i < 30 && !orgId; i++) {
    await sleep(1500);
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // Which assertions are live depends on migration 37 (this work order writes
  // the file; J applies it later). Both branches are real paths to prove.
  const m37 = (await rest(`/committee_roster?select=email&limit=1`)).status === 200;
  console.log(`migration 37 (email/state): ${m37 ? "APPLIED" : "NOT applied — strip-retry fail-open under test"}`);

  // --- §1-8 / §1-9: the copy --------------------------------------------------
  await page.goto(`${BASE}/members`, { waitUntil: "networkidle2" });
  const body0 = await page.evaluate(() => document.body.innerText);
  check("§1-9: who-can-log-in pointer line gone", !body0.includes("谁可以登入用"));
  check("§1-8: long date sentence gone", !body0.includes("随便怎么打"));
  check("§1-8: short IC hint present", body0.includes("照身份证抄"));
  const hasEmoji = await page.evaluate(() =>
    (document.body.innerHTML || "").includes("📅"),
  );
  check("§1-8: no 📅 emoji (lucide icon now)", !hasEmoji);

  // §1-7: title datalist grouped, zh group first under zh UI.
  const datalist = await page.evaluate(() => {
    const d = document.getElementById("committee-honorifics");
    return d ? [...d.querySelectorAll("option")].map((o) => o.value) : [];
  });
  check(
    "§1-7: zh titles listed before BM titles under zh UI",
    datalist.length > 0 && datalist.indexOf("讲师") < datalist.indexOf("Dato'"),
    JSON.stringify(datalist.slice(0, 4)),
  );

  // --- §1-5: seed the standard skeleton ---------------------------------------
  await clickButtonWithText(page, "加常见职位");
  await page.waitForFunction(
    () => {
      const card = document.body.innerText || "";
      return card.includes("加好了");
    },
    { timeout: 20000 },
  );
  await sleep(500);
  let table = await tableText(page);
  check("§1-5: seeded positions show", table.includes("Pengerusi / 主席") && table.includes("Bendahari / 财政"));
  check("§1-5: empty names show as amber 还没填 (not blank cells)", table.includes("还没填"));
  let db = await (await rest(`/committee_roster?org_id=eq.${orgId}&select=id`)).json();
  check("§1-5: default skeleton = 7 rows", Array.isArray(db) && db.length === 7, `got ${db.length}`);

  // Press it again — nothing doubles.
  await clickButtonWithText(page, "加常见职位");
  await page.waitForFunction(
    () => !(document.body.innerText || "").includes("加入中"),
    { timeout: 20000 },
  );
  await sleep(1500);
  db = await (await rest(`/committee_roster?org_id=eq.${orgId}&select=id`)).json();
  check("§1-5: pressing again adds nothing", Array.isArray(db) && db.length === 7, `got ${db.length}`);

  // --- §1-3: edit a seeded row in place ---------------------------------------
  // The first row (Pengerusi) has no name: open ITS Edit form and fill it.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("table button")].find((b) =>
      (b.textContent ?? "").includes("编辑"),
    );
    if (btn) btn.click();
  });
  await page.waitForFunction(
    () => !!document.querySelector('table form input[name="personName"]'),
    { timeout: 10000 },
  );
  const editScope = 'table form ';
  const setIn = async (name, value) => {
    await page.evaluate(
      (sel) => {
        const el = document.querySelector(sel);
        if (el) el.value = "";
      },
      editScope + `input[name="${name}"]`,
    );
    await page.type(editScope + `input[name="${name}"]`, value);
  };
  await setIn("personName", "陈大明");
  await setIn("nameOfficial", "TAN TAI BENG");
  await setIn("email", "taitb@contoh.my");
  await setIn("state", "Selangor");
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("table form button")].find((x) =>
      (x.textContent ?? "").includes("保存"),
    );
    if (b) b.click();
  });
  await page.waitForFunction(
    () => {
      const t = document.querySelector("table");
      return t && t.innerText.includes("陈大明");
    },
    { timeout: 20000 },
  );
  table = await tableText(page);
  check("§1-3: edited name shows in the row", table.includes("陈大明"));
  check("§1-3: edited IC name shows", table.includes("TAN TAI BENG"));
  if (m37) {
    check("§1-3: email + state stored and shown", table.includes("taitb@contoh.my") && table.includes("Selangor"));
  } else {
    console.log("[SKIP] email/state display — migration 37 not applied; the save above proves the strip-retry (D8 fail-open)");
  }

  // --- §1-3: the add form takes email + Negeri --------------------------------
  await typeInto(page, 'input[name="position"]', "Setiausaha / 秘书");
  await typeInto(page, 'input[name="personName"]', "林小美");
  await typeInto(page, 'input[name="email"]', "mei@contoh.my");
  await typeInto(page, 'input[name="state"]', "Selangor");
  await clickButtonWithText(page, "加进名单");
  await page.waitForFunction(
    () => {
      const forms = [...document.querySelectorAll("form")];
      return forms.some(
        (f) =>
          (f.innerText || "").includes("加好了") &&
          f.querySelector('input[name="personName"]'),
      );
    },
    { timeout: 20000 },
  );
  await sleep(500);
  table = await tableText(page);
  check("§1-3: add with email/Negeri lands (fail-open either way)", table.includes("林小美"));

  // A broken email is refused with the field named.
  await typeInto(page, 'input[name="position"]', "AJK");
  await typeInto(page, 'input[name="personName"]', "王小强");
  await typeInto(page, 'input[name="email"]', "not-an-email");
  await clickButtonWithText(page, "加进名单");
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("好像不对"),
    { timeout: 20000 },
  );
  check("§1-3: a no-@ email is refused in plain words", true);
  await typeInto(page, 'input[name="email"]', "");

  // --- §1-4: the NEW 8-column template imports --------------------------------
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Jawatankuasa");
  ws.addRow([
    "Jawatan / 职位 / Position",
    "Nama / 姓名 / Name",
    "Gelaran / 称呼职衔 / Title (optional)",
    "Nama seperti dalam IC / 身份证上的名字 / Name as on IC",
    "E-mel / 电邮 / Email",
    "Negeri / 州属 / State",
    "Nota / 备注 / Note",
    "Tarikh perlantikan / 任命日期 / Appointed (YYYY-MM-DD)",
  ]);
  ws.addRow(["AJK / 理事", "李美玲", "师姐", "LEE MEI LING", "mei.ling@contoh.my", "WP Kuala Lumpur", "（小）", "2026-01-01"]);
  ws.addRow(["AJK / 理事", "陈志强", "", "", "", "", "", ""]);
  const tmp = mkdtempSync(path.join(os.tmpdir(), "probe-h1-"));
  const xlsxPath = path.join(tmp, "roster.xlsx");
  writeFileSync(xlsxPath, Buffer.from(await wb.xlsx.writeBuffer()));

  await clickButtonWithText(page, "一次过带进来");
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("Excel / CSV"),
    { timeout: 10000 },
  );
  const fileInput = await page.$('input[type="file"][name="file"]');
  check("§1-4: the Excel picker is on the file road", !!fileInput);
  await fileInput.uploadFile(xlsxPath);
  // The zh label "加进名单" sits on BOTH the add form's button and the import
  // form's — click inside the form that owns the paste textarea (陷阱: 断言/
  // 点击都要圈定这一张卡独有的 DOM 范围).
  await page.evaluate(() => {
    const form = [...document.querySelectorAll("form")].find((f) =>
      f.querySelector('textarea[name="pasted"]'),
    );
    const b = form
      ? [...form.querySelectorAll('button[type="submit"]')][0]
      : null;
    if (b) b.click();
  });
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("名单加好了"),
    { timeout: 20000 },
  );
  await sleep(500);
  db = await (
    await rest(
      `/committee_roster?org_id=eq.${orgId}&select=${m37 ? "person_name,email,state" : "person_name"}&order=id`,
    )
  ).json();
  console.log("committee_roster after import:", JSON.stringify(db));
  check(
    "§1-4: import added exactly 2 rows (7 seeded + 1 added + 2 imported = 10)",
    Array.isArray(db) && db.length === 10,
    `got ${db.length}`,
  );
  const meiLing = Array.isArray(db) ? db.find((r) => r.person_name === "李美玲") : null;
  check("§1-4: imported person landed", !!meiLing);
  if (m37) {
    check(
      "§1-4: imported email + Negeri stored",
      meiLing && meiLing.email === "mei.ling@contoh.my" && meiLing.state === "WP Kuala Lumpur",
    );
  } else {
    console.log("[SKIP] imported email/state columns — migration 37 not applied; the batch strip-retry carried the rows");
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
          `/member_groups?org_id=eq.${orgId}`,
          `/committee_roster?org_id=eq.${orgId}`,
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
      if (browser) await browser.close().catch(() => {});
    } catch (e) {
      console.error("cleanup error:", e.message);
    }
    process.exit(failures.length === 0 ? 0 : 1);
  });
