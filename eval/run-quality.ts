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
import { runDraftMinutesPlan, runPhraseMinutesItems } from "../src/lib/ai/draft-minutes-run";
import { parseMeetingNotesExtraction } from "../src/lib/extraction";
import {
  buildPhraseWork,
  composeMinutesMd,
  composeStructuredMinutesMd,
  minutesStructure,
  usableResolutions,
} from "../src/lib/minutes-compose";
import { reconcileExtraction } from "../src/lib/financial-reconcile";
import { formatRm, lintMinitMd, type MinitLintExpectations, type MinitLintFinding } from "../src/lib/minit-format";
import { isMinutesLang, type MinutesLang } from "../src/lib/minutes-lang";
import type { MeetingNotesExtraction } from "../src/lib/extraction";
import type { MinutesPlan } from "../src/lib/minutes-compose";

/** 130 §17: the plain plan — every usable item, in order, verbatim, one
 *  section. The route's own fallback shape; here it is the offline stand-in
 *  for the model so the compose layer can be measured without paying. */
function plainPlan(resolutionTexts: string[]): MinutesPlan {
  return {
    sections: [
      {
        heading: "Perkara-perkara yang dibincangkan",
        items: resolutionTexts.map((text, i) => ({ source: i, text })),
      },
    ],
    unresolved: [],
  };
}

/** 130 §17 (D53/D54/D55): every name and every locked token the extraction
 *  carries must be in the document — names in their own characters, amounts
 *  and IC numbers digit for digit. Checked on every run, online or offline. */
function provenanceFindings(e: MeetingNotesExtraction, md: string): MinitLintFinding[] {
  const out: MinitLintFinding[] = [];
  const present = (f?: { value: string; confidence: string }) =>
    f && f.confidence !== "missing" && f.value.trim() !== "" ? f.value.trim() : null;
  const names = [
    ...e.attendees.map((a) => present(a.name)),
    ...(e.apologies ?? []).map((a) => present(a.name)),
    ...e.office_bearers.map((b) => present(b.person_name)),
    present(e.prepared_by?.person_name),
    present(e.endorsed_by?.person_name),
  ].filter((n): n is string => n !== null);
  for (const n of new Set(names)) {
    if (!md.includes(n)) out.push({ code: "name_lost", detail: n });
  }
  for (const f of e.figures) {
    if (f.amount_cents.confidence === "missing" || f.amount_cents.value === null) continue;
    const digits = String(f.amount_cents.value / 100);
    const rm = formatRm(f.amount_cents.value);
    if (!md.includes(rm) && !md.includes(digits) && !md.includes(rm.replace(".00", ""))) {
      out.push({ code: "locked_lost", detail: `amount ${rm}` });
    }
  }
  for (const b of e.office_bearers) {
    const ic = present(b.ic_no);
    if (ic && !md.includes(ic)) out.push({ code: "locked_lost", detail: `IC ${ic}` });
  }
  return out;
}

const ROOT = path.resolve(__dirname, "..");
const CASES_DIR = path.join(ROOT, "eval", "quality-cases");
const REPORTS_DIR = path.join(ROOT, "eval", "reports");
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS ?? 2000);
/**
 * 130 §17: `--offline` — the COMPOSE LAYER alone, zero vendor calls, zero
 * money. Structured cases compose deterministically (as they already did
 * when no phrasing was needed); an unstructured case gets the plain plan
 * (every item in one section, verbatim — the same shape the route falls back
 * to when the model fails twice). What this measures is everything AFTER the
 * model: the fixed passages, the glossary, the date form, the headcount line,
 * the signature block, the sub-heading recovery, and the PROVENANCE checks
 * below (every name and every locked token of the extraction must be in the
 * document). `--lang bm,zh,en` runs each case in several languages — the
 * three copies must all pass (三語一致).
 */
