// ---------------------------------------------------------------------------
// PHASE 6 EVAL RUNNER — `npm run eval`
//
// Runs the REAL extraction pipeline (same prompts + provider + zod contracts
// the app uses) over every golden case in /eval/cases, scores the results
// with /src/lib/eval-score.ts, prints an accuracy table and writes a
// timestamped report to /eval/reports.
//
// Costs real API calls — needs GEMINI_API_KEY in .env.local. Cases run
// SEQUENTIALLY with a pause to respect free-tier rate limits.
//
// PDPA: golden cases are FICTIONAL. Reports quote case contents (that is
// their job) and are git-ignored — if you ever add real-document cases,
// reports stay on this machine only.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// MUST come before any src/lib/ai import — see the file for why.
import "../scripts/allow-server-only";

import { getVisionProvider, resolveModel } from "../src/lib/ai/provider";
import {
  parseMeetingNotesExtraction,
  parseLedgerExtraction,
  parseConstitutionExtraction,
  parseEventsExtraction,
} from "../src/lib/extraction";
import { extractMeetingNotesPrompt } from "../src/prompts/extract-meeting-notes";
import { extractLedgerPrompt } from "../src/prompts/extract-ledger";
import { extractConstitutionPrompt } from "../src/prompts/extract-constitution";
import { extractEventsPrompt } from "../src/prompts/extract-events";
import {
  scoreMinutes,
  scoreLedger,
  scoreConstitution,
  scoreEvents,
  summarize,
  type EvalCaseType,
  type FieldResult,
  type FieldKind,
  type ExpectedMinutes,
  type ExpectedLedger,
  type ExpectedConstitution,
  type ExpectedEvents,
} from "../src/lib/eval-score";

const ROOT = path.resolve(__dirname, "..");
const CASES_DIR = path.join(ROOT, "eval", "cases");
const REPORTS_DIR = path.join(ROOT, "eval", "reports");
const PAUSE_MS = 8000; // be gentle to free-tier rate limits

// --- minimal .env.local loader (no extra dependency; values never printed) --
function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawVal.replace(/^["']|["']$/g, "");
  }
}

type CaseMeta = {
  type: EvalCaseType;
  description: string;
  orgName: string;
  todayIso: string;
  expected: unknown;
};

type CaseOutcome = {
  name: string;
  type: EvalCaseType;
  status: "scored" | "failed";
  error?: string;
  results: FieldResult[];
  /** Wall-clock for this case, including the rule-7 retry and any 429 backoff. */
  elapsedMs: number;
  /** Summed from the vendor's own usage. null if ANY call came back unpriced —
   *  see the price-table rule in gemini.ts. A null must never be shown as 0. */
  costMicros: number | null;
  inputTokens: number;
  outputTokens: number;
  /** How many times the vendor was actually reached (1, or 2 with a retry). */
  vendorCalls: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Free-tier reality: 503 (model overloaded) and 429 (rate limit) are common
// and TEMPORARY. Wait and retry instead of failing the case.
const BACKOFF_MS = [20_000, 45_000, 90_000];

function isTransient(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|quota/i.test(msg);
}

async function callWithBackoff(
  provider: ReturnType<typeof getVisionProvider>,
  req: {
    prompt: string;
    imageBase64?: string;
    mimeType?: string;
    onUsage?: (u: { inputTokens: number; outputTokens: number; costMicros: number | null }) => void;
  }
): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      return await provider.extractJson(req);
    } catch (e) {
      lastError = e;
      if (!isTransient(e) || attempt === BACKOFF_MS.length) throw e;
      const wait = BACKOFF_MS[attempt];
      process.stdout.write(`(busy, waiting ${wait / 1000}s) `);
      await sleep(wait);
    }
  }
  throw lastError;
}

function findInput(dir: string): { file: string; mime: string | null } {
  const mimes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  for (const f of readdirSync(dir)) {
    const ext = path.extname(f).toLowerCase();
    if (ext in mimes) return { file: path.join(dir, f), mime: mimes[ext] };
    if (ext === ".txt" && f.startsWith("input")) return { file: path.join(dir, f), mime: null };
  }
  throw new Error("no input.(png|jpg|jpeg|webp|txt) found");
}

