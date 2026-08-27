/**
 * MODEL BENCH — `npm run bench` / double-click `bench-models.bat`
 * (G-1/G-2, work order 31, 拍板 45)
 *
 * Answers the question J keeps asking: **which model is accurate, and which
 * one is worth its price?** One table: accuracy × cost × CP值 per model.
 *
 *     npm run bench                       (candidates harvested automatically)
 *     npm run bench gemini:gemini-3.5-flash-lite anthropic:claude-haiku-4-5
 *     npm run bench --dry-run             (plan + cost estimate, no calls)
 *     npm run bench --mock                (validate the toolchain, ZERO vendor calls)
 *     npm run bench --yes                 (skip the confirm — for scripts, not people)
 *
 * WHERE THE CANDIDATES COME FROM (G-1): every `provider:model` spec mentioned
 * in `docs/换模型手册.md` and the AI section of `.env.example`, deduplicated —
 * then only providers whose API key is actually set in .env.local are kept.
 * Name models on the command line to override.
 *
 * COST DISCIPLINE (拍板 45): before any real call this script prints the
 * per-model and total cost ESTIMATE (price table: src/lib/unit-economics.ts
 * MODEL_PRICES, checked PRICES_CHECKED_ON) and WAITS FOR A KEYPRESS. Real runs
 * are for J's double-click; an unattended session may only use --mock.
 *
 * HOW IT AVOIDS LYING
 * It does not re-implement the eval. It sets AI_MODEL_EXTRACT and calls the
 * very same runSuite() `npm run eval` calls, so a model is selected through
 * the app's own resolveModel(). Measured cost comes from each vendor's own
 * usage numbers via the same onUsage path that prices ai_usage rows in
 * production; the static price table is only used for the up-front estimate
 * and as a clearly-marked fallback when a vendor row is unpriced.
 *
 * 🔴 WHAT THIS TABLE CANNOT TELL YOU (2026-08-22, still true)
 * Every case in eval/cases is a SYNTHETIC PRINTED .png. The product's hard job
 * is HANDWRITTEN mixed-language pages. A winner here has been shown to read
 * printed text well — nothing more. G-3 (J present, real handwriting golden
 * cases) is the run that decides anything. The table prints this warning
 * itself, every run, so it cannot be quoted without it.
 *
 * It never prints an API key.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

// --mock must influence module-load-time config (EVAL_PAUSE_MS) — set BEFORE
// the require()s below pull in eval/run-eval.
const MOCK = process.argv.includes("--mock");
if (MOCK) process.env.EVAL_PAUSE_MS = "0";

// MUST come before any src/lib/ai import — see the file for why.
import "./allow-server-only";

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  runSuite,
  setEvalProviderOverride,
  loadEnvLocal,
  REPORTS_DIR,
  ROOT,
} = require("../eval/run-eval") as typeof import("../eval/run-eval");
const { summarize } = require("../src/lib/eval-score") as typeof import("../src/lib/eval-score");
const { resolveModel, PROVIDER_KEY_ENV } =
  require("../src/lib/ai/provider") as typeof import("../src/lib/ai/provider");
const { MODEL_PRICES, PRICES_CHECKED_ON, WORK_ITEMS } =
  require("../src/lib/unit-economics") as typeof import("../src/lib/unit-economics");
const { sampleMeetingExtraction } =
  require("../src/lib/sample-data") as typeof import("../src/lib/sample-data");
const { sampleLedgerExtraction } =
  require("../src/lib/sample-ledger") as typeof import("../src/lib/sample-ledger");
/* eslint-enable @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------------------
// Candidate harvesting (G-1)
// ---------------------------------------------------------------------------

// Trailing [A-Za-z0-9] so a sentence's full stop is not swallowed into the
// model name ("...text-embedding-3-large." is prose, not a model id).
const SPEC_RE = /\b(gemini|openai|anthropic|xai):[A-Za-z0-9._-]*[A-Za-z0-9]/g;

function harvestCandidates(): string[] {
  const sources = [
    path.join(ROOT, "docs/换模型手册.md"),
    path.join(ROOT, ".env.example"),
  ];
  const seen = new Set<string>();
  for (const p of sources) {
    let text = "";
    try {
      text = readFileSync(p, "utf-8");
    } catch {
      console.log(`  (could not read ${path.basename(p)} — skipping that source)`);
    }
    for (const m of text.match(SPEC_RE) ?? []) seen.add(m);
  }
  // Embedding models cannot extract — they appear in the same files for the
  // cari_minit search feature and must not eat a bench slot (or a budget).
  return [...seen].filter((s) => !/embed/i.test(s));
}

type Row = {
  spec: string;
  ran: boolean;
  skippedBecause?: string;
  correct: number;
  totalFields: number;
  pct: number;
  invented: number;
  failedCases: number;
  caseCount: number;
  /** Measured (vendor-reported) total. null = at least one call unpriced. */
  costMicros: number | null;
  /** True when costMicros was FILLED IN from the static price table. */
  costFromTable: boolean;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
};

