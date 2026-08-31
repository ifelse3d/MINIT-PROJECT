// PROBE — work order 82 K4: REAL-VENDOR acceptance of the answer-language
// rule. One conversation, three questions — BM, then ENGLISH, then CHINESE —
// with the INTERFACE set to BM the whole time. J's 8/29 complaint was exactly
// the middle case: an English question answered in Malay. The rule now says
// the reply follows the QUESTION.
//
// 💰 REAL QUOTA: 3 chat_turn actions on a ZZZ org (work order authorises
// ≤US$0.10 for chat answers). Every reply and the actual vendor cost are
// printed for the report; the language checks are stopword heuristics —
// the printed text is the real evidence.
//
// The three questions are deliberately OUTSIDE the prepared layer (that layer
// answering free is probe-k1's business) — which also proves the charged path
// still works: 自由打字問預備層外的 → 照舊走模型扣費.
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

const TEST_EMAIL = "zzz-probe-k4-82@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ K4 语言跟人走测试（可删）";
const BASE = "http://localhost:3000";

const QUESTIONS = [
  { lang: "bm", text: "Apakah maksud kuorum dalam mesyuarat agung?" },
  { lang: "en", text: "What is a proxy form used for?" },
  { lang: "zh", text: "AGM 和 EGM 有什么分别？" },
];

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

const CJK = /[\u3400-\u9FFF\uF900-\uFAFF]/;
const MS_WORDS = ["yang", "untuk", "adalah", "ialah", "anda", "boleh", "dengan", "atau", "dalam", "itu", "digunakan", "borang"];
const EN_WORDS = ["the", "is", "are", "to", "of", "for", "a", "it", "used", "form"];
function countWords(text, words) {
  const padded = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  let n = 0;
  for (const w of words) if (padded.includes(` ${w} `)) n++;
  return n;
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
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(90000);
    await page.setViewport({ width: 1280, height: 950 });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
    // Interface = BM for the whole conversation: if the model followed the
    // interface (or the history) instead of the question, the EN and ZH
    // answers would come back in Malay — the exact complaint.
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem("minit.lang.v2", "bm");
        document.cookie = "minit-lang=bm;path=/";
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

    await page.goto(`${BASE}/`, { waitUntil: "networkidle2" });
    await new Promise((r) => setTimeout(r, 900));

    const replies = [];
    for (const q of QUESTIONS) {
      const before = await page.evaluate(
        () =>
          Array.from(document.querySelectorAll("section div.self-start")).filter(
            (n) => n.closest("aside") === null,
          ).length,
      );
      await page.click("#minit-ask-input");
      await page.type("#minit-ask-input", q.text);
      await page.keyboard.press("Enter");
      // Wait for a NEW assistant bubble (vendor answers can take a while).
      let reply = null;
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        reply = await page.evaluate((prev) => {
          const bubbles = Array.from(
            document.querySelectorAll("section div.self-start"),
          ).filter((n) => n.closest("aside") === null && !(n.textContent ?? "").includes("sedang berfikir"));
          if (bubbles.length <= prev) return null;
          return bubbles[bubbles.length - 1].textContent ?? "";
        }, before);
        if (reply) break;
      }
      check(`${q.lang}: got an answer`, reply !== null);
      replies.push({ ...q, reply: reply ?? "" });
      console.log(`\n[${q.lang}] Q: ${q.text}\n[${q.lang}] A: ${(reply ?? "(none)").slice(0, 400)}\n`);
    }

    // Language of each reply (heuristics — the printed text is the evidence).
    const bm = replies.find((r) => r.lang === "bm");
    const en = replies.find((r) => r.lang === "en");
    const zh = replies.find((r) => r.lang === "zh");
    if (bm?.reply) {
      check(
        "BM question → BM answer (more Malay stopwords than English)",
        countWords(bm.reply, MS_WORDS) > countWords(bm.reply, EN_WORDS) && !CJK.test(bm.reply),
        `ms=${countWords(bm.reply, MS_WORDS)} en=${countWords(bm.reply, EN_WORDS)}`,
      );
    }
    if (en?.reply) {
      check(
        "EN question → EN answer (J's complaint case)",
        countWords(en.reply, EN_WORDS) > countWords(en.reply, MS_WORDS) && !CJK.test(en.reply),
        `en=${countWords(en.reply, EN_WORDS)} ms=${countWords(en.reply, MS_WORDS)}`,
      );
    }
    if (zh?.reply) {
      check("ZH question → ZH answer (contains CJK)", CJK.test(zh.reply));
    }

    // The charged path really charged: 3 chat_turn rows, none refunded.
    const usage = await (
      await rest(`/ai_usage?org_id=eq.${orgId}&select=action,cost_micros,refunded_at`)
    ).json();
    const chatRows = (Array.isArray(usage) ? usage : []).filter((u) => u.action === "chat_turn");
    check("ai_usage: exactly 3 chat_turn rows (free layer not involved)", chatRows.length === 3, JSON.stringify(usage).slice(0, 200));
    check("ai_usage: none refunded", chatRows.every((u) => u.refunded_at === null));
    const cost = chatRows.reduce((s, u) => s + (u.cost_micros ?? 0), 0);
    console.log(`Total vendor cost: ${cost} micros ≈ US$${(cost / 1e6).toFixed(4)}`);

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
