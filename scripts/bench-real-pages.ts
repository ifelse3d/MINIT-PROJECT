/**
 * REAL-PAGE BENCH — `npx tsx scripts/bench-real-pages.ts …`
 * (work order 125 §8 — 拍板 18③ 2026-08-30: the bench is run by engineering,
 * the OUTPUT is left for J to read page by page, and only then does he choose
 * a model. This script changes nothing in .env.)
 *
 * WHY THIS EXISTS. `npm run bench` reads synthetic PRINTED pngs and says so
 * itself: a winner there has proved it reads printed text. Minit's hard job is
 * a HANDWRITTEN mixed-language page, and on 2026-09-07 the SAME model read the
 * SAME 1280px photo twice and disagreed with itself four times (会费→会员,
 * 晚宴→晚晚宴, two names each one character off). So this bench reads the real
 * pages J photographed, several candidate models, EACH TWICE — because a model
 * that cannot agree with itself is today's disease, not one that scores a
 * point lower.
 *
 * WHAT IT RUNS. Exactly the extraction /api/intake runs — the same prompt
 * builder (src/prompts/extract-meeting-notes.ts), the same contract
 * (parseMeetingNotesExtraction with the rule-7 retry), the same provider files
 * — with the model chosen per candidate instead of by resolveModel. Nothing is
 * re-implemented; a difference in the table is a difference in the model.
 *
 * 🔴 PRIVACY (A3 — the repo is public). This file holds NO photo, NO path, NO
 * name: the pages and the output directory come from the command line, the
 * table is written ONLY into that directory, and stdout carries cost, time and
 * agreement counts — never a cell's contents. The report quotes the table with
 * real names replaced (甲乙丙).
 *
 *     --paper A=<photo>[,<photo2>]   a page set (repeat --paper for B, C …)
 *     --out <dir>                    where the table and raw JSON go (required)
 *     --models spec,spec             provider:model list (default: the five below)
 *     --runs N                       reads per model per page (default 2)
 *     --max-usd X                    hard stop on REAL accumulated cost (default 1.00) —
 *                                    checked BEFORE each read, so the read that
 *                                    crosses the line still completes (a sonnet-5
 *                                    read cost US$0.14 once; budget with that in mind)
 *     --timeout-ms N                 per-read vendor timeout (default 60000 — the
 *                                    live route allows 20s; the time column says
 *                                    whether a model would fit it)
 *     --document                     also draft the document with the CURRENT
 *                                    write model from run 1 of the current
 *                                    extract model (the 收工 probe), per paper
 *     --dry-run                      print the plan and the cost estimate only
 *     --yes                          skip the keypress
 *
 * Candidates default: gemini:gemini-3.5-flash-lite (current), gemini:gemini-3.5-flash,
 * openai:gpt-5.6-luna, openai:gpt-5.6-terra, anthropic:claude-sonnet-5 — a
 * candidate whose vendor key is not in .env.local is skipped with a reason.
 * It never prints an API key.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

// MUST come before any src/lib/ai import — see the file for why.
import "./allow-server-only";

/* eslint-disable @typescript-eslint/no-require-imports */
const { PROVIDER_KEY_ENV, getVisionProvider, resolveModel } =
  require("../src/lib/ai/provider") as typeof import("../src/lib/ai/provider");
const { createGeminiProvider } = require("../src/lib/ai/gemini") as typeof import("../src/lib/ai/gemini");
const { createOpenAiProvider } = require("../src/lib/ai/openai") as typeof import("../src/lib/ai/openai");
const { createAnthropicProvider } =
  require("../src/lib/ai/anthropic") as typeof import("../src/lib/ai/anthropic");
const { createXaiProvider } = require("../src/lib/ai/xai") as typeof import("../src/lib/ai/xai");
const { extractMeetingNotesPrompt } =
  require("../src/prompts/extract-meeting-notes") as typeof import("../src/prompts/extract-meeting-notes");
const { parseMeetingNotesExtraction } =
  require("../src/lib/extraction") as typeof import("../src/lib/extraction");
const { mergeMeetingExtractions } =
  require("../src/lib/extraction-merge") as typeof import("../src/lib/extraction-merge");
