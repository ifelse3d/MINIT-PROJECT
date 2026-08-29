// E3 (工作单 64): the AI suggestion cards, proven through the real UI against
// local `next start` + the real DB. Zero AI cost (typing is the no-quota
// path). Content is BM so the BM save-guard never trips (its own unit tests
// cover the guard).
//
// What it proves:
//   * a typed, confirmed meeting (one appointed Bendahari + two dated
//     resolutions) → saving lands on the finished-document page and the
//     suggestion cards appear: 加进理事名单 + 加进日历, each with its
//     "因为会议记录写了" source line (拍板 5);
//   * confirming the member card writes committee_roster through the
//     EXISTING addCommitteeMember path (row checked over REST), and after a
//     reload the card is gone — the roster itself is the dedupe;
//   * confirming an event card writes events_meetings through saveEvent
//     (row checked over REST: right title, right Malaysian day);
//   * ignoring a card hides it, says 已忽略, and — with migration 36 NOT
//     applied on this DB — the fail-open story holds: the "migration 36"
//     plain-language note shows, and the dismissal survives a reload via
//     this device's localStorage;
//   * zero rows in ai_usage (no vendor was ever involved).
//
//   node scripts/probe-e3-64.mjs
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
const TEST_EMAIL = "zzz-probe-e3@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ PROBE E3 建议卡（可删）";

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

/** Edit ONE FieldRow: press its edit button, fill the editor, press 保存. */
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

/** Click a button inside the suggestion card that mentions `cardText`.
 *  Only the NEAREST rounded-md ancestor (the per-card box) is tested — the
 *  outer Card wraps EVERY card, so walking further up would match a button
 *  from the wrong card (this probe's first run did exactly that). */
