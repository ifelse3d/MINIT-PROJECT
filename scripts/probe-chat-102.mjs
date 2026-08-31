// PROBE — work order 102 Stage 1/2: J's four live-caught cases, replayed with
// J's ORIGINAL sentences through the real UI chat path.
//
//   a. 換語言:  「我看不懂英文，怎麽辦」        → should CHANGE the language
//   b. citation: same question                  → should carry ZERO citations
//   c. 口述開會: J's spoken account of a meeting → should DRAFT minutes
//   d. 按鈕:     reply buttons must not carry scary words, must deep-link
//
// Run BEFORE the fix (--before) to record the sickness, and AFTER to verify.
// 💰 REAL QUOTA on a ZZZ org: ~4-6 chat_turn + (after) 1 extract_minutes.
//
// Usage: node scripts/probe-chat-102.mjs [--before|--after]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const MODE = process.argv.includes("--before") ? "before" : "after";
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

const TEST_EMAIL = "zzz-probe-chat-102@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ 102 聊天路接脑测试（可删）";
const BASE = "http://localhost:3000";

const failures = [];
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures.push(name);
}
function note(name, extra = "") {
  console.log(`NOTE  ${name}${extra ? " — " + extra : ""}`);
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

/** Ask one question in the workbench box and wait for the new assistant turn.
 *  Returns { text, buttons[], sources[], html } of the newest assistant bubble. */
async function askInWorkbench(page, text, timeoutS = 120) {
  const before = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("section div.self-start")).filter(
        (n) => n.closest("aside") === null,
      ).length,
  );
  await page.click("#minit-ask-input");
  // type() is slow for long CJK strings; set the value via the input event.
  await page.evaluate((t) => {
    const el = document.querySelector("#minit-ask-input");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set;
    setter.call(el, t);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await page.keyboard.press("Enter");
  for (let i = 0; i < timeoutS; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const result = await page.evaluate((prev) => {
      const bubbles = Array.from(
        document.querySelectorAll("section div.self-start"),
      ).filter(
        (n) =>
          n.closest("aside") === null &&
          !/正在想|sedang berfikir|is thinking/.test(n.textContent ?? ""),
      );
      if (bubbles.length <= prev) return null;
      const b = bubbles[bubbles.length - 1];
      const buttons = Array.from(b.querySelectorAll("a,button")).map((x) => ({
        text: (x.textContent ?? "").trim(),
        href: x.getAttribute("href") ?? "",
      }));
      const sources = Array.from(b.querySelectorAll('a[href*="/minutes/history#"]')).map(
        (x) => x.getAttribute("href"),
      );
      return { text: b.textContent ?? "", buttons, sources };
    }, before);
    if (result) return result;
  }
  return null;
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
  let orgId = null;
  const record = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(90000);
    await page.setViewport({ width: 1280, height: 950 });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
    // Interface = ENGLISH, exactly J's live scene (he could not read it).
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("minit.lang.v2", "en");
        document.cookie = "minit-lang=en;path=/";
      } catch {}
    });

    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', TEST_EMAIL);
    await page.type('input[type="password"]', TEST_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
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
    for (const b of await page.$$("button")) {
      const t = ((await b.evaluate((n) => n.textContent ?? "")) || "").trim();
      if (/Cipta|创建组织|Create/i.test(t)) { await b.click(); break; }
    }
    await new Promise((r) => setTimeout(r, 6000));
    const orgRows = await (await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)).json();
    orgId = orgRows?.[0]?.id ?? null;
    check("org created + id found", orgId !== null, String(orgId));

    // Seed ONE confirmed AGM minutes doc + its embedding-free row, so the
    // citation sickness has something to drag in. (No embeddings = cariMinit
    // returns nothing; the BEFORE run therefore documents b's mechanism from
    // code + the live fallback behaviour. The b acceptance is the
    // deterministic zero-citation gate, tested in vitest as well.)

    await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 900));

    // --- case a + b: J's exact language question --------------------------
    const a = await askInWorkbench(page, "我看不懂英文，怎麽辦，是否能換話語呢");
    check("a: got an answer", a !== null);
    if (a) {
      record.push({ case: "a/b", q: "我看不懂英文，怎麽辦，是否能換話語呢", ...a });
      console.log(`\n[a] A: ${a.text.slice(0, 500)}\n[a] buttons: ${JSON.stringify(a.buttons)}\n[a] sources: ${JSON.stringify(a.sources)}\n`);
      const scary = a.buttons.some((b) => /delete|padam pertubuhan|删除/i.test(b.text));
      const uiLangNow = await page.evaluate(() => {
        try { return localStorage.getItem("minit.lang.v2"); } catch { return null; }
      });
      if (MODE === "before") {
        note("a BEFORE: interface language after answer", String(uiLangNow));
        note("a BEFORE: scary words on button", String(scary));
        note("b BEFORE: citations shown", String(a.sources.length));
      } else {
        check("a: interface switched to Chinese", uiLangNow === "zh", String(uiLangNow));
        check("a: change card with undo is shown", /已改|Sudah diubah|Changed/.test(a.text));
        check("d: no scary words on any button", !scary, JSON.stringify(a.buttons));
        check("b: zero minutes citations on a language question", a.sources.length === 0, String(a.sources.length));
      }
    }

    // --- case c: J's spoken meeting account -------------------------------
    const cText =
      "我跟你説我們剛剛開會的，你幫我做好。我們8點半集合報到，然後遊行到會所，接著大家一起吃早餐，之後上課，最後還有liveband表演。";
    const c1 = await askInWorkbench(page, cText, 180);
    check("c: got an answer to the spoken account", c1 !== null);
    if (c1) {
      record.push({ case: "c-1", q: cText, ...c1 });
      console.log(`\n[c1] A: ${c1.text.slice(0, 500)}\n[c1] buttons: ${JSON.stringify(c1.buttons)}\n`);
      if (MODE === "before") {
        note("c BEFORE: does it teach instead of work?", /上传|upload|muat naik|Home/i.test(c1.text) ? "teaches upload" : "unclear");
      } else {
        // After the fix the agent should either ask for the missing date or
        // start drafting. Answer the follow-up with the date, then expect a
        // product card.
        const asked = /日期|tarikh|date|几号|幾號|哪一天|bila/i.test(c1.text);
        note("c: agent asked a follow-up?", String(asked));
        const c2 = await askInWorkbench(page, "2026年8月30日，出席的有二十位会员。", 240);
        check("c: second turn answered", c2 !== null);
        if (c2) {
          record.push({ case: "c-2", ...c2 });
          console.log(`\n[c2] A: ${c2.text.slice(0, 600)}\n[c2] buttons: ${JSON.stringify(c2.buttons)}\n`);
          // The finished piece: a product card in the conversation. The
          // dictation extraction runs AFTER the reply lands — wait for it.
          let hasCard = false;
          for (let i = 0; i < 90 && !hasCard; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            hasCard = await page.evaluate(
              () => document.querySelectorAll('[data-probe="product-card"]').length > 0,
            );
          }
          check("c: a minutes product card appeared", hasCard);
          if (!hasCard) {
            const errText = await page.evaluate(
              () =>
                Array.from(document.querySelectorAll("section p"))
                  .map((n) => n.textContent ?? "")
                  .filter((s) => /没能|tidak dapat|could not|断了|terputus/.test(s))
                  .join(" | "),
            );
            note("c: visible error text", errText || "(none)");
          }
        }
      }
    }

    // usage rows for the report
    const usage = await (
      await rest(`/ai_usage?org_id=eq.${orgId}&select=action,cost_micros,refunded_at`)
    ).json();
    const cost = (Array.isArray(usage) ? usage : []).reduce((s, u) => s + (u.cost_micros ?? 0), 0);
    console.log(`\nai_usage rows: ${JSON.stringify(usage)}`);
    console.log(`Total vendor cost: ${cost} micros ≈ US$${(cost / 1e6).toFixed(4)}`);

    check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));

    writeFileSync(
      path.join(ROOT, `eval/reports/chat-102-${MODE}.json`),
      JSON.stringify({ mode: MODE, when: new Date().toISOString(), record, usage, costMicros: cost }, null, 2),
    );
    console.log(`\nRecord written to eval/reports/chat-102-${MODE}.json`);
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
  console.log(failures.length === 0 ? "\nALL CHECKS PASSED" : `\n${failures.length} FAILURES: ${failures.join(", ")}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
