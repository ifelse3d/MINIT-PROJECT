// PROBE — work order 82 K1: the prepared-answer layer answers the "Try
// asking" chips for FREE — zero vendor calls, zero quota — in all three
// languages, on BOTH surfaces (home box + floating panel).
//
// The acceptance line from the order: chips 逐顆點過去 ai_usage 0 行；三語各驗.
// Also exercises the new confirm-first Clear (K2) once.
//
// ZZZ org + user, deleted at the end. ZERO AI (that is the whole point).
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

const TEST_EMAIL = "zzz-probe-k1-82@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ K1 免费问答测试（可删）";
const BASE = "http://localhost:3000";

// Must mirror SUGGESTED_QUESTIONS (prepared-answers.ts) — the unit tests pin
// the matcher; this probe pins the WIRING (chip → free bubble on screen).
const CHIPS = [
  {
    bm: "Bila saya kena hantar Penyata Tahunan?",
    zh: "年度呈报什么时候要交？",
    en: "When do I file the Annual Return?",
    href: "/filings?dari=ai",
  },
  {
    bm: "Di mana saya buat resit?",
    zh: "在哪里做收据？",
    en: "Where do I make receipts?",
    href: "/money/receipts?dari=ai",
  },
  {
    bm: "Apa itu e-Invois?",
    zh: "e-Invois 是什么？",
    en: "What is e-Invois?",
    href: "/money/einvois?dari=ai",
  },
];
const FREE_NOTE = {
  bm: "kuota AI tidak digunakan",
  zh: "不扣 AI 用量",
  en: "no AI allowance used",
};

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

async function ensureUser() {
  const list = await (await admin(`/users?page=1&per_page=100`)).json();
  const existing = (list.users ?? []).find((u) => u.email === TEST_EMAIL);
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

async function sweepLeftovers() {
  const rows = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)).json();
  for (const r of Array.isArray(rows) ? rows : []) {
    await rest(`/orgs?id=eq.${r.id}`, { method: "DELETE" });
  }
}

/** The newest assistant bubble in the HOME flow (outside the panel). */
async function lastHomeBubble(page) {
  return page.evaluate(() => {
    const bubbles = Array.from(
      document.querySelectorAll("section div.self-start"),
    ).filter((n) => n.closest("aside") === null);
    const last = bubbles[bubbles.length - 1];
    if (!last) return null;
    const link = last.querySelector("a[href]");
    return { text: last.textContent ?? "", href: link ? link.getAttribute("href") : null };
  });
}

/** The newest assistant bubble INSIDE the panel. */
async function lastPanelBubble(page) {
  return page.evaluate(() => {
    const aside = document.querySelector("aside aside") ?? document.querySelector("aside");
    if (!aside) return null;
    const bubbles = Array.from(aside.querySelectorAll("div.self-start"));
    const last = bubbles[bubbles.length - 1];
    if (!last) return null;
    const link = last.querySelector("a[href]");
    return { text: last.textContent ?? "", href: link ? link.getAttribute("href") : null };
  });
}

async function setLang(page, lang) {
  await page.evaluate((l) => {
    localStorage.setItem("minit.lang.v2", l);
    document.cookie = `minit-lang=${l};path=/`;
  }, lang);
}