function buildPrompt(meta: CaseMeta, textInput: string | null): string {
  const { orgName, todayIso } = meta;
  switch (meta.type) {
    case "minutes":
      return extractMeetingNotesPrompt({ orgName, todayIso });
    case "ledger":
      return extractLedgerPrompt({ orgName, todayIso });
    case "constitution":
      return extractConstitutionPrompt({ orgName });
    case "events":
      return extractEventsPrompt({ orgName, todayIso, text: textInput ?? "" });
  }
}

function parseAndScore(meta: CaseMeta, raw: unknown):
  | { ok: true; results: FieldResult[] }
  | { ok: false; issues: string } {
  const issuesOf = (e: { issues: { path: PropertyKey[]; message: string }[] }) =>
    e.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");

  switch (meta.type) {
    case "minutes": {
      const p = parseMeetingNotesExtraction(raw);
      if (!p.success) return { ok: false, issues: issuesOf(p.error) };
      return { ok: true, results: scoreMinutes(meta.expected as ExpectedMinutes, p.data) };
    }
    case "ledger": {
      const p = parseLedgerExtraction(raw);
      if (!p.success) return { ok: false, issues: issuesOf(p.error) };
      return { ok: true, results: scoreLedger(meta.expected as ExpectedLedger, p.data) };
    }
    case "constitution": {
      const p = parseConstitutionExtraction(raw);
      if (!p.success) return { ok: false, issues: issuesOf(p.error) };
      return { ok: true, results: scoreConstitution(meta.expected as ExpectedConstitution, p.data) };
    }
    case "events": {
      const p = parseEventsExtraction(raw);
      if (!p.success) return { ok: false, issues: issuesOf(p.error) };
      return { ok: true, results: scoreEvents(meta.expected as ExpectedEvents, p.data) };
    }
  }
}

async function runCase(name: string): Promise<CaseOutcome> {
  const startedMs = Date.now();
  // What this case cost, from the vendor's own numbers. `unpriced` is tracked
  // separately from 0 on purpose: "we do not know" and "it was free" are
  // different answers, and only one of them may be added into a total.
  let costMicros = 0;
  let unpriced = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let vendorCalls = 0;
  const onUsage = (u: { inputTokens: number; outputTokens: number; costMicros: number | null }) => {
    vendorCalls += 1;
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
    if (u.costMicros === null) unpriced = true;
    else costMicros += u.costMicros;
  };
  const spend = () => ({
    elapsedMs: Date.now() - startedMs,
    costMicros: unpriced ? null : costMicros,
    inputTokens,
    outputTokens,
    vendorCalls,
  });

  const dir = path.join(CASES_DIR, name);
  const meta = JSON.parse(readFileSync(path.join(dir, "case.json"), "utf-8")) as CaseMeta;
  const input = findInput(dir);
  const isText = input.mime === null;
  const textInput = isText ? readFileSync(input.file, "utf-8") : null;
  const imageBase64 = isText ? undefined : readFileSync(input.file).toString("base64");

  const prompt = buildPrompt(meta, textInput);
  const provider = getVisionProvider();
  const req = { prompt, imageBase64, mimeType: input.mime ?? undefined, onUsage };

  // One attempt = model call + JSON.parse + zod. A JSON SyntaxError (model wrote
  // broken JSON) is a model-output problem like a zod failure, NOT an infra
  // error — return it as issues so it feeds the rule-7 retry instead of crashing.
  const attempt = async (p: string): Promise<
    { ok: true; results: FieldResult[] } | { ok: false; issues: string }
  > => {
    try {
      const raw = await callWithBackoff(provider, { ...req, prompt: p });
      return parseAndScore(meta, raw);
    } catch (e) {
      if (e instanceof SyntaxError) {
        return { ok: false, issues: `Your response was not valid JSON: ${e.message}` };
      }
      throw e; // real infra error — handled below
    }
  };

  try {
    // Attempt 1, then retry ONCE with parse/validation errors appended (rule 7).
    // Each attempt itself backs off and retries on 503/429 (free-tier spikes).
    let scored = await attempt(prompt);
    if (!scored.ok) {
      const retryPrompt = `${prompt}

YOUR PREVIOUS ATTEMPT FAILED VALIDATION with these errors — fix them and respond with ONLY the corrected JSON:
${scored.issues}`;
      scored = await attempt(retryPrompt);
    }
    if (!scored.ok) {
      return {
        name, type: meta.type, status: "failed",
        error: "invalid JSON after 2 attempts", results: [], ...spend(),
      };
    }
    return { name, type: meta.type, status: "scored", results: scored.results, ...spend() };
  } catch (e) {
    return {
      name,
      type: meta.type,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
      results: [],
      ...spend(),
    };
  }
}

