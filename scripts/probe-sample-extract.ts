// ---------------------------------------------------------------------------
// LOCAL PROBE — extraction structure against a REAL sample photo (work order
// 68, G1 acceptance: "the structure extracted from sample A must line up with
// the original, section by section").
//
//   npx tsx scripts/probe-sample-extract.ts <path-to-photo> [orgName]
//
// PRIVACY (A3): the photo path is an argument; nothing from the photo enters
// the repo. The full extraction is written to eval/reports/ (git-ignored,
// this machine only); the console prints STRUCTURE ONLY (section numbers,
// heading word counts, paragraph lengths) so a transcript quoted in a report
// leaks no content. Costs one real vendor call.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import "./allow-server-only";

import { getVisionProvider, resolveModel, EXTRACT_OUTPUT_CEILING, type TokenUsage } from "../src/lib/ai/provider";
import { parseMeetingNotesExtraction } from "../src/lib/extraction";
import { extractMeetingNotesPrompt } from "../src/prompts/extract-meeting-notes";

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

async function main() {
  loadEnvLocal();
  const imgPath = process.argv[2];
  if (!imgPath || !existsSync(imgPath)) {
    console.error("usage: npx tsx scripts/probe-sample-extract.ts <photo> [orgName]");
    process.exitCode = 1;
    return;
  }
  const orgName = process.argv[3] ?? "Pertubuhan Contoh";
  const { provider, model } = resolveModel("extract");
  console.log(`model: ${provider}:${model}`);

  let cost: number | null = 0;
  const onUsage = (u: TokenUsage) => {
    cost = cost === null || u.costMicros === null ? null : cost + u.costMicros;
  };

  const basePrompt = extractMeetingNotesPrompt({
    orgName,
    todayIso: new Date().toISOString().slice(0, 10),
  });
  const imageBase64 = readFileSync(imgPath).toString("base64");
  const mimeType = imgPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

  // CLAUDE.md rule 7, same as the live route: on a contract failure, retry
  // ONCE with the validation error appended — the probe must measure the
  // pipeline the app actually runs, retry included.
  let raw = await getVisionProvider("extract").extractJson({
    prompt: basePrompt,
    imageBase64,
    mimeType,
    maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
    onUsage,
  });
  let parsed = parseMeetingNotesExtraction(raw);
  if (!parsed.success) {
    console.log("first attempt failed the contract — rule-7 retry with the error appended");
    raw = await getVisionProvider("extract").extractJson({
      prompt:
        basePrompt +
        `\n\nYOUR PREVIOUS ANSWER FAILED VALIDATION:\n${JSON.stringify(parsed.error.issues.slice(0, 5))}\nReturn corrected JSON.`,
      imageBase64,
      mimeType,
      maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
      onUsage,
    });
    parsed = parseMeetingNotesExtraction(raw);
  }
  if (!parsed.success) {
    console.log("PARSE FAILED:", parsed.error.issues.slice(0, 3));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    writeFileSync(
      path.join(ROOT, "eval", "reports", `sample-extract-RAW-${stamp}.json`),
      JSON.stringify(raw, null, 2),
      "utf-8",
    );
    process.exitCode = 1;
    return;
  }
  const e = parsed.data;

  // STRUCTURE ONLY on the console — content stays out of transcripts.
  const has = (f?: { confidence: string } | null) =>
    f ? f.confidence : "(absent)";
  console.log("header fields:");
  console.log(`  meeting_type=${e.meeting_type.confidence} date=${e.meeting_date.confidence} time=${has(e.meeting_time)} venue=${e.meeting_venue.confidence}`);
  console.log(`  attendance_count=${has(e.attendance_count)} adjournment=${has(e.adjournment)} prepared_by=${e.prepared_by ? "present" : "(absent)"} endorsed_by=${e.endorsed_by ? "present" : "(absent)"}`);
  console.log(`attendees: ${e.attendees.length}  figures: ${e.figures.length}  office_bearers: ${e.office_bearers.length}`);
  console.log(`resolutions: ${e.resolutions.length}`);
  const sections = new Map<string, { title: string; n: number; chars: number; ownNos: string[] }>();
  for (const r of e.resolutions) {
    const k = r.section_no ?? "(none)";
    const s = sections.get(k) ?? {
      title: r.section_title ?? "",
      n: 0,
      chars: 0,
      ownNos: [],
    };
    s.n += 1;
    s.chars += r.text.value.length;
    if (r.own_no) s.ownNos.push(r.own_no);
    sections.set(k, s);
  }
  for (const [no, s] of sections) {
    console.log(
      `  section ${no}: ${s.n} item(s), ${s.chars} chars total, title ${s.title === "" ? "(none)" : `${s.title.length} chars`}${s.ownNos.length ? `, own_no: ${s.ownNos.join(",")}` : ""}`,
    );
  }
  // Enumerator continuity for list pages: report the leading numbers seen.
  const leading = e.resolutions
    .map((r) => r.text.value.match(/^\s*(\d{1,3})[.、．)]/)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  if (leading.length > 1) {
    const gaps: string[] = [];
    for (let i = 1; i < leading.length; i++) {
      if (leading[i] - leading[i - 1] > 1) gaps.push(`${leading[i - 1]}→${leading[i]}`);
    }
    console.log(`list numbering seen: ${leading.join(",")}${gaps.length ? `  ⚠ GAPS: ${gaps.join(" ")}` : "  (no gaps)"}`);
  }
  console.log(`cost: ${cost === null ? "unpriced" : `US$${((cost as number) / 1_000_000).toFixed(4)}`}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.join(ROOT, "eval", "reports", `sample-extract-${stamp}.json`);
  writeFileSync(out, JSON.stringify(e, null, 2), "utf-8");
  console.log(`full extraction (LOCAL ONLY, git-ignored): ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
