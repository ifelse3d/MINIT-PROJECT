// C-7 (工作单 51): does the D44 free fence ACTUALLY stop someone at the wall?
// Until tonight the fence was "installed and powered" (migration 31 applied)
// but nobody had ever WALKED INTO it. This walks a throwaway trial org into
// three of the four walls through the real UI/API — ZERO AI calls:
//
//   * documents:      5 typed minutes save fine, the 6th is refused
//   * receipts:       20 issue fine, the 21st (a new round) is refused
//   * clean download: 3 clean PDFs fine, the 4th answers 402
//
// The fourth wall (the 21st AI-read page) is NOT probed — reading 20 pages
// through a vendor to test a counter would burn real money; its charge/refund
// plumbing shares the code paths proven here and in the unit tests.
//
//   node scripts/probe-fence-51.mjs        (against local next start)
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
const TEST_EMAIL = "zzz-probe-fence@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE 围栏撞墙（可删）";

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

/** Edit ONE FieldRow (the e2e-minutes helper, verbatim). */
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

/** One full TYPED minutes flow (the e2e-minutes walk), ending on the save.
 *  Returns "saved" | "fenced" | "stuck". */
async function typeAndSaveMinutes(page, n) {
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await sleep(800);
  await editRow(page, "会议类型", async () => {
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
    }, `2026-08-${String(n + 1).padStart(2, "0")}`);
  });
  await editRow(page, "会议地点", async () => {
    await page.keyboard.type(`Dewan Fence ${n}`);
  });
  await page.goto(`${BASE}/minutes/attendance`, { waitUntil: "networkidle2" });
  await page.type('input[placeholder*="打一个名字"]', "Fence Hadir");
  await page.keyboard.press("Enter");
  await sleep(800);
  await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
  await sleep(800);
  await clickByText(page, "button", "保存到历史");
  await sleep(5000);
  const text = await page.evaluate(() => document.body.innerText);
  if (/\/minutes\/history\/\d+/.test(page.url())) return "saved";
  if (text.includes("已经用完")) return "fenced";
  return "stuck";
}