const usd = (micros: number) => `$${(micros / 1e6).toFixed(4)}`;

function parseArgs(argv: string[]): { specs: string[] | null; dryRun: boolean; yes: boolean } {
  const dryRun = argv.includes("--dry-run");
  const yes = argv.includes("--yes");
  const specs = argv.filter((a) => !a.startsWith("--"));
  return { specs: specs.length ? specs : null, dryRun, yes };
}

function keyStatus(spec: string): { envVar: string; present: boolean } | { error: string } {
  const [provider] = spec.split(":");
  const envVar = (PROVIDER_KEY_ENV as Record<string, string | undefined>)[provider];
  if (!envVar) {
    return { error: `unknown provider "${provider}" — see AI_PROVIDERS in src/lib/ai/provider.ts` };
  }
  return { envVar, present: Boolean(process.env[envVar]) };
}

/** Static price row for a spec's model name, or null. Estimate/fallback ONLY —
 *  measured vendor numbers always win. */
function tablePrice(spec: string): { inputPerMTok: number; outputPerMTok: number } | null {
  const model = spec.split(":")[1] ?? "";
  for (const p of Object.values(MODEL_PRICES)) {
    // MODEL_PRICES names may carry a suffix ("claude-sonnet-5 (from ...)").
    if (p.name === model || p.name.startsWith(`${model} `)) {
      return { inputPerMTok: p.inputPerMTok, outputPerMTok: p.outputPerMTok };
    }
  }
  return null;
}

/** The extract work item's token profile — the basis of the up-front estimate. */
function extractTokenProfile(): { inputTokens: number; outputTokens: number } {
  const item = WORK_ITEMS.find((w) => w.task === "extract");
  return item
    ? { inputTokens: item.inputTokens, outputTokens: item.outputTokens }
    : { inputTokens: 3_100, outputTokens: 2_200 };
}

function estimateMicros(spec: string, caseCount: number): number | null {
  const price = tablePrice(spec);
  if (!price) return null;
  const { inputTokens, outputTokens } = extractTokenProfile();
  const perCaseUsd =
    (inputTokens / 1e6) * price.inputPerMTok + (outputTokens / 1e6) * price.outputPerMTok;
  return Math.round(perCaseUsd * caseCount * 1e6);
}

async function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => rl.question(prompt, () => resolve()));
  rl.close();
}

// ---------------------------------------------------------------------------
// The mock provider (G-1 validation). Returns schema-valid fixtures, reports
// plausible fake usage through the SAME onUsage seam a vendor would, and
// never touches the network. Two fake "models" get different fake prices so
// the ranking, the CP arithmetic and the cost columns all get exercised.
// ---------------------------------------------------------------------------

