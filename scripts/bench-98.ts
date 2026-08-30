// ---------------------------------------------------------------------------
// BENCH-98 — real-document two-track model bench (work order 100 §1; the
// read/write bench work order 98 asked for, run against 真件 A/B).
//
//   npx tsx scripts/bench-98.ts            (all four models, both tracks)
//   npx tsx scripts/bench-98.ts --read     (read track only)
//   npx tsx scripts/bench-98.ts --write    (write track only)
//
// WHY A SEPARATE SCRIPT AND NOT bench-models.ts. bench-models runs the
// synthetic eval suite (printed .png cases) through runSuite(); its whole
// design is "same suite, swap the model". This bench answers a different
// question — how do four models handle J's REAL documents, on the two tasks
// the env vars actually route (AI_MODEL_EXTRACT reads, AI_MODEL_WRITE
// writes) — and its outputs are full finished documents for J to leaf
// through, not a fields-correct percentage. Bolting real-file I/O into
// bench-models would tangle both. The table format follows 72's precedent.
//
// TRACKS
//   READ  : each model extracts 真件 A's two photos (the annotated printed
//           minit + the handwritten shorthand page) through the very same
//           prompt + rule-7 retry the live /api/extract-minutes runs, then
//           the two pages are merged exactly as the app's queue merges them.
//   WRITE : each model arranges/writes a BM minit from the SAME baseline
//           extraction (flash-lite's read, so the writing is compared on
//           identical input) through runDraftMinutesPlan — the loop the
//           live /api/draft-minutes runs for unstructured input, guards
//           (coverage / names / merged-facts / latin-names) included.
//
// 🔴 A3 PRIVACY: inputs live in eval/reports/samples-real/, outputs in
// eval/reports/bench-98/ — both under the git-ignored eval/reports/. Real
// names and IC numbers stay on this machine. The console prints structure
// and numbers only.
//
// 💰 COST DISCIPLINE: every vendor call's usage lands in a ledger printed at
// the end and written to bench-98/COSTS.md. A hard stop aborts further
// vendor calls past HARD_STOP_MICROS (the work order's bench cap is
// US$0.60; the stop sits under it so an in-flight call cannot overshoot).
// ---------------------------------------------------------------------------

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import "./allow-server-only";

import {
  getVisionProvider,
  resolveModel,
  EXTRACT_OUTPUT_CEILING,
  type TokenUsage,
} from "../src/lib/ai/provider";
import { EXTRACT_ATTEMPT_TIMEOUT_MS } from "../src/lib/ai/http";
import {
  parseMeetingNotesExtraction,
  type MeetingNotesExtraction,
} from "../src/lib/extraction";
import { extractMeetingNotesPrompt } from "../src/prompts/extract-meeting-notes";
import { mergeMeetingExtractions } from "../src/lib/extraction-merge";
import { runDraftMinutesPlan } from "../src/lib/ai/draft-minutes-run";
import {
  composeMinutesMd,
  composeStructuredMinutesMd,
  minutesStructure,
  usableResolutions,
} from "../src/lib/minutes-compose";
import { lintMinitMd } from "../src/lib/minit-format";
import { buildMinutesPdf } from "../src/lib/minutes-pdf";

const ROOT = path.resolve(__dirname, "..");
const SAMPLES = path.join(ROOT, "eval", "reports", "samples-real");
const OUT = path.join(ROOT, "eval", "reports", "bench-98");

// The real society's name as printed on 真件 A/B — local files only (A3).
const ORG_NAME = "Pertubuhan Pengajian Tao ( Hong Tao ) Perlis";

const ALL_MODELS = [
  "gemini:gemini-3.5-flash-lite", // baseline (current AI_MODEL_EXTRACT)
  "gemini:gemini-3.6-flash",
  "openai:gpt-5.6-luna",
  "openai:gpt-5.6-terra",
] as const;
const BASELINE = ALL_MODELS[0];

// `--models a,b` reruns just those cells (a failed cell should not cost a
// rerun of the ones that already succeeded — every extra run is real money).
const modelsArg = process.argv.find((a) => a.startsWith("--models="));
const MODELS: readonly string[] = modelsArg
  ? modelsArg.slice("--models=".length).split(",").filter(Boolean)
  : ALL_MODELS;

/**
 * Bench walls, LOOSER than the live ones on purpose: the point of the bench
 * is to SEE each model's finished document and judge it. Whether a model also
 * fits the live walls (20s/attempt writes, 45s/attempt reads, 50s route
 * budget) is reported from the measured times — a model that needs 60s is
 * still a fact worth having in the table, not a cell worth leaving blank.
 */
