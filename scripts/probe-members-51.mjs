// 包B (工作单 51): does the reworked /members actually behave? Walks the real
// UI against local `next start` + the real DB — ZERO AI calls, everything is
// server actions. A throwaway ZZZ user + org, deleted in the finally block.
//
// Proves:
//   B-3  form on top, committee table below
//   B-4  a successful add CLEARS the form (date included)
//   B-6  same name + same IC name → refused; different IC name → asked, then
//        added on confirm; the note shows in the table
//   B-1  no "term end" box anywhere; the appointed date column shows
//   B-11 the badge says 现任 N 人 and matches the table
//   B-5/B-3 groups: existing-group chips render; glossary page renders with
//        form on top (smoke)
//
//   node scripts/probe-members-51.mjs
import { readFileSync } from "node:fs";
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
const TEST_EMAIL = "zzz-probe-members@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE 成员页（可删）";

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

  // Is migration 32 applied? Decides which assertions are live: with it, the
  // note is stored and shown; without it, the STRIP-RETRY must keep the add
  // working (fail-open, D8) and the note simply is not kept yet.
  const m32 = (await rest(`/committee_roster?select=note&limit=1`)).status === 200;
  console.log(`migration 32 (note/honorific): ${m32 ? "APPLIED" : "NOT applied — fail-open path under test"}`);

  // --- /members ------------------------------------------------------------
  await page.goto(`${BASE}/members`, { waitUntil: "networkidle2" });
  const body0 = await page.evaluate(() => document.body.innerText);
  check("B-1: no 任期结束 box anywhere", !body0.includes("任期结束"));
  check("B-11: the badge says 现任 0 人", body0.includes("现任 0 人"));
  check(
    "B-8: who-can-log-in moved out (pointer to Settings stays)",
    !body0.includes("谁可以用 MinitAI") && body0.includes("成员与邀请"),
  );

  // B-4 + the plain add: form on top, clears after a successful add.
  await typeInto(page, 'input[name="position"]', "Pengerusi / 主席");
  await typeInto(page, 'input[name="personName"]', "陈小明");
  await typeInto(page, 'input[name="nameOfficial"]', "TAN SIEW MING");
  await typeInto(page, 'input[name="note"]', "（大）");
  await typeInto(page, 'input[name="termStart"]', "20260101");
  await clickButtonWithText(page, "加进名单");
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("加好了"),
    { timeout: 20000 },
  );
  await sleep(400); // the clear runs on a 0ms timer after the success lands
  const cleared = await page.evaluate(() => ({
    name: document.querySelector('input[name="personName"]')?.value ?? "?",
    date: document.querySelector('input[name="termStart"]')?.value ?? "?",
  }));
  check("B-4: form cleared after add (name box)", cleared.name === "");
  check("B-4: form cleared after add (date box)", cleared.date === "");
  const body1 = await page.evaluate(() => document.body.innerText);
  check("added row shows in the table (fail-open add works)", body1.includes("陈小明"));
  if (m32) {
    check("B-6: the note shows beside the name", body1.includes("（大）"));
  } else {
    console.log("[SKIP] note display — migration 32 not applied; the add above proves the strip-retry (D8 fail-open)");
  }
  check("B-11: badge counts the row — 现任 1 人", body1.includes("现任 1 人"));
  check("B-1: appointed date shows (no arrow-range)", body1.includes("2026-01-01") && !body1.includes("2026-01-01 →"));

  // B-6: SAME name + SAME IC name → refused outright.
  await typeInto(page, 'input[name="position"]', "AJK");
  await typeInto(page, 'input[name="personName"]', "陈小明");
  await typeInto(page, 'input[name="nameOfficial"]', "TAN SIEW MING");
  await clickButtonWithText(page, "加进名单");
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("已经在名单里"),
    { timeout: 20000 },
  );
  check("B-6: same name + same IC refused", true);

  // B-6: SAME name + DIFFERENT IC name → asked, then added on confirm.
  await typeInto(page, 'input[name="nameOfficial"]', "TAN SIEW MENG");
  await typeInto(page, 'input[name="note"]', "（小）");
  await clickButtonWithText(page, "加进名单");
  // "照加" is unique to the ask-box's confirm button — the step-2 refusal
  // message ALSO contains "另一位同名", which made an earlier version of this
  // wait pass before the box existed.
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("照加"),
    { timeout: 20000 },
  );
  check("B-6: different IC asks instead of blocking", true);
  const confirmClicked = await clickButtonWithText(page, "是另一位");
  console.log("confirm click dispatched:", confirmClicked);
  try {
    await page.waitForFunction(
      () => (document.body.innerText || "").includes("现任 2 人"),
      { timeout: 20000 },
    );
  } catch (e) {
    const snap = await page.evaluate(() => (document.body.innerText || "").slice(0, 1500));
    console.log("TIMEOUT SNAPSHOT >>>", JSON.stringify(snap));
    throw e;
  }
  if (m32) {
    const body2 = await page.evaluate(() => document.body.innerText);
    check("B-6: confirmed duplicate-name person added (note shows)", body2.includes("（小）"));
  } else {
    check("B-6: confirmed duplicate-name person added", true);
  }

  // DB truth: two rows (note/honorific only exist once migration 32 is in).
  const cols = m32
    ? "person_name,note,honorific,term_start"
    : "person_name,term_start";
  const dbRows = await (
    await rest(`/committee_roster?org_id=eq.${orgId}&select=${cols}`)
  ).json();
  console.log("committee_roster rows:", JSON.stringify(dbRows));
  check("DB holds exactly 2 committee rows", Array.isArray(dbRows) && dbRows.length === 2);

  // --- groups: existing-group chips (B-5) ----------------------------------
  await typeInto(page, 'input[placeholder*="青年组"]', "青年组");
  const nameInputs = await page.$$('input[list="minit-committee-names"]');
  if (nameInputs.length > 0) {
    await nameInputs[0].click();
    await nameInputs[0].type("陈小明");
  }
  await clickButtonWithText(page, "加进去");
  await page.waitForFunction(
    () => {
      const t = document.body.innerText || "";
      return t.includes("已有的分组") || t.includes("没有保存成功");
    },
    { timeout: 20000 },
  );
  const groupsOutcome = await page.evaluate(() => {
    const t = document.body.innerText || "";
    return t.includes("已有的分组") ? "chips" : "db-behind";
  });
  check(
    "B-5: existing groups render as tappable chips",
    groupsOutcome === "chips",
    groupsOutcome,
  );

  // --- glossary smoke: form on top + table renders -------------------------
  await page.goto(`${BASE}/settings/glossary`, { waitUntil: "networkidle2" });
  const glossOrder = await page.evaluate(() => {
    const form = document.querySelector("form");
    const table = document.querySelector("table");
    const t = document.body.innerText || "";
    return {
      hasForm: !!form,
      formAboveTable:
        !!form && (!table || form.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING),
      emptyText: t.includes("还是空的"),
    };
  });
  check(
    "B-3: glossary form on top (empty list text below)",
    glossOrder.hasForm && glossOrder.formAboveTable !== 0 && glossOrder.emptyText,
  );

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
          `/org_glossary?org_id=eq.${orgId}`,
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