function mockProviderFor(spec: string) {
  // Deterministic fake price per fake model, so rank order is stable.
  const fake = spec.endsWith("-a")
    ? { inPerM: 0.3, outPerM: 2.5 }
    : { inPerM: 0.05, outPerM: 0.4 };
  const missing = { value: "", confidence: "missing", source_ref: null };
  return {
    name: `MOCK(${spec})`,
    async extractJson(req: {
      prompt: string;
      onUsage?: (u: { inputTokens: number; outputTokens: number; costMicros: number | null }) => void;
    }): Promise<unknown> {
      const inputTokens = Math.round(req.prompt.length / 4);
      const outputTokens = 600;
      const costMicros = Math.round(
        ((inputTokens / 1e6) * fake.inPerM + (outputTokens / 1e6) * fake.outPerM) * 1e6,
      );
      req.onUsage?.({ inputTokens, outputTokens, costMicros });
      const p = req.prompt;
      if (/perlembagaan|constitution|fasal/i.test(p) && !/mesyuarat|minutes/i.test(p)) {
        return { document_title: missing, clauses: [] };
      }
      if (/You extract upcoming events/i.test(p)) {
        return { events: [] };
      }
      if (/lejar|ledger|derma/i.test(p) && !/mesyuarat|minutes/i.test(p)) {
        return JSON.parse(JSON.stringify(sampleLedgerExtraction));
      }
      return JSON.parse(JSON.stringify(sampleMeetingExtraction));
    },
  } as ReturnType<typeof import("../src/lib/ai/provider").getVisionProvider>;
}

// ---------------------------------------------------------------------------
// G-2: the CHAT question — what does ONE question cost on gpt-5-nano vs
// gpt-5.6-luna? Real token sizes from ai_usage when the database answers;
// the unit-economics assumption otherwise (marked as such). The margin story
// (order 29 §7: 73.4% was computed on nano, production runs luna) becomes two
// lines of numbers. The decision stays J's.
// ---------------------------------------------------------------------------

type ChatStats = { model: string; calls: number; avgIn: number; avgOut: number };

async function readChatUsage(): Promise<ChatStats[] | { error: string }> {
  const supaUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !service) return { error: "SUPABASE env not set" };
  try {
    const res = await fetch(
      `${supaUrl}/rest/v1/ai_usage?action=eq.chat_turn&refunded_at=is.null` +
        `&select=model,input_tokens,output_tokens&limit=2000`,
      { headers: { apikey: service, Authorization: `Bearer ${service}` } },
    );
    if (!res.ok) return { error: `ai_usage query returned ${res.status}` };
    const rows = (await res.json()) as {
      model: string | null;
      input_tokens: number | null;
      output_tokens: number | null;
    }[];
    const byModel = new Map<string, { calls: number; in: number; out: number }>();
    for (const r of rows) {
      if (!r.model || r.input_tokens == null || r.output_tokens == null) continue;
      const b = byModel.get(r.model) ?? { calls: 0, in: 0, out: 0 };
      b.calls += 1;
      b.in += r.input_tokens;
      b.out += r.output_tokens;
      byModel.set(r.model, b);
    }
    return [...byModel.entries()].map(([model, b]) => ({
      model,
      calls: b.calls,
      avgIn: Math.round(b.in / b.calls),
      avgOut: Math.round(b.out / b.calls),
    }));
  } catch (e) {
    return { error: `could not reach the database (${(e as Error).message})` };
  }
}