const { parseHeadcount } = require("../src/lib/headcount") as typeof import("../src/lib/headcount");
const { reconcileExtraction } =
  require("../src/lib/financial-reconcile") as typeof import("../src/lib/financial-reconcile");
const { MODEL_PRICES, PRICES_CHECKED_ON } =
  require("../src/lib/unit-economics") as typeof import("../src/lib/unit-economics");
const { runDraftMinutesPlan, runPhraseMinutesItems } =
  require("../src/lib/ai/draft-minutes-run") as typeof import("../src/lib/ai/draft-minutes-run");
const {
  buildPhraseWork,
  composeMinutesMd,
  composeStructuredMinutesMd,
  minutesStructure,
  usableResolutions,
} = require("../src/lib/minutes-compose") as typeof import("../src/lib/minutes-compose");
const { verbatimIndices } =
  require("../src/lib/minutes-ambiguity") as typeof import("../src/lib/minutes-ambiguity");
const { droppedChineseNames } =
  require("../src/lib/minutes-guards") as typeof import("../src/lib/minutes-guards");
const { cjkSnippets } = require("../src/lib/bm-guard") as typeof import("../src/lib/bm-guard");
const { applyBmGlossary } = require("../src/lib/bm-glossary") as typeof import("../src/lib/bm-glossary");
const { lintMinitMd } = require("../src/lib/minit-format") as typeof import("../src/lib/minit-format");
/* eslint-enable @typescript-eslint/no-require-imports */

type Extraction = import("../src/lib/extraction").MeetingNotesExtraction;
type Provider = ReturnType<typeof getVisionProvider>;

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_MODELS = [
  "gemini:gemini-3.5-flash-lite",
  "gemini:gemini-3.5-flash",
  "openai:gpt-5.6-luna",
  "openai:gpt-5.6-terra",
  "anthropic:claude-sonnet-5",
];
/** The estimate's assumed size of one read: a 1280px photo plus the prompt
 *  in, a full extraction out. Real cost is taken from the vendor's usage. */
const EST_INPUT_TOKENS = 7_000;
const EST_OUTPUT_TOKENS = 2_500;

// --- .env.local (values never printed) --------------------------------------
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

// --- arguments ---------------------------------------------------------------
type Args = {
  papers: { label: string; files: string[] }[];
  out: string;
  models: string[];
  runs: number;
  maxUsd: number;
  /** Per-read vendor timeout (default 60s — see readPage). */
  timeoutMs: number;
  document: boolean;
  dryRun: boolean;
  yes: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Args = { papers: [], out: "", models: DEFAULT_MODELS, runs: 2, maxUsd: 1, timeoutMs: 60_000, document: false, dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const next = () => argv[++i] ?? "";
    if (v === "--paper") {
      const spec = next();
      const eq = spec.indexOf("=");
      if (eq === -1) throw new Error(`--paper wants LABEL=<photo>[,<photo2>], got "${spec}"`);
      a.papers.push({ label: spec.slice(0, eq), files: spec.slice(eq + 1).split(",").map((s) => s.trim()).filter(Boolean) });
    } else if (v === "--out") a.out = next();
    else if (v === "--models") a.models = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (v === "--runs") a.runs = Math.max(1, Number(next()) || 2);
    else if (v === "--max-usd") a.maxUsd = Number(next()) || 1;
    else if (v === "--timeout-ms") a.timeoutMs = Math.max(5_000, Number(next()) || 60_000);
    else if (v === "--document") a.document = true;
    else if (v === "--dry-run") a.dryRun = true;
    else if (v === "--yes") a.yes = true;
    else throw new Error(`unknown argument "${v}"`);
  }
  if (a.papers.length === 0) throw new Error("at least one --paper LABEL=<photo> is required");
  if (a.out === "") throw new Error("--out <dir> is required (the table holds real data; it goes nowhere else)");
  for (const p of a.papers) for (const f of p.files) if (!existsSync(f)) throw new Error(`photo not found: ${f}`);
  return a;
}

function mimeOf(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";
  return "image/jpeg";
}

