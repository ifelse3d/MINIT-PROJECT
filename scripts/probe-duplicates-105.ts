// ---------------------------------------------------------------------------
// §3 (work order 105) — WHERE THE "these look like the same meeting twice"
// BAR SITS, measured rather than chosen.
//
//   npx tsx scripts/probe-duplicates-105.ts [readings.json ...]
//
// With no arguments it uses every versions-104-*.json in eval/reports — the
// readings work order 104 already paid for, so this probe costs NOTHING and
// reaches no vendor.
//
// 🔴 PRIVACY (A3). It prints COUNTS AND RATIOS ONLY. Not one line of J's
// meetings leaves this machine, and nothing it prints can be pasted into a
// report and accidentally publish somebody's minutes.
//
// It also builds the negative control the threshold needs: a real pair of
// PAGES. Two pages of one meeting are, by construction, the decisions the
// other page does not carry — so the first half and the second half of a
// single long reading are exactly that shape, and the probe scores them the
// same way.
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import "./allow-server-only";

import { parseMeetingNotesExtraction, type MeetingNotesExtraction } from "../src/lib/extraction";
import {
  DUPLICATE_ASK_RATIO,
  DUPLICATE_MIN_ITEMS,
  findRepeatedReading,
} from "../src/lib/duplicate-pages";

const ROOT = path.resolve(__dirname, "..");
const REPORTS = path.join(ROOT, "eval", "reports");

function filesToRead(): string[] {
  const args = process.argv.slice(2);
  if (args.length > 0) return args;
  return readdirSync(REPORTS)
    .filter((f) => /^versions-104-.*\.json$/.test(f))
    .map((f) => path.join(REPORTS, f));
}

/** Split ONE reading down the middle: the negative control. Two halves of one
 *  document share no decision with each other — the shape of real pages. */
function halves(e: MeetingNotesExtraction): [MeetingNotesExtraction, MeetingNotesExtraction] {
  const rows = e.resolutions;
  const mid = Math.ceil(rows.length / 2);
  return [
    { ...e, resolutions: rows.slice(0, mid) },
    { ...e, resolutions: rows.slice(mid) },
  ];
}

let failures = 0;

for (const file of filesToRead()) {
  const raw = JSON.parse(readFileSync(file, "utf-8")) as { readA?: unknown; readB?: unknown };
  const a = parseMeetingNotesExtraction(raw.readA);
  const b = parseMeetingNotesExtraction(raw.readB);
  if (!a.success || !b.success) {
    console.log(`SKIP  ${path.basename(file)} — not a pair of readings`);
    continue;
  }

  const positive = findRepeatedReading([a.data, b.data]);
  const [h1, h2] = halves(b.data);
  const negative = findRepeatedReading([h1, h2]);

  const nA = a.data.resolutions.length;
  const nB = b.data.resolutions.length;
  console.log(`\n${path.basename(file)}`);
  console.log(`  decisions: A=${nA}  B=${nB}`);
  console.log(
    `  TWO VERSIONS of one meeting → ${
      positive
        ? `ASK (matches ${positive.matches}/${Math.min(nA, nB)}, ratio ${positive.ratio.toFixed(2)})`
        : "silent"
    }`,
  );
  console.log(
    `  TWO PAGES (control: one reading cut in half) → ${
      negative ? `ASK (ratio ${negative.ratio.toFixed(2)})` : "silent"
    }`,
  );

  if (!positive) {
    console.log("  ✗ FAIL — the real repeated pair should be asked about");
    failures += 1;
  }
  if (negative) {
    console.log("  ✗ FAIL — two genuine pages must never be asked about");
    failures += 1;
  }
}

console.log(
  `\nbar: ratio ≥ ${DUPLICATE_ASK_RATIO}, shorter reading ≥ ${DUPLICATE_MIN_ITEMS} decisions`,
);
console.log(failures === 0 ? "\nPASS" : `\nFAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