// --- report rendering --------------------------------------------------------

const KINDS: FieldKind[] = ["date", "amount", "enum", "name", "text"];

function pct(c: number, t: number): string {
  return t === 0 ? "  n/a" : `${((c / t) * 100).toFixed(1).padStart(5)}%`;
}

function renderReport(outcomes: CaseOutcome[], startedAt: Date): string {
  const all = outcomes.flatMap((o) => o.results);
  const total = summarize(all);
  const lines: string[] = [];
  lines.push(`# Minit eval report — ${startedAt.toISOString()}`);
  lines.push("");
  // Ask the provider layer what it ACTUALLY resolved to, rather than echoing the
  // env var back. Printing `GEMINI_MODEL ?? "(default)"` is what let this report
  // stay silent when GEMINI_DEFAULT_MODEL changed from gemini-3.5-flash to
  // gemini-3.5-flash-lite on 2026-08-04: every run since then said "(default)"
  // and nobody could tell that the measured model was no longer the same one.
  // An accuracy number is meaningless without the exact model id beside it.
  const measured = resolveModel("extract");
  lines.push(`Model: ${measured.provider}:${measured.model}  ← what extraction ACTUALLY ran on`);
  lines.push(
    `Resolved from: ${process.env.AI_MODEL_EXTRACT ? "AI_MODEL_EXTRACT" : process.env.GEMINI_MODEL ? "GEMINI_MODEL" : "GEMINI_DEFAULT_MODEL (nothing set)"}`,
  );
  lines.push(`Cases: ${outcomes.length} (${outcomes.filter((o) => o.status === "failed").length} failed to run)`);
  lines.push("");
  lines.push("## Accuracy by field type");
  lines.push("");
  lines.push("| Field type | Correct | Total | Accuracy |");
  lines.push("|---|---|---|---|");
  for (const k of KINDS) {
    const b = total.byKind[k];
    lines.push(`| ${k} | ${b.correct} | ${b.total} | ${pct(b.correct, b.total).trim()} |`);
  }
  lines.push(`| **OVERALL** | **${total.overall.correct}** | **${total.overall.total}** | **${total.overall.pct}%** |`);
  lines.push("");
  lines.push(`**Invented fields (AI made something up): ${total.inventedCount}** ← must be 0`);
  lines.push("");
  lines.push("## Per case");
  lines.push("");
  for (const o of outcomes) {
    if (o.status === "failed") {
      lines.push(`- ❌ **${o.name}** (${o.type}) — FAILED TO RUN: ${o.error}`);
      continue;
    }
    const s = summarize(o.results);
    lines.push(`- **${o.name}** (${o.type}) — ${s.overall.correct}/${s.overall.total} (${s.overall.pct}%)${s.inventedCount ? ` · ⚠️ ${s.inventedCount} invented` : ""}`);
  }
  lines.push("");
  lines.push("## Failures");
  lines.push("");
  const anyFailure = outcomes.some((o) => summarize(o.results).failures.length > 0);
  if (!anyFailure) lines.push("None 🎉");
  for (const o of outcomes) {
    for (const f of summarize(o.results).failures) {
      lines.push(
        `- ${o.name} · \`${f.field}\` (${f.kind}${f.invented ? ", **INVENTED**" : ""}): expected "${f.expected}", got "${f.got}"`
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

// --- the suite, callable from outside ------------------------------------------

export type SuiteResult = {
  outcomes: CaseOutcome[];
  startedAt: Date;
  /** provider:model that extraction ACTUALLY resolved to for this run. */
  model: string;
};

/**
 * Runs every golden case once and returns the outcomes.
 *
 * Deliberately takes NO model argument. `scripts/bench-models.ts` selects a
 * model by setting AI_MODEL_EXTRACT before calling this, so a benchmark run
 * goes through the SAME resolveModel() path a real request does. A second way
 * to choose a model would be a second set of rules that can drift from the app.
 */
export async function runSuite(opts: { quiet?: boolean } = {}): Promise<SuiteResult> {
  const caseNames = readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (caseNames.length === 0) throw new Error("No cases found in eval/cases.");

  const startedAt = new Date();
  const outcomes: CaseOutcome[] = [];
  for (const [i, name] of caseNames.entries()) {
    if (!opts.quiet) process.stdout.write(`[${i + 1}/${caseNames.length}] ${name} ... `);
    const outcome = await runCase(name);
    outcomes.push(outcome);
    if (!opts.quiet) {
      if (outcome.status === "failed") {
        console.log(`FAILED (${outcome.error})`);
      } else {
        const s = summarize(outcome.results);
        console.log(
          `${s.overall.correct}/${s.overall.total} (${s.overall.pct}%)` +
            `${s.inventedCount ? ` ⚠️ ${s.inventedCount} invented` : ""}`,
        );
      }
    }
    if (i < caseNames.length - 1) await sleep(PAUSE_MS);
  }

  const measured = resolveModel("extract");
  return { outcomes, startedAt, model: `${measured.provider}:${measured.model}` };
}

export { loadEnvLocal, summarize, KINDS, pct, renderReport, REPORTS_DIR, ROOT };

// --- main ---------------------------------------------------------------------

async function main() {
  loadEnvLocal();
  if (!process.env.GEMINI_API_KEY) {
    console.error(
      "\nGEMINI_API_KEY tiada / not found.\nAdd it to .env.local in the project root, then run `npm run eval` again.\n"
    );
    process.exit(1);
  }

  console.log("\nMinit eval — running the golden cases sequentially...\n");
  const { outcomes, startedAt } = await runSuite();

  // Console summary table
  const all = outcomes.flatMap((o) => o.results);
  const total = summarize(all);
  console.log("\n──────── accuracy by field type ────────");
  for (const k of KINDS) {
    const b = total.byKind[k];
    console.log(`  ${k.padEnd(7)} ${String(b.correct).padStart(3)}/${String(b.total).padEnd(3)} ${pct(b.correct, b.total)}`);
  }
  console.log(`  ${"OVERALL".padEnd(7)} ${String(total.overall.correct).padStart(3)}/${String(total.overall.total).padEnd(3)} ${pct(total.overall.correct, total.overall.total)}`);
  console.log(`  invented fields: ${total.inventedCount} (must be 0)`);

  // Reports
  mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const mdPath = path.join(REPORTS_DIR, `eval-${stamp}.md`);
  const jsonPath = path.join(REPORTS_DIR, `eval-${stamp}.json`);
  writeFileSync(mdPath, renderReport(outcomes, startedAt), "utf-8");
  writeFileSync(
    jsonPath,
    JSON.stringify({ startedAt: startedAt.toISOString(), outcomes, summary: total }, null, 2),
    "utf-8"
  );
  console.log(`\nReports saved:\n  ${path.relative(ROOT, mdPath)}\n  ${path.relative(ROOT, jsonPath)}\n`);
}

// Guarded so `npm run bench` can import runSuite() from this file without the
// import itself kicking off a full single-model run.
if (require.main === module) {
  main().catch((e) => {
    console.error("eval crashed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