// --- providers per candidate ------------------------------------------------
function providerFor(spec: string): Provider {
  const [vendor, ...rest] = spec.split(":");
  const model = rest.join(":");
  switch (vendor) {
    case "gemini": return createGeminiProvider(model);
    case "openai": return createOpenAiProvider(model);
    case "anthropic": return createAnthropicProvider(model);
    case "xai": return createXaiProvider(model);
    default: throw new Error(`unknown vendor in "${spec}"`);
  }
}

function keyPresent(spec: string): boolean {
  const vendor = spec.split(":")[0] as keyof typeof PROVIDER_KEY_ENV;
  const envName = PROVIDER_KEY_ENV[vendor];
  return envName !== undefined && (process.env[envName] ?? "") !== "";
}

function tablePrice(spec: string): { inputPerMTok: number; outputPerMTok: number } | null {
  const model = spec.split(":").slice(1).join(":");
  for (const p of Object.values(MODEL_PRICES)) {
    if (p.name === model || p.name.startsWith(`${model} `)) {
      return { inputPerMTok: p.inputPerMTok, outputPerMTok: p.outputPerMTok };
    }
  }
  return null;
}

function estimateUsd(spec: string, calls: number): number | null {
  const price = tablePrice(spec);
  if (!price) return null;
  const per = (EST_INPUT_TOKENS / 1e6) * price.inputPerMTok + (EST_OUTPUT_TOKENS / 1e6) * price.outputPerMTok;
  return per * calls;
}

// --- one read ----------------------------------------------------------------
type Read = {
  ok: boolean;
  error?: string;
  extraction?: Extraction;
  elapsedMs: number;
  costMicros: number | null;
  vendorCalls: number;
};

async function readPage(provider: Provider, file: string, orgName: string, timeoutMs: number): Promise<Read> {
  const started = Date.now();
  let cost: number | null = 0;
  let calls = 0;
  const onUsage = (u: { costMicros: number | null }) => {
    calls += 1;
    cost = cost === null || u.costMicros === null ? null : cost + u.costMicros;
  };
  const prompt = extractMeetingNotesPrompt({ orgName, todayIso: new Date().toISOString().slice(0, 10) });
  // A slower model needs longer than the live route's 20s wall to be SEEN at
  // all (gemini-3.5-flash timed out six times for six on the first run);
  // whether it fits the live walls is reported by the time column.
  const req = { prompt, imageBase64: readFileSync(file).toString("base64"), mimeType: mimeOf(file), onUsage, timeoutMs };
  const attempt = async (p: string) => {
    const raw = await provider.extractJson({ ...req, prompt: p });
    return parseMeetingNotesExtraction(raw);
  };
  try {
    let parsed = await attempt(prompt);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
      parsed = await attempt(`${prompt}\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION with these errors — fix them and respond with ONLY the corrected JSON:\n${issues}`);
    }
    if (!parsed.success) {
      return { ok: false, error: "failed the extraction contract twice", elapsedMs: Date.now() - started, costMicros: cost, vendorCalls: calls };
    }
    return { ok: true, extraction: parsed.data, elapsedMs: Date.now() - started, costMicros: cost, vendorCalls: calls };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e), elapsedMs: Date.now() - started, costMicros: cost, vendorCalls: calls };
  }
}