function chatSection(stats: ChatStats[] | { error: string }): string {
  const L: string[] = [];
  L.push("## CHAT 口徑：每問一題的成本（G-2）");
  L.push("");
  const nano = MODEL_PRICES.gpt5Nano;
  const luna = MODEL_PRICES.gpt56Luna;
  const chatItem = WORK_ITEMS.filter((w) => w.task === "chat").at(-1);
  const assumed = { avgIn: chatItem?.inputTokens ?? 2000, avgOut: chatItem?.outputTokens ?? 500 };

  let basis: string;
  let sizes: { avgIn: number; avgOut: number; calls?: number };
  if (Array.isArray(stats) && stats.length > 0) {
    // Prefer the real recorded sizes: whichever chat model has real rows.
    const best = stats.reduce((a, b) => (b.calls > a.calls ? b : a));
    sizes = best;
    basis = `ai_usage 實際記錄（${best.model}，${best.calls} 筆的平均：input ${best.avgIn} / output ${best.avgOut} tokens）`;
    L.push("實際記錄（`ai_usage`，未退款的 chat 呼叫）：");
    L.push("");
    L.push("| model | 呼叫數 | 平均 input tokens | 平均 output tokens |");
    L.push("|---|---|---|---|");
    for (const s of stats) L.push(`| \`${s.model}\` | ${s.calls} | ${s.avgIn} | ${s.avgOut} |`);
    L.push("");
  } else {
    sizes = assumed;
    const why = Array.isArray(stats) ? "ai_usage 裡沒有 chat_turn 記錄" : stats.error;
    basis = `unit-economics 的假設值（input ${assumed.avgIn} / output ${assumed.avgOut} tokens）— ${why}，拿不到真實平均`;
  }

  const per = (p: { inputPerMTok: number; outputPerMTok: number }) =>
    (sizes.avgIn / 1e6) * p.inputPerMTok + (sizes.avgOut / 1e6) * p.outputPerMTok;
  const nanoUsd = per(nano);
  const lunaUsd = per(luna);
  L.push(`同一題的大小（${basis}），兩個模型各要多少錢：`);
  L.push("");
  L.push("| CHAT model | 每題成本 (USD) | 每月 250 題 (USD) |");
  L.push("|---|---|---|");
  L.push(`| \`${nano.name}\` | $${nanoUsd.toFixed(6)} | $${(nanoUsd * 250).toFixed(2)} |`);
  L.push(`| \`${luna.name}\` | $${lunaUsd.toFixed(6)} | $${(lunaUsd * 250).toFixed(2)} |`);
  L.push("");
  L.push(
    `倍數：luna 每題 ≈ nano 的 **${(lunaUsd / nanoUsd).toFixed(1)}×**。` +
      `29 號單 §7 的毛利口徑問題就是這一行：73.4% 毛利是按 \`${nano.name}\` 算的，` +
      `而線上 AI_MODEL_CHAT 實際跑 \`${luna.name}\`。引用 73.4% 之前，要嘛把口徑改成 luna 重算，要嘛把線上換成 nano——選哪個是 J 的決定，這張表只把兩個數字擺出來。`,
  );
  L.push("");
  L.push(`（價目表 ${PRICES_CHECKED_ON} 查證，src/lib/unit-economics.ts MODEL_PRICES；引用前先確認沒漲價。）`);
  return L.join("\n");
}

// ---------------------------------------------------------------------------

