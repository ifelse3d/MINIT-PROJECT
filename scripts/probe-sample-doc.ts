// ---------------------------------------------------------------------------
// LOCAL PROBE — the WHOLE pipeline against a REAL sample photo (work order 68
// §4 acceptance): photo → extraction → (confirm everything, as the human
// would) → the route's own compose decision tree → the finished document.
//
//   npx tsx scripts/probe-sample-doc.ts <photo> [lang] [orgName]
//
// PRIVACY (A3): console prints lint findings and structure only; the full
// document lands in eval/reports/ (git-ignored, this machine only).
// Model for the phrase step follows AI_MODEL_LONG_DOC — set it to compare
// candidates. Costs real vendor calls (extract; phrase only when needed).
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import "./allow-server-only";

import {
  getVisionProvider,
  resolveModel,
  EXTRACT_OUTPUT_CEILING,
  type TokenUsage,
} from "../src/lib/ai/provider";
import { runDraftMinutesPlan, runPhraseMinutesItems } from "../src/lib/ai/draft-minutes-run";
import { parseMeetingNotesExtraction, type MeetingNotesExtraction } from "../src/lib/extraction";
import {
  buildPhraseWork,
  composeMinutesMd,
  composeStructuredMinutesMd,
  minutesStructure,
  usableResolutions,
} from "../src/lib/minutes-compose";
import { lintMinitMd } from "../src/lib/minit-format";
import { isMinutesLang } from "../src/lib/minutes-lang";

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

/** The human's part, simulated: every field confirmed exactly as read. */
function confirmAll(e: MeetingNotesExtraction): MeetingNotesExtraction {
  const c = structuredClone(e);
  const touch = (f?: { confidence: string } | null) => {
    if (f && f.confidence === "check") f.confidence = "confirmed";
  };
  touch(c.meeting_type);
  touch(c.meeting_date);
  touch(c.meeting_venue);
  touch(c.meeting_time);
  touch(c.attendance_count);
  touch(c.adjournment);
  touch(c.prepared_by?.position);
  touch(c.prepared_by?.person_name);
  touch(c.endorsed_by?.position);
  touch(c.endorsed_by?.person_name);
  c.attendees.forEach((a) => touch(a.name));
  c.resolutions.forEach((r) => touch(r.text));
  c.figures.forEach((f) => {
    touch(f.description);
    touch(f.amount_cents);
  });
  c.office_bearers.forEach((b) => {
    touch(b.position);
    touch(b.person_name);
  });
  return c;
}