// --- the cells ---------------------------------------------------------------
/** Every cell a reader would compare, keyed so two runs line up. */
function cells(e: Extraction): Map<string, string> {
  const out = new Map<string, string>();
  const val = (f?: { value: string; confidence: string }) =>
    !f || f.confidence === "missing" ? "(missing)" : f.value;
  out.set("meeting_type", val(e.meeting_type));
  out.set("meeting_date", val(e.meeting_date));
  out.set("meeting_time", val(e.meeting_time));
  out.set("meeting_venue", val(e.meeting_venue));
  out.set("attendance_count (as written)", val(e.attendance_count));
  const hc = e.attendance_count && e.attendance_count.confidence !== "missing" ? parseHeadcount(e.attendance_count.value) : null;
  out.set("headcount (code)", hc ? `present ${hc.present}, apologies ${hc.apologies} [${hc.names.join(", ")}]` : "(shape not counted)");
  out.set("attendees", e.attendees.map((a) => a.name.value).join(" | ") || "(none)");
  out.set("apologies", (e.apologies ?? []).map((a) => a.name.value).join(" | ") || "(none)");
  out.set("adjournment", val(e.adjournment));
  out.set("prepared_by", e.prepared_by ? `${val(e.prepared_by.person_name)} / ${val(e.prepared_by.position)}` : "(missing)");
  out.set("endorsed_by", e.endorsed_by ? `${val(e.endorsed_by.person_name)} / ${val(e.endorsed_by.position)}` : "(missing)");
  e.figures.forEach((f, i) => {
    const amt = f.amount_cents.value === null ? "null" : (f.amount_cents.value / 100).toFixed(2);
    out.set(`figure ${i + 1}`, `${val(f.description)} = RM${amt} [${f.role ?? "-"}]`);
  });
  out.set("reconcile (code)", JSON.stringify(reconcileExtraction(e)));
  e.resolutions.forEach((r, i) => out.set(`resolution ${i + 1}`, val(r.text)));
  e.office_bearers.forEach((b, i) => out.set(`office_bearer ${i + 1}`, `${val(b.position)}: ${val(b.person_name)}`));
  return out;
}

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ⏎ ");
}