async function clickCardButton(page, cardText, buttonText) {
  return page.evaluate(
    ({ cardText, buttonText }) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const b of buttons) {
        if (!(b.textContent ?? "").includes(buttonText)) continue;
        let node = b.parentElement;
        while (node && node !== document.body) {
          if (node.className?.includes?.("rounded-md")) {
            if (node.textContent?.includes(cardText)) {
              b.click();
              return true;
            }
            break; // nearest card box only — never the shared outer Card
          }
          node = node.parentElement;
        }
      }
      return false;
    },
    { cardText, buttonText },
  );
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

  // --- typed committee minutes: 1 appointment + 2 dated resolutions --------
  const year = new Date().getFullYear();
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await clickByText(page, "button", "自己打字");
  await new Promise((r) => setTimeout(r, 800));

  const typeOk = await editRow(page, "会议类型", async () => {
    await page.evaluate(() => {
      const sel = [...document.querySelectorAll("select")].find((s) =>
        [...s.options].some((o) => o.value === "committee"),
      );
      if (!sel) return;
      sel.value = "committee";
      sel.dispatchEvent(new Event("input", { bubbles: true }));
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  check("meeting type set", typeOk);
  const dateOk = await editRow(page, "会议日期", async () => {
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
  check("meeting date set", dateOk);
  const venueOk = await editRow(page, "会议地点", async () => {
    await page.keyboard.type("Dewan Probe E3");
  });
  check("venue set", venueOk);

  // Two resolutions with explicit dates (one to confirm, one to ignore).
  // The section is a collapsed StepGroup until its header is pressed —
  // children are not in the DOM while it is closed.
  const openRes = await clickByText(page, "button", "做了什么决定");
  check("resolutions group expanded", openRes);
  await new Promise((r) => setTimeout(r, 400));
  const addRes1 = await clickByText(page, "button", "自己加一条决议");
  check("add-resolution button found", addRes1);
  await new Promise((r) => setTimeout(r, 500));
  const res1 = await editRow(page, "决议 1", async () => {
    await page.keyboard.type(`Mesyuarat AJK akan datang 20 Disember pukul 8 malam`);
  });
  check("resolution 1 typed (next meeting, 20 Dis)", res1);
  await clickByText(page, "button", "自己加一条决议");
  await new Promise((r) => setTimeout(r, 500));
  const res2 = await editRow(page, "决议 2", async () => {
    await page.keyboard.type(`Gotong-royong dewan 15/11`);
  });
  check("resolution 2 typed (gotong-royong 15/11)", res2);

  // One office bearer — the appointment the minutes record. Same collapsed
  // StepGroup story.
  const openBearers = await clickByText(page, "button", "职位与人名");
  check("bearers group expanded", openBearers);
  await new Promise((r) => setTimeout(r, 400));
  const addBearer = await clickByText(page, "button", "自己加一个职位");
  check("add-position button found", addBearer);
  await new Promise((r) => setTimeout(r, 500));
  const posOk = await editRow(page, "职位 1", async () => {
    await page.keyboard.type("Bendahari");
  });
  check("bearer position typed", posOk);
  const whoOk = await editRow(page, "是谁", async () => {
    await page.keyboard.type("ZZZ Melati Probe");
  });
  check("bearer name typed", whoOk);

  // Attendance (D30: zero attendance blocks saving).
  await page.goto(`${BASE}/minutes/attendance`, { waitUntil: "networkidle2" });
  await page.type('input[placeholder*="打一个名字"]', "Hadir Satu");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 800));

  // --- save → the finished-document page -----------------------------------
  await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 800));
  await clickByText(page, "button", "保存到历史");
  await new Promise((r) => setTimeout(r, 5000));
  const onDocPage = /\/minutes\/history\/\d+$/.test(page.url().replace(/\/$/, ""));
  check("save lands on the finished-document page", onDocPage, page.url());
  const docUrl = page.url();

  // The finished document's own <pre> repeats every resolution word for
  // word, so all card assertions read ONLY the suggestion box.
  const cardsText = () =>
    page.evaluate(
      () =>
        document.querySelector('[data-probe="suggestion-cards"]')?.textContent ?? "",
    );
  let cards = await cardsText();
  check("suggestion card area appears", cards.includes("从这份会议记录读到的建议"));
  check("member card proposes the Bendahari", cards.includes("ZZZ Melati Probe"));
  check(
    "member card shows the appointment-date sentence",
    cards.includes("任命日期会填"),
  );
  check(
    "event card proposes the next meeting (20 Dis)",
    cards.includes("Mesyuarat AJK akan datang"),
  );
  check("event card proposes the gotong-royong (15/11)", cards.includes("Gotong-royong"));
  check("every card carries its source line (拍板 5)", cards.includes("因为会议记录写了"));
  check(
    "fail-open: the migration 36 note shows on this behind DB",
    cards.includes("migration 36"),
  );

  // --- ignore the gotong-royong card ---------------------------------------
  const ignored = await clickCardButton(page, "Gotong-royong", "忽略");
  check("ignore button pressed", ignored);
  await new Promise((r) => setTimeout(r, 2500));
  cards = await cardsText();
  check("ignored card is gone", !cards.includes("Gotong-royong"));
  check("the ignored count line shows (留痕可见)", cards.includes("已忽略 1 条"));

  // --- confirm the member card ---------------------------------------------
  const memberOk = await clickCardButton(page, "ZZZ Melati Probe", "确认加入");
  check("member confirm pressed", memberOk);
  await new Promise((r) => setTimeout(r, 4000));
  cards = await cardsText();
  check("member card acknowledges with a roster link", cards.includes("去名册看看"));
  const roster = await (
    await rest(
      `/committee_roster?org_id=eq.${orgId}&select=person_name,position,term_start`,
    )
  ).json();
  check(
    "committee_roster row written through the EXISTING action",
    Array.isArray(roster) &&
      roster.some(
        (r) =>
          r.person_name === "ZZZ Melati Probe" &&
          r.position === "Bendahari" &&
          r.term_start === `${year}-06-20`,
      ),
    JSON.stringify(roster),
  );

  // --- confirm the next-meeting event card ---------------------------------
  const eventOk = await clickCardButton(page, "Mesyuarat AJK akan datang", "确认加入");
  check("event confirm pressed", eventOk);
  await new Promise((r) => setTimeout(r, 4000));
  cards = await cardsText();
  check("event card acknowledges with a calendar link", cards.includes("去日历看看"));
  const events = await (
    await rest(`/events_meetings?org_id=eq.${orgId}&select=title,starts_at,time_text`)
  ).json();
  const savedEvent = (Array.isArray(events) ? events : []).find((e) =>
    (e.title ?? "").includes("Mesyuarat AJK akan datang"),
  );
  check(
    "events_meetings row written through saveEvent",
    Boolean(savedEvent) && String(savedEvent.starts_at).startsWith(`${year}-12-19T16:00`),
    JSON.stringify(events),
  );
  check(
    "the time rode along as written",
    savedEvent?.time_text === "pukul 8",
    savedEvent?.time_text ?? "(none)",
  );

  // --- reload: confirmed cards stay gone (dedupe), ignored stays hidden ----
  await page.goto(docUrl, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2500));
  cards = await cardsText();
  check(
    "after reload the confirmed member card is gone (roster is the dedupe)",
    !cards.includes("加进理事名单"),
  );
  check(
    "after reload the confirmed event card is gone (calendar is the dedupe)",
    !cards.includes("加进日历"),
  );
  check(
    "after reload the ignored card stays hidden (localStorage fail-open)",
    !cards.includes("Gotong-royong"),
  );

  // --- zero AI involvement --------------------------------------------------
  const usage = await (await rest(`/ai_usage?org_id=eq.${orgId}&select=id`)).json();
  check("zero ai_usage rows (no vendor call anywhere)", (usage ?? []).length === 0);

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
          `/suggestion_marks?org_id=eq.${orgId}`,
          `/minutes_docs?org_id=eq.${orgId}`,
          `/committee_roster?org_id=eq.${orgId}`,
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
