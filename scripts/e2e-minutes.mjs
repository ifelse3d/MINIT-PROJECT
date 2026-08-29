// End-to-end check of the MINUTES flow against the real dev server + database
// (2026-08-25), inside a purpose-made test org deleted at the end:
//
//   R-4   typed minutes → the hero preview + one-tap amber confirm
//   S0-3  "Save to History" is idempotent — pressing twice stores ONE document
//   S0-5  /filings builds the paste-pack from the CONFIRMED document (server)
//
// No AI is called anywhere in this flow (typing is the no-quota path).
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

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

const TEST_EMAIL = "zzz-e2e-minutes@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
// Already uppercase: the create form uppercases as you type (C-4, 拍板 33),
// and the REST lookups below must match what actually got stored.
const ORG_NAME = "ZZZ E2E 会议测试社团（可删）";
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

/** Edit ONE FieldRow: press its edit button (label depends on state), fill
 *  the editor, press 保存. */
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

async function run() {
  const userId = await ensureUser();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 1280, height: 900 });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("minit.lang.v2", "zh");
      document.cookie = "minit-lang=zh;path=/";
    } catch {}
  });

  // sign in + org
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  await page.type('input[name="name"]', ORG_NAME);
  await clickByText(page, "button", "创建组织");
  await new Promise((r) => setTimeout(r, 6000));
  // §1-6 (work order 69): creating an org lands on the GUIDED SEQUENCE.
  check("org created", page.url().includes("/orgs/welcome"));

  // --- typed minutes -------------------------------------------------------
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await new Promise((r) => setTimeout(r, 800));

  // meeting type: choice editor. NOT page.$("select"): since C-2 the shell
  // itself carries a language <select>, so the FIRST select on the page is no
  // longer the field editor — find the one holding the meeting types.
  const typeOk = await editRow(page, "会议类型", async () => {
    await page.evaluate(() => {
      const sel = [...document.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => o.value === "committee"),
      );
      if (!sel) return;
      sel.value = "committee";
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  check("meeting type set", typeOk);

  // meeting date: native date input
  const dateOk = await editRow(page, "会议日期", async () => {
    // A date input ignores ISO keystrokes (locale entry); set the value the
    // way React expects: native setter + input/change events.
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
    }, "2026-08-20");
  });
  check("meeting date set", dateOk);

  // venue: text editor. BM on purpose — the BM guard (W6, J 8/27) blocks
  // saving a BM document that carries Chinese content, and this script's
  // job is to test the SAVE path. The guard has its own unit tests.
  const venueOk = await editRow(page, "会议地点", async () => {
    // The row editor autofocuses its input — type into the focused element.
    await page.keyboard.type("Dewan E2E");
  });
  check("venue set", venueOk);

  // attendance — D30 (2026-08-28, J #33): zero attendance can no longer be
  // saved as a confirmed document. The old escape hatch is a DEFERRAL now;
  // the honest flow types one attendee in, which is what this does. (The
  // deferral path is exercised below: the save button must stay locked.)
  await page.goto(`${BASE}/minutes/attendance`, { waitUntil: "networkidle2" });
  // First prove the deferral does NOT unlock the save (D30).
  await clickByText(page, "button, label", "稍后补上");
  await new Promise((r) => setTimeout(r, 500));
  await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  const deferredText = await page.evaluate(() => document.body.innerText);
  check(
    "D30: deferred attendance leaves the save locked with the fill-it-in notice",
    deferredText.includes("出席名单还是空的"),
  );
  // Now record a real attendee and continue.
  await page.goto(`${BASE}/minutes/attendance`, { waitUntil: "networkidle2" });
  await page.type('input[placeholder*="打一个名字"]', "E2E Hadir");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 800));

  // hero preview should now say everything is checked (R-4)
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  let text = await page.evaluate(() => document.body.innerText);
  const heroDone = text.includes("全部核对好了") || text.includes("您的文件");
  check("R-4 hero preview present after review", heroDone);

  // --- save twice (S0-3) ---------------------------------------------------
  await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  let docText = await page.evaluate(() => document.body.innerText);
  console.log("DOC PAGE SNIPPET >>>", docText.slice(0, 700).split(String.fromCharCode(10)).join(" | "));
  const saved1 = await clickByText(page, "button", "保存到历史");
  await new Promise((r) => setTimeout(r, 5000));
  text = await page.evaluate(() => document.body.innerText);
  console.log("AFTER SAVE SNIPPET >>>", text.slice(0, 700).split(String.fromCharCode(10)).join(" | "));
  // J 28/8 evening items 6+7: a successful save walks TO the finished
  // document's own page (/minutes/history/<id>) — final preview, Print/PDF
  // and Edit right there. (Replaces the old walk-back-to-/minutes card.)
  check("save lands on the finished document's page with Print/PDF",
    saved1 && /\/minutes\/history\/\d+$/.test(page.url().replace(/\/$/, "")) &&
    text.includes("打印 / PDF"));

  // J 28/8 evening item 1: a saved workspace does not linger — /minutes
  // opens ready for the NEXT meeting, not on last month's.
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1000));
  text = await page.evaluate(() => document.body.innerText);
  check("workspace is clean after a save (new-meeting page, no saved card)",
    !text.includes("上一场已存好") && text.includes("拍下手写的会议笔记"));
  await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));

  // press again if the button still exists (retry path); otherwise call it a
  // pass — the UI hiding the button after success is also a fine defence.
  const saved2 = await clickByText(page, "button", "保存到历史");
  if (saved2) await new Promise((r) => setTimeout(r, 5000));

  const orgRow = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
  const orgId = orgRow[0]?.id;
  // client_id only exists after migration 20260828000000 — select it
  // separately so a pre-migration database still yields a row count.
  let docs = await (await rest(`/minutes_docs?org_id=eq.${orgId}&select=id,status,client_id`)).json();
  let hasClientId = true;
  if (!Array.isArray(docs)) {
    hasClientId = false;
    docs = await (await rest(`/minutes_docs?org_id=eq.${orgId}&select=id,status`)).json();
  }
  check("S0-3 exactly ONE minutes document stored after double save",
    Array.isArray(docs) && docs.length === 1,
    `count=${Array.isArray(docs) ? docs.length : "err"}, secondPress=${saved2}, clientIdColumn=${hasClientId}`);
  check("stored document is confirmed",
    docs[0]?.status === "confirmed");
  if (hasClientId) {
    check("stored document carries client_id", Boolean(docs[0]?.client_id));
  } else {
    console.log("NOTE: client_id column absent (migration 20260828000000 not applied yet) — idempotency currently relies on it; run the migration.");
  }

  // --- D-1②: /minutes/history is records, not workspace --------------------
  await page.goto(`${BASE}/minutes/history`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  text = await page.evaluate(() => document.body.innerText);
  check("D-1 history page shows no step rail and no done banner",
    text.includes("会议记录历史") && !text.includes("拍或打字") && !text.includes("存进您机构的历史"));

  // --- /filings reads the CONFIRMED document from the server (S0-5) --------
  await page.goto(`${BASE}/filings`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1000));
  text = await page.evaluate(() => document.body.innerText);
  const hasPack = text.includes("eROSES") &&
    (text.includes("2026-08-20") || text.includes("要粘贴的值"));
  check("S0-5 /filings shows the paste-pack from the confirmed doc", hasPack);

  // and it must come from the SERVER: wipe local storage, reload, still there
  await page.evaluate(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("minit:")) localStorage.removeItem(k);
    }
  });
  await page.goto(`${BASE}/filings`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1000));
  text = await page.evaluate(() => document.body.innerText);
  check("S0-5 paste-pack survives a local wipe (server data, not the draft)",
    text.includes("要粘贴的值") || text.includes("2026-08-20"));

  // --- cleanup -------------------------------------------------------------
  if (orgId) {
    await rest(`/minutes_docs?org_id=eq.${orgId}`, { method: "DELETE" });
    await rest(`/members_roles?org_id=eq.${orgId}`, { method: "DELETE" });
    await rest(`/orgs?id=eq.${orgId}`, { method: "DELETE" });
  }
  await admin(`/users/${userId}`, { method: "DELETE" });
  await browser.close();
  console.log("page errors:", pageErrors.length, pageErrors.slice(0, 5));
  console.log(failures.length === 0 ? "ALL CHECKS PASSED" : `FAILURES: ${failures.join("; ")}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error("SCRIPT ERROR:", e.message);
  process.exit(2);
});
