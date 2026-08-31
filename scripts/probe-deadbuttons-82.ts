// PROBE — work order 82 closing package: the DEAD-BUTTON FULL ROSTER.
// Work order 81 I3 fixed clickability and proved two buttons alive; this one
// proves EVERY key in ASK_ROUTES + ASK_ACTION_ROUTES — the only hrefs a chat
// answer button can carry — renders and really navigates to its page.
//
// The hrefs come from importing the REAL whitelist module (no hand-copied
// list to drift). A transcript carrying one button per key is seeded into the
// panel's scoped localStorage (zero AI), the desktop rail stays open across
// navigations, and each button is clicked from a neutral page (/health, which
// is not itself a destination).
//
// Run: node node_modules/tsx/dist/cli.mjs scripts/probe-deadbuttons-82.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import {
  ASK_ACTION_ROUTES,
  ASK_ROUTES,
  withAiMarker,
} from "../src/lib/ask-routes";

const ROOT = "C:/dev/minit-v2";
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env.local"), "utf-8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
) as Record<string, string>;
const SUPA_URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_EMAIL = "zzz-probe-deadbtn-82@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ 死按钮全名单测试（可删）";
const BASE = "http://localhost:3000";
const NEUTRAL = "/health"; // a real page that is NOT a button destination

type RouteRow = { key: string; href: string; bm: string; zh: string; en: string };
const ROWS: RouteRow[] = [
  ...Object.entries(ASK_ROUTES).map(([key, r]) => ({ key, ...r })),
  ...Object.entries(ASK_ACTION_ROUTES).map(([key, r]) => ({ key, ...r })),
];

const failures: string[] = [];
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}

async function admin(p: string, opts: RequestInit = {}) {
  return fetch(`${SUPA_URL}/auth/v1/admin${p}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
}
async function rest(p: string, opts: RequestInit = {}) {
  return fetch(`${SUPA_URL}/rest/v1${p}`, {
    ...opts,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
}

/** Where must the browser land for this key to count as ALIVE? */
function landedOk(key: string, href: string, url: URL): boolean {
  const base = href.split("?")[0];
  if (key === "home") return url.pathname === "/";
  // /filings is a 308 front door to /filings/eroses (work order 78) — landing
  // anywhere inside /filings is the button doing its job.
  if (key === "filings") return url.pathname.startsWith("/filings");
  return url.pathname === base || url.pathname.startsWith(base + "/");
}

async function run() {
  // sweep + user
  const rows0 = (await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json()) as { id: number }[];
  for (const r of Array.isArray(rows0) ? rows0 : []) await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
  const list0 = (await (await admin(`/users?page=1&per_page=100`)).json()) as { users?: { id: string; email: string }[] };
  let userId = (list0.users ?? []).find((u) => u.email === TEST_EMAIL)?.id;
  if (userId) {
    await admin(`/users/${userId}`, { method: "PUT", body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }) });
  } else {
    const res = await admin(`/users`, { method: "POST", body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }) });
    userId = ((await res.json()) as { id: string }).id;
  }

  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--no-first-run", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);
    await page.setViewport({ width: 1280, height: 950 });
    const pageErrors: string[] = [];
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
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
    // §1 (work order 104): /orgs/new opens on a FORK now — "I have the
    // constitution" or "I'll type it myself". One tap to the form these
    // scripts have always driven; a no-op wherever there is no fork.
    await page.evaluate(() =>
      document
        .querySelector<HTMLElement>('[data-probe="road-manual"]')
        ?.click(),
    );
    await new Promise((r) => setTimeout(r, 250));
    await page.type('input[name="name"]', ORG_NAME);
    for (const b of await page.$$("button")) {
      const t = ((await b.evaluate((n) => n.textContent ?? "")) || "").trim();
      if (t.includes("创建组织")) {
        await b.click();
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 6000));
    const orgRows = (await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)
    ).json()) as { id: number }[];
    const orgId = orgRows?.[0]?.id ?? null;
    check("org created + id found", orgId !== null, String(orgId));

    // One assistant turn per whitelist key — every button the model can send.
    const turns = [
      { role: "user", text: "全部按钮点检" },
      ...ROWS.map((r) => ({
        role: "assistant",
        text: `按钮点检：${r.key}`,
        button: { href: withAiMarker(r.href), bm: r.bm, zh: r.zh, en: r.en },
        sources: null,
        lookups: null,
      })),
    ];
    await page.evaluate(
      ({ key, t }) => localStorage.setItem(key, JSON.stringify(t)),
      { key: `minit:${userId}:${orgId}:chat.panel.v1`, t: turns },
    );
    // Keep the rail open across navigations (the dock restores this flag).
    await page.evaluate(() => localStorage.setItem("minit.ai-dock.open", "1"));

    for (const row of ROWS) {
      const href = withAiMarker(row.href);
      await page.goto(`${BASE}${NEUTRAL}`, { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 900));
      const opened = await page.evaluate(() => Boolean(document.querySelector("aside.v2-glass")));
      if (!opened) {
        const launcher = await page.$('button[aria-label="MinitAI"]');
        if (launcher) {
          await launcher.click();
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
      const sel = `aside.v2-glass a[href="${href}"]`;
      const link = await page.$(sel);
      check(`${row.key}: button rendered`, link !== null, href);
      if (!link) continue;
      await link.evaluate((n) => n.scrollIntoView({ block: "center" }));
      await new Promise((r) => setTimeout(r, 400));
      const box = await link.boundingBox();
      if (!box) {
        check(`${row.key}: button has a hit box`, false);
        continue;
      }
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await new Promise((r) => setTimeout(r, 2200));
      const url = new URL(page.url());
      check(`${row.key}: click NAVIGATED (${row.href})`, landedOk(row.key, row.href, url), url.pathname + url.search);
    }

    check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  } finally {
    try {
      const rows = (await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json()) as { id: number }[];
      for (const r of Array.isArray(rows) ? rows : []) {
        await rest(`/members_roles?org_id=eq.${r.id}`, { method: "DELETE" }).catch(() => {});
        await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
      }
      const list = (await (await admin(`/users?page=1&per_page=100`)).json()) as { users?: { id: string; email: string }[] };
      const u = (list.users ?? []).find((x) => x.email === TEST_EMAIL);
      if (u) await admin(`/users/${u.id}`, { method: "DELETE" });
    } catch (e) {
      console.log("cleanup issue:", String(e).slice(0, 200));
    }
    await browser.close();
  }

  console.log(
    failures.length === 0 ? "\nALL CHECKS PASSED" : `\n${failures.length} FAILURE(S): ${failures.join(", ")}`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