async function main() {
  loadEnvLocal();
  const imgPath = process.argv[2];
  if (!imgPath || !existsSync(imgPath)) {
    console.error("usage: npx tsx scripts/probe-sample-doc.ts <photo> [lang] [orgName]");
    process.exitCode = 1;
    return;
  }
  const lang = isMinutesLang(process.argv[3] ?? "bm") ? (process.argv[3] as "bm" | "zh" | "en") : "bm";
  const orgName = process.argv[4] ?? "Pertubuhan Contoh";
  const extractModel = resolveModel("extract");
  const draftModel = resolveModel("long_doc");
  console.log(`extract: ${extractModel.provider}:${extractModel.model} · draft: ${draftModel.provider}:${draftModel.model} · lang: ${lang}`);

  let cost: number | null = 0;
  let calls = 0;
  const onUsage = (u: TokenUsage) => {
    calls += 1;
    cost = cost === null || u.costMicros === null ? null : cost + u.costMicros;
  };

  // 1. extract (rule-7 retry like the live route). A .docx goes through the
  // route's own office branch — converted to LABELLED TEXT, no image.
  const { extractMeetingNotesPrompt } = await import("../src/prompts/extract-meeting-notes");
  let basePrompt = extractMeetingNotesPrompt({
    orgName,
    todayIso: new Date().toISOString().slice(0, 10),
  });
  let media: { imageBase64?: string; mimeType?: string } = {};
  if (/\.(docx|pptx)$/i.test(imgPath)) {
    const { officeFileToText } = await import("../src/lib/office-text");
    const { untrustedBlock } = await import("../src/prompts/untrusted");
    const buf = readFileSync(imgPath);
    const converted = await officeFileToText(
      path.basename(imgPath),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    );
    if (!converted.ok) {
      console.log("OFFICE FILE COULD NOT BE CONVERTED");
      process.exitCode = 1;
      return;
    }
    basePrompt += `\n\n${untrustedBlock(
      "THE DOCUMENT'S FULL TEXT (converted from a Word/PowerPoint file on the server — there is no photo; read this text as the page itself)",
      converted.text,
    )}`;
  } else {
    media = {
      imageBase64: readFileSync(imgPath).toString("base64"),
      mimeType: imgPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
    };
  }
  let raw = await getVisionProvider("extract").extractJson({
    prompt: basePrompt,
    ...media,
    maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
    onUsage,
  });
  let parsed = parseMeetingNotesExtraction(raw);
  if (!parsed.success) {
    raw = await getVisionProvider("extract").extractJson({
      prompt:
        basePrompt +
        `\n\nYOUR PREVIOUS ANSWER FAILED VALIDATION:\n${JSON.stringify(parsed.error.issues.slice(0, 5))}\nReturn corrected JSON.`,
      ...media,
      maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
      onUsage,
    });
    parsed = parseMeetingNotesExtraction(raw);
  }
  if (!parsed.success) {
    console.log("EXTRACTION FAILED THE CONTRACT TWICE");
    process.exitCode = 1;
    return;
  }

  // 2. the human confirms
  const extraction = confirmAll(parsed.data);

  // 3. the route's decision tree
  const composeOpts = {
    orgName,
    confirmedBy: "probe",
    dateIso: new Date().toISOString().slice(0, 10),
    lang,
  };
  let markdown: string;
  let how: string;
  const structure = minutesStructure(extraction);
  if (structure) {
    const work = buildPhraseWork(extraction, lang);
    if (work.items.length === 0) {
      markdown = composeStructuredMinutesMd(extraction, composeOpts);
      how = "structured, deterministic (ZERO draft vendor calls)";
    } else {
      const run = await runPhraseMinutesItems({
        provider: getVisionProvider("long_doc"),
        items: work.items,
        allTexts: work.allTexts,
        lang,
        onUsage,
      });
      if (!run.ok) {
        console.log("PHRASING FAILED THE CHECKS TWICE");
        process.exitCode = 1;
        return;
      }
      const { texts, titles } = work.split(run.phrased);
      markdown = composeStructuredMinutesMd(extraction, composeOpts, texts, titles);
      how = `structured, ${work.items.length} item(s)/title(s) phrased by the model`;
    }
  } else {
    const texts = usableResolutions(extraction).map((r) => r.text.value);
    const run = await runDraftMinutesPlan({
      provider: getVisionProvider("long_doc"),
      resolutionTexts: texts,
      lang,
      onUsage,
    });
    if (!run.ok) {
      console.log("PLAN FAILED THE CHECKS TWICE — last repair:", JSON.stringify(run.repair));
      const texts2 = usableResolutions(extraction).map((r, i) => `${i}: ${r.text.value}`);
      for (const idx of run.repair?.altered ?? []) console.log("  altered source:", texts2[idx]);
      process.exitCode = 1;
      return;
    }
    markdown = composeMinutesMd(run.plan, extraction, composeOpts);
    how = "unstructured, model-arranged";
  }

  // 4. the ruler (structure expectations derived from what the page had)
  const findings = lintMinitMd(markdown, {
    lang,
    masa: extraction.meeting_time !== undefined,
    agendaTable: structure !== null && structure.some((s) => s.no !== ""),
    attendanceCount:
      extraction.attendance_count !== undefined || extraction.attendees.length > 0,
  });

  console.log(`path: ${how}`);
  console.log(
    findings.length === 0
      ? "lint: 0 findings ✓"
      : `lint: ${findings.map((f) => f.code).join(", ")}`,
  );
  console.log(
    `vendor calls: ${calls} · cost: ${cost === null ? "unpriced" : `US$${((cost as number) / 1_000_000).toFixed(4)}`}`,
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const model = draftModel.model.replace(/[^a-z0-9.-]/gi, "_");
  const out = path.join(ROOT, "eval", "reports", `sample-doc-${lang}-${model}-${stamp}.md`);
  writeFileSync(out, markdown, "utf-8");
  console.log(`document (LOCAL ONLY, git-ignored): ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
