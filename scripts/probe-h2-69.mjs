// 包H2 (工作单 69): the restructured eROSES flow, proven through the real UI
// against local `next start` + the real DB. Zero AI cost (typing is the
// no-quota path; money/roster rows are seeded by service role).
//
// What it proves (§1 numbers from work order 69):
//   §1-1  /filings/eroses is a CARD entry page (register / annual return /
//         deadlines), and the finished-minutes page's question lands there
//         with ?doc=<id> preserved into the chosen card
//   HR13  the Penyata Tahunan is one page per portal step
//         (/filings/eroses/penyata/langkah/1…9) with the Langkah rail
//   §1-2  a missing value is filled WITHOUT leaving the flow: Maklumat Am +
//         bank account inline on step 2, IC name inline on step 3, auditor
//         inline on step 4 — each lands in the real table
//   walk  from the confirmed AGM through all nine steps, the URL never
//         leaves /filings/eroses/penyata (验收: 不離開 flow)
//   §1-15b every step (and the register page) carries its interface sketch
//   §1-11 on /filings the free-plan lock is REAL: copy button locked AND the
//         value region is select-none with copy interception
//
//   node scripts/probe-h2-69.mjs
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
const TEST_EMAIL = "zzz-probe-h2@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
// All-caps on purpose: the org-name input auto-uppercases (§6 trap: fixed
// data must be written in its POST-transform shape or the lookup finds nothing).
const ORG_NAME = "ZZZ PROBE H2 FLOW（可删）";

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
  await sleep(400);
  await fill();
  await sleep(200);
  await clickByText(page, "button", "保存", { exact: true });
  await sleep(600);
  return true;
}

/** Type into an input inside a [data-probe] scope, by name. */
async function typeScoped(page, scope, name, value) {
  const sel = `[data-probe="${scope}"] input[name="${name}"]`;
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.value = "";
  }, sel);
  await page.type(sel, value);
}

let userId = null;
let orgId = null;
let browser = null;