async function run() {
  await sweepLeftovers();
  const userId = await ensureUser();
  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu"],
  });
  let orgId = null;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45000);
    await page.setViewport({ width: 1280, height: 950 });
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
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
      page.click('button[type="submit"]'),
    ]);
    await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
    await page.type('input[name="name"]', ORG_NAME);
    const createBtns = await page.$$("button");
    for (const b of createBtns) {
      const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
      if (t.includes("创建组织")) { await b.click(); break; }
    }
    await new Promise((r) => setTimeout(r, 6000));
    const orgRows = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)).json();
    orgId = orgRows?.[0]?.id ?? null;
    check("org created + id found", orgId !== null, String(orgId));

    // ---- HOME box: all 3 chips × all 3 languages -------------------------
    for (const lang of ["zh", "bm", "en"]) {
      // A fresh conversation per language (chips only show on an empty flow).
      await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
      await setLang(page, lang);
      await page.evaluate((key) => localStorage.removeItem(key), `minit:${userId}:${orgId}:chat.home.v1`);
      await page.reload({ waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 800));

      for (let i = 0; i < CHIPS.length; i++) {
        const chip = CHIPS[i];
        if (i === 0) {
          // The real gesture once per language: tap the chip, press Ask.
          const chipBtns = await page.$$("section button");
          let clicked = false;
          for (const b of chipBtns) {
            const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
            if (t === chip[lang]) { await b.click(); clicked = true; break; }
          }
          check(`home ${lang}: chip 1 present + tapped`, clicked);
          if (!clicked) continue;
        } else {
          // Chips only prefill — typing the same text is the same path.
          await page.click("#minit-ask-input");
          await page.type("#minit-ask-input", chip[lang]);
        }
        await page.focus("#minit-ask-input");
        await page.keyboard.press("Enter");
        await new Promise((r) => setTimeout(r, 700));
        const bubble = await lastHomeBubble(page);
        check(
          `home ${lang}: chip ${i + 1} answered instantly, marked free`,
          bubble !== null && bubble.text.includes(FREE_NOTE[lang]),
          bubble ? bubble.text.slice(0, 60) : "no bubble",
        );
        check(
          `home ${lang}: chip ${i + 1} button = whitelisted deep link`,
          bubble !== null && bubble.href === chip.href,
          bubble?.href ?? "none",
        );
      }
    }

    // ---- PANEL: the 3 chips (zh) + the confirm-first Clear (K2) ----------
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
    await setLang(page, "zh");
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 800));
    const launcher = await page.$('button[aria-label="MinitAI"]');
    check("panel: launcher present", launcher !== null);
    if (launcher) {
      await launcher.click();
      await new Promise((r) => setTimeout(r, 1200));
      for (let i = 0; i < CHIPS.length; i++) {
        const chip = CHIPS[i];
        if (i === 0) {
          const chipBtns = await page.$$("aside button");
          let clicked = false;
          for (const b of chipBtns) {
            const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
            if (t === chip.zh) { await b.click(); clicked = true; break; }
          }
          check("panel: chip 1 present + tapped", clicked);
        } else {
          await page.type("aside textarea", chip.zh);
        }
        await page.focus("aside textarea");
        await page.keyboard.press("Enter");
        await new Promise((r) => setTimeout(r, 700));
        const bubble = await lastPanelBubble(page);
        check(
          `panel: chip ${i + 1} answered instantly, marked free`,
          bubble !== null && bubble.text.includes(FREE_NOTE.zh),
        );
        check(
          `panel: chip ${i + 1} button = whitelisted deep link`,
          bubble !== null && bubble.href === chip.href,
          bubble?.href ?? "none",
        );
      }

      // K2: clearing confirms first, then really clears.
      const clearIcon = await page.$('aside button[aria-label="清除对话"]');
      check("panel: header clear icon present", clearIcon !== null);
      if (clearIcon) {
        await clearIcon.click();
        await new Promise((r) => setTimeout(r, 600));
        const dialogSeen = await page.evaluate(() =>
          Boolean(document.querySelector('[role="dialog"]')),
        );
        check("panel: clear asks first (dialog)", dialogSeen);
        const dlgBtns = await page.$$('[role="dialog"] button');
        let confirmed = false;
        for (const b of dlgBtns) {
          const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
          if (t.includes("清除对话")) { await b.click(); confirmed = true; break; }
        }
        check("panel: dialog confirm tapped", confirmed);
        await new Promise((r) => setTimeout(r, 600));
        const cleared = await page.evaluate(() => {
          const aside = document.querySelector("aside");
          return aside ? !aside.innerText.includes("不扣 AI 用量") : false;
        });
        check("panel: conversation cleared after confirm", cleared);
      }

      // K2: the ? opens the explanation popup.
      const helpBtn = await page.$('aside button[aria-label="这些用量是什么意思？"]');
      check("panel: ? icon present", helpBtn !== null);
      if (helpBtn) {
        await helpBtn.click();
        await new Promise((r) => setTimeout(r, 600));
        const modalText = await page.evaluate(
          () => document.querySelector('[role="dialog"]')?.textContent ?? "",
        );
        check("panel: ? popup explains the quota", modalText.includes("AI 用量"));
        check("panel: ? popup explains the turn reset", modalText.includes("换新对话"));
        const closeBtns = await page.$$('[role="dialog"] button');
        for (const b of closeBtns) {
          const t = (await b.evaluate((n) => n.textContent ?? "")).trim();
          if (t.includes("知道了")) { await b.click(); break; }
        }
      }
    }

    // ---- the whole point: NOTHING was charged ----------------------------
    const usage = await (await rest(`/ai_usage?org_id=eq.${orgId}&select=id,action`)).json();
    check(
      "ai_usage has ZERO rows for this org (free layer never reached a vendor)",
      Array.isArray(usage) && usage.length === 0,
      JSON.stringify(usage).slice(0, 120),
    );

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
