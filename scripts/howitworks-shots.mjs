// F-3 (work order 31): re-shoot the four "see how it works" frames against the
// CURRENT UI, using the app's own worked examples (示範 mode) so no AI quota is
// spent and no real data appears. Also prints the highlight-box rectangle for
// each frame (percent of the image) to paste into src/app/how-it-works.tsx.
//
// Run: start the dev server, then  node scripts/howitworks-shots.mjs
// Creates one clearly-labelled test user + org on the live DB (same pattern as
// scripts/screenshots.mjs / the e2e scripts) and deletes both afterwards.
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = "C:/dev/minit-v2";
const OUT = path.join(ROOT, "public/how-it-works");

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
if (!SUPA_URL || !SERVICE) {
  console.error("missing supabase env");
  process.exit(1);
}

const TEST_EMAIL = "zzz-howitworks-shots@example.com";
const TEST_PASSWORD = "Shot#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ HOWITWORKS（截图用，可删）";
const BASE = "http://localhost:3000";

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

async function ensureTestUser() {
  const res0 = await admin(`/users?page=1&per_page=100`);
  const body0 = await res0.json();
  const users = body0.users ?? body0 ?? [];
  const existing = (Array.isArray(users) ? users : []).find((u) => u.email === TEST_EMAIL);
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
  const body = await res.json();
  if (!res.ok) {
    console.error("create user failed", res.status, JSON.stringify(body).slice(0, 200));
    process.exit(1);
  }
  return body.id;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click the first button/anchor whose text contains `needle`. */
async function clickByText(page, needle, tag = "button") {
  const els = await page.$$(tag);
  for (const el of els) {
    const txt = await el.evaluate((e) => e.textContent ?? "");
    if (txt.includes(needle)) {
      await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
      await sleep(150);
      await el.click();
      return true;
    }
  }
  return false;
}

/** Percent rect of an element within the current viewport (for the CSS box). */
async function pctRect(page, el, name) {
  const vp = page.viewport();
  const box = await el.boundingBox();
  if (!box) {
    console.log(`  [${name}] no bbox`);
    return;
  }
  const pct = (v, total) => `${((v / total) * 100).toFixed(1)}%`;
  console.log(
    `  [${name}] hi: { left: "${pct(box.x, vp.width)}", top: "${pct(box.y, vp.height)}", width: "${pct(box.width, vp.width)}", height: "${pct(box.height, vp.height)}" }`,
  );
}


/** Click the first element whose trimmed text equals `text` exactly. */
async function clickByExactText(page, text, tag = "button") {
  return page.evaluate(
    ({ text, tag }) => {
      for (const el of document.querySelectorAll(tag)) {
        if ((el.textContent ?? "").trim() === text) {
          el.click();
          return true;
        }
      }
      return false;
    },
    { text, tag },
  );
}

/** Edit ONE FieldRow (same approach as e2e-minutes.mjs). */
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
  await clickByExactText(page, "保存");
  await sleep(600);
  return true;
}