// --- the 收工 probe: the document, as the route would produce it -------------
async function draftDocument(extraction: Extraction, orgName: string, onUsage: (u: { costMicros: number | null }) => void) {
  // Simulate the person on the wizard: every field confirmed as read, the
  // headcount card answered "yes" when code could count the line. Nothing
  // else is touched — the card would have asked; here we take its yes.
  const e: Extraction = JSON.parse(JSON.stringify(extraction));
  const confirmAll = (o: unknown) => {
    if (Array.isArray(o)) { o.forEach(confirmAll); return; }
    if (typeof o !== "object" || o === null) return;
    const obj = o as Record<string, unknown>;
    if (obj.confidence === "check") obj.confidence = "confirmed";
    for (const v of Object.values(obj)) confirmAll(v);
  };
  confirmAll(e);
  const hc = e.attendance_count && e.attendance_count.confidence !== "missing" ? parseHeadcount(e.attendance_count.value) : null;
  if (hc) e.attendance_confirmed = hc.present;

  const composeOpts = { orgName, confirmedBy: "bench", dateIso: new Date().toISOString().slice(0, 10), lang: "bm" as const };
  const locked = verbatimIndices(e);
  const structure = minutesStructure(e);
  let markdown: string;
  let path_: string;
  if (structure) {
    const all = buildPhraseWork(e, "bm");
    const work = { ...all, items: all.items.filter((it) => !locked.includes(it.index)) };
    if (work.items.length === 0) {
      markdown = composeStructuredMinutesMd(e, composeOpts);
      path_ = "structure (no vendor call)";
    } else {
      const run = await runPhraseMinutesItems({ provider: getVisionProvider("write"), items: work.items, allTexts: work.allTexts, lang: "bm", onUsage });
      if (!run.ok) { markdown = composeStructuredMinutesMd(e, composeOpts); path_ = "structured phrase FAILED twice → verbatim"; }
      else { const { texts, titles } = work.split(run.phrased); markdown = composeStructuredMinutesMd(e, composeOpts, texts, titles); path_ = "structured phrase"; }
    }
  } else {
    const texts = usableResolutions(e).map((r) => r.text.value);
    const run = await runDraftMinutesPlan({ provider: getVisionProvider("write"), resolutionTexts: texts, lang: "bm", verbatimIndices: locked, onUsage });
    if (!run.ok) {
      markdown = `(plan failed twice — the route would fall back to the plain template; repair=${JSON.stringify(run.repair)})`;
      path_ = "arranging loop FAILED twice";
    } else {
      markdown = composeMinutesMd(run.plan, e, composeOpts);
      path_ = "arranging loop";
    }
  }

  // The checks the 收工 list names — computed, not eyeballed.
  const sources = usableResolutions(e).map((r) => r.text.value);
  const dropped = droppedChineseNames(sources, markdown, [orgName]);
  const kewangan = markdown.split(/^## /m).find((s) => s.startsWith("KEWANGAN")) ?? "";
  const adj = e.adjournment && e.adjournment.confidence !== "missing" ? e.adjournment.value : "";
  // PENUTUP prints the closing line with the glossary applied (散会 →
  // Bersurai), so the count looks for either spelling.
  const core = (s: string) => s.replace(/[^0-9A-Za-z㐀-䶿一-鿿]/g, "");
  const adjCore = core(adj);
  const adjCoreBm = core(applyBmGlossary(adj, [orgName]));
  const flat = core(markdown);
  const adjCount =
    adjCore === ""
      ? 0
      : flat.split(adjCore).length - 1 + (adjCoreBm !== adjCore ? flat.split(adjCoreBm).length - 1 : 0);
  const checks = {
    path: path_,
    "Chinese names of the page all still in Chinese (droppedChineseNames)": dropped.length === 0 ? "PASS" : `FAIL — dropped: ${dropped.length}`,
    "Jumlah hadir line": (markdown.match(/Jumlah hadir: \d+ orang/) ?? ["(none)"])[0],
    "Kehadiran line present": markdown.includes("Kehadiran:") ? "PASS" : (adj || e.attendance_count ? "FAIL" : "n/a (page had none)"),
    "signature: prepared_by name printed": e.prepared_by && e.prepared_by.person_name.value ? (markdown.includes(`( ${e.prepared_by.person_name.value} )`) ? "PASS" : "FAIL") : "n/a",
    "signature: endorsed_by name printed": e.endorsed_by && e.endorsed_by.person_name.value ? (markdown.includes(`( ${e.endorsed_by.person_name.value} )`) ? "PASS" : "FAIL") : "n/a",
    "no '( Pengerusi )' placeholder": markdown.includes("( Pengerusi )") ? "FAIL" : "PASS",
    "reconcile (the card would show on mismatch)": JSON.stringify(reconcileExtraction(e)),
    "adjournment printed once": adjCore === "" ? "n/a" : adjCount === 1 ? "PASS" : `FAIL — ${adjCount}×`,
    "KEWANGAN block Chinese characters": String((kewangan.match(/[㐀-䶿一-鿿]/g) ?? []).length),
    "BM guard lines still flagged": String(cjkSnippets(markdown, [orgName]).length),
    "format lint findings": JSON.stringify(lintMinitMd(markdown, { lang: "bm", attendanceCount: !!e.attendance_count })),
  };
  return { markdown, checks, headcountConfirmedAs: hc?.present ?? null };
}

// --- main --------------------------------------------------------------------
async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  // Second-resolution plus a random tail: two benches launched in the same
  // second wrote the same table file once (the sonnet run overwrote the
  // document probe's table) — never again.
  const ts = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${Math.random().toString(16).slice(2, 6)}`;
  const outDir = path.resolve(args.out);
  const rawDir = path.join(outDir, `raw-${ts}`);
  const orgName = "PERSATUAN CONTOH";

  const runnable = args.models.filter(keyPresent);
  const skipped = args.models.filter((m) => !keyPresent(m));
  const pages = args.papers.flatMap((p) => p.files.map((f, i) => ({ paper: p.label, page: i + 1, file: f })));
  const callsPerModel = pages.length * args.runs;

  console.log(`\nReal-page bench — ${args.papers.length} paper(s), ${pages.length} page(s), ${args.runs} run(s) each`);
  console.log(`current extract model: ${(() => { const r = resolveModel("extract"); return `${r.provider}:${r.model}`; })()} · write model: ${(() => { const r = resolveModel("write"); return `${r.provider}:${r.model}`; })()}`);
  for (const m of skipped) console.log(`  skip ${m} — ${PROVIDER_KEY_ENV[m.split(":")[0] as keyof typeof PROVIDER_KEY_ENV] ?? "?"} not set`);
  let estTotal = 0;
  let estUnknown = false;
  for (const m of runnable) {
    const est = estimateUsd(m, callsPerModel);
    if (est === null) estUnknown = true; else estTotal += est;
    console.log(`  ${m}: ${callsPerModel} read(s), est. ${est === null ? "? (no price row)" : `US$${est.toFixed(3)}`}`);
  }
  console.log(`  estimate total: US$${estTotal.toFixed(3)}${estUnknown ? " + unknown" : ""} (price table checked ${PRICES_CHECKED_ON}; assumes ${EST_INPUT_TOKENS} in / ${EST_OUTPUT_TOKENS} out per read) · hard stop at US$${args.maxUsd.toFixed(2)} REAL`);
  if (args.dryRun) { console.log("\n--dry-run: nothing called."); return; }
  if (!args.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise<void>((r) => rl.question("Press Enter to run (Ctrl+C to stop)… ", () => { rl.close(); r(); }));
  }
  mkdirSync(rawDir, { recursive: true });

  let spentMicros = 0;
  let unpriced = false;
  const stop = () => spentMicros / 1e6 >= args.maxUsd;
  type Row = { paper: string; page: number; model: string; run: number; read: Read };
  const rows: Row[] = [];

  for (const model of runnable) {
    const provider = providerFor(model);
    for (const pg of pages) {
      for (let run = 1; run <= args.runs; run++) {
        if (stop()) { console.log(`  🛑 hard stop: US$${(spentMicros / 1e6).toFixed(3)} reached`); break; }
        process.stdout.write(`  ${model} · ${pg.paper} p${pg.page} · run ${run} … `);
        const read = await readPage(provider, pg.file, orgName, args.timeoutMs);
        if (read.costMicros === null) unpriced = true; else spentMicros += read.costMicros;
        console.log(read.ok ? `ok ${(read.elapsedMs / 1000).toFixed(1)}s ${read.costMicros === null ? "cost ?" : `US$${(read.costMicros / 1e6).toFixed(4)}`}` : `FAILED (${read.error})`);
        rows.push({ paper: pg.paper, page: pg.page, model, run, read });
        writeFileSync(path.join(rawDir, `${pg.paper}-p${pg.page}-${model.replace(/[^A-Za-z0-9.-]/g, "_")}-run${run}.json`), JSON.stringify(read, null, 2), "utf-8");
      }
    }
  }

  // --- the table (real data — into the output directory only) ----------------
  const md: string[] = [];
  md.push(`# Real-page bench — ${ts}`, "");
  md.push(`🔴 PRIVATE — this file holds real names. It stays in this directory. The report quotes it with names replaced.`, "");
  md.push(`Papers: ${args.papers.map((p) => `${p.label} (${p.files.length} page(s))`).join(", ")} · runs per page: ${args.runs} · models: ${runnable.join(", ")}${skipped.length ? ` · skipped (no key): ${skipped.join(", ")}` : ""}`, "");
  md.push(`Real cost: US$${(spentMicros / 1e6).toFixed(4)}${unpriced ? " (+ unpriced calls)" : ""} · estimate was US$${estTotal.toFixed(3)}`, "");

  const agreement: { model: string; agree: number; total: number }[] = [];
  for (const pg of pages) {
    for (const model of runnable) {
      const mine = rows.filter((r) => r.paper === pg.paper && r.page === pg.page && r.model === model);
      if (mine.length === 0) continue;
      md.push(`## ${pg.paper} · page ${pg.page} · ${model}`, "");
      const failed = mine.filter((r) => !r.read.ok);
      for (const f of failed) md.push(`- run ${f.run}: FAILED — ${f.read.error}`);
      const okRuns = mine.filter((r) => r.read.ok);
      md.push(`- time: ${mine.map((r) => `run ${r.run} ${(r.read.elapsedMs / 1000).toFixed(1)}s`).join(" · ")} · cost: ${mine.map((r) => (r.read.costMicros === null ? "?" : `US$${(r.read.costMicros / 1e6).toFixed(4)}`)).join(" · ")}`, "");
      if (okRuns.length === 0) continue;
      const cellMaps = okRuns.map((r) => cells(r.read.extraction!));
      const keys = [...new Set(cellMaps.flatMap((m) => [...m.keys()]))];
      const header = `| cell | ${okRuns.map((r) => `run ${r.run}`).join(" | ")} | agree |`;
      md.push(header, `|---|${okRuns.map(() => "---").join("|")}|---|`);
      let agree = 0;
      for (const k of keys) {
        const vals = cellMaps.map((m) => m.get(k) ?? "(absent)");
        const same = vals.every((v) => v === vals[0]);
        if (same) agree += 1;
        md.push(`| ${esc(k)} | ${vals.map(esc).join(" | ")} | ${okRuns.length < 2 ? "—" : same ? "✓" : "✗"} |`);
      }
      md.push("");
      if (okRuns.length >= 2) {
        const entry = agreement.find((a) => a.model === model) ?? (agreement.push({ model, agree: 0, total: 0 }), agreement[agreement.length - 1]);
        entry.agree += agree;
        entry.total += keys.length;
      }
    }
  }

  md.push("## Agreement between runs (cells identical across the runs of one page)", "");
  md.push("| model | identical cells | of | % |", "|---|---|---|---|");
  for (const a of agreement) md.push(`| ${a.model} | ${a.agree} | ${a.total} | ${a.total ? ((a.agree / a.total) * 100).toFixed(0) : "—"}% |`);
  md.push("");

  // --- the 收工 probe (current models only) -----------------------------------
  if (args.document) {
    const current = (() => { const r = resolveModel("extract"); return `${r.provider}:${r.model}`; })();
    md.push(`## Document probe — current extract model ${current}, run 1, drafted with the current write model`, "");
    for (const p of args.papers) {
      const reads = pages.filter((pg) => pg.paper === p.label).map((pg) => rows.find((r) => r.paper === pg.paper && r.page === pg.page && r.model === current && r.run === 1)?.read);
      if (reads.some((r) => !r || !r.ok)) { md.push(`### ${p.label}: a page failed to read — no document`, ""); continue; }
      let merged = reads[0]!.extraction!;
      for (const r of reads.slice(1)) merged = mergeMeetingExtractions(merged, r!.extraction!);
      let docCost: number | null = 0;
      const onUsage = (u: { costMicros: number | null }) => { docCost = docCost === null || u.costMicros === null ? null : docCost + u.costMicros; };
      process.stdout.write(`  document ${p.label} … `);
      try {
        const d = await draftDocument(merged, orgName, onUsage);
        if (docCost !== null) spentMicros += docCost;
        console.log(`ok ${docCost === null ? "cost ?" : `US$${(docCost / 1e6).toFixed(4)}`}`);
        writeFileSync(path.join(outDir, `${p.label}.document-${ts}.md`), d.markdown, "utf-8");
        md.push(`### ${p.label} — headcount confirmed as: ${d.headcountConfirmedAs ?? "(card would ask)"} · draft cost ${docCost === null ? "?" : `US$${(docCost / 1e6).toFixed(4)}`}`, "");
        md.push("| check | result |", "|---|---|");
        for (const [k, v] of Object.entries(d.checks)) md.push(`| ${esc(k)} | ${esc(v)} |`);
        md.push("", `Document: \`${p.label}.document-${ts}.md\``, "");
        // stdout: pass/fail only, never contents.
        for (const [k, v] of Object.entries(d.checks)) if (/^(PASS|FAIL|n\/a)/.test(v) || k === "Jumlah hadir line" || k === "adjournment printed once") console.log(`    ${k}: ${v.startsWith("Jumlah") ? v : v.split(" — ")[0]}`);
      } catch (e) {
        console.log(`FAILED (${e instanceof Error ? e.message.slice(0, 120) : String(e)})`);
        md.push(`### ${p.label}: draft FAILED — ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`, "");
      }
    }
  }

  const outFile = path.join(outDir, `bench-real-pages-${ts}.md`);
  writeFileSync(outFile, md.join("\n"), "utf-8");
  console.log(`\nTable written: ${outFile}`);
  console.log(`Real cost: US$${(spentMicros / 1e6).toFixed(4)}${unpriced ? " (+ unpriced)" : ""} · agreement: ${agreement.map((a) => `${a.model} ${a.total ? ((a.agree / a.total) * 100).toFixed(0) : "—"}%`).join(" · ")}`);
  console.log(`Nothing in .env was changed. J reads the table and chooses; the .env change is a later session's job.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