let userId = null;
let orgId = null;
let browser = null;

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
  let orgRow = null;
  for (let i = 0; i < 30 && !orgId; i++) {
    await sleep(1500);
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id,plan`)
    ).json();
    if (Array.isArray(rows) && rows[0]) {
      orgRow = rows[0];
      orgId = rows[0].id;
    }
  }
  if (!orgId) {
    console.log("page url:", page.url());
    console.log("page text:", (await page.evaluate(() => document.body.innerText)).slice(0, 400));
    throw new Error("org never appeared");
  }
  console.log("trial org", orgId, JSON.stringify(orgRow));

  // === WALL 1: documents — 5 fine, the 6th refused ==========================
  let firstDocId = null;
  for (let n = 1; n <= 6; n++) {
    const outcome = await typeAndSaveMinutes(page, n);
    if (n === 1 && outcome === "saved") {
      const m = page.url().match(/\/minutes\/history\/(\d+)/);
      firstDocId = m ? m[1] : null;
    }
    if (n <= 5) {
      check(`doc ${n}/5 saved`, outcome === "saved", outcome);
      if (outcome !== "saved") break;
    } else {
      check("WALL: the 6th document is refused with the fence sentence", outcome === "fenced", outcome);
    }
  }

  // === WALL 2: clean downloads — 3 fine, the 4th answers 402 ================
  if (firstDocId) {
    for (let i = 1; i <= 4; i++) {
      const r = await page.evaluate(async (id) => {
        const res = await fetch(`/api/minutes-pdf?id=${id}&clean=1`);
        const type = res.headers.get("content-type") ?? "";
        let body = "";
        if (!type.includes("pdf")) body = (await res.text()).slice(0, 600);
        return { status: res.status, type, body };
      }, firstDocId);
      if (i <= 3) {
        check(
          `clean download ${i}/3 delivered a PDF`,
          r.status === 200 && r.type.includes("pdf"),
          `status=${r.status} ${r.body}`,
        );
      } else {
        check(
          "WALL: the 4th clean download answers 402 with the fence sentence",
          r.status === 402 &&
            (r.body.includes("telah digunakan") || r.body.includes("已经用完")),
          `status=${r.status} ${r.body.slice(0, 200)}`,
        );
      }
    }
  } else {
    check("clean-download wall (needs doc 1's id)", false, "no doc id captured");
  }

  // === WALL 3: receipts — 20 fine, the 21st refused =========================
  // Round A: type 20 donations, issue — all 20 go out.
  await page.goto(`${BASE}/money`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await sleep(800);
  for (let i = 1; i <= 20; i++) {
    const nameInputs = await page.$$('input[aria-label^="捐款人"]');
    const amountInputs = await page.$$('input[inputmode="decimal"]');
    if (nameInputs.length === 0) break;
    await nameInputs[nameInputs.length - 1].type(`Penderma ${i}`);
    await amountInputs[amountInputs.length - 1].type("10");
    await sleep(200);
  }
  await clickByText(page, "button", "加进名册");
  await sleep(1500);
  await page.goto(`${BASE}/money/issue`, { waitUntil: "networkidle2" });
  await sleep(1200);
  await clickByText(page, "button", "生成正式收据");
  await sleep(600);
  await clickByText(page, "button", "是，生成收据");
  await sleep(4000);
  let text = await page.evaluate(() => document.body.innerText);
  if (text.includes("开第一张收据之前") || text.includes("MIN 继续")) {
    await clickByText(page, "button", "就用 MIN 继续");
    await sleep(6000);
    text = await page.evaluate(() => document.body.innerText);
  }
  const receiptsA = await (
    await rest(`/receipts?org_id=eq.${orgId}&select=id`)
  ).json();
  check(
    "20 receipts issued on the trial plan",
    Array.isArray(receiptsA) && receiptsA.length === 20,
    `rows=${Array.isArray(receiptsA) ? receiptsA.length : "?"}`,
  );

  // Round B: one more donation — the 21st receipt must be refused whole.
  await page.goto(`${BASE}/money`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await sleep(800);
  const nameInputs2 = await page.$$('input[aria-label^="捐款人"]');
  const amountInputs2 = await page.$$('input[inputmode="decimal"]');
  await nameInputs2[nameInputs2.length - 1].type("Penderma 21");
  await amountInputs2[amountInputs2.length - 1].type("10");
  await sleep(300);
  await clickByText(page, "button", "加进名册");
  await sleep(1500);
  await page.goto(`${BASE}/money/issue`, { waitUntil: "networkidle2" });
  await sleep(1200);
  await clickByText(page, "button", "生成正式收据");
  await sleep(600);
  await clickByText(page, "button", "是，生成收据");
  await sleep(4000);
  const afterB = await page.evaluate(() => document.body.innerText);
  const receiptsB = await (
    await rest(`/receipts?org_id=eq.${orgId}&select=id`)
  ).json();
  check(
    "WALL: the 21st receipt is refused with the fence sentence",
    afterB.includes("已经开完"),
    afterB.includes("已经开完") ? "" : afterB.slice(0, 300),
  );
  check(
    "…and NOT issued (still exactly 20 rows — no number burned)",
    Array.isArray(receiptsB) && receiptsB.length === 20,
    `rows=${Array.isArray(receiptsB) ? receiptsB.length : "?"}`,
  );

  // The fence counters, on the record.
  const fenceRows = await (
    await rest(`/fence_usage?org_id=eq.${orgId}&select=*`)
  ).json();
  console.log("fence_usage:", JSON.stringify(fenceRows));

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
          `/receipts?org_id=eq.${orgId}`,
          `/donations?org_id=eq.${orgId}`,
          `/minutes_docs?org_id=eq.${orgId}`,
          `/paste_packs?org_id=eq.${orgId}`,
          `/uploads?org_id=eq.${orgId}`,
          `/events_meetings?org_id=eq.${orgId}`,
          `/deadlines?org_id=eq.${orgId}`,
          `/ai_usage?org_id=eq.${orgId}`,
          `/app_errors?org_id=eq.${orgId}`,
          `/fence_usage?org_id=eq.${orgId}`,
          `/members_roles?org_id=eq.${orgId}`,
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
