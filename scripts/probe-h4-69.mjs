// 包H4 (工作单 69): the close-out fixes, proven through the real UI against
// local `next start` + the real DB. ZERO AI calls (typing is the no-quota
// path). A throwaway ZZZ user + org, deleted in the finally block.
//
// Proves (§1 numbers from work order 69):
//   §1-15a the workspace's cloud drafts FOLD to one line (count + latest),
//          expand shows at most two + "see all"; /minutes/drafts lists the
//          lot; a draft is AUTO-NAMED from meeting type + date; Resume from
//          the drafts page lands in the workspace with the content
//   §1-10  deletes go through the app's own ConfirmDialog: cancel keeps the
//          row, confirm removes it (proven on the drafts page and on the
//          committee roster's Remove)
//   §1-13  Settings → Members & invites renders full-width (invite form on
//          screen, help folded, no horizontal overflow)
//
//   node scripts/probe-h4-69.mjs
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
const TEST_EMAIL = "zzz-probe-h4@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE H4 TUTUP（可删）";

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

async function deleteOrgRows(id) {
  for (const p of [
    `/minutes_drafts?org_id=eq.${id}`,
    `/minutes_docs?org_id=eq.${id}`,
    `/committee_roster?org_id=eq.${id}`,
    `/member_groups?org_id=eq.${id}`,
    `/members_roles?org_id=eq.${id}`,
    `/fence_usage?org_id=eq.${id}`,
    `/app_errors?org_id=eq.${id}`,
    `/orgs?id=eq.${id}`,
  ]) {
    await rest(p, { method: "DELETE" }).catch(() => {});
  }
}

async function clickByText(page, selector, text) {
  return page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((x) =>
        (x.textContent ?? "").includes(t),
      );
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    text,
  );
}

