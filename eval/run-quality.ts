// ---------------------------------------------------------------------------
// DOCUMENT-QUALITY EVAL — `npm run eval:quality` (work order 68, G0).
//
// The extraction eval (run-eval.ts) measures "did the fields come out right".
// It scored 92.9% while the produced DOCUMENT was unusable — double numbering,
// lost prose, missing MASA and signature block (J's real printed AGM sample,
// 2026-08-29). Nothing measured "does the output look like a minit a
// secretary can file". This runner is that measurement:
//
//   confirmed extraction (fixture) → the REAL draft pipeline (same loop the
//   route runs: src/lib/ai/draft-minutes-run.ts) → composeMinutesMd →
//   lintMinitMd (src/lib/minit-format.ts) + per-case expectations.
//
// Zero findings on every case is the bar. Costs real API calls (text-only —
// cents, not dollars). Cases are FICTIONAL (PDPA); reports are git-ignored.
// ---------------------------------------------------------------------------

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// MUST come before any src/lib/ai import — see the file for why.
import "../scripts/allow-server-only";

import { getVisionProvider, resolveModel, type TokenUsage } from "../src/lib/ai/provider";
import { runDraftMinutesPlan } from "../src/lib/ai/draft-minutes-run";
import { parseMeetingNotesExtraction } from "../src/lib/extraction";
import { composeMinutesMd } from "../src/lib/minutes-compose";
import { lintMinitMd, type MinitLintExpectations, type MinitLintFinding } from "../src/lib/minit-format";
import { isMinutesLang } from "../src/lib/minutes-lang";

const ROOT = path.resolve(__dirname, "..");
const CASES_DIR = path.join(ROOT, "eval", "quality-cases");
const REPORTS_DIR = path.join(ROOT, "eval", "reports");
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS ?? 2000);

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

type QualityCase = {
  type: string;
  description: string;
  orgName: string;
  language: string;
  extraction: unknown;
  expect: Omit<MinitLintExpectations, "lang">;
};

type CaseOutcome = {
  name: string;
  status: "scored" | "failed";
  error?: string;
  findings: MinitLintFinding[];
  markdown: string;
  costMicros: number | null;
  vendorCalls: number;
  elapsedMs: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  loadEnvLocal();

  const { provider: providerName, model } = resolveModel("long_doc");
  console.log(`\nMinit quality eval — draft model: ${providerName}:${model}\n`);

  const caseNames = readdirSync(CASES_DIR).filter((d) =>
    existsSync(path.join(CASES_DIR, d, "case.json")),
  );
  const outcomes: CaseOutcome[] = [];

  for (const [i, name] of caseNames.entries()) {
    process.stdout.write(`[${i + 1}/${caseNames.length}] ${name} ... `);
    const started = Date.now();
    const meta = JSON.parse(
      readFileSync(path.join(CASES_DIR, name, "case.json"), "utf-8"),
    ) as QualityCase;

    const parsed = parseMeetingNotesExtraction(meta.extraction);
    if (!parsed.success) {
      console.log("FIXTURE INVALID");
      outcomes.push({
        name,
        status: "failed",
        error: parsed.error.issues[0]?.message ?? "fixture failed the extraction contract",
        findings: [],
        markdown: "",
        costMicros: null,
        vendorCalls: 0,
        elapsedMs: Date.now() - started,
      });
      continue;
    }
    const extraction = parsed.data;
    const lang = isMinutesLang(meta.language) ? meta.language : "bm";

    let cost: number | null = 0;
    let calls = 0;
    const onUsage = (u: TokenUsage) => {
      calls += 1;
      cost = cost === null || u.costMicros === null ? null : cost + u.costMicros;
    };

    try {
      const resolutionTexts = extraction.resolutions
        .filter((r) => r.text.confidence !== "missing" && r.text.value !== "")
        .map((r) => r.text.value);

      const run = await runDraftMinutesPlan({
        provider: getVisionProvider("long_doc"),
        resolutionTexts,
        lang,
        onUsage,
      });
      if (!run.ok) throw new Error("plan failed the coverage/name/merge checks twice");

      const markdown = composeMinutesMd(run.plan, extraction, {
        orgName: meta.orgName,
        confirmedBy: "eval",
        dateIso: new Date().toISOString().slice(0, 10),
        lang,
      });

      const findings = lintMinitMd(markdown, { ...meta.expect, lang });
      console.log(
        findings.length === 0 ? "0 findings ✓" : `${findings.length} findings`,
      );
      outcomes.push({
        name,
        status: "scored",
        findings,
        markdown,
        costMicros: cost,
        vendorCalls: calls,
        elapsedMs: Date.now() - started,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`FAILED — ${msg}`);
      outcomes.push({
        name,
        status: "failed",
        error: msg,
        findings: [],
        markdown: "",
        costMicros: cost,
        vendorCalls: calls,
        elapsedMs: Date.now() - started,
      });
    }
    if (i < caseNames.length - 1) await sleep(PAUSE_MS);
  }

  // --- summary ---
  const totalFindings = outcomes.reduce((n, o) => n + o.findings.length, 0);
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const totalCost = outcomes.reduce<number | null>(
    (n, o) => (n === null || o.costMicros === null ? null : n + o.costMicros),
    0,
  );

  console.log("\n──────── document quality ────────");
  for (const o of outcomes) {
    const label =
      o.status === "failed"
        ? `FAILED (${o.error})`
        : o.findings.length === 0
          ? "PASS"
          : o.findings.map((f) => f.code).join(", ");
    console.log(`  ${o.name}  ${label}`);
  }
  console.log(
    `  TOTAL findings: ${totalFindings} (bar: 0) · pipeline failures: ${failed}` +
      ` · cost: ${totalCost === null ? "unpriced" : `US$${(totalCost / 1_000_000).toFixed(4)}`}`,
  );

  // --- report ---
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const lines: string[] = [
    `# Quality eval — ${stamp}`,
    "",
    `Draft model: \`${providerName}:${model}\` (resolved from AI_MODEL_LONG_DOC / defaults at run time)`,
    "",
    `Total findings: **${totalFindings}** (bar: 0) · pipeline failures: ${failed}`,
    "",
  ];
  for (const o of outcomes) {
    lines.push(`## ${o.name}`, "");
    if (o.status === "failed") {
      lines.push(`**PIPELINE FAILED**: ${o.error}`, "");
    } else {
      lines.push(
        o.findings.length === 0
          ? "**PASS — 0 findings**"
          : ["**Findings:**", ...o.findings.map((f) => `- \`${f.code}\`: ${f.detail}`)].join("\n"),
        "",
        `Vendor calls: ${o.vendorCalls} · cost: ${o.costMicros === null ? "unpriced" : `US$${(o.costMicros / 1_000_000).toFixed(4)}`} · ${o.elapsedMs}ms`,
        "",
        "### Produced document",
        "",
        "```markdown",
        o.markdown,
        "```",
        "",
      );
    }
  }
  const reportPath = path.join(REPORTS_DIR, `quality-${stamp}.md`);
  writeFileSync(reportPath, lines.join("\n"), "utf-8");
  console.log(`\nReport saved: eval\\reports\\quality-${stamp}.md\n`);

  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
