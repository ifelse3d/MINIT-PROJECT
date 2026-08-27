// ---------------------------------------------------------------------------
// npm run status  —  "现在到底做了什么，还没做什么"
//
// WHY THIS EXISTS (2026-08-19/20)
// Twice in one evening a handover document told J to do something he had
// already done that afternoon: swap the Gemini key, and paste two migrations.
// Both times the document was believed instead of the system. STATE.md already
// warned that "what we run today" is an assumption unless a command answers it
// — this extends that rule to the TO-DO LIST, which decays the same way and is
// harder to notice: a finished item left on the list only wastes time, but an
// unfinished item that falls off gets assumed done.
//
// So: every line below is asked, not remembered. Nothing here is copied from a
// document. Two kinds of answer, never mixed up:
//
//   [机器]  checked just now, by this program
//   [人眼]  a human looked at a screen on a date — no API reports it
//
// Read-only throughout (CLAUDE.md D8: Claude only runs pure selects). It never
// prints a key.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHAMPION = String.raw`C:\dev\minit-champion-overnight-20260813`;

// Plain ASCII, no colour codes. A double-clicked .bat on a machine where ANSI
// is off prints the escape sequences literally, and "[32mOK[0m" is worse
// than no colour at all.
const ok = (s) => "  [ 做了 ]  " + s;
const no = (s) => "  [ 没做 ]  " + s;
const eye = (s) => "  [ 人眼 ]  " + s;
const head = (s) => "\n" + s + "\n" + "-".repeat(58);
const mark = (b, s) => (b ? ok(s) : no(s));

function git(args, cwd = ROOT) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function readEnv() {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(path.join(ROOT, ".env.local"), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.trimStart().startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

/** Does this file contain this marker? Used to prove a feature is really wired
 *  in, rather than trusting a changelog entry about it. */
function has(rel, needle) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8").includes(needle);
  } catch {
    return false;
  }
}

const env = readEnv();

/** Ask PostgREST whether a table (and optionally a column) really exists.
 *  service_role bypasses RLS, so this proves the SHAPE of the schema and
 *  nothing about the policies on it — said out loud below, not glossed over. */
async function dbHas(table, select = "*") {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/${table}?select=${select}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return res.ok;
  } catch {
    return null;
  }
}

async function geminiAlive() {
  const key = env.GEMINI_API_KEY;
  if (!key) return { alive: false, models: 0 };
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { alive: false, models: 0 };
    const b = await res.json();
    return { alive: true, models: (b.models ?? []).length };
  } catch {
    return { alive: false, models: 0 };
  }
}