/** Click a button inside the OPEN confirm dialog. */
async function clickDialog(page, text) {
  return page.evaluate((t) => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return false;
    const b = [...dlg.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes(t),
    );
    if (!b) return false;
    b.click();
    return true;
  }, text);
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
  await sleep(400);
  await fill();
  await sleep(200);
  await clickByText(page, "button", "保存");
  await sleep(600);
  return true;
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
  await clickByText(page, "button", "创建组织");
  for (let i = 0; i < 30 && !orgId; i++) {
    await sleep(1500);
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  const year = new Date().getFullYear();

  // --- §1-15a: an organically autosaved draft, auto-named -------------------
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await sleep(800);
  await editRow(page, "会议类型", async () => {
    await page.evaluate(() => {
      const sel = [...document.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => o.value === "agm"),
      );
      if (!sel) return;
      sel.value = "agm";
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
    }, `${year}-05-20`);
  });
  await sleep(4000); // the 2.5s debounced cloud autosave
  let drafts = await (
    await rest(`/minutes_drafts?org_id=eq.${orgId}&select=client_key,title`)
  ).json();
  check("draft autosaved to the cloud", Array.isArray(drafts) && drafts.length === 1);
  check(
    "§1-15a: draft AUTO-NAMED from type + date",
    drafts[0]?.title?.includes(`${year}-05-20`) === true,
    drafts[0]?.title ?? "(none)",
  );

  // Stash it and start fresh — the fold should now list ONE other draft.
  await clickByText(page, "button", "先存成草稿，开新的一份");
  await sleep(2500);
  const fold = await page.evaluate(() => {
    const el = document.querySelector('[data-probe="drafts-fold"]');
    if (!el) return null;
    return {
      text: (el.textContent ?? "").slice(0, 200),
      expanded: (el.textContent ?? "").includes("继续这一份"),
    };
  });
  check("§1-15a: the fold renders", fold !== null);
  check(
    "§1-15a: collapsed by default — count + latest, no Resume buttons",
    fold !== null && fold.text.includes("未完成草稿（1）") && !fold.expanded,
    fold?.text ?? "",
  );
  await page.evaluate(() => {
    const el = document.querySelector('[data-probe="drafts-fold"] button');
    if (el) el.click();
  });
  await sleep(400);
  const expanded = await page.evaluate(() => {
    const el = document.querySelector('[data-probe="drafts-fold"]');
    return el ? el.textContent ?? "" : "";
  });
  check(
    "§1-15a: expanded shows Resume + the see-all link",
    expanded.includes("继续这一份") && expanded.includes("看全部草稿"),
  );

  // --- §1-15a: the drafts page + §1-10 the confirm dialog ------------------
  await page.goto(`${BASE}/minutes/drafts`, { waitUntil: "networkidle2" });
  let rowsOnPage = await page.$$('[data-probe="draft-row"]');
  check("§1-15a: /minutes/drafts lists the draft", rowsOnPage.length === 1);

  // Delete → dialog appears → CANCEL keeps the row.
  await clickByText(page, '[data-probe="draft-row"] button', "删除");
  await sleep(400);
  const dialogUp = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
  check("§1-10: delete opens the app's own dialog", dialogUp);
  await clickDialog(page, "取消");
  await sleep(600);
  drafts = await (await rest(`/minutes_drafts?org_id=eq.${orgId}&select=id`)).json();
  check("§1-10: cancel keeps the draft", Array.isArray(drafts) && drafts.length === 1);

  // Delete → CONFIRM removes it for real.
  await clickByText(page, '[data-probe="draft-row"] button', "删除");
  await sleep(400);
  await clickDialog(page, "删除");
  await sleep(2500);
  drafts = await (await rest(`/minutes_drafts?org_id=eq.${orgId}&select=id`)).json();
  check("§1-10: confirm deletes the draft", Array.isArray(drafts) && drafts.length === 0);

  // --- §1-15a: Resume from the drafts page lands in the workspace ----------
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await sleep(800);
  await editRow(page, "会议地点", async () => {
    await page.keyboard.type("Dewan Probe H4");
  });
  await sleep(4000);
  await clickByText(page, "button", "先存成草稿，开新的一份");
  await sleep(2500);
  await page.goto(`${BASE}/minutes/drafts`, { waitUntil: "networkidle2" });
  rowsOnPage = await page.$$('[data-probe="draft-row"]');
  check("second draft listed", rowsOnPage.length === 1);
  await clickByText(page, '[data-probe="draft-row"] a', "继续这一份");
  await sleep(3000);
  const resumed = await page.evaluate(() => ({
    path: window.location.pathname,
    hasParam: window.location.search.includes("draft="),
    body: (document.body.innerText || "").includes("Dewan Probe H4"),
  }));
  check("§1-15a: Resume lands in the workspace with the content", resumed.path === "/minutes" && resumed.body, JSON.stringify(resumed));
  check("§1-15a: the ?draft param is stripped after resuming", !resumed.hasParam);

  // --- §1-10 on the committee roster ---------------------------------------
  const seed = await rest(`/committee_roster`, {
    method: "POST",
    body: JSON.stringify([
      { org_id: orgId, position: "Pengerusi", person_name: "陈大明", name_official: "TAN TAI BENG" },
    ]),
  });
  check("roster row seeded", seed.status === 201);
  await page.goto(`${BASE}/members`, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("table button")].find((b) =>
      (b.textContent ?? "").includes("删除"),
    );
    if (btn) btn.click();
  });
  await sleep(400);
  const rosterDialog = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    return dlg ? dlg.textContent ?? "" : "";
  });
  check(
    "§1-10: roster Remove opens the dialog with the filing warning",
    rosterDialog.includes("理事名单"),
  );
  await clickDialog(page, "取消");
  await sleep(600);
  let roster = await (await rest(`/committee_roster?org_id=eq.${orgId}&select=id`)).json();
  check("§1-10: cancel keeps the member", roster.length === 1);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("table button")].find((b) =>
      (b.textContent ?? "").includes("删除"),
    );
    if (btn) btn.click();
  });
  await sleep(400);
  await clickDialog(page, "删除");
  await sleep(2500);
  roster = await (await rest(`/committee_roster?org_id=eq.${orgId}&select=id`)).json();
  check("§1-10: confirm removes the member", roster.length === 0);

  // --- §1-13: Members & invites renders full-width -------------------------
  await page.goto(`${BASE}/settings/members`, { waitUntil: "networkidle2" });
  const layout = await page.evaluate(() => {
    const body = document.body.innerText || "";
    const form = [...document.querySelectorAll("form")].find((f) =>
      f.querySelector('select[name="role"]'),
    );
    return {
      inviteForm: !!form,
      helpFolded: body.includes("这是什么？"),
      // The page must not scroll horizontally (§6: the body never does).
      hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });
  check("§1-13: invite form on screen", layout.inviteForm);
  check("§1-13: explainer folded behind 这是什么？", layout.helpFolded);
  check("§1-13: no horizontal overflow", !layout.hOverflow);

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
      const all = await (
        await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
      ).json().catch(() => []);
      for (const r of Array.isArray(all) ? all : []) await deleteOrgRows(r.id);
      if (orgId) await deleteOrgRows(orgId);
      const left = await (
        await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
      ).json().catch(() => null);
      console.log(
        Array.isArray(left) && left.length === 0
          ? "org deleted cleanly"
          : `⚠ org row may remain: ${JSON.stringify(left)}`,
      );
      if (userId) await admin(`/users/${userId}`, { method: "DELETE" }).catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch (e) {
      console.error("cleanup error:", e.message);
    }
    process.exit(failures.length === 0 ? 0 : 1);
  });