const BENCH_TIMEOUT_MS = 90_000;
const benchDeadline = () => Date.now() + 180_000;

/** Abort before any call that would push the ledger past this. */
const HARD_STOP_MICROS = 550_000; // US$0.55 < the US$0.60 cap

// --- the honest ledger ------------------------------------------------------

type LedgerRow = {
  what: string;
  model: string;
  /** vendor calls under this row (a rule-7 retry / repair round adds one) */
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number | null;
  ms: number;
};
const ledger: LedgerRow[] = [];
const spentMicros = () => ledger.reduce((a, r) => a + (r.costMicros ?? 0), 0);
const usd = (micros: number) => `$${(micros / 1e6).toFixed(4)}`;

function assertBudget(what: string) {
  if (spentMicros() >= HARD_STOP_MICROS) {
    throw new Error(
      `HARD STOP: ledger at ${usd(spentMicros())} ≥ ${usd(HARD_STOP_MICROS)} before "${what}" — bench cap is US$0.60.`,
    );
  }
}

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// --- one extraction, exactly the live pipeline's shape ----------------------

async function extractFile(
  spec: string,
  filePath: string,
  what: string,
): Promise<MeetingNotesExtraction | null> {
  assertBudget(what);
  process.env.AI_MODEL_EXTRACT = spec;
  resolveModel("extract"); // throws early on a bad spec
  const provider = getVisionProvider("extract");
  const prompt = extractMeetingNotesPrompt({
    orgName: ORG_NAME,
    todayIso: new Date().toISOString().slice(0, 10),
  });
  const imageBase64 = readFileSync(filePath).toString("base64");
  const mimeType = filePath.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : "image/jpeg";

  const row: LedgerRow = {
    what,
    model: spec,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
    ms: 0,
  };
  ledger.push(row);
  const onUsage = (u: TokenUsage) => {
    row.calls += 1;
    row.inputTokens += u.inputTokens;
    row.outputTokens += u.outputTokens;
    row.costMicros =
      row.costMicros === null || u.costMicros === null
        ? null
        : row.costMicros + u.costMicros;
  };

  const t0 = Date.now();
  try {
    // CLAUDE.md rule 7, same as the live route: one retry with the error.
    let raw = await provider.extractJson({
      prompt,
      imageBase64,
      mimeType,
      maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
      timeoutMs: BENCH_TIMEOUT_MS,
      deadlineAt: benchDeadline(),
      onUsage,
    });
    let parsed = parseMeetingNotesExtraction(raw);
    if (!parsed.success) {
      raw = await provider.extractJson({
        prompt:
          prompt +
          `\n\nYOUR PREVIOUS ANSWER FAILED VALIDATION:\n${JSON.stringify(parsed.error.issues.slice(0, 5))}\nReturn corrected JSON.`,
        imageBase64,
        mimeType,
        maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
        timeoutMs: BENCH_TIMEOUT_MS,
        deadlineAt: benchDeadline(),
        onUsage,
      });
      parsed = parseMeetingNotesExtraction(raw);
    }
    row.ms = Date.now() - t0;
    if (!parsed.success) {
      console.log(`  ✗ ${what}: FAILED CONTRACT after retry`);
      return null;
    }
    return parsed.data;
  } catch (e) {
    row.ms = Date.now() - t0;
    console.log(`  ✗ ${what}: ${(e as Error).message}`);
    return null;
  }
}

// --- structure summary (console-safe: numbers, confidences, no content) -----

function describeExtraction(e: MeetingNotesExtraction): string {
  const secs = new Map<string, number>();
  for (const r of e.resolutions) {
    const k = r.section_no ?? "(none)";
    secs.set(k, (secs.get(k) ?? 0) + 1);
  }
  return (
    `date=${e.meeting_date.value || "missing"}(${e.meeting_date.confidence}) ` +
    `type=${e.meeting_type.value || "?"} time=${e.meeting_time ? e.meeting_time.confidence : "absent"} ` +
    `attendees=${e.attendees.length} resolutions=${e.resolutions.length} ` +
    `figures=${e.figures.length} bearers=${e.office_bearers.length} ` +
    `sections={${[...secs.entries()].map(([k, n]) => `${k}:${n}`).join(" ")}}`
  );
}

const slug = (spec: string) => spec.split(":")[1].replace(/[^a-z0-9.-]/gi, "-");

async function savePdf(mdPath: string, md: string) {
  const bytes = await buildMinutesPdf({ finalMd: md, title: null });
  writeFileSync(mdPath.replace(/\.md$/, ".pdf"), bytes);
}