async function main() {
  loadEnvLocal();
  const { specs: cliSpecs, dryRun, yes } = parseArgs(process.argv.slice(2));

  console.log(`\n=== Minit model bench ===${MOCK ? "  🧪 MOCK — no vendor is called" : ""}\n`);

  let specs: string[];
  if (MOCK) {
    specs = ["gemini:mock-model-a", "openai:mock-model-b"];
  } else if (cliSpecs) {
    specs = cliSpecs;
  } else {
    specs = harvestCandidates();
    console.log(
      `Candidates harvested from docs/换模型手册.md + .env.example: ${specs.length} spec(s).`,
    );
  }

  console.log("Line-up:");
  const runnable: string[] = [];
  const skipped: Row[] = [];
  for (const spec of specs) {
    if (MOCK) {
      console.log(`  ✓ ${spec} (mock)`);
      runnable.push(spec);
      continue;
    }
    const st = keyStatus(spec);
    if ("error" in st) {
      console.log(`  ✗ ${spec.padEnd(34)} ${st.error}`);
      skipped.push({ ...blankRow(spec), skippedBecause: st.error });
      continue;
    }
    if (!st.present) {
      const why = `${st.envVar} not set`;
      console.log(`  – ${spec.padEnd(34)} skipped (${why})`);
      skipped.push({ ...blankRow(spec), skippedBecause: why });
      continue;
    }
    console.log(`  ✓ ${spec}`);
    runnable.push(spec);
  }

  if (runnable.length === 0) {
    console.log("\nNothing to run — no key is set for any candidate.");
    console.log("Add a key to .env.local, or name models you do have keys for:");
    console.log("  npm run bench gemini:gemini-3.5-flash-lite\n");
    process.exit(1);
  }

  // --- the cost estimate, BEFORE anything is called (拍板 45) --------------
  const caseCount = 10; // eval/cases — recounted by the run itself
  console.log(`\nEstimated cost (price table ${PRICES_CHECKED_ON}, ${caseCount} cases/model):`);
  let totalEst = 0;
  let anyUnknown = false;
  for (const spec of runnable) {
    const est = MOCK ? 0 : estimateMicros(spec, caseCount);
    if (est === null) {
      anyUnknown = true;
      console.log(`  ${spec.padEnd(36)} ?  (model not in the price table)`);
    } else {
      totalEst += est;
      console.log(`  ${spec.padEnd(36)} ~${usd(est)}`);
    }
  }
  console.log(
    `  TOTAL ≈ ${usd(totalEst)}${anyUnknown ? " + unknown-price models" : ""}` +
      (MOCK ? "  (mock: nothing real is spent)" : ""),
  );
  console.log("These are REAL API calls and they cost REAL money." + (MOCK ? " (not in mock)" : ""));

  if (dryRun) {
    console.log("\n--dry-run: stopping here. Nothing was called.\n");
    return;
  }
  if (!MOCK && !yes) {
    await waitForEnter("\n按 Enter 開跑（Ctrl+C 取消）… / Press Enter to run (Ctrl+C to cancel)… ");
  } else if (MOCK) {
    console.log("\nMock run — no confirmation needed, nothing is spent.\n");
  }

  const rows: Row[] = [];
  for (const [i, spec] of runnable.entries()) {
    console.log(`\n──── [${i + 1}/${runnable.length}] ${spec} ────\n`);
    // Selecting the model by env var is deliberate: the bench goes through the
    // app's own resolveModel(), so it cannot measure a routing the app would
    // not actually use.
    process.env.AI_MODEL_EXTRACT = spec;
    setEvalProviderOverride(MOCK ? mockProviderFor(spec) : null);

    try {
      resolveModel("extract");
    } catch (e) {
      console.log(`  ✗ ${(e as Error).message}`);
      rows.push({ ...blankRow(spec), skippedBecause: "invalid spec" });
      continue;
    }

    const { outcomes } = await runSuite();
    const s = summarize(outcomes.flatMap((o) => o.results));
    const anyUnpriced = outcomes.some((o) => o.costMicros === null);
    let costMicros = anyUnpriced
      ? null
      : outcomes.reduce((a, o) => a + (o.costMicros ?? 0), 0);
    let costFromTable = false;
    if (costMicros === null) {
      // Fallback: price the MEASURED tokens from the static table, marked.
      const price = tablePrice(spec);
      if (price) {
        const inTok = outcomes.reduce((a, o) => a + o.inputTokens, 0);
        const outTok = outcomes.reduce((a, o) => a + o.outputTokens, 0);
        costMicros = Math.round(
          ((inTok / 1e6) * price.inputPerMTok + (outTok / 1e6) * price.outputPerMTok) * 1e6,
        );
        costFromTable = true;
      }
    }
    rows.push({
      spec,
      ran: true,
      correct: s.overall.correct,
      totalFields: s.overall.total,
      pct: s.overall.pct,
      invented: s.inventedCount,
      failedCases: outcomes.filter((o) => o.status === "failed").length,
      caseCount: outcomes.length,
      costMicros,
      costFromTable,
      inputTokens: outcomes.reduce((a, o) => a + o.inputTokens, 0),
      outputTokens: outcomes.reduce((a, o) => a + o.outputTokens, 0),
      elapsedMs: outcomes.reduce((a, o) => a + o.elapsedMs, 0),
    });
  }
  setEvalProviderOverride(null);

  const all = [...rows, ...skipped];
  const chat = await readChatUsage();
  const table = renderTable(all);
  const report =
    `# Minit model bench — ${new Date().toISOString()}${MOCK ? " · 🧪 MOCK RUN（工具鏈驗證，非真實量測）" : ""}\n\n` +
    `${table}\n\n${chatSection(chat)}\n`;
  console.log(`\n${table}\n`);

  mkdirSync(REPORTS_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const out = path.join(REPORTS_DIR, `model-bench-${day}${MOCK ? "-mock" : ""}.md`);
  writeFileSync(out, report, "utf-8");
  console.log(`Report saved: ${path.relative(ROOT, out)}\n`);
}

function blankRow(spec: string): Row {
  return {
    spec,
    ran: false,
    correct: 0,
    totalFields: 0,
    pct: 0,
    invented: 0,
    failedCases: 0,
    caseCount: 0,
    costMicros: null,
    costFromTable: false,
    inputTokens: 0,
    outputTokens: 0,
    elapsedMs: 0,
  };
}

/** Mechanical labels only — "the fastest horse" is a fact, "ride it" is J's call. */
function adviceFor(r: Row, rows: Row[]): string {
  const ran = rows.filter((x) => x.ran && x.totalFields > 0);
  const tags: string[] = [];
  if (r.invented > 0) tags.push("🔴 有捏造，直接出局（Hard Rule 1）");
  const cp = (x: Row) =>
    x.costMicros === null || x.costMicros === 0 ? null : x.pct / (x.costMicros / 1e6 / Math.max(1, x.caseCount));
  const maxPct = Math.max(...ran.map((x) => x.pct));
  const cps = ran.map(cp).filter((v): v is number => v !== null);
  const myCp = cp(r);
  if (r.pct === maxPct) tags.push("最準");
  if (myCp !== null && cps.length > 0 && myCp === Math.max(...cps)) tags.push("CP 值最高");
  const priced = ran.filter((x) => x.costMicros !== null && x.caseCount > 0);
  if (
    r.costMicros !== null &&
    priced.length > 0 &&
    r.costMicros / Math.max(1, r.caseCount) ===
      Math.min(...priced.map((x) => x.costMicros! / Math.max(1, x.caseCount)))
  ) {
    tags.push("最便宜");
  }
  return tags.join("・") || "—";
}

function renderTable(rows: Row[]): string {
  const L: string[] = [];
  L.push("## EXTRACT 模型排名（G-1）");
  L.push("");
  L.push("| 模型 | 準確率 | 捏造 | 每次讀取成本 | CP 值（準確率 ÷ 每案 USD） | 每案耗時 | 失敗案 | 建議 |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    if (!r.ran) {
      L.push(`| \`${r.spec}\` | — | — | — | — | — | — | skipped: ${r.skippedBecause} |`);
      continue;
    }
    const perCaseMs = r.elapsedMs / Math.max(1, r.caseCount);
    const perCaseMicros =
      r.costMicros === null ? null : r.costMicros / Math.max(1, r.caseCount);
    const cp =
      perCaseMicros === null || perCaseMicros === 0
        ? "?"
        : (r.pct / (perCaseMicros / 1e6)).toFixed(0);
    const costCell =
      perCaseMicros === null
        ? "?（無價目）"
        : `${usd(perCaseMicros)}${r.costFromTable ? ` *（按 ${PRICES_CHECKED_ON} 價目表折算）*` : ""}`;
    L.push(
      `| \`${r.spec}\` | ${r.pct}% (${r.correct}/${r.totalFields}) | ` +
        `${r.invented}${r.invented ? " ⚠️" : ""} | ${costCell} | ${cp} | ` +
        `${(perCaseMs / 1000).toFixed(1)}s | ${r.failedCases} | ${adviceFor(r, rows)} |`,
    );
  }
  L.push("");
  L.push("**捏造必須是 0。** 靠編造拿高分的模型，比誠實說 `missing` 的低分模型更糟（CLAUDE.md Hard Rule 1）。");
  L.push("");
  L.push("🔴 **這張表量不到的事。** `eval/cases` 全是合成的印刷體 .png，而 Minit 的硬仗是");
  L.push("**手寫**混語頁面。這裡的贏家只證明了它會讀印刷體。不要單憑這張表選讀取模型，");
  L.push("也不要引用這裡的數字當「準確率」而不說明它量的是哪種任務——真手寫的那一輪（G-3）才算數。");
  L.push("");
  L.push(`成本欄：無註記＝廠商回報的實際計費；帶 * ＝該廠商未回報價格，按 ${PRICES_CHECKED_ON} 的`);
  L.push("價目表（src/lib/unit-economics.ts）用實測 tokens 折算。`?` ＝連價目表也沒有這個模型。");
  return L.join("\n");
}

main().catch((e) => {
  console.error("bench crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