async function deleteOrgRows(id) {
  for (const p of [
    `/donations?org_id=eq.${id}`,
    `/expenses?org_id=eq.${id}`,
    `/minutes_docs?org_id=eq.${id}`,
    `/committee_roster?org_id=eq.${id}`,
    `/auditors?org_id=eq.${id}`,
    `/org_bank_accounts?org_id=eq.${id}`,
    `/member_groups?org_id=eq.${id}`,
    `/members_roles?org_id=eq.${id}`,
    `/fence_usage?org_id=eq.${id}`,
    `/app_errors?org_id=eq.${id}`,
    `/orgs?id=eq.${id}`,
  ]) {
    await rest(p, { method: "DELETE" }).catch(() => {});
  }
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
  // A leftover same-named org from a crashed earlier run would make the
  // name lookup return THE WRONG ORG (the UI's active org is the new one,
  // the seeds would land in the orphan — exactly the split-brain this probe
  // once diagnosed). Sweep first, and take the NEWEST id after creating.
  const leftovers = await (
    await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
  ).json();
  for (const r of Array.isArray(leftovers) ? leftovers : []) {
    await deleteOrgRows(r.id);
  }

  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  await page.type('input[name="name"]', ORG_NAME);
  const createClicked = await clickByText(page, "button", "创建组织");
  console.log("create-org click dispatched:", createClicked);
  for (let i = 0; i < 30 && !orgId; i++) {
    await sleep(1500);
    const orgRow = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)
    ).json();
    orgId = Array.isArray(orgRow) ? (orgRow[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // --- seed: money rows (step 5) + a roster with one missing IC (step 3) ---
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
  const seedRoster = await rest(`/committee_roster`, {
    method: "POST",
    body: JSON.stringify([
      {
        org_id: orgId,
        position: "Pengerusi / 主席",
        person_name: "陈大明",
        name_official: "TAN TAI BENG",
      },
      { org_id: orgId, position: "Setiausaha / 秘书", person_name: "林小美", name_official: null },
    ]),
  });
  check("roster seeded (one IC missing)", seedRoster.status === 201, `status=${seedRoster.status}`);

  // --- typed AGM minutes → save → the question → the DOOR ------------------
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await sleep(800);
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
    await page.keyboard.type("Dewan Probe H2");
  });
  await page.goto(`${BASE}/minutes/attendance`, { waitUntil: "networkidle2" });
  await page.type('input[placeholder*="打一个名字"]', "Hadir Satu");
  await page.keyboard.press("Enter");
  await sleep(800);
  await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
  await sleep(800);
  await clickByText(page, "button", "保存到历史");
  await sleep(5000);
  const docId = Number(/\/minutes\/history\/(\d+)/.exec(page.url())?.[1] ?? "0");
  check("save landed on the finished-document page", docId > 0, page.url());

  await clickByText(page, "a", "一步一步带你填");
  await sleep(2500);
  check(
    "the eROSES door opened with ?doc=<id>",
    page.url().includes(`/filings/eroses?doc=${docId}`),
    page.url(),
  );

  // --- §1-1: the entry is CARDS --------------------------------------------
  const cards = await page.evaluate(() => ({
    mesyuarat: !!document.querySelector('[data-probe="card-mesyuarat"]'),
    penyata: !!document.querySelector('[data-probe="card-penyata"]'),
    tarikh: !!document.querySelector('[data-probe="card-tarikh"]'),
  }));
  check(
    "entry page shows the three cards",
    cards.mesyuarat && cards.penyata && cards.tarikh,
    JSON.stringify(cards),
  );

  await page.click('[data-probe="card-penyata"]');
  await sleep(2000);
  check(
    "Penyata card lands on the flow start, doc preserved",
    page.url().includes(`/filings/eroses/penyata?doc=${docId}`),
    page.url(),
  );
  let text = await page.evaluate(() => document.body.innerText);
  check("start page shows the financial-year line", text.includes("财政年度"));

  await page.click('[data-probe="start-flow"]');
  await sleep(2000);
  check("start button lands on langkah/1", page.url().includes("/penyata/langkah/1"), page.url());

  // --- the nine steps, never leaving the flow -------------------------------
  const stepChecks = {
    1: async () => {
      const t = await page.evaluate(() => document.body.innerText);
      check("step 1: sketch present", await page.$('[data-probe="sketch-1"]') !== null);
      check("step 1: meeting date value shown", t.includes(`${year}-06-20`) || t.includes(`20-06-${year}`));
      check("step 1: attendance count shown", t.includes("Bilangan Ahli Hadir"));
      check("step 1: register-guide link present", t.includes("登记会议引导") || t.includes("Daftar mesyuarat"));
    },
    2: async () => {
      check("step 2: sketch present", (await page.$('[data-probe="sketch-2"]')) !== null);
      const hasForm = (await page.$('[data-probe="maklumat-inline"]')) !== null;
      check("step 2: inline Maklumat form present (§1-2)", hasForm);
      if (hasForm) {
        await typeScoped(page, "maklumat-inline", "phone", "03-1234 5678");
        await typeScoped(page, "maklumat-inline", "financialYearStart", `${year}-01-01`);
        await typeScoped(page, "maklumat-inline", "membersRegistered", "120");
        await typeScoped(page, "maklumat-inline", "membersVoting", "98");
        await page.evaluate(() => {
          const f = document.querySelector('[data-probe="maklumat-inline"]');
          const b = f && [...f.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("保存"));
          if (b) b.click();
        });
        await page.waitForFunction(
          () => (document.querySelector('[data-probe="maklumat-inline"]')?.textContent ?? "").includes("存好了"),
          { timeout: 20000 },
        );
        await sleep(1500); // router.refresh() re-reads the server values
        const t2 = await page.evaluate(() => document.body.innerText);
        check("step 2: saved phone now shows as a value", t2.includes("03-1234 5678"));
      }
      // the bank inline form
      const hasBank = (await page.$('[data-probe="bank-inline"]')) !== null;
      check("step 2: inline bank form present (§1-2)", hasBank);
      if (hasBank) {
        await typeScoped(page, "bank-inline", "bankName", "Bank Contoh");
        await typeScoped(page, "bank-inline", "accountNo", "1234567890");
        await page.evaluate(() => {
          const f = document.querySelector('[data-probe="bank-inline"]');
          const b = f && [...f.querySelectorAll('button[type="submit"]')][0];
          if (b) b.click();
        });
        await sleep(3000);
        const t3 = await page.evaluate(() => document.body.innerText);
        check("step 2: bank account landed", t3.includes("Bank Contoh") && t3.includes("1234567890"));
      }
    },
    3: async () => {
      check("step 3: sketch present", (await page.$('[data-probe="sketch-3"]')) !== null);
      // D48 (work order 89 ⑦b): BOTH seeded rows still miss eROSES fields
      // (陈大明 has no state/date, 林小美 no IC name either) — so the
      // copy-pack must be LOCKED and each row must offer its own inline
      // gap form right here.
      check(
        "step 3: no live copy while rows are incomplete (D48)",
        (await page.$('[data-copy-id="s3-ajk"]')) === null &&
          (await page.$('[data-probe="ajk-gaps"]')) !== null,
      );
      let forms = await page.evaluate(
        () => document.querySelectorAll('[data-probe="ic-inline"]').length,
      );
      check("step 3: one inline gap form per incomplete row", forms === 2, `got ${forms}`);
      if (forms === 0) {
        const rows = await (
          await rest(`/committee_roster?org_id=eq.${orgId}&select=person_name,name_official,state,term_start`)
        ).json();
        console.log("DBG roster rows:", JSON.stringify(rows));
        console.log("DBG step3 body:", JSON.stringify(await page.evaluate(() => document.body.innerText.slice(0, 2000))));
      }
      // Fill whatever the FIRST form asks for, save, repeat — each save
      // refreshes the page and the closed row's form disappears.
      for (let round = 0; round < 3 && forms > 0; round++) {
        for (const [name, value] of [
          ["nameOfficial", "LIM SIEW MEI"],
          ["state", "Selangor"],
          ["termStart", `${year}-05-20`],
        ]) {
          const has = await page.evaluate(
            (n) => !!document.querySelector(`[data-probe="ic-inline"] input[name="${n}"]`),
            name,
          );
          if (has) await typeScoped(page, "ic-inline", name, value);
        }
        await page.evaluate(() => {
          const f = document.querySelector('[data-probe="ic-inline"]');
          const b = f && [...f.querySelectorAll('button[type="submit"]')][0];
          if (b) b.click();
        });
        await sleep(3000);
        forms = await page.evaluate(
          () => document.querySelectorAll('[data-probe="ic-inline"]').length,
        );
      }
      check("step 3: every gap closed after filling in place", forms === 0, `left ${forms}`);
      // The gate opens: the gaps block and the 🛑 button are both gone.
      // (Whether an ACTIVE copy appears depends on the minutes naming office
      // bearers — this typed AGM named none, so the value row honestly says
      // where the list would come from; that path predates D48.)
      const unlocked =
        (await page.$('[data-probe="ajk-gaps"]')) === null &&
        (await page.$('[data-probe="ajk-copy-blocked"]')) === null;
      check("step 3: the D48 gate opens once the list is complete", unlocked);
      const db = await (
        await rest(`/committee_roster?org_id=eq.${orgId}&person_name=eq.${encodeURIComponent("林小美")}&select=name_official,state,term_start`)
      ).json();
      check(
        "step 3: the fills are in the real table",
        db[0]?.name_official === "LIM SIEW MEI" &&
          db[0]?.state === "Selangor" &&
          db[0]?.term_start === `${year}-05-20`,
        JSON.stringify(db),
      );
    },
    4: async () => {
      check("step 4: sketch present", (await page.$('[data-probe="sketch-4"]')) !== null);
      const hasForm = (await page.$('[data-probe="auditor-inline"]')) !== null;
      check("step 4: inline auditor form present (§1-2)", hasForm);
      if (hasForm) {
        await typeScoped(page, "auditor-inline", "personName", "Pemeriksa Satu");
        await typeScoped(page, "auditor-inline", "nameOfficial", "PEMERIKSA SATU");
        await typeScoped(page, "auditor-inline", "appointedOn", `${year}-06-20`);
        await page.evaluate(() => {
          const f = document.querySelector('[data-probe="auditor-inline"]');
          const b = f && [...f.querySelectorAll('button[type="submit"]')][0];
          if (b) b.click();
        });
        await sleep(3000);
        const db = await (await rest(`/auditors?org_id=eq.${orgId}&select=person_name`)).json();
        check("step 4: auditor is in the real table", Array.isArray(db) && db.length === 1);
        if (!Array.isArray(db) || db.length !== 1) {
          const t = await page.evaluate(
            () => document.querySelector('[data-probe="auditor-inline"]')?.textContent ?? "GONE",
          );
          console.log("DBG auditor form text:", JSON.stringify(t.slice(0, 500)));
        }
      }
    },
    5: async () => {
      check("step 5: sketch present", (await page.$('[data-probe="sketch-5"]')) !== null);
      const t = await page.evaluate(() => document.body.innerText);
      check("step 5: income total computed to the sen", t.includes("16,302.00"));
      check("step 5: expense figure shown", t.includes("2,191.46"));
      if (!t.includes("16,302.00")) {
        console.log("DBG step5 body:", JSON.stringify(t.slice(0, 2500)));
      }
    },
    6: async () => {
      const t = await page.evaluate(() => document.body.innerText);
      check("step 6: laporan link present", t.includes("生成活动报告") || t.includes("Jana Laporan"));
    },
    7: async () => {
      const t = await page.evaluate(() => document.body.innerText);
      check("step 7: Tiada Data guidance", t.includes("Tiada Data"));
    },
    8: async () => {
      const t = await page.evaluate(() => document.body.innerText);
      check("step 8: Cetak guidance", t.includes("Cetak"));
    },
    9: async () => {
      const t = await page.evaluate(() => document.body.innerText);
      check("step 9: Seksyen 54A named", t.includes("54A"));
    },
  };

  for (let n = 1; n <= 9; n++) {
    check(
      `step ${n}: URL stays inside the flow`,
      page.url().includes(`/filings/eroses/penyata/langkah/${n}`),
      page.url(),
    );
    await stepChecks[n]();
    if (n < 9) {
      await page.evaluate(() => {
        const nav = document.querySelector('[data-probe="step-nav"]');
        const a = nav && [...nav.querySelectorAll("a")].find((x) => (x.textContent ?? "").includes("下一步"));
        if (a) a.click();
      });
      await page.waitForFunction(
        (next) => window.location.pathname.includes(`/langkah/${next}`),
        { timeout: 20000 },
        n + 1,
      );
      await sleep(1200);
    }
  }

  // --- the register-a-meeting card ------------------------------------------
  await page.goto(`${BASE}/filings/eroses/mesyuarat?doc=${docId}`, { waitUntil: "networkidle2" });
  const t = await page.evaluate(() => document.body.innerText);
  check("mesyuarat guide: sketch present", (await page.$('[data-probe="sketch-mesyuarat"]')) !== null);
  check("mesyuarat guide: Jenis Mesyuarat row", t.includes("Jenis Mesyuarat"));
  check("mesyuarat guide: attendance counted", t.includes("Jumlah Kehadiran"));

  // --- the deadlines card ----------------------------------------------------
  await page.goto(`${BASE}/filings/eroses/tarikh`, { waitUntil: "networkidle2" });
  const t2 = await page.evaluate(() => document.body.innerText);
  check("tarikh page: annual-return deadline from the confirmed AGM", t2.includes("Penyata Tahunan ROS") || t2.includes("年度呈报"));

  // --- §1-11: the free-plan lock is REAL for this trial org ------------------
  // (work order 78: the old /filings long page is retired — /filings now
  // redirects to the card entry, and the lock lives on the flow's ValueRows.
  // Same assertions, new address.)
  await page.goto(`${BASE}/filings/eroses/penyata/langkah/1?doc=${docId}`, { waitUntil: "networkidle2" });
  const lock = await page.evaluate(() => {
    const body = document.body.innerText || "";
    const lockedButton = body.includes("复制（付费版）");
    const selectNone = [...document.querySelectorAll("span.select-none")].some(
      (s) => (s.textContent ?? "").trim() !== "",
    );
    return { lockedButton, selectNone };
  });
  check("§1-11: copy button locked on the free plan", lock.lockedButton);
  check("§1-11: value region is select-none (real lock)", lock.selectNone);

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
      // Sweep by NAME, not only by the id we think we made — a crashed run
      // must never leave a same-named orphan to poison the next run.
      const all = await (
        await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
      ).json().catch(() => []);
      for (const r of Array.isArray(all) ? all : []) {
        await deleteOrgRows(r.id);
      }
      if (orgId) await deleteOrgRows(orgId);
      {
        const left = await (
          await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
        ).json().catch(() => null);
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