// ---------------------------------------------------------------------------

async function main() {
  loadEnvLocal();
  mkdirSync(OUT, { recursive: true });
  const readOnly = process.argv.includes("--read");
  const writeOnly = process.argv.includes("--write");

  const A1 = path.join(SAMPLES, "A1-printed-annotated.jpeg");
  const A2 = path.join(SAMPLES, "A2-handwritten-shorthand.jpeg");
  const B = path.join(SAMPLES, "B-typeset-20260718.pdf");

  const readRows: {
    spec: string;
    merged: MeetingNotesExtraction | null;
    desc: string;
  }[] = [];

  // ---- READ track ----------------------------------------------------------
  if (!writeOnly) {
    console.log("\n=== READ track: 真件 A (two photos, merged like the app queue) ===");
    for (const spec of MODELS) {
      console.log(`\n--- ${spec} ---`);
      const p1 = await extractFile(spec, A1, `read A1 ${spec}`);
      const p2 = p1 ? await extractFile(spec, A2, `read A2 ${spec}`) : null;
      // Per-page copies too: when a field is present on a page but absent
      // after the merge, these are the evidence of WHERE it was lost (that is
      // exactly how the extraction-merge G1-fields bug was pinned down).
      if (p1)
        writeFileSync(
          path.join(OUT, `read-A1-${slug(spec)}.json`),
          JSON.stringify(p1, null, 2),
          "utf-8",
        );
      if (p2)
        writeFileSync(
          path.join(OUT, `read-A2-${slug(spec)}.json`),
          JSON.stringify(p2, null, 2),
          "utf-8",
        );
      const merged = p1 && p2 ? mergeMeetingExtractions(p1, p2) : p1;
      const desc = merged ? describeExtraction(merged) : "FAILED";
      console.log(`  merged: ${desc}`);
      if (merged) {
        writeFileSync(
          path.join(OUT, `read-A-${slug(spec)}.json`),
          JSON.stringify(merged, null, 2),
          "utf-8",
        );
      }
      readRows.push({ spec, merged, desc });
      console.log(`  ledger so far: ${usd(spentMicros())}`);
    }

    // 真件 B once, with the CURRENT extract model (the baseline) — this is the
    // "current pipeline" case history, not a per-model race. Skipped on a
    // filtered rerun (--models=…): it already ran, and reruns cost money.
    if (!modelsArg) {
    console.log(`\n--- 真件 B (typeset PDF) with ${BASELINE} ---`);
    const bExtraction = await extractFile(BASELINE, B, `read B ${BASELINE}`);
    if (bExtraction) {
      writeFileSync(
        path.join(OUT, `read-B-${slug(BASELINE)}.json`),
        JSON.stringify(bExtraction, null, 2),
        "utf-8",
      );
      console.log(`  B: ${describeExtraction(bExtraction)}`);
      // What the app writes TODAY for B (BM + structure ⇒ zero-AI assembly).
      const structure = minutesStructure(bExtraction);
      const md = structure
        ? composeStructuredMinutesMd(bExtraction, {
            orgName: ORG_NAME,
            confirmedBy: "(bench)",
            dateIso: new Date().toISOString().slice(0, 10),
            lang: "bm",
            unconfirmedPreview: true,
          })
        : "(no structure — arranging path would run)";
      writeFileSync(path.join(OUT, "current-B.md"), md, "utf-8");
      if (structure) await savePdf(path.join(OUT, "current-B.md"), md);
      const findings = lintMinitMd(md, {
        lang: "bm",
        masa: Boolean(bExtraction.meeting_time),
        agendaTable: Boolean(structure),
        attendanceCount: Boolean(bExtraction.attendance_count),
      });
      console.log(
        `  current-pipeline B doc: ${findings.length} lint finding(s)` +
          (findings.length ? ` [${findings.map((f) => f.code).join(", ")}]` : ""),
      );
    }
    }
  }

  // ---- WRITE track ---------------------------------------------------------
  if (!readOnly) {
    console.log("\n=== WRITE track: BM minit from the SAME baseline extraction ===");
    // The baseline read (this run's, or a previous run's saved file).
    let baseline = readRows.find((r) => r.spec === BASELINE)?.merged ?? null;
    if (!baseline) {
      const p = path.join(OUT, `read-A-${slug(BASELINE)}.json`);
      try {
        baseline = parseMeetingNotesExtraction(
          JSON.parse(readFileSync(p, "utf-8")),
        ).data as MeetingNotesExtraction;
        console.log(`(baseline loaded from ${path.relative(ROOT, p)})`);
      } catch {
        console.log("✗ no baseline extraction — run the read track first.");
        process.exitCode = 1;
        return;
      }
    }

    // What the app writes TODAY for A (structure present ⇒ zero-AI assembly;
    // this is where 照抄速記 comes from — the case-history document).
    const structure = minutesStructure(baseline);
    if (structure) {
      const md = composeStructuredMinutesMd(baseline, {
        orgName: ORG_NAME,
        confirmedBy: "(bench)",
        dateIso: new Date().toISOString().slice(0, 10),
        lang: "bm",
        unconfirmedPreview: true,
      });
      writeFileSync(path.join(OUT, "current-A.md"), md, "utf-8");
      await savePdf(path.join(OUT, "current-A.md"), md);
      const findings = lintMinitMd(md, {
        lang: "bm",
        masa: Boolean(baseline.meeting_time),
        agendaTable: true,
        attendanceCount: Boolean(baseline.attendance_count),
      });
      console.log(
        `current-pipeline A doc (zero-AI structured assembly): ${findings.length} lint finding(s)` +
          (findings.length ? ` [${findings.map((f) => f.code).join(", ")}]` : ""),
      );
    }

    const texts = usableResolutions(baseline).map((r) => r.text.value);
    console.log(`(write input: ${texts.length} resolution items)`);
    for (const spec of MODELS) {
      console.log(`\n--- write ${spec} ---`);
      assertBudget(`write ${spec}`);
      process.env.AI_MODEL_WRITE = spec;
      const provider = getVisionProvider("write");
      const row: LedgerRow = {
        what: `write A ${spec}`,
        model: spec,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        ms: 0,
      };
      ledger.push(row);
      const t0 = Date.now();
      try {
        const run = await runDraftMinutesPlan({
          provider,
          resolutionTexts: texts,
          lang: "bm",
          timeoutMs: BENCH_TIMEOUT_MS,
          deadlineAt: benchDeadline(),
          onUsage: (u) => {
            row.calls += 1;
            row.inputTokens += u.inputTokens;
            row.outputTokens += u.outputTokens;
            row.costMicros =
              row.costMicros === null || u.costMicros === null
                ? null
                : row.costMicros + u.costMicros;
          },
        });
        row.ms = Date.now() - t0;
        if (!run.ok) {
          console.log(`  ✗ plan failed both attempts (repair: ${JSON.stringify(run.repair)})`);
          continue;
        }
        const md = composeMinutesMd(run.plan, baseline, {
          orgName: ORG_NAME,
          confirmedBy: "(bench)",
          dateIso: new Date().toISOString().slice(0, 10),
          lang: "bm",
          unconfirmedPreview: true,
        });
        const mdPath = path.join(OUT, `write-A-${slug(spec)}.md`);
        writeFileSync(mdPath, md, "utf-8");
        await savePdf(mdPath, md);
        const findings = lintMinitMd(md, { lang: "bm" });
        console.log(
          `  ✓ ${((row.ms) / 1000).toFixed(1)}s, ${findings.length} lint finding(s)` +
            (findings.length ? ` [${findings.map((f) => f.code).join(", ")}]` : "") +
            (row.calls > 1 ? ` (${row.calls} calls — needed a repair round)` : " (one pass)") +
            `, cost ${row.costMicros === null ? "unpriced" : usd(row.costMicros)}`,
        );
      } catch (e) {
        row.ms = Date.now() - t0;
        console.log(`  ✗ ${(e as Error).message}`);
      }
    }
  }

  // ---- ledger --------------------------------------------------------------
  const lines: string[] = [];
  lines.push(`# bench-98 cost ledger — ${new Date().toISOString()}`);
  lines.push("");
  lines.push("| call | model | vendor calls | in tok | out tok | cost | time |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of ledger) {
    lines.push(
      `| ${r.what} | \`${r.model}\` | ${r.calls} | ${r.inputTokens} | ${r.outputTokens} | ${r.costMicros === null ? "unpriced" : usd(r.costMicros)} | ${(r.ms / 1000).toFixed(1)}s |`,
    );
  }
  lines.push("");
  lines.push(`**TOTAL: ${usd(spentMicros())}** (hard stop ${usd(HARD_STOP_MICROS)})`);
  const ledgerMd = lines.join("\n");
  // Append, never overwrite: a filtered rerun must not erase the first run's
  // ledger — the report's 錢逐筆帳 is the concatenation of every run.
  appendFileSync(path.join(OUT, "COSTS.md"), ledgerMd + "\n\n", "utf-8");
  console.log(`\n${ledgerMd}\n`);
}

main().catch((e) => {
  console.error("bench-98 crashed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
