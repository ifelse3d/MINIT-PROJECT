// ---------------------------------------------------------------------------
// LOCAL PROBE — §2 (work order 104): does the constitution read hand back the
// society's own NAME, ADDRESS and REGISTRATION NUMBER, and is what it hands
// back better than the regex that used to guess them?
//
//   npx tsx scripts/probe-constitution-104.ts <path-to-constitution.pdf> [orgName]
//
// WHAT IT DOES. Sends SEGMENT 1 — pages 1..CONSTITUTION_SEGMENT_PAGES, exactly
// the piece the app's segmented reader sends first — through the real prompt,
// the real provider and the real zod contract, then prints, side by side:
//
//   AFTER  what extraction.organisation says (the new §2 fields)
//   BEFORE what src/lib/constitution-identity.ts would have answered from the
//          same clauses with the regex alone (the old, and only, reader)
//
// J's report this answers, 2026-08-31 evening: 「名字讀成 Persatuan、地址斷在
// Taman」.
//
// PRIVACY (A3): the path is an ARGUMENT — nothing from the document enters the
// repo. The full extraction is written to eval/reports/ (git-ignored, this
// machine only). The console prints the three identity fields (that IS the
// measurement) and clause STRUCTURE only, never clause bodies.
//
// Costs ONE real vendor call.
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
import { parseConstitutionExtraction } from "../src/lib/extraction";
import { extractConstitutionPrompt } from "../src/prompts/extract-constitution";
import { CONSTITUTION_SEGMENT_PAGES } from "../src/lib/constitution-pages";
import {
  findRegisteredAddress,
  findRegisteredName,
  readRegisteredAddress,
  readRegisteredName,
  readRegistrationNo,
} from "../src/lib/constitution-identity";
import type { ConfirmedClause } from "../src/lib/constitution";

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

/** Pages 1..N of a PDF, as its own PDF — the app's first segment. */
async function firstSegment(bytes: Buffer): Promise<{ base64: string; pages: number; total: number }> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, {
    updateMetadata: false,
    ignoreEncryption: true,
  });
  const total = doc.getPageCount();
  const take = Math.min(total, CONSTITUTION_SEGMENT_PAGES);
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    doc,
    Array.from({ length: take }, (_, i) => i),
  );
  for (const p of copied) out.addPage(p);
  return {
    base64: Buffer.from(await out.save()).toString("base64"),
    pages: take,
    total,
  };
}

function line(label: string, fact: { value: string } | null): string {
  return `  ${label.padEnd(18)} ${fact ? fact.value : "(nothing — the panel says so)"}`;
}

async function main() {
  loadEnvLocal();
  const docPath = process.argv[2];
  if (!docPath || !existsSync(docPath)) {
    console.error(
      "usage: npx tsx scripts/probe-constitution-104.ts <constitution.pdf|jpg|png> [orgName]",
    );
    process.exitCode = 1;
    return;
  }
  const orgName = process.argv[3] ?? "Pertubuhan Contoh";
  const { provider, model } = resolveModel("extract");
  console.log(`model: ${provider}:${model}`);

  const bytes = readFileSync(docPath);
  const isPdf = docPath.toLowerCase().endsWith(".pdf");
  let base64: string;
  let mimeType: string;
  if (isPdf) {
    const seg = await firstSegment(bytes);
    base64 = seg.base64;
    mimeType = "application/pdf";
    console.log(
      `document: ${seg.total} pages · sending segment 1 (pages 1-${seg.pages}), same as the app`,
    );
  } else {
    base64 = bytes.toString("base64");
    mimeType = docPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    console.log("document: one image · sent whole, same as the app");
  }

  let cost: number | null = 0;
  const onUsage = (u: TokenUsage) => {
    cost = cost === null || u.costMicros === null ? null : cost + u.costMicros;
  };

  const basePrompt = extractConstitutionPrompt({ orgName });
  // CLAUDE.md rule 7, same as the live route: one retry with the validation
  // error appended, so the probe measures the pipeline the app runs.
  let raw = await getVisionProvider("extract").extractJson({
    prompt: basePrompt,
    imageBase64: base64,
    mimeType,
    maxOutputTokens: EXTRACT_OUTPUT_CEILING.constitution,
    onUsage,
  });
  let parsed = parseConstitutionExtraction(raw);
  if (!parsed.success) {
    console.log("first attempt failed the contract — rule-7 retry");
    raw = await getVisionProvider("extract").extractJson({
      prompt:
        basePrompt +
        `\n\nYOUR PREVIOUS ANSWER FAILED VALIDATION:\n${JSON.stringify(
          parsed.error.issues.slice(0, 5),
        )}\nReturn corrected JSON.`,
      imageBase64: base64,
      mimeType,
      maxOutputTokens: EXTRACT_OUTPUT_CEILING.constitution,
      onUsage,
    });
    parsed = parseConstitutionExtraction(raw);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = path.join(
    ROOT,
    "eval",
    "reports",
    `constitution-104-${stamp}.json`,
  );
  writeFileSync(outPath, JSON.stringify(raw, null, 2), "utf-8");

  if (!parsed.success) {
    console.log("PARSE FAILED:", parsed.error.issues.slice(0, 3));
    console.log(`raw written to ${path.relative(ROOT, outPath)}`);
    process.exitCode = 1;
    return;
  }

  const e = parsed.data;
  const clauses: ConfirmedClause[] = e.clauses
    .filter(
      (c) =>
        c.clause_no.confidence !== "missing" &&
        c.text.confidence !== "missing" &&
        c.text.value !== "",
    )
    .map((c) => ({
      clause_no: c.clause_no.value,
      heading: c.heading.confidence === "missing" ? "" : c.heading.value,
      text: c.text.value,
      page_ref: c.page_ref.confidence === "missing" ? "" : c.page_ref.value,
    }));

  console.log(`\nclauses read: ${clauses.length}`);
  console.log(`organisation block: ${e.organisation ? "present" : "ABSENT"}`);

  console.log("\nAFTER — what §2 hands to the screen (AI first, regex fallback):");
  console.log(line("registered name", readRegisteredName(clauses, e.organisation)));
  console.log(line("registered address", readRegisteredAddress(clauses, e.organisation)));
  console.log(line("registration no", readRegistrationNo(e.organisation)));

  const nameOnly = findRegisteredName(clauses);
  const addrOnly = findRegisteredAddress(clauses);
  console.log("\nBEFORE — the clause regex on its own (what J saw):");
  console.log(line("registered name", nameOnly ? { value: nameOnly.name } : null));
  console.log(line("registered address", addrOnly ? { value: addrOnly.address } : null));
  console.log("  registration no    (there has never been a regex for it)");

  console.log(
    `\ncost: ${cost === null ? "unknown" : `$${(cost / 1_000_000).toFixed(6)}`}`,
  );
  console.log(`full extraction: ${path.relative(ROOT, outPath)} (git-ignored)`);
}

void main();
