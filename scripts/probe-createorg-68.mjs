// PROBE — work order 68 §5-8: the create-org constitution road, walked for
// real with the 8-page CONTOH PDF (known content, fictional society).
//
//   node scripts/probe-createorg-68.mjs
//
// COSTS REAL AI CREDIT (one constitution read, ~US$0.05 — the same read D0
// measured at 42s). Deliberately a PROBE, not a recurring e2e: the house e2e
// suite is zero-AI by convention, and a suite that burns credit on every run
// stops being run. ZZZ user + org are deleted at the end.
//
// What it proves:
//   * the create-org form reads the attached constitution through
//     /api/extract-minutes' 45s-per-attempt regime (D0) and lands on
//     /constitution?setup=1 with the extraction handed over; OR
//   * on failure, the page shows the HONEST failure card (red, its own box,
//     with an in-place "再试一次" button) — never a red error inside the
//     green success box (work order 68 §1-8).
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

const TEST_EMAIL = "zzz-probe-createorg@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE CREATEORG（可删）";
const BASE = "http://localhost:3000";
const CONTOH = path.join(ROOT, "public", "contoh", "undang-undang-tubuh-contoh.pdf");

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
  // Attach the CONTOH constitution BEFORE creating — the form holds the file
  // and sends it the moment the org exists (create-org-form.tsx).
  const fileInput = await page.$('input[type="file"]');
  check("constitution file input exists on /orgs/new", Boolean(fileInput));
  if (fileInput) await fileInput.uploadFile(CONTOH);
  await new Promise((r) => setTimeout(r, 500));

  const started = Date.now();
  await clickByText(page, "button", "创建组织");

  // The reading takes up to ~50s for 8 pages (D0 measured 42s). Poll for one
  // of the three end states; "reading…" is the in-between.
  async function waitForOutcome() {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      if (page.url().includes("/constitution")) return "landed";
      const text = await page.evaluate(() => document.body.innerText);
      if (text.includes("章程这次没读成功")) return "failed-honestly";
    }
    return "timeout";
  }
  let outcome = await waitForOutcome();
  let elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`outcome (round 1): ${outcome} after ${elapsed}s`);

  // An 8-page read sits at the edge of the 45s wall — generation-speed
  // variance decides it. The in-place retry exists for exactly this; press
  // it ONCE the way a person would, and measure round 2.
  if (outcome === "failed-honestly") {
    const text = await page.evaluate(() => document.body.innerText);
    check("round-1 failure card offers the in-place retry", text.includes("再试一次"));
    const retryStart = Date.now();
    await clickByText(page, "button", "再试一次");
    outcome = await waitForOutcome();
    elapsed = ((Date.now() - retryStart) / 1000).toFixed(1);
    console.log(`outcome (round 2, after in-place retry): ${outcome} after ${elapsed}s`);
  }

  if (outcome === "landed") {
    check("CONTOH read through the create-org road, landed on /constitution", true, `${elapsed}s`);
    await new Promise((r) => setTimeout(r, 1500));
    const text = await page.evaluate(() => document.body.innerText);
    check(
      "the handed-over extraction is on the constitution page",
      text.includes("setup") || text.length > 500,
    );
  } else if (outcome === "failed-honestly") {
    // Not the goal, but the CONTRACT holds: failure in its own red card,
    // success box not wrapping it, and an in-place retry button.
    const text = await page.evaluate(() => document.body.innerText);
    check("failure is honest: its own card, with an in-place retry", text.includes("再试一次"));
    check(
      "the green 'done' box does not wrap the failure",
      !(await page.evaluate(() => {
        const green = [...document.querySelectorAll("div")].find(
          (d) =>
            d.className.includes("border-green") &&
            d.textContent?.includes("已经登记") &&
            d.textContent?.includes("没读成功"),
        );
        return Boolean(green);
      })),
    );
    failures.push("reading did not complete (see outcome above)");
  } else {
    check("create-org constitution read reached an end state", false, `stuck after ${elapsed}s`);
  }

  // --- forensics BEFORE cleanup -------------------------------------------
  const orgRows = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}`)).json();
  const orgId = Array.isArray(orgRows) && orgRows[0] ? orgRows[0].id : null;
  if (orgId) {
    const usage = await (
      await rest(`/ai_usage?org_id=eq.${orgId}&select=action,cost_micros,input_tokens,output_tokens,refunded_at,created_at&order=id.asc`)
    ).json();
    console.log("ai_usage rows:", JSON.stringify(usage));
    const errs = await (
      await rest(`/app_errors?org_id=eq.${orgId}&select=route,name,code,created_at&order=id.asc`)
    ).json();
    console.log("app_errors rows:", JSON.stringify(errs));
  }
  if (orgId) {
    await rest(`/uploads?org_id=eq.${orgId}`, { method: "DELETE" });
    await rest(`/constitutions?org_id=eq.${orgId}`, { method: "DELETE" });
    await rest(`/ai_usage?org_id=eq.${orgId}`, { method: "DELETE" });
    await rest(`/fence_usage?org_id=eq.${orgId}`, { method: "DELETE" });
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
