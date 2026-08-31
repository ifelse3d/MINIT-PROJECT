// PROBE — work order 82 K3: the phone chat panel, reworked. At 375×812:
//   * no horizontal overflow (page or panel),
//   * after sending a question the ANSWER is visible and uncovered,
//   * the deep-link button inside the answer is really clickable (navigates),
//   * the input stays on screen,
//   * the meter row's ? popup opens and closes inside the viewport.
// The question sent is a prepared-layer chip → zero AI.
// What headless CANNOT verify: the real on-screen keyboard (the dvh sheet
// shrink is design-reasoned, not machine-proven) — reported honestly.
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

const TEST_EMAIL = "zzz-probe-k3-82@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ K3 手机面板测试（可删）";
const BASE = "http://localhost:3000";

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}

async function admin(p, opts = {}) {
  return fetch(`${SUPA_URL}/auth/v1/admin${p}`, {
    ...opts,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
}
async function rest(p, opts = {}) {
  return fetch(`${SUPA_URL}/rest/v1${p}`, {
    ...opts,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(opts.headers ?? {}) },
  });
}

async function run() {
  // sweep + user
  const rows0 = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
  for (const r of Array.isArray(rows0) ? rows0 : []) await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
  const list0 = await (await admin(`/users?page=1&per_page=100`)).json();
  let userId = (list0.users ?? []).find((u) => u.email === TEST_EMAIL)?.id;
  if (userId) {
    await admin(`/users/${userId}`, { method: "PUT", body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }) });
  } else {
    const res = await admin(`/users`, { method: "POST", body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, email_confirm: true }) });
    userId = (await res.json()).id;
  }

  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("minit.lang.v2", "zh");
        document.cookie = "minit-lang=zh;path=/";
      } catch {}
    });

    // sign in + org (desktop first: the create form is easier there)
    await page.setViewport({ width: 1280, height: 900 });
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
    const btns = await page.$$("button");
    for (const b of btns) {
      const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
      if (t.includes("创建组织")) { await b.click(); break; }
    }
    await new Promise((r) => setTimeout(r, 6000));

    // ---- the phone ------------------------------------------------------
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 900));

    const launcher = await page.$('button[aria-label="MinitAI"]');
    check("launcher present", launcher !== null);
    if (!launcher) throw new Error("no launcher");
    await launcher.click();
    await new Promise((r) => setTimeout(r, 1400));

    // The sheet's usable height: it should take (almost) the whole screen.
    const sheetBox = await page.evaluate(() => {
      const aside = document.querySelector("aside.v2-glass");
      if (!aside) return null;
      const r = aside.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
    });
    check("sheet fills the room under the top bar (≥ 700px on 812px screen)", sheetBox !== null && sheetBox.height >= 700, JSON.stringify(sheetBox));

    // No horizontal overflow, page or panel.
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      panel: (() => {
        const aside = document.querySelector("aside.v2-glass");
        return aside ? aside.scrollWidth - aside.clientWidth : -1;
      })(),
    }));
    check("no page horizontal overflow", overflow.doc <= 375, `scrollWidth ${overflow.doc}`);
    check("no panel horizontal overflow", overflow.panel <= 0, String(overflow.panel));

    // Send a prepared-layer chip question (free) via the real input.
    const chipBtns = await page.$$("aside button");
    let tapped = false;
    for (const b of chipBtns) {
      const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
      if (t === "在哪里做收据？") { await b.click(); tapped = true; break; }
    }
    check("chip tapped", tapped);
    await page.focus("aside textarea");
    await page.keyboard.press("Enter");
    await new Promise((r) => setTimeout(r, 800));

    // The answer is VISIBLE (J's screenshot showed it squeezed to a slit).
    const answer = await page.evaluate(() => {
      const aside = document.querySelector("aside.v2-glass");
      if (!aside) return null;
      const bubbles = Array.from(aside.querySelectorAll("div.self-start"));
      const last = bubbles[bubbles.length - 1];
      if (!last) return null;
      const r = last.getBoundingClientRect();
      const midX = r.left + r.width / 2;
      const midY = Math.min(r.top + 40, r.top + r.height / 2);
      const el = document.elementFromPoint(midX, midY);
      return {
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        visiblePx: Math.min(r.bottom, innerHeight) - Math.max(r.top, 0),
        uncovered: Boolean(el && (last.contains(el) || el === last)),
      };
    });
    check("answer bubble visible (≥ 200px of it on screen)", answer !== null && answer.visiblePx >= 200, JSON.stringify(answer));
    check("answer bubble NOT covered by anything", answer !== null && answer.uncovered);

    // The input stays on screen next to the answer.
    const inputBox = await page.evaluate(() => {
      const ta = document.querySelector("aside textarea");
      if (!ta) return null;
      const r = ta.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, onScreen: r.top >= 0 && r.bottom <= innerHeight };
    });
    check("input on screen", inputBox !== null && inputBox.onScreen, JSON.stringify(inputBox));

    // The ? popup opens inside the viewport and closes.
    const helpBtn = await page.$('aside button[aria-label="这些用量是什么意思？"]');
    check("? icon present", helpBtn !== null);
    if (helpBtn) {
      await helpBtn.click();
      await new Promise((r) => setTimeout(r, 600));
      const modal = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        if (!d) return null;
        const r = d.getBoundingClientRect();
        return { fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight + 1, text: (d.textContent ?? "").slice(0, 40) };
      });
      check("? popup fits the phone viewport", modal !== null && modal.fits, JSON.stringify(modal));
      const dlgBtns = await page.$$('[role="dialog"] button');
      for (const b of dlgBtns) {
        const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
        if (t.includes("知道了")) { await b.click(); break; }
      }
      await new Promise((r) => setTimeout(r, 400));
      const gone = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
      check("? popup closes", gone);
    }

    // The deep-link button inside the answer really navigates (phone sheet
    // closes on navigate — the I3 regression stays covered by probe-i3-81).
    const link = await page.evaluateHandle(() => {
      const aside = document.querySelector("aside.v2-glass");
      const links = aside ? Array.from(aside.querySelectorAll('a[href*="receipts"]')) : [];
      return links[links.length - 1] ?? null;
    });
    const linkEl = link.asElement();
    check("answer's deep-link present", linkEl !== null);
    if (linkEl) {
      await linkEl.evaluate((n) => n.scrollIntoView({ block: "center" }));
      await new Promise((r) => setTimeout(r, 400));
      const box = await linkEl.boundingBox();
      const diag = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          return Boolean(el?.closest('a[href*="receipts"]'));
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      check("deep-link uncovered at its centre", diag);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await new Promise((r) => setTimeout(r, 2500));
      check("deep-link click NAVIGATED", page.url().includes("/money/receipts"), page.url());
    }

    check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
  } finally {
    try {
      const rows = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
      for (const r of Array.isArray(rows) ? rows : []) {
        await rest(`/members_roles?org_id=eq.${r.id}`, { method: "DELETE" }).catch(() => {});
        await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
      }
      const list = await (await admin(`/users?page=1&per_page=100`)).json();
      const u = (list.users ?? []).find((x) => x.email === TEST_EMAIL);
      if (u) await admin(`/users/${u.id}`, { method: "DELETE" });
    } catch (e) {
      console.log("cleanup issue:", String(e).slice(0, 200));
    }
    await browser.close();
  }

  console.log(failures.length === 0 ? "\nALL CHECKS PASSED" : `\n${failures.length} FAILURE(S): ${failures.join(", ")}`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
