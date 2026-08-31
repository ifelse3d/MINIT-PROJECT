// PROBE — work order 89 ①②③④⑤ acceptance, against the real next start +
// DB. ZERO AI calls; a throwaway ZZZ user + org, deleted in the finally.
//
//   ① constitution DISPLAY combing (data untouched): a book shaped like org
//     197's (inline "1.2 …" inside Fasal 1 · 8.1 with its own heading ·
//     13.2 with NO heading) renders with sub-clauses indented under their
//     parent, no "—" placeholder for the missing heading, the page line
//     shortened to "m/s X", and Fasal 1's inline 1.2 on its own indented
//     paragraph — all verbatim.
//   ② the calendar day Sheet portals INTO .v2-root (C-1 family): same
//     font as the app, and the Save button is a real primary button.
//   ③ the day form's optional boxes say （选填）, not 可以不填.
//   ⑤ the .ics download says 加入手机日历, Google Calendar unchanged.
//   ④ the upload note is ONE short line (formats moved to hover/title) —
//     checked on the home door and the minutes door.
// Screenshots land in eval/reports/proof-89-*.png.
//
//   node scripts/probe-ui-89.mjs
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
const TEST_EMAIL = "zzz-probe-ui-89@example.com";
const TEST_PASSWORD = "E2e#" + Math.random().toString(36).slice(2, 10) + "Aa1";
const ORG_NAME = "ZZZ UI 89 显示层（可删）";

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

