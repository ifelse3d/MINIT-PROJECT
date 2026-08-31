// D2-3 (工作单 56): the Laporan Aktiviti DRAFT against the REAL vendor, once.
// A new prompt must not ship unverified when the proof costs half a sen:
// seed a ZZZ org with two calendar activities, press 起草 through the real
// UI, and require a draft whose rows carry BOTH activity names. ~1 AI action
// (US$~0.005). Everything deleted in finally.
//   node scripts/probe-laporan-56.mjs
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
const TEST_EMAIL = "zzz-probe-laporan@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE LAPORAN（可删）";

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
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);
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
  // §1 (work order 104): /orgs/new opens on a FORK now — "I have the
  // constitution" or "I'll type it myself". One tap to the form these
  // scripts have always driven; a no-op wherever there is no fork.
  await page.evaluate(() =>
    document.querySelector('[data-probe="road-manual"]')?.click(),
  );
  await new Promise((r) => setTimeout(r, 250));
  await page.type('input[name="name"]', ORG_NAME);
  for (const el of await page.$$("button")) {
    const t = ((await el.evaluate((n) => n.textContent ?? "")) || "").trim();
    if (t.includes("创建组织")) {
      await el.click();
      break;
    }
  }
  for (let i = 0; i < 20 && !orgId; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // Two calendar activities — the records the draft must word.
  const seeded = await rest(`/events_meetings`, {
    method: "POST",
    body: JSON.stringify([
      {
        org_id: orgId,
        title: "Gotong-royong Dewan ZZZ",
        starts_at: "2026-03-07T09:00:00+08:00",
        venue_text: "Dewan Orang Ramai Taman Contoh",
        kind: "activity",
      },
      {
        org_id: orgId,
        title: "Kelas Komputer Warga Emas",
        starts_at: "2026-05-16T14:00:00+08:00",
        venue_text: null,
        kind: "class",
      },
    ]),
  });
  check(
    "two activities seeded",
    seeded.status === 201,
    `status=${seeded.status} ${(await seeded.text().catch(() => "")).slice(0, 200)}`,
  );

  await page.goto(`${BASE}/filings/laporan`, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("起草"),
    );
    b?.click();
  });
  const outcome = await page
    .waitForFunction(
      () => {
        const t = document.body.innerText || "";
        if (t.includes("核对与修改")) return "done";
        const red = document.querySelector("[class*='border-red']");
        if (red && (red.textContent ?? "").trim().length > 5)
          return "error:" + (red.textContent ?? "").slice(0, 200);
        return false;
      },
      { timeout: 120000, polling: 1000 },
    )
    .then((h) => h.jsonValue());
  check("draft came back (real vendor)", outcome === "done", String(outcome).slice(0, 200));

  const text = await page.evaluate(() => document.body.innerText || "");
  const values = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea")].map((n) => n.value ?? "").join("\n"),
  );
  check(
    "both activity names are in the editable draft",
    values.includes("Gotong-royong Dewan ZZZ") && values.includes("Kelas Komputer"),
  );
  check("the download step appeared", text.includes("下载 PDF"));

  const usage = await (
    await rest(`/ai_usage?org_id=eq.${orgId}&select=action,cost_micros,refunded_at`)
  ).json();
  console.log("ai_usage:", JSON.stringify(usage));
  check(
    "exactly one draft_activity_report action, not refunded",
    Array.isArray(usage) &&
      usage.length === 1 &&
      usage[0].action === "draft_activity_report" &&
      usage[0].refunded_at === null,
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
          `/events_meetings?org_id=eq.${orgId}`,
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