console.log("============================================================");
console.log("  MINIT · 现在到底是什么状态");
console.log("============================================================");
console.log("每一行都是刚刚问出来的，不是从文件抄的。");
console.log("[ 做了 ] / [ 没做 ] = 这支程式刚刚查到的事实");
console.log("[ 人眼 ]           = 没有 API 回报得了，只有人看得到（附日期）");
console.log(new Date().toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" }) + " MYT");

// --- A. git -----------------------------------------------------------------
console.log(head("A · GIT —— 东西上到 GitHub 了没有"));
for (const [label, cwd] of [
  ["minit    ", ROOT],
  ["champion ", CHAMPION],
]) {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
  if (!upstream) {
    console.log(no(`${label} ${branch} —— 没有 upstream，从来没 push 过`));
    continue;
  }
  const ahead = git(["rev-list", "--count", `${upstream}..HEAD`], cwd) || "?";
  const behind = git(["rev-list", "--count", `HEAD..${upstream}`], cwd) || "?";
  const clean = ahead === "0" && behind === "0";
  console.log(
    mark(clean, `${label} ${branch}  →  ${clean ? "跟 GitHub 一模一样" : `本机多 ${ahead} 支 / 远端多 ${behind} 支`}`),
  );
}
const dirty = git(["status", "--porcelain=v1", "--", "src/", "supabase/", "scripts/"])
  .split("\n")
  .filter(Boolean);
console.log(
  dirty.length === 0
    ? ok("  程式码没有未 commit 的改动")
    : eye(
        `还有 ${dirty.length} 个程式档没 commit：\n` +
          dirty.map((l) => "             " + l.trim()).join("\n"),
      ),
);

// --- B. database ------------------------------------------------------------
console.log(head("B · 资料库 —— migration 套了没有"));
const glossaryTable = await dbHas("org_glossary", "term,action,translation,note");
const officialCol = await dbHas("committee_roster", "name_official");
if (glossaryTable === null) {
  console.log(eye("  读不到 .env.local 的 Supabase 设定，这一节跳过"));
} else {
  console.log(mark(glossaryTable, "20260819000000_org_glossary       —— org_glossary 表 ＋ 四个栏位"));
  console.log(mark(officialCol, "20260819010000_committee_official —— committee_roster.name_official"));
  console.log(
    eye("service_role 会绕过 RLS，所以上面证明不了 policy。要确定，跑这一句（唯读）：\n" +
      "             select policyname, cmd from pg_policies\n" +
      "             where schemaname='public' and tablename='org_glossary'\n" +
      "             order by policyname;      → 四行就是齐的"),
  );
}

// --- C. AI ------------------------------------------------------------------
console.log(head("C · AI —— key、分流、付费层"));
const g = await geminiAlive();
console.log(mark(g.alive, `Gemini key 是活的 —— GET /v1beta/models 看得到 ${g.models} 个模型`));
console.log(mark(!!env.OPENAI_API_KEY, "OPENAI_API_KEY 在 .env.local 里"));
for (const k of ["AI_MODEL_EXTRACT", "AI_MODEL_CHAT", "AI_MODEL_CLASSIFY", "AI_MODEL_LONG_DOC"]) {
  const v = env[k] ?? "";
  // A value without a colon is silently ignored by resolveModel() and falls
  // back to Gemini — the exact trap `npm run check:ai` was written to catch.
  console.log(mark(v.includes(":"), `${k.padEnd(18)} = ${v || "(没设)"}`));
}
console.log(
  eye("Gemini 付费层 = *** Tier 1 *** —— J 2026-08-20 在 AI Studio 画面上确认，\n" +
    "             Spend 页有真实费用（RM0.12，8/18 与 8/19 各一笔）。\n" +
    "             没有任何 API 会回报 tier，所以这一条只能靠人眼。要重验：\n" +
    "             aistudio.google.com → Usage & Billing → 标题旁边那个徽章。"),
);
console.log("             详细分流请跑：npm run check:ai");

// --- D. the six ------------------------------------------------------------
// Each one is proved by looking for the thing itself, never by trusting a
// changelog line about it. STATE.md's own rule: grep the caller, do not read
// the comment next to it.
console.log(head("D · J 2026-08-19 点名的六件"));

// Each row: [label, done, undoneNote (printed only while NOT done),
//            doneCaveat (printed only when done — for half-done truths)].
// 2026-08-27: the old single `note` printed "还没开始…" under items whose
// probe had since turned true (⑤⑥), and ② probed the retired v2/ shell path
// while the code lives in v3/ — three false "没做/还没开始" in one morning.
const six = [
  ["① 汇入失败给出路", has("src/app/api/import-roster/route.ts", 'form.get("text")') &&
    has("src/app/members/members-form.tsx", "readPastedWithAi"), "", ""],
  ["② 单一机构不讲「切换」", has("src/components/v3/org-chip.tsx", "soleOrg"),
    "v3/org-chip.tsx 没有 soleOrg 分支", ""],
  ["③ 缺 IC 姓名的人数", has("src/app/members/page.tsx", "missingOfficial"),
    "members/page.tsx 没有 missingOfficial",
    "只做了「数」这一半。「申报前挡下来」没做 —— 没有地方可以挂，见 STATE 第 6 节"],
  ["④ Save as draft", has("src/app/minutes/actions.ts", "saveMinutesDraft") ||
    has("src/lib/minutes-draft.ts", "saveMinutesDraft"),
    "还没开始 · 约一天 · 很可能要一支 migration", ""],
  ["⑤ 邀请成员 P1-1", (await dbHas("invites", "id")) === true,
    "invites 表不在库里 —— migration 20260902000000_invites_and_org_type 还没套", ""],
  ["⑥ ai_usage 分到人", (await dbHas("ai_usage", "user_id")) === true,
    "ai_usage.user_id 栏位不在库里 —— 要一支小 migration", ""],
];
for (const [label, done, undoneNote, doneCaveat] of six) {
  console.log(mark(done, label + (done || !undoneNote ? "" : "   ← " + undoneNote)));
  if (done && doneCaveat) console.log("         ⚠ " + doneCaveat);
}

// --- E. competition ---------------------------------------------------------
console.log(head("E · 竞赛证据 —— 这才是会变成分数的东西"));
let shots = [];
try {
  shots = fs
    .readdirSync(path.join(ROOT, "competition", "screenshots"))
    .filter((f) => f.toLowerCase() !== "readme.md");
} catch {
  /* folder missing */
}
console.log(mark(shots.length > 0, `competition/screenshots/ —— ${shots.length} 张（README 不算）`));
console.log(eye("Live URL（Vercel）—— https://minit-project.vercel.app 已上线（2026-08-27 验证过）。\n" +
  "             push 后线上像旧版？两个坑都记在 STATE 第 6 节 8-27 段：\n" +
  "             ① Deployment Blocked（非 ifelse3d 署名/推送）② build cache 端出旧 CSS。\n" +
  "             剩下的人工活：把这个 URL 写进竞赛材料"));
console.log(eye("利害关系人访谈 —— 补 Commercial 那 25 分（现在 5/25，五项最低），不用写程式"));
console.log(eye("真实手写 eval —— 现在是必跑的：填了词库的 org 走的不是量到 95.2% 的那支 prompt"));

const daysLeft = Math.ceil((new Date("2026-08-31T23:59:00+08:00") - Date.now()) / 86400000);
console.log(head(`⏳ 距离竞赛截止 2026-08-31 23:59 MYT 还有 ${daysLeft} 天`));
console.log("   程式码已经是「可以交」的水准。再多的功能都不会变成分数。");
console.log("");
