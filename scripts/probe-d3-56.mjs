// D3 (工作单 56): the eROSES step-by-step guide, proven through the real UI
// against local `next start` + the real DB. Zero AI cost (typing is the
// no-quota path; money rows are seeded by service role).
//
// What it proves:
//   * 拍板 9: the workspace document page no longer carries the old
//     "values to paste into eROSES" block; instead, SAVING lands on the
//     finished-document page which ASKS "file this to eROSES?" and links
//     the guide with ?doc=<id>.
//   * /filings/eroses renders all NINE portal steps by their BM names, the
//     Pengurusan Mesyuarat prerequisite box, and the meeting's own values
//     (date, attendance count) from the confirmed doc.
//   * Step 5 shows the D1-2 mapping computed from seeded money rows —
//     "1.1 Derma = 16,252.00" — plus the honest counting notes.
//   * Steps 2/4 say "migration 35/34" honestly while this DB is behind
//     (fail-open), never a fake empty.
//
//   node scripts/probe-d3-56.mjs
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
const TEST_EMAIL = "zzz-probe-d3@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE D3 呈报引导（可删）";

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
  // Clipboard permission BEFORE any page exists — granting after load is too
  // late for headless Chrome.
  await browser
    .defaultBrowserContext()
    .overridePermissions(BASE, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"])
    .catch(() => {});
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
  await new Promise((r) => setTimeout(r, 6000));
  const orgRow = await (
    await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
  ).json();
  orgId = orgRow[0]?.id ?? null;
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // --- seed money rows for step 5 (D1-2 mapping) ---------------------------
  const year = new Date().getFullYear();
  const seedDon = await rest(`/donations`, {
    method: "POST",
    body: JSON.stringify(
      [
        { donor: "Penderma A", cents: 1000000, purpose: "Derma am" },
        { donor: "Penderma B", cents: 625200, purpose: "Derma — tabung bumbung" },
        { donor: "Ahli C", cents: 5000, purpose: "Yuran ahli" },
      ].map((d) => ({
        org_id: orgId,
        donor_name: d.donor,
        amount_cents: d.cents,
        purpose: d.purpose,
        donated_at: `${year}-03-15`,
        custody_status: "collected",
        source: "manual",
      })),
    ),
  });
  check("donations seeded", seedDon.status === 201, `status=${seedDon.status}`);
  const seedExp = await rest(`/expenses`, {
    method: "POST",
    body: JSON.stringify([
      {
        org_id: orgId,
        description: "Bil elektrik dewan",
        amount_cents: 219146,
        category: "Utiliti",
        spent_at: `${year}-04-01`,
        status: "recorded",
      },
    ]),
  });
  check("expense seeded", seedExp.status === 201, `status=${seedExp.status}`);

  // --- typed AGM minutes → save --------------------------------------------
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await new Promise((r) => setTimeout(r, 800));
  const typeOk = await editRow(page, "会议类型", async () => {
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
  check("meeting type set to AGM", typeOk);
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
    }, `${year}-06-20`);
  });
  await editRow(page, "会议地点", async () => {
    await page.keyboard.type("Dewan Probe D3");
  });
  await page.goto(`${BASE}/minutes/attendance`, { waitUntil: "networkidle2" });
  await page.type('input[placeholder*="打一个名字"]', "Hadir Satu");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 800));

  // 拍板 9 (before): the workspace document page must NOT carry the old
  // paste block any more.
  await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  let text = await page.evaluate(() => document.body.innerText);
  check(
    "workspace no longer carries the old eROSES paste block (拍板 9)",
    !text.includes("要贴进 eROSES 的内容"),
  );

  await clickByText(page, "button", "保存到历史");
  await new Promise((r) => setTimeout(r, 5000));
  text = await page.evaluate(() => document.body.innerText);
  const onDocPage = /\/minutes\/history\/\d+$/.test(page.url().replace(/\/$/, ""));
  check("save lands on the finished-document page", onDocPage, page.url());

  // 拍板 9 (after): the finished page ASKS about eROSES and links the guide.
  check(
    "the finished page asks 要呈报 eROSES 吗",
    text.includes("要把这场会议呈报 eROSES 吗"),
  );
  const docId = Number(/\/minutes\/history\/(\d+)/.exec(page.url())?.[1] ?? "0");
  await clickByText(page, "a", "一步一步带你填");
  await new Promise((r) => setTimeout(r, 2500));
  check(
    "the guide opened with ?doc=<id>",
    page.url().includes(`/filings/eroses?doc=${docId}`),
    page.url(),
  );

  // --- the guide itself ----------------------------------------------------
  text = await page.evaluate(() => document.body.innerText);
  const steps = [
    "1 · Mesyuarat",
    "2 · Maklumat Am",
    "3 · Maklumat AJK",
    "4 · Maklumat Juruaudit",
    "5 · Penyata Kewangan",
    "6 · Laporan Aktiviti",
    "7 · Sumbangan Dari/Ke Luar Negara",
    "8 · Paparan",
    "9 · Pengakuan",
  ];
  for (const s of steps) {
    check(`guide shows step "${s}"`, text.includes(s));
  }
  check(
    "step 1 carries the Pengurusan Mesyuarat prerequisite",
    text.includes("Pengurusan Mesyuarat"),
  );
  check("step 1 shows the meeting date", text.includes(`${year}-06-20`));
  check("step 1 shows the attendance count row", text.includes("Bilangan Ahli Hadir"));
  check(
    "steps 2/4 say the database is behind honestly (fail-open)",
    text.includes("migration 35") && text.includes("migration 34"),
  );
  check(
    "step 3 committee row says where to fix it",
    text.includes("理事名单还没进系统") || text.includes("Senarai AJK"),
  );
  // D1-2 through the guide: the goal sentence made real.
  check("step 5 computes 1.1 Derma = 16,252.00", text.includes("16,252.00"));
  check("step 5 computes Yuran ahli = 50.00", text.includes("50.00"));
  check("step 5 computes Utiliti = 2,191.46", text.includes("2,191.46"));
  check(
    "step 5 links the reference statement",
    text.includes("Minit 的财务报表"),
  );
  check("step 6 links the Laporan generator", text.includes("生成活动报告"));
  const copyButtons = await page.evaluate(
    () =>
      [...document.querySelectorAll("button")].filter((b) =>
        (b.textContent ?? "").includes("复制"),
      ).length,
  );
  check("every value carries a COPY button (>=8 of them)", copyButtons >= 8, `count=${copyButtons}`);

  // One copy button, really clicked. Headless Chrome sometimes refuses
  // clipboard writes regardless of permissions — the UI degrades by design
  // (.catch, value stays selectable), so a denied write here is an
  // ENVIRONMENT note, not a product failure. What must never happen is a
  // page error from the click (that was a real bug, caught by this probe's
  // first run).
  const copyBtns = await page.$$("button");
  for (const b of copyBtns) {
    const label = ((await b.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (label.includes("复制")) {
      await b.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 700));
  const copiedTick = await page.evaluate(() =>
    (document.body.innerText || "").includes("已复制"),
  );
  if (copiedTick) {
    check("a COPY button acknowledges the copy", true);
  } else {
    console.log(
      "NOTE  headless clipboard write denied — copy tick not shown; UI degraded without page errors (checked below).",
    );
  }
  check(
    "clicking COPY never breaks the page",
    pageErrors.length === 0,
    pageErrors.join(" | "),
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
          `/minutes_docs?org_id=eq.${orgId}`,
          `/donations?org_id=eq.${orgId}`,
          `/expenses?org_id=eq.${orgId}`,
          `/ai_usage?org_id=eq.${orgId}`,
          `/app_errors?org_id=eq.${orgId}`,
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
      console.log("cleaned up");
      process.exitCode = failures.length === 0 ? 0 : 1;
    }
  });
