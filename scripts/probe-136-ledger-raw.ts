// 136 diagnosis — run the ledger prompt on ONE image and print the RAW model
// JSON (before zod), then what parse keeps. Costs one extract call. Never
// commit its output; the image may be a real page.
//
//   node node_modules/tsx/dist/cli.mjs scripts/probe-136-ledger-raw.ts <image>
import { readFileSync } from "node:fs";
import path from "node:path";
import "./allow-server-only";
import { getVisionProvider, resolveModel, EXTRACT_OUTPUT_CEILING } from "../src/lib/ai/provider";
import { parseLedgerExtraction } from "../src/lib/extraction";
import { extractLedgerPrompt } from "../src/prompts/extract-ledger";

const envPath = path.join(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
async function main() {
const file = process.argv[2];
  if (!file) throw new Error("image path required");
  const mime = file.endsWith(".png") ? "image/png" : "image/jpeg";
  const imageBase64 = readFileSync(file).toString("base64");
  const provider = getVisionProvider("extract");
  console.log("model:", resolveModel("extract"));
  const raw = await provider.extractJson({
    prompt: extractLedgerPrompt({ orgName: "Pertubuhan Contoh Harmoni", todayIso: "2026-09-09" }),
    imageBase64,
    mimeType: mime,
    maxOutputTokens: EXTRACT_OUTPUT_CEILING.ledger,
    onUsage: (u) => console.log("usage:", u),
  });
  const rows = ((raw as { rows?: unknown[] })?.rows ?? []) as Record<string, unknown>[];
  console.log("RAW rows:", rows.length);
  for (const r of rows) {
    const p = r.purpose as { value?: string } | undefined;
    console.log("  purpose=", JSON.stringify(p?.value), " kind=", JSON.stringify(r.kind));
  }
  const parsed = parseLedgerExtraction(raw);
  console.log("parse ok:", parsed.success);
  if (parsed.success) {
    console.log("KEPT kinds:", parsed.data.rows.map((r) => r.kind?.value ?? "(none)").join(", "));
  } else {
    console.log(parsed.error.issues.slice(0, 10));
  }
  
}
void main();
