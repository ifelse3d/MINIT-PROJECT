/**
 * Answers one question: "I pasted the four AI_MODEL_* lines — did they take?"
 *
 *     npm run check:ai
 *
 * WHY THIS EXISTS
 * The routing config fails silently. `AI_MODEL_CHAT=gpt-5-nano` (no colon) does
 * not error — provider.ts only parses a value containing ":", so it quietly
 * falls back to Gemini while you believe routing is on. You would not find out
 * until a month of invoices did not match the margin you quoted.
 *
 * HOW IT AVOIDS LYING TO YOU
 * It does not re-implement the parsing. It calls the SAME `resolveModel()` the
 * app calls, and reads the SAME price tables `gemini.ts` / `openai.ts` use to
 * record cost. If this script and the running app ever disagree, that is a bug
 * in one shared function, not a drift between two copies of the rules.
 *
 * It never prints a key — only whether one is present.
 *
 * Exit code 0 = config is coherent. 1 = something is silently wrong.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import {
  SCENARIOS,
  evaluate,
  type Assumptions,
  type TaskKind,
} from "../src/lib/unit-economics";
import type { AiProviderName, AiTask } from "../src/lib/ai/provider";

const ROOT = path.resolve(__dirname, "..");

// Lets this script load src/lib/ai/* — see that file for why it is not a
// weakening of the guard. It must run before the requires below.
import "./allow-server-only";

// Loaded via require (not import) so it happens AFTER the line above, which an
// import statement would not guarantee. We deliberately use the app's own
// resolveModel() and price tables rather than a second copy of the rules: a
// copy could drift and start reporting a routing the app does not use, which is
// the exact bug this script exists to catch.
/* eslint-disable @typescript-eslint/no-require-imports */
const { resolveModel, routedProviders, AI_PROVIDERS, PROVIDER_KEY_ENV } =
  require("../src/lib/ai/provider") as typeof import("../src/lib/ai/provider");
const { PRICES_PER_MTOK_USD: GEMINI_PRICES } =
  require("../src/lib/ai/gemini") as typeof import("../src/lib/ai/gemini");
const { PRICES_PER_MTOK_USD: OPENAI_PRICES } =
  require("../src/lib/ai/openai") as typeof import("../src/lib/ai/openai");
const { PRICES_PER_MTOK_USD: ANTHROPIC_PRICES } =
  require("../src/lib/ai/anthropic") as typeof import("../src/lib/ai/anthropic");
const { PRICES_PER_MTOK_USD: XAI_PRICES } =
  require("../src/lib/ai/xai") as typeof import("../src/lib/ai/xai");
/* eslint-enable @typescript-eslint/no-require-imports */

// --- minimal .env.local loader (same pattern as scripts/seed-demo.ts) -------
function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return false;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawVal.replace(/^["']|["']$/g, "");
  }
  return true;
}

/** provider.ts uses long_doc; unit-economics.ts uses longDoc. Same job. */
const TASKS: readonly { task: AiTask; kind: TaskKind; envVar: string; what: string }[] = [
  { task: "classify", kind: "classify", envVar: "AI_MODEL_CLASSIFY", what: "notes or ledger? (trivial)" },
  { task: "extract", kind: "extract", envVar: "AI_MODEL_EXTRACT", what: "READS THE HANDWRITING" },
  { task: "chat", kind: "chat", envVar: "AI_MODEL_CHAT", what: "short text Q&A" },
  { task: "long_doc", kind: "longDoc", envVar: "AI_MODEL_LONG_DOC", what: "30-page constitutions" },
  // 97 §8: document writing — unset falls back to long_doc's resolution
  // (today's behaviour). Priced in the longDoc bucket until it diverges.
  { task: "write", kind: "longDoc", envVar: "AI_MODEL_WRITE", what: "document WRITING (unset = follows LONG_DOC)" },
];

const PRICE_TABLES: Record<AiProviderName, Record<string, { in: number; out: number }>> = {
  gemini: GEMINI_PRICES,
  openai: OPENAI_PRICES,
  anthropic: ANTHROPIC_PRICES,
  xai: XAI_PRICES,
};

function priceTableFor(provider: AiProviderName) {
  return PRICE_TABLES[provider];
}

/** Which published scenario, if any, does this exact routing correspond to? */
function matchScenario(actual: Record<TaskKind, string>): Assumptions | undefined {
  return SCENARIOS.find((s) =>
    (Object.keys(actual) as TaskKind[]).every((k) => s.routing[k].name === actual[k]),
  );
}

