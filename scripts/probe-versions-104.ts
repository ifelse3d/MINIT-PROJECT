// ---------------------------------------------------------------------------
// §10 (work order 104) — TWO PAPERS ABOUT ONE MEETING: pages, or versions?
//
//   npx tsx scripts/probe-versions-104.ts <fileA> <fileB> [orgName]
//
// J, 2026-08-31 evening, holding a short "need to do" note and the typed-up
// minit of the same meeting: read as PAGES, the finished document ran
// "3. 4. 5." and then "1. 2.1 4. 5." — the same agenda twice, in two hands.
//
// This reads both papers ONCE through the real prompt, the real provider and
// the real zod contract, then folds them BOTH WAYS and prints the two agendas
// side by side:
//
//   BEFORE  mergeMeetingExtractions  (pages — concatenate, today's behaviour)
//   AFTER   mergeMeetingVersions     (versions — fullest wins, others add)
//
// PRIVACY (A3): the paths are ARGUMENTS. The console prints the ENUMERATOR
// SEQUENCE and line lengths — the shape of the bug — not the meeting's
// contents; the full readings go to eval/reports/ (git-ignored, this machine).
//
// Costs TWO real vendor calls (one per paper).
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import "./allow-server-only";

import {
  EXTRACT_OUTPUT_CEILING,
  getVisionProvider,
  resolveModel,
  type TokenUsage,
} from "../src/lib/ai/provider";
import {
  parseMeetingNotesExtraction,
  type MeetingNotesExtraction,
} from "../src/lib/extraction";
import { extractMeetingNotesPrompt } from "../src/prompts/extract-meeting-notes";
import { mergeMeetingExtractions } from "../src/lib/extraction-merge";
import {
  meetingRichness,
  mergeMeetingVersions,
} from "../src/lib/extraction-versions";

const ROOT = path.resolve(__dirname, "..");

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

const mimeOf = (p: string) =>
  p.toLowerCase().endsWith(".png")
    ? "image/png"
    : p.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "image/jpeg";

/** The printed enumerator a line starts with ("3.", "2.1", "①") or "—". */
function enumeratorOf(text: string): string {
  const m = /^\s*([0-9]+(?:\.[0-9]+)*)[.)、]?/.exec(text);
  return m ? m[1] : "—";
}

/** The shape of the agenda, with no meeting content in it. */
function agendaShape(e: MeetingNotesExtraction): string {
  return e.resolutions
    .map((r) => `${enumeratorOf(r.text.value)}(${r.text.value.length})`)
    .join("  ");
}

async function readOne(
  file: string,
  orgName: string,
  onUsage: (u: TokenUsage) => void,
): Promise<MeetingNotesExtraction | null> {
  const prompt = extractMeetingNotesPrompt({
    orgName,
    todayIso: new Date().toISOString().slice(0, 10),
  });
  const raw = await getVisionProvider("extract").extractJson({
    prompt,
    imageBase64: readFileSync(file).toString("base64"),
    mimeType: mimeOf(file),
    maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
    onUsage,
  });
  const parsed = parseMeetingNotesExtraction(raw);
  if (!parsed.success) {
    console.log(`PARSE FAILED for ${path.basename(file)}`);
    return null;
  }
  return parsed.data;
}

async function main() {
  loadEnvLocal();

  // --replay <saved.json>: re-fold readings this probe already PAID for.
  // Changing the merge rule and measuring the difference must not cost a
  // second read of the same two papers.
  if (process.argv[2] === "--replay") {
    const saved = JSON.parse(readFileSync(process.argv[3], "utf-8")) as {
      readA: MeetingNotesExtraction;
      readB: MeetingNotesExtraction;
    };
    report(saved.readA, saved.readB, null);
    return;
  }

  const [a, b] = [process.argv[2], process.argv[3]];
  if (!a || !b || !existsSync(a) || !existsSync(b)) {
    console.error(
      "usage: npx tsx scripts/probe-versions-104.ts <fileA> <fileB> [orgName]",
    );
    process.exitCode = 1;
    return;
  }
  const orgName = process.argv[4] ?? "Pertubuhan Contoh";
  const { provider, model } = resolveModel("extract");
  console.log(`model: ${provider}:${model}`);

  let cost: number | null = 0;
  const onUsage = (u: TokenUsage) => {
    cost = cost === null || u.costMicros === null ? null : cost + u.costMicros;
  };

  const readA = await readOne(a, orgName, onUsage);
  const readB = await readOne(b, orgName, onUsage);
  if (!readA || !readB) {
    process.exitCode = 1;
    return;
  }

  report(readA, readB, cost);
}

function report(
  readA: MeetingNotesExtraction,
  readB: MeetingNotesExtraction,
  cost: number | null,
) {
  console.log(
    `\nfacts read: A = ${meetingRichness(readA)} · B = ${meetingRichness(readB)}`,
  );

  const asPages = mergeMeetingExtractions(readA, readB);
  const asVersions = mergeMeetingVersions([readA, readB]);

  console.log("\nBEFORE — read as PAGES (concatenate):");
  console.log(`  lines: ${asPages.resolutions.length}`);
  console.log(`  agenda: ${agendaShape(asPages)}`);
  console.log("\nAFTER — read as VERSIONS (fullest wins, others only add):");
  console.log(`  lines: ${asVersions.resolutions.length}`);
  console.log(`  agenda: ${agendaShape(asVersions)}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.join(ROOT, "eval", "reports", `versions-104-${stamp}.json`);
  writeFileSync(
    out,
    JSON.stringify({ readA, readB, asPages, asVersions }, null, 2),
    "utf-8",
  );
  console.log(
    cost === null
      ? "\ncost: $0 (replay of readings already paid for)"
      : `\ncost: $${(cost / 1_000_000).toFixed(6)}`,
  );
  console.log(`full readings: ${path.relative(ROOT, out)} (git-ignored)`);
}

void main();
