// PROBE — how long does one FULL 8-page CONTOH constitution read take, per
// model, with NO route walls (work order 68 §1-8 root-causing)? The route's
// 45s/50s/60s arithmetic is fixed by the platform; what varies is the
// model's generation speed. This measures that, alone.
//
//   npx tsx scripts/probe-constitution-speed.ts [provider:model]
//
// Costs one real constitution read (~US$0.03–0.06). CONTOH is fictional.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import "./allow-server-only";

import { EXTRACT_OUTPUT_CEILING, getVisionProvider, resolveModel, type TokenUsage } from "../src/lib/ai/provider";
import { parseConstitutionExtraction } from "../src/lib/extraction";
import { extractConstitutionPrompt } from "../src/prompts/extract-constitution";

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
  if (process.argv[2]) process.env.AI_MODEL_LONG_DOC = process.argv[2];
  const { provider, model } = resolveModel("long_doc");
  console.log(`model: ${provider}:${model}`);

  const pdf = readFileSync(path.join(ROOT, "public", "contoh", "undang-undang-tubuh-contoh.pdf"));
  let usage: TokenUsage | null = null;

  const started = Date.now();
  const raw = await getVisionProvider("long_doc").extractJson({
    prompt: extractConstitutionPrompt({ orgName: "Pertubuhan Contoh" }),
    imageBase64: pdf.toString("base64"),
    mimeType: "application/pdf",
    maxOutputTokens: EXTRACT_OUTPUT_CEILING.constitution,
    timeoutMs: 180_000, // NO wall — we are measuring, not guarding
    onUsage: (u) => {
      usage = u;
    },
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);

  const parsed = parseConstitutionExtraction(raw);
  if (!parsed.success) {
    console.log("contract issues (first 4):");
    for (const i of parsed.error.issues.slice(0, 4)) {
      console.log(`  ${i.path.join(".")}: ${i.message}`);
    }
  }
  const u = usage as TokenUsage | null;
  console.log(
    `time: ${secs}s · parsed: ${parsed.success ? `${parsed.data.clauses.length} clauses` : "FAILED CONTRACT"}` +
      (u
        ? ` · out tokens: ${u.outputTokens} (${Math.round(u.outputTokens / Number(secs))} tok/s) · cost: ${u.costMicros === null ? "unpriced" : `US$${(u.costMicros / 1_000_000).toFixed(4)}`}`
        : ""),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
