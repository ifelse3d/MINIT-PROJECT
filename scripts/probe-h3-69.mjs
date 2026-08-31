// 包H3 (工作单 69): onboarding + the org-creation rule, proven through the
// real UI against local `next start` + the real DB. ZERO AI calls.
//
// What it proves (§1 numbers from work order 69):
//   §1-6  creating an organisation LANDS on /orgs/welcome — the guided
//         sequence (constitution → roster → Maklumat Am), where each step is
//         skipped only by PRESSING "Fill in later", Maklumat Am is filled
//         inline, and a step done in the database ticks itself
//   §1-6  the old scattered ?welcome=1 home card is gone
//   §1-14 the old "3 root orgs" check is GONE (while migration 38 is not
//         applied, several roots go through — fail-open, D8, proven live);
//         once 38 IS applied, the second root is refused with the paid-plan
//         sentence (the branch this probe takes then)
//
//   node scripts/probe-h3-69.mjs
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
const TEST_EMAIL = "zzz-probe-h3@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
// All-caps (the org-name input auto-uppercases — §6 trap).
const ORG_NAME = "ZZZ PROBE H3 UTAMA（可删）";
const EXTRA_PREFIX = "ZZZ PROBE H3 EXTRA";

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

async function sweepByName() {
  const rows = await (
    await rest(`/orgs?name=like.${encodeURIComponent("ZZZ PROBE H3*")}&select=id`)
  ).json().catch(() => []);
  for (const r of Array.isArray(rows) ? rows : []) await deleteOrgRows(r.id);
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

async function stateOf(page, id) {
  return page.evaluate(
    (probeId) =>
      document.querySelector(`[data-probe="${probeId}"]`)?.getAttribute("data-state") ?? "MISSING",
    id,
  );
}

async function createOrgViaUi(page, name) {
  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  // §1 (work order 104): /orgs/new opens on a FORK now — "I have the
  // constitution" or "I'll type it myself". One tap to the form these
  // scripts have always driven; a no-op wherever there is no fork.
  await page.evaluate(() =>
    document.querySelector('[data-probe="road-manual"]')?.click(),
  );
  await new Promise((r) => setTimeout(r, 250));
  await page.type('input[name="name"]', name);
  await clickByText(page, "button", "创建组织");
  let orgId = null;
  let refusal = null;
  for (let i = 0; i < 20 && !orgId && !refusal; i++) {
    await sleep(1500);
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(name)}&select=id&order=id.desc&limit=1`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
    if (!orgId) {
      refusal = await page.evaluate(() => {
        const t = document.body.innerText || "";
        return t.includes("付费方案") || t.includes("pelan berbayar") ? t.slice(0, 400) : null;
      });
    }
  }
  return { orgId, refusal };
}

async function main() {
  console.log("probing", BASE);
  await sweepByName();

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

  const m38 =
    (await rest(`/orgs?select=created_by&limit=1`)).status === 200;
  console.log(
    `migration 38 (orgs.created_by): ${m38 ? "APPLIED — the 1-root rule is live" : "NOT applied — fail-open (D8) under test"}`,
  );

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

  // --- §1-6: creation lands on the guided sequence --------------------------
  const first = await createOrgViaUi(page, ORG_NAME);
  check("first org created", first.orgId !== null, first.refusal ?? "");
  const orgId = first.orgId;
  await page.waitForFunction(
    () => window.location.pathname.includes("/orgs/welcome"),
    { timeout: 20000 },
  );
  await sleep(800);
  check("creation lands on /orgs/welcome", page.url().includes("/orgs/welcome"), page.url());
  check(
    "the sequence renders",
    (await page.$('[data-probe="welcome-flow"]')) !== null,
  );
  check(
    "step 1 (constitution) is CURRENT",
    (await stateOf(page, "welcome-perlembagaan")) === "current",
  );
  check(
    "step 2 (roster) waits its turn",
    (await stateOf(page, "welcome-ajk")) === "later",
  );

  // Skip is a BUTTON — press it twice, the sequence advances in order.
  await clickByText(page, "button", "稍后填");
  await sleep(500);
  check(
    "after skip 1: constitution SKIPPED, roster CURRENT",
    (await stateOf(page, "welcome-perlembagaan")) === "skipped" &&
      (await stateOf(page, "welcome-ajk")) === "current",
  );
  await clickByText(page, "button", "稍后填");
  await sleep(500);
  check(
    "after skip 2: Maklumat Am CURRENT with its inline form",
    (await stateOf(page, "welcome-maklumat")) === "current" &&
      (await page.$('[data-probe="maklumat-inline"]')) !== null,
  );

  // Fill Maklumat Am right here — the step ticks itself from the database.
  await page.type('[data-probe="maklumat-inline"] input[name="phone"]', "03-9999 8888");
  await page.evaluate(() => {
    const f = document.querySelector('[data-probe="maklumat-inline"]');
    const b = f && [...f.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("保存"));
    if (b) b.click();
  });
  await page.waitForFunction(
    () => !!document.querySelector('[data-probe="welcome-done"]'),
    { timeout: 20000 },
  );
  check("Maklumat saved inline → step done → finish card shows", true);

  // A step done in the DATABASE ticks itself even though it was skipped.
  const seedRoster = await rest(`/committee_roster`, {
    method: "POST",
    body: JSON.stringify([
      { org_id: orgId, position: "Pengerusi", person_name: "陈大明", name_official: "TAN TAI BENG" },
    ]),
  });
  check("roster row seeded", seedRoster.status === 201, `status=${seedRoster.status}`);
  await page.goto(`${BASE}/orgs/welcome`, { waitUntil: "networkidle2" });
  check(
    "roster step now shows DONE (database wins over skip)",
    (await stateOf(page, "welcome-ajk")) === "done",
  );

  // The old home landing card is gone.
  await page.goto(`${BASE}/?welcome=1`, { waitUntil: "networkidle2" });
  const home = await page.evaluate(() => document.body.innerText);
  check("old ?welcome=1 home card gone", !home.includes("机构开好了"));

  // --- §1-14: the creation rule --------------------------------------------
  if (m38) {
    const second = await createOrgViaUi(page, `${EXTRA_PREFIX} 2（可删）`);
    check(
      "§1-14: second root org refused with the paid-plan sentence",
      second.orgId === null && second.refusal !== null,
      second.refusal ?? "created anyway",
    );
  } else {
    // The column is not there yet, so the 1-root rule cannot count — what
    // MUST already be true is that the old 3-root check is GONE: a fourth
    // root org goes through where it used to be refused.
    let all = true;
    for (const n of [2, 3, 4]) {
      const extra = await createOrgViaUi(page, `${EXTRA_PREFIX} ${n}（可删）`);
      if (extra.orgId === null) {
        all = false;
        console.log(`extra org ${n} refused:`, extra.refusal ?? "(no refusal text)");
        break;
      }
      await sleep(500);
    }
    check(
      "§1-14: old 3-root cap is GONE (4 roots created under fail-open, D8)",
      all,
    );
    console.log(
      "[SKIP] the 1-root refusal itself — migration 38 not applied; rerun this probe after J applies 38 to see the refusal branch",
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
      await sweepByName();
      const left = await (
        await rest(`/orgs?name=like.${encodeURIComponent("ZZZ PROBE H3*")}&select=id`)
      ).json().catch(() => null);
      console.log(
        Array.isArray(left) && left.length === 0
          ? "orgs deleted cleanly"
          : `⚠ org rows may remain: ${JSON.stringify(left)}`,
      );
      if (userId) await admin(`/users/${userId}`, { method: "DELETE" }).catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch (e) {
      console.error("cleanup error:", e.message);
    }
    process.exit(failures.length === 0 ? 0 : 1);
  });