// The org-197 shapes from J's screenshot, in miniature (fixtures, not data
// from any real org).
const CLAUSES = [
  {
    clause_no: "1",
    heading: "NAMA DAN TEMPAT URUSAN",
    text: "1.1 Pertubuhan ini dikenali dengan nama Persatuan ZZZ. 1.2 Tempat urusan pertubuhan ialah No. 12, Jalan Contoh, 41100 Klang.",
    page_ref: "muka surat 1 daripada 8",
  },
  {
    clause_no: "8",
    heading: "MESYUARAT AGUNG",
    text: "Mesyuarat agung diadakan setiap tahun.",
    page_ref: "muka surat 3 daripada 8",
  },
  {
    clause_no: "8.1",
    heading: "Kuorum",
    text: "Kuorum mesyuarat ialah satu perdua daripada jumlah ahli.",
    page_ref: "muka surat 3 daripada 8",
  },
  {
    clause_no: "13",
    heading: "PINDAAN",
    text: "Undang-undang ini boleh dipinda di mesyuarat agung.",
    page_ref: "muka surat 8 daripada 8",
  },
  {
    clause_no: "13.2",
    heading: "",
    text: "Pindaan berkuat kuasa selepas kelulusan Pendaftar.",
    page_ref: "muka surat 8 daripada 8",
  },
];

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
  // §1 (work order 104): /orgs/new opens on a FORK now — "I have the
  // constitution" or "I'll type it myself". One tap to the form these
  // scripts have always driven; a no-op wherever there is no fork.
  await page.evaluate(() =>
    document.querySelector('[data-probe="road-manual"]')?.click(),
  );
  await new Promise((r) => setTimeout(r, 250));
  await page.type('input[name="name"]', ORG_NAME);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("创建组织"),
    );
    if (b) b.click();
  });
  for (let i = 0; i < 30 && !orgId; i++) {
    await sleep(1500);
    const rows = await (
      await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id&order=id.desc&limit=1`)
    ).json();
    orgId = Array.isArray(rows) ? (rows[0]?.id ?? null) : null;
  }
  if (!orgId) throw new Error("org never appeared");
  console.log("org", orgId, "created");

  // ① seed the constitution (the same table the app writes; display only
  //    is under test, so seeding by REST is honest).
  const seed = await rest(`/constitutions`, {
    method: "POST",
    body: JSON.stringify({ org_id: orgId, clauses_json: CLAUSES }),
  });
  check("① constitution seeded", seed.status === 201, `status=${seed.status}`);

  // --- ① /constitution section 3 -------------------------------------------
  await page.goto(`${BASE}/constitution`, { waitUntil: "networkidle2" });
  await sleep(1500);
  const body1 = await page.evaluate(() => document.body.innerText);
  check("① page line shortened to m/s X", body1.includes("m/s 1") && body1.includes("m/s 8"));
  // Scoped to the clause CARDS: the identity panel legitimately quotes a
  // clause verbatim elsewhere on the page, page line included.
  const summaryHasLong = await page.evaluate(() =>
    [...document.querySelectorAll("details summary")].some((s) =>
      (s.innerText || "").includes("daripada 8"),
    ),
  );
  check(
    "① the clause cards keep the long page line in the tooltip only",
    !summaryHasLong,
  );
  const cardChecks = await page.evaluate(() => {
    const details = [...document.querySelectorAll("details")];
    const byBadge = (no) =>
      details.find((d) => {
        const badge = d.querySelector("summary span");
        return badge && badge.textContent.trim() === no;
      });
    const d81 = byBadge("8.1");
    const d132 = byBadge("13.2");
    const d1 = byBadge("1");
    let split = null;
    if (d1) {
      d1.open = true;
      const ps = [...d1.querySelectorAll("p")];
      split = {
        count: ps.length,
        secondIndented: ps[1] ? ps[1].className.includes("pl-4") : false,
        secondText: ps[1] ? ps[1].textContent.trim().slice(0, 30) : "",
      };
    }
    return {
      found: Boolean(d81 && d132 && d1),
      child81: d81 ? d81.className.includes("ml-5") : false,
      child132: d132 ? d132.className.includes("ml-5") : false,
      dash132: d132 ? (d132.querySelector("summary")?.innerText ?? "").includes("—") : true,
      split,
    };
  });
  check("① the three org-197 shapes render", cardChecks.found);
  check("① 8.1 (own heading) hangs indented under Fasal 8", cardChecks.child81);
  check("① 13.2 (no heading) hangs indented under Fasal 13", cardChecks.child132);
  check("① no — placeholder where the book has no heading", !cardChecks.dash132);
  check(
    "① Fasal 1's inline 1.2 breaks onto its own indented paragraph, verbatim",
    cardChecks.split &&
      cardChecks.split.count === 2 &&
      cardChecks.split.secondIndented &&
      cardChecks.split.secondText.startsWith("1.2 Tempat"),
    JSON.stringify(cardChecks.split),
  );
  await page.screenshot({ path: `${ROOT}/eval/reports/proof-89-clauses.png`, fullPage: true });

  // --- ② ③ ⑤ the calendar day Sheet ----------------------------------------
  // A FUTURE day, because only future items grow the add-to-calendar links
  // (⑤). Tomorrow's day-of-month; when tomorrow falls in the NEXT month the
  // ⑤ block is skipped honestly rather than clicking through month nav.
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const tomorrowSameMonth = tomorrow.getMonth() === now.getMonth();
  const dayToClick = tomorrowSameMonth ? String(tomorrow.getDate()) : "15";
  await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle2" });
  await page.evaluate((d) => {
    const re = new RegExp(`^${d}(\\D|$)`);
    // LAST match: the grid's first week can carry the previous month's tail
    // (July 31 sits in August's first row), and that day is in the past.
    const matches = [...document.querySelectorAll("button")].filter((x) =>
      re.test((x.textContent ?? "").trim()),
    );
    const b = matches[matches.length - 1];
    if (b) b.click();
  }, dayToClick);
  await page.waitForSelector('[data-slot="sheet-content"]', { timeout: 15000 });
  const sheetChecks = await page.evaluate(() => {
    const sheet = document.querySelector('[data-slot="sheet-content"]');
    const root = document.querySelector(".v2-root");
    const rootFont = root ? getComputedStyle(root).fontFamily : "";
    return {
      insideRoot: Boolean(sheet && sheet.closest(".v2-root")),
      fontMatches: sheet ? getComputedStyle(sheet).fontFamily === rootFont : false,
      font: sheet ? getComputedStyle(sheet).fontFamily.slice(0, 60) : "",
    };
  });
  check("② the day Sheet portals INTO .v2-root (C-1 family)", sheetChecks.insideRoot);
  check("② the Sheet inherits the app font (no serif fallback)", sheetChecks.fontMatches, sheetChecks.font);

  await page.evaluate(() => {
    const sheet = document.querySelector('[data-slot="sheet-content"]');
    const b = sheet && [...sheet.querySelectorAll("button")].find((x) =>
      (x.textContent ?? "").includes("给这一天加活动或笔记"),
    );
    if (b) b.click();
  });
  await page.waitForFunction(
    () => (document.body.innerText || "").includes("这一天有什么事"),
    { timeout: 10000 },
  );
  const formChecks = await page.evaluate(() => {
    const sheet = document.querySelector('[data-slot="sheet-content"]');
    const text = sheet ? sheet.innerText : "";
    const save = sheet && [...sheet.querySelectorAll('button[type="submit"]')][0];
    const bg = save ? getComputedStyle(save).backgroundColor : "";
    return {
      optional: (text.match(/（选填）/g) ?? []).length,
      oldWording: text.includes("可以不填"),
      saveBg: bg,
    };
  });
  check("③ both optional boxes say （选填）", formChecks.optional === 2, `saw ${formChecks.optional}`);
  check("③ 可以不填 is gone from the panel", !formChecks.oldWording);
  check(
    "② the Save button paints a real fill (tokens reached the portal)",
    formChecks.saveBg !== "" &&
      formChecks.saveBg !== "rgba(0, 0, 0, 0)" &&
      formChecks.saveBg !== "rgb(255, 255, 255)",
    formChecks.saveBg,
  );
  await page.screenshot({ path: `${ROOT}/eval/reports/proof-89-daypanel.png` });

  // Add an event so the export links render, then read the .ics button (⑤).
  await page.evaluate(() => {
    const sheet = document.querySelector('[data-slot="sheet-content"]');
    const input = sheet && sheet.querySelector("form input");
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(input, "Sembahyang ZZZ89");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.evaluate(() => {
    const sheet = document.querySelector('[data-slot="sheet-content"]');
    const b = sheet && [...sheet.querySelectorAll('button[type="submit"]')][0];
    if (b) b.click();
  });
  await page.waitForFunction(
    () => {
      const sheet = document.querySelector('[data-slot="sheet-content"]');
      return sheet && sheet.innerText.includes("Sembahyang ZZZ89");
    },
    { timeout: 10000 },
  );
  if (tomorrowSameMonth) {
    const icsChecks = await page.evaluate(() => {
      const sheet = document.querySelector('[data-slot="sheet-content"]');
      const links = sheet ? [...sheet.querySelectorAll("a[download]")] : [];
      const phone = links.find((a) => (a.textContent ?? "").includes("加入手机日历"));
      return {
        phoneButton: Boolean(phone),
        title: phone ? phone.getAttribute("title") : "",
        oldLabel: sheet ? sheet.innerText.includes(".ics") : true,
        googleStays: sheet ? sheet.innerText.includes("Google Calendar") : false,
        href: phone ? (phone.getAttribute("href") ?? "").slice(0, 30) : "",
        downloadName: phone ? phone.getAttribute("download") : "",
      };
    });
    check("⑤ the download says 加入手机日历", icsChecks.phoneButton);
    check("⑤ its tooltip still names iPhone / Outlook (.ics)", (icsChecks.title ?? "").includes("Outlook"));
    check("⑤ the bare .ics label is gone from the panel", !icsChecks.oldLabel);
    check("⑤ Google Calendar button unchanged", icsChecks.googleStays);
    check(
      "⑤ download behaviour untouched (data URL + minit-*.ics name)",
      icsChecks.href.startsWith("data:text/calendar") &&
        (icsChecks.downloadName ?? "").endsWith(".ics"),
      `${icsChecks.href} ${icsChecks.downloadName}`,
    );
  } else {
    console.log("[SKIP] ⑤ export-link block — tomorrow is next month; rerun any other day");
  }

  // --- ④ the two doors' upload note ----------------------------------------
  const noteOn = async (url) => {
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle2" });
    await sleep(500);
    return page.evaluate(() => {
      const el = [...document.querySelectorAll("span[title]")].find((s) =>
        (s.getAttribute("title") ?? "").includes("12MB"),
      );
      return el
        ? {
            text: el.innerText,
            title: el.getAttribute("title"),
          }
        : null;
    });
  };
  const homeNote = await noteOn("/");
  check(
    "④ home door: one short line, formats in the tooltip",
    homeNote !== null &&
      homeNote.text.includes("照片会自动缩小 · 最大 12MB") &&
      !homeNote.text.includes("PowerPoint") &&
      (homeNote.title ?? "").includes("PDF / Word / PowerPoint"),
    JSON.stringify(homeNote),
  );
  await page.screenshot({ path: `${ROOT}/eval/reports/proof-89-home-door.png` });
  const minutesNote = await noteOn("/minutes");
  check(
    "④ minutes door: same short line",
    minutesNote !== null &&
      minutesNote.text.includes("照片会自动缩小 · 最大 12MB") &&
      !minutesNote.text.includes("PowerPoint"),
    JSON.stringify(minutesNote),
  );
  await page.screenshot({ path: `${ROOT}/eval/reports/proof-89-minutes-door.png` });

  check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
}

main()
  .catch((e) => {
    console.error("PROBE ERROR:", e.message);
    failures.push("probe threw");
  })
  .finally(async () => {
    try {
      const rows = await (
        await rest(`/orgs?name=eq.${encodeURIComponent(ORG_NAME)}&select=id`)
      ).json();
      for (const r of Array.isArray(rows) ? rows : []) {
        for (const p of [
          `/constitutions?org_id=eq.${r.id}`,
          `/uploads?org_id=eq.${r.id}`,
          `/ai_usage?org_id=eq.${r.id}`,
          `/fence_usage?org_id=eq.${r.id}`,
          `/members_roles?org_id=eq.${r.id}`,
          `/orgs?id=eq.${r.id}`,
        ]) {
          await rest(p, { method: "DELETE" }).catch(() => {});
        }
      }
      if (userId) await admin(`/users/${userId}`, { method: "DELETE" }).catch(() => {});
      if (browser) await browser.close().catch(() => {});
    } catch (e) {
      console.error("cleanup error:", e.message);
    }
    console.log(
      failures.length === 0 ? "\nALL CHECKS PASSED" : `\n${failures.length} FAILURE(S): ${failures.join("; ")}`,
    );
    process.exit(failures.length === 0 ? 0 : 1);
  });