const OFFLINE = process.argv.includes("--offline");
const LANGS = (() => {
  const i = process.argv.indexOf("--lang");
  return i === -1 ? null : process.argv[i + 1]?.split(",").map((s) => s.trim()).filter(isMinutesLang) ?? null;
})();

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
  /** 125 §4: what the figures' arithmetic must say for this page. */
  reconcile?: "balanced" | "mismatch" | "not_applicable";
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

  const { provider: providerName, model } = OFFLINE
    ? { provider: "offline", model: "compose layer only (no vendor)" }
    : resolveModel("long_doc");
  console.log(`\nMinit quality eval — draft model: ${providerName}:${model}${OFFLINE ? " · --offline" : ""}\n`);

  const caseNames = readdirSync(CASES_DIR).filter((d) =>
    existsSync(path.join(CASES_DIR, d, "case.json")),
  );
  const outcomes: CaseOutcome[] = [];

  const runs: { name: string; caseName: string; lang: MinutesLang | null }[] = [];
  for (const caseName of caseNames) {
    if (LANGS && LANGS.length > 0) for (const lang of LANGS) runs.push({ name: `${caseName} [${lang}]`, caseName, lang });
    else runs.push({ name: caseName, caseName, lang: null });
  }
  for (const [i, run] of runs.entries()) {
    const { name, caseName } = run;
    process.stdout.write(`[${i + 1}/${runs.length}] ${name} ... `);
    const started = Date.now();
    const meta = JSON.parse(
      readFileSync(path.join(CASES_DIR, caseName, "case.json"), "utf-8"),
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
    const lang: MinutesLang = run.lang ?? (isMinutesLang(meta.language) ? meta.language : "bm");

    let cost: number | null = 0;
    let calls = 0;
    const onUsage = (u: TokenUsage) => {
      calls += 1;
      cost = cost === null || u.costMicros === null ? null : cost + u.costMicros;
    };

    try {
      const composeOpts = {
        orgName: meta.orgName,
        confirmedBy: "eval",
        dateIso: new Date().toISOString().slice(0, 10),
        lang,
      };

      // The SAME decision tree the route runs (G2): a structured document is
      // assembled deterministically (model phrases only what needs the target
      // language); an unstructured one goes through the arranging loop.
      let markdown: string;
      const structure = minutesStructure(extraction);
      if (structure) {
        const work = buildPhraseWork(extraction, lang);
        if (work.items.length === 0 || OFFLINE) {
          // Offline: a structured document composes deterministically in ANY
          // language — titles and paragraphs pass through verbatim, so a zh
          // or en copy of a BM page reads BM inside its own furniture. That
          // is what the compose layer does without a model; the lint still
          // measures the furniture, the dates, the names, the tokens.
          markdown = composeStructuredMinutesMd(extraction, composeOpts);
        } else {
          const run = await runPhraseMinutesItems({
            provider: getVisionProvider("long_doc"),
            items: work.items,
            allTexts: work.allTexts,
            lang,
            onUsage,
          });
          if (!run.ok) throw new Error("phrasing failed the coverage/name checks twice");
          const { texts, titles } = work.split(run.phrased);
          markdown = composeStructuredMinutesMd(extraction, composeOpts, texts, titles);
        }
      } else if (OFFLINE) {
        const resolutionTexts = usableResolutions(extraction).map((r) => r.text.value);
        markdown = composeMinutesMd(plainPlan(resolutionTexts), extraction, composeOpts);
      } else {
        const resolutionTexts = usableResolutions(extraction).map((r) => r.text.value);
        const run = await runDraftMinutesPlan({
          provider: getVisionProvider("long_doc"),
          resolutionTexts,
          lang,
          onUsage,
        });
        if (!run.ok) throw new Error("plan failed the coverage/name/merge checks twice");
        markdown = composeMinutesMd(run.plan, extraction, composeOpts);
      }

      // A case's mustContain / mustNotContain are written for ITS language
      // (BM labels, BM glossary words); a cross-language run (--lang) keeps
      // the structural checks and the provenance checks, and drops those two.
      const ownLanguage = run.lang === null || run.lang === (isMinutesLang(meta.language) ? meta.language : "bm");
      const expectFor = ownLanguage ? meta.expect : { ...meta.expect, mustContain: [], mustNotContain: [] };
      const findings = lintMinitMd(markdown, { ...expectFor, lang });
      // 130 §17: provenance — names and locked tokens must be in the document.
      findings.push(...provenanceFindings(extraction, markdown));
      // 125 §4: the treasurer's arithmetic — pure code over the confirmed
      // figures, so a case can say whether its page balances. Zero cost.
      if (meta.reconcile) {
        const r = reconcileExtraction(extraction);
        if (r.status !== meta.reconcile) {
          findings.push({
            code: "reconcile_unexpected",
            detail: `expected ${meta.reconcile}, got ${r.status}${r.status === "mismatch" ? ` (diff ${r.diffCents} sen)` : ""}`,
          });
        }
      }
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
    if (!OFFLINE && i < runs.length - 1) await sleep(PAUSE_MS);
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