async function run() {
  const userId = await ensureTestUser();
  console.log("test user ready");

  const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: "new",
    args: ["--no-first-run", "--disable-gpu", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + String(e).slice(0, 200)));
  await page.setViewport({ width: 1100, height: 800 });

  // Language: 中文, once, via the first-run picker.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await clickByText(page, "以中文使用");
  await sleep(400);

  // Sign in.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', TEST_EMAIL);
  await page.type('input[type="password"]', TEST_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 45000 }),
    page.click('button[type="submit"]'),
  ]);
  console.log("signed in, at", page.url());

  // Org.
  await page.goto(`${BASE}/orgs/new`, { waitUntil: "networkidle2" });
  await page.type('input[name="name"]', ORG_NAME);
  await clickByText(page, "创建组织");
  await sleep(6000);
  console.log("org created, at", page.url());

  // --- frame 1: the upload gate on /minutes, highlight "拍照" --------------
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await sleep(800);
  {
    let target = null;
    for (const el of await page.$$("button, label")) {
      const txt = await el.evaluate((e) => e.textContent ?? "");
      if (txt.includes("拍照") || txt.includes("拍下手写")) {
        target = el;
        break;
      }
    }
    await page.screenshot({ path: path.join(OUT, "step-1.png") });
    if (target) await pctRect(page, target, "step-1");
    console.log("step-1 saved");
  }

  // --- open the worked example (SPA click — sample state is not persisted) --
  const openedSample = await clickByText(page, "看一个做好的示范");
  console.log("sample opened:", openedSample);
  await sleep(1200);

  // --- frame 2: the flagged fields ("N 项要你核对") ------------------------
  {
    const target = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll("button, div"));
      const t = btns.find(
        (e) =>
          /要你核对/.test(e.textContent ?? "") &&
          e.getBoundingClientRect().height > 40 &&
          e.getBoundingClientRect().height < 200,
      );
      if (t) t.scrollIntoView({ block: "center" });
      return t ?? null;
    });
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, "step-2.png") });
    const el = target.asElement();
    if (el) await pctRect(page, el, "step-2");
    console.log("step-2 saved");
  }

  // --- frame 3: the confirm step on the money page --------------------------
  // §1-4 (work order 32): the in-page sample rows are GONE (the walkthrough
  // IS the demo now), so this frame highlights the CONFIRM action itself —
  // "把已确认的行加入登记" — which is what the caption describes.
  await page.goto(`${BASE}/money`, { waitUntil: "networkidle2" });
  await sleep(1200);
  {
    const target = await page.evaluateHandle(() => {
      const t =
        Array.from(document.querySelectorAll("button")).find((e) =>
          (e.textContent ?? "").includes("加入登记"),
        ) ?? null;
      if (t) t.scrollIntoView({ block: "center" });
      return t;
    });
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, "step-3.png") });
    const el = target.asElement();
    if (el) await pctRect(page, el, "step-3");
    console.log("step-3 saved");
  }

  // --- frame 4: a REAL finished document, via the typed path (no AI call) --
  // "自己打字" opens the empty editable fields — the same no-AI path the e2e
  // script uses — so the document composer has confirmed content to render.
  await page.goto(`${BASE}/minutes`, { waitUntil: "networkidle2" });
  await sleep(800);
  await clickByText(page, "自己打字");
  await sleep(800);
  await editRow(page, "会议类型", async () => {
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
    }, "2026-08-20");
  });
  await editRow(page, "会议地点", async () => {
    await page.keyboard.type("Dewan Persatuan");
  });
  await page.goto(`${BASE}/minutes/attendance`, { waitUntil: "networkidle2" });
  await clickByText(page, "没有记出席", "button, label");
  await sleep(800);
  await page.goto(`${BASE}/minutes/document`, { waitUntil: "networkidle2" });
  await sleep(1000);
  {
    // Highlight the composed document body (the BM letterhead block).
    const target = await page.evaluateHandle(() => {
      const all = Array.from(document.querySelectorAll("article, section, div, pre"));
      const t = all.find((e) => {
        const r = e.getBoundingClientRect();
        return (
          /MINIT MESYUARAT|MESYUARAT JAWATANKUASA/.test(e.textContent ?? "") &&
          r.height > 150 &&
          r.height < 800 &&
          r.width > 400 &&
          e.children.length < 30
        );
      });
      if (t) t.scrollIntoView({ block: "center" });
      return t ?? null;
    });
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, "step-4.png") });
    const el = target.asElement();
    if (el) await pctRect(page, el, "step-4");
    console.log("step-4 saved");
  }

  await browser.close();

  // Cleanup: the org rows, then the user (same as screenshots.mjs).
  const orgRes = await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`);
  const orgs = await orgRes.json();
  for (const o of Array.isArray(orgs) ? orgs : []) {
    await rest(`/members_roles?org_id=eq.${o.id}`, { method: "DELETE" });
    const del = await rest(`/orgs?id=eq.${o.id}`, { method: "DELETE" });
    console.log("delete org", o.id, del.status);
  }
  const delUser = await admin(`/users/${userId}`, { method: "DELETE" });
  console.log("delete user:", delUser.status);
  console.log("page errors:", consoleErrors.length);
  for (const e of consoleErrors.slice(0, 8)) console.log("  -", e);
}

run().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