function main() {
  const problems: string[] = [];
  const notes: string[] = [];

  const hasEnvFile = loadEnvLocal();
  console.log("\n=== AI routing check ===");
  console.log(
    hasEnvFile
      ? "Read .env.local (values shown below are model names, never keys).\n"
      : "⚠ No .env.local found — reporting whatever is in the process environment.\n",
  );

  const actual: Partial<Record<TaskKind, string>> = {};

  for (const { task, kind, envVar, what } of TASKS) {
    const raw = process.env[envVar];
    let line = `${envVar.padEnd(20)} `;

    let resolved: { provider: AiProviderName; model: string };
    try {
      resolved = resolveModel(task);
    } catch (err) {
      // Trap 2: a colon is present but the provider is not one we support.
      console.log(`${line}❌ ${(err as Error).message}`);
      problems.push(`${envVar} is set to something the app will refuse at request time.`);
      continue;
    }

    actual[kind] = resolved.model;
    const label = `${resolved.provider}:${resolved.model}`;

    if (raw === undefined || raw === "") {
      line += `— not set → falls back to ${label}`;
      notes.push(
        task === "write"
          ? `${envVar} is not set, so "${what}" follows AI_MODEL_LONG_DOC's resolution (97 §8).`
          : `${envVar} is not set, so "${what}" inherits the legacy AI_PROVIDER setting.`,
      );
    } else if (!raw.includes(":")) {
      // Trap 1: the quiet one. Set, looks right, does nothing.
      line += `🚨 "${raw}" has NO COLON → SILENTLY IGNORED, actually using ${label}`;
      problems.push(
        `${envVar}="${raw}" is being ignored. Write it as provider:model, e.g. gemini:${raw} or openai:${raw}.`,
      );
    } else {
      line += `✅ ${label}`;
    }

    // Trap 3: unpriced model — the call still works, the cost row comes back null.
    if (!(resolved.model in priceTableFor(resolved.provider))) {
      line += `  ⚠ not in ${resolved.provider}.ts price table → cost will record as null`;
      problems.push(
        `${resolved.model} has no price row, so recordTokens() cannot store a cost for "${what}".`,
      );
    }

    console.log(line);
    console.log(`${" ".repeat(21)}job: ${what}`);
  }

  // --- keys: presence only, never the value --------------------------------
  console.log("\n--- API keys (presence only) ---");
  // P-2: the SAME shared function /health uses, so the two can never disagree
  // about which keys the current routing requires.
  const usedProviders = routedProviders();
  // Every provider is listed, including ones nothing is routed to. An empty
  // slot is INFORMATION ("Claude is wired up, no key yet"), not a problem: a
  // key is only required when the routing above actually sends work there.
  for (const provider of AI_PROVIDERS) {
    const name = PROVIDER_KEY_ENV[provider];
    const present = Boolean(process.env[name]);
    const needed = usedProviders.has(provider);
    const mark = present ? "present" : "absent";
    const tail = needed
      ? "   ← required by the routing above"
      : present
        ? ""
        : "   (empty slot — harmless until something is routed here)";
    console.log(`  ${name.padEnd(18)} ${mark}${tail}`);
    if (needed && !present) {
      problems.push(`${name} is missing but the routing above sends work to ${provider}.`);
    }
  }

  // --- what this routing is worth ------------------------------------------
  console.log("\n--- What this routing costs ---");
  const complete = TASKS.every(({ kind }) => actual[kind] !== undefined);
  const match = complete ? matchScenario(actual as Record<TaskKind, string>) : undefined;
  if (match) {
    const r = evaluate(match);
    console.log(`  matches: ${match.label}`);
    console.log(
      `  → RM${r.costPerOrgMyr.toFixed(2)} per organisation / month, ` +
        `${r.grossMarginPct.toFixed(1)}% gross margin at ${r.orgs} organisations`,
    );
    console.log("  (a model, not a measurement — see npm run economics)");
  } else if (complete) {
    console.log("  This combination is not one of the priced scenarios in");
    console.log("  src/lib/unit-economics.ts, so no published margin applies to it.");
    console.log("  Add it there before quoting a number for it.");
    notes.push("Routing does not match any priced scenario — do not quote a margin for it.");
  }

  // --- verdict --------------------------------------------------------------
  if (notes.length) {
    console.log("\n--- Notes ---");
    for (const n of notes) console.log(`  · ${n}`);
  }
  if (problems.length) {
    console.log("\n❌ PROBLEMS");
    for (const p of problems) console.log(`  · ${p}`);
    console.log("\nFix these in .env.local, then run `npm run check:ai` again.");
    process.exit(1);
  }
  console.log("\n✅ Coherent: every task resolves to a priced model, and the keys it needs are present.\n");
}

main();
