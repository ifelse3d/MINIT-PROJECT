/**
 * MODEL BENCH — `npm run bench`
 *
 * Answers one question that `npm run eval` cannot: **which model is worth it?**
 *
 *     npm run bench                                   (the default line-up)
 *     npm run bench gemini:gemini-3.5-flash-lite anthropic:claude-haiku-4-5
 *     npm run bench --dry-run                         (plan + cost estimate, no calls)
 *
 * `npm run eval` measures ONE model and prints accuracy. That is the right tool
 * for "did my prompt change help". It is the wrong tool for choosing a vendor,
 * because a model is only worth choosing on accuracy AND cost AND speed
 * together — and the three trade against each other. This script runs the exact
 * same suite once per model and puts the three numbers in one table.
 *
 * HOW IT AVOIDS LYING TO YOU
 * It does not re-implement the eval. It sets AI_MODEL_EXTRACT and calls the very
 * same runSuite() that `npm run eval` calls, so a model is selected through the
 * app's own resolveModel(). Cost comes from each vendor's own usage numbers via
 * the same onUsage path that writes ai_usage.cost_micros in production — not
 * from a spreadsheet.
 *
 * 🔴 WHAT THIS SCRIPT CANNOT TELL YOU (2026-08-22)
 * Every case in eval/cases is a SYNTHETIC PRINTED .png. The product's hard job
 * is HANDWRITTEN mixed-language pages. A model that wins here has been shown to
 * read printed text well — nothing more. Choosing an extractor on this table
 * alone would repeat the 95.2% mistake: a real, reproducible number that
 * describes a different task from the one being sold. The table prints this
 * warning itself, every run, so it cannot be quoted without it.
 *
 * It never prints an API key.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// MUST come before any src/lib/ai import — see the file for why.
import "./allow-server-only";

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  runSuite,
  loadEnvLocal,
  REPORTS_DIR,
  ROOT,
} = require("../eval/run-eval") as typeof import("../eval/run-eval");
const { summarize } = require("../src/lib/eval-score") as typeof import("../src/lib/eval-score");
const { resolveModel, PROVIDER_KEY_ENV } =
  require("../src/lib/ai/provider") as typeof import("../src/lib/ai/provider");
/* eslint-enable @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------------------
// The default line-up.
//
// Chosen to answer "is a big model worth 10x?", not to be exhaustive:
//   · the incumbent, so every other row has something to be compared against
//   · the cheapest thing that could plausibly work
//   · the cheapest Claude, and one big Claude — the price gap J is asking about
// Anything with no key set is skipped, loudly, instead of failing ten times.
// ---------------------------------------------------------------------------
const DEFAULT_LINEUP = [
  "gemini:gemini-3.5-flash-lite", // ← the incumbent. The 95.2% was measured here.
  "gemini:gemini-3.5-flash",
  "openai:gpt-5.6-luna",
  "anthropic:claude-haiku-4-5",
  "anthropic:claude-sonnet-5",
];

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
  costMicros: number | null;
  inputTokens: number;
  outputTokens: number;
  elapsedMs: number;
};

/** A run's cost is only a number if EVERY case in it was priced. One unpriced
 *  call makes the total a lower bound, and a lower bound printed as a total is
 *  how a made-up margin gets into a slide deck — hence the null handling at the
 *  call site rather than a silent `?? 0`. */
const usd = (micros: number) => `$${(micros / 1e6).toFixed(4)}`;

function parseArgs(argv: string[]): { specs: string[]; dryRun: boolean } {
  const dryRun = argv.includes("--dry-run");
  const specs = argv.filter((a) => !a.startsWith("--"));
  return { specs: specs.length ? specs : DEFAULT_LINEUP, dryRun };
}

/** Which vendor key does this spec need, and is it present? */
function keyStatus(spec: string): { envVar: string; present: boolean } | { error: string } {
  const [provider] = spec.split(":");
  const envVar = (PROVIDER_KEY_ENV as Record<string, string | undefined>)[provider];
  if (!envVar) {
    return { error: `unknown provider "${provider}" — see AI_PROVIDERS in src/lib/ai/provider.ts` };
  }
  return { envVar, present: Boolean(process.env[envVar]) };
}

