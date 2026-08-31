// ---------------------------------------------------------------------------
// §2 (work order 105) — THE TIDY PASS, on a real reading, through the real
// provider and the real checks.
//
//   npx tsx scripts/probe-tidy-105.ts [readings.json] [which: A|B|pages]
//
// With no arguments it uses the newest versions-104-*.json in eval/reports —
// a reading work order 104 already paid for — so this probe reads NO
// photograph and costs ONE cheap text call.
//
// 🔴 IT DOES NOT TOUCH extract-meeting-notes. It starts from the verbatim JSON
// that prompt already produced, which is the architectural law of §2 and the
// reason the extraction eval baseline cannot move.
//
// 🔴 PRIVACY (A3). The console prints the SHAPE — how many lines before, how
// many paragraphs after, the enumerator sequence, how many paragraphs fell
// back to their verbatim wording. The full before/after text goes to
// eval/reports/ (git-ignored, this machine only).
// ---------------------------------------------------------------------------

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import "./allow-server-only";

import {
  EXTRACT_OUTPUT_CEILING,
  getVisionProvider,
  resolveModel,
  type TokenUsage,
} from "../src/lib/ai/provider";
import { parseMeetingNotesExtraction } from "../src/lib/extraction";
import { mergeMeetingExtractions } from "../src/lib/extraction-merge";
import { runTidyMinutes } from "../src/lib/ai/tidy-minutes-run";
import { tidySourceItems } from "../src/lib/tidy-minutes";

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(ROOT, "eval", "reports");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/** The printed enumerator a line starts with ("3.", "2.1") or "—". */
function enumeratorOf(text: string): string {
  const m = /^\s*([0-9]+(?:\.[0-9]+)*)[.)、]?/.exec(text);
  return m ? m[1] : "—";
}

async function run() {
  loadEnvLocal();

  const fileArg = process.argv[2];
  const which = (process.argv[3] ?? "pages").toUpperCase();
  const file =
    fileArg ??
    path.join(
      REPORTS,
      readdirSync(REPORTS)
        .filter((f) => /^versions-104-.*\.json$/.test(f))
        .sort()
        .pop() ?? "",
    );
  if (!existsSync(file)) {
    console.error("no readings file — pass one as the first argument");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
  const a = parseMeetingNotesExtraction(raw.readA);
  const b = parseMeetingNotesExtraction(raw.readB);
  if (!a.success || !b.success) {
    console.error("that file does not hold two readings");
    process.exit(1);
  }
  const extraction =
    which === "A" ? a.data : which === "B" ? b.data : mergeMeetingExtractions(a.data, b.data);

  const items = tidySourceItems(extraction);
  console.log(`source: ${path.basename(file)} (${which})`);
  console.log(`model : ${JSON.stringify(resolveModel("extract"))}`);
  console.log(`\nBEFORE — ${items.length} verbatim lines`);
  console.log(`  enumerators: ${items.map((i) => enumeratorOf(i.text)).join(" ")}`);
  console.log(`  lengths    : ${items.map((i) => i.text.length).join(",")}`);

  let inTok = 0;
  let outTok = 0;
  let micros = 0;
  const onUsage = (u: TokenUsage) => {
    inTok += u.inputTokens ?? 0;
    outTok += u.outputTokens ?? 0;
    micros += u.costMicros ?? 0;
  };

  const result = await runTidyMinutes({
    provider: getVisionProvider("extract"),
    extraction,
    orgName: "PERTUBUHAN CONTOH HARMONI",
    items,
    onUsage,
    maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
  });

  if (!result.ok) {
    console.log(`\nAFTER — refused (${result.reason}); the verbatim layer stands unchanged.`);
    console.log(`cost: US$${(micros / 1e6).toFixed(4)} (in ${inTok} / out ${outTok})`);
    process.exit(1);
  }

  const doc = result.doc;
  const paragraphs = [
    ...doc.sections.flatMap((s) => s.items),
    ...doc.unresolved,
  ];
  console.log(`\nAFTER — ${paragraphs.length} paragraphs in ${doc.sections.length} section(s)`);
  console.log(`  folded away : ${doc.merged} repeated line(s)`);
  console.log(`  fell back   : ${doc.fallbacks} paragraph(s) shown as written`);
  console.log(`  lengths     : ${paragraphs.map((p) => p.text.length).join(",")}`);
  console.log(`  sources     : ${paragraphs.map((p) => `[${p.source.join("+")}]`).join(" ")}`);
  console.log(`\ncost: US$${(micros / 1e6).toFixed(4)} (in ${inTok} / out ${outTok})`);

  const out = path.join(REPORTS, `tidy-105-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    out,
    JSON.stringify({ before: items, after: doc, cost: { inTok, outTok, micros } }, null, 2),
    "utf-8",
  );
  console.log(`full before/after (git-ignored): ${out}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