async function main() {
  loadEnvLocal();
  const { specs, dryRun } = parseArgs(process.argv.slice(2));

  console.log("\n=== Minit model bench ===\n");
  console.log("Line-up:");
  const runnable: string[] = [];
  const skipped: Row[] = [];
  for (const spec of specs) {
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
    console.log("\nNothing to run — no key is set for any model in the line-up.");
    console.log("Add a key to .env.local, or name models that you do have keys for:");
    console.log("  npm run bench gemini:gemini-3.5-flash-lite\n");
    process.exit(1);
  }

  console.log(
    `\n${runnable.length} model(s) × the whole golden-case suite. ` +
      "Cases run one at a time with a pause, so budget a few minutes per model.",
  );
  console.log("These are REAL API calls and they cost REAL money.\n");

  if (dryRun) {
    console.log("--dry-run: stopping here. Nothing was called.\n");
    return;
  }

  const rows: Row[] = [];
  for (const [i, spec] of runnable.entries()) {
    console.log(`\n──── [${i + 1}/${runnable.length}] ${spec} ────\n`);
    // Selecting the model by env var is deliberate: it makes the bench go
    // through the app's own resolveModel(), so this cannot measure a routing
    // the app would not actually use.
    process.env.AI_MODEL_EXTRACT = spec;

    // Fail loudly here rather than ten cases later if the spec is malformed.
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
    rows.push({
      spec,
      ran: true,
      correct: s.overall.correct,
      totalFields: s.overall.total,
      pct: s.overall.pct,
      invented: s.inventedCount,
      failedCases: outcomes.filter((o) => o.status === "failed").length,
      caseCount: outcomes.length,
      costMicros: anyUnpriced ? null : outcomes.reduce((a, o) => a + (o.costMicros ?? 0), 0),
      inputTokens: outcomes.reduce((a, o) => a + o.inputTokens, 0),
      outputTokens: outcomes.reduce((a, o) => a + o.outputTokens, 0),
      elapsedMs: outcomes.reduce((a, o) => a + o.elapsedMs, 0),
    });
  }

  const all = [...rows, ...skipped];
  const table = renderTable(all);
  console.log(`\n${table}`);

  mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.join(REPORTS_DIR, `bench-${stamp}.md`);
  writeFileSync(out, `# Minit model bench — ${new Date().toISOString()}\n\n${table}\n`, "utf-8");
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
    inputTokens: 0,
    outputTokens: 0,
    elapsedMs: 0,
  };
}

function renderTable(rows: Row[]): string {
  const L: string[] = [];
  L.push("| model | accuracy | invented | cost / run | avg per case | cases failed |");
  L.push("|---|---|---|---|---|---|");
  for (const r of rows) {
    if (!r.ran) {
      L.push(`| \`${r.spec}\` | — | — | — | — | skipped: ${r.skippedBecause} |`);
      continue;
    }
    const perCaseMs = r.elapsedMs / Math.max(1, r.caseCount);
    L.push(
      `| \`${r.spec}\` | ${r.pct}% (${r.correct}/${r.totalFields}) | ` +
        `${r.invented}${r.invented ? " ⚠️" : ""} | ` +
        `${r.costMicros === null ? "? (unpriced model)" : usd(r.costMicros)} | ` +
        `${(perCaseMs / 1000).toFixed(1)}s | ${r.failedCases} |`,
    );
  }
  L.push("");
  L.push("**invented must be 0.** A model that scores higher by making things up is");
  L.push("worse than one that scores lower and says `missing` (CLAUDE.md Hard Rule 1).");
  L.push("");
  L.push("🔴 **What this table does NOT measure.** Every case in `eval/cases` is a");
  L.push("synthetic PRINTED .png. Minit's hard job is HANDWRITTEN mixed-language pages.");
  L.push("A winner here has been shown to read printed text well — nothing more.");
  L.push("Do not choose the extractor on this table alone, and do not quote a number");
  L.push("from it as \"accuracy\" without saying which task it describes.");
  L.push("");
  L.push("`? (unpriced model)` = that vendor file has no price row for this model, so");
  L.push("the run's cost is unknown rather than zero. Add the row before comparing cost.");
  return L.join("\n");
}

main().catch((e) => {
  console.error("bench crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
