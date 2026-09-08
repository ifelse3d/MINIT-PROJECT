"use server";

import { getSessionUser } from "@/db/supabase-server";
import { getSupabase } from "@/db/supabase";
import { isOperatorEmail } from "@/lib/admin-gate";
import { EXTRACT_OUTPUT_CEILING, PROVIDER_KEY_ENV, type AiProviderName } from "@/lib/ai/provider";
import { createGeminiProvider } from "@/lib/ai/gemini";
import { createOpenAiProvider } from "@/lib/ai/openai";
import { createAnthropicProvider } from "@/lib/ai/anthropic";
import { createXaiProvider } from "@/lib/ai/xai";
import { extractMeetingNotesPrompt } from "@/prompts/extract-meeting-notes";
import { parseMeetingNotesExtraction } from "@/lib/extraction";
import { parseHeadcount } from "@/lib/headcount";
import { captureAppError } from "@/lib/app-errors";

// ---------------------------------------------------------------------------
// 130 §14-2 (119 A-7 / 120 順位第二): the model bench, from the console.
//
// scripts/bench-real-pages.ts is the full instrument (several models, each
// page read twice, agreement counted, a table left for J to read). This is
// its one-read core behind a button on /admin so J can try a page against a
// model WITHOUT a terminal — the same prompt builder, the same contract, the
// same provider files, one read per (page, model), each read its own server
// action so no call meets the platform's 60s wall.
//
// 🔴 MONEY. Every read here is REAL vendor spend on J's keys. The card shows
// the estimate BEFORE anything runs and requires J's explicit confirmation;
// this file refuses anyone who is not a platform admin. Nothing is charged
// to any organisation's quota (there is no org), and nothing is stored.
//
// 🔴 PRIVACY. The page J uploads is read and the RESULT SUMMARY returned —
// counts and a few structural probes, never the extracted names or the
// image. The page bytes live only in this request. Nothing is logged.
// ---------------------------------------------------------------------------

export const BENCH_MODELS = [
  "gemini:gemini-3.5-flash-lite",
  "gemini:gemini-3.5-flash",
  "openai:gpt-5.6-luna",
  "openai:gpt-5.6-terra",
  "anthropic:claude-sonnet-5",
] as const;

export type BenchModelInfo = { spec: string; keyPresent: boolean };

async function platformAdminEmail(): Promise<string | null> {
  const user = await getSessionUser();
  const email = user?.email ?? "";
  if (!email || !isOperatorEmail(email)) return null;
  try {
    const admin = getSupabase();
    const { data, error } = await admin
      .from("platform_admins")
      .select("email")
      .ilike("email", email)
      .maybeSingle();
    return !error && data !== null ? email : null;
  } catch {
    return null;
  }
}

/** Which candidates this deployment can actually call (a key is present). */
export async function adminBenchModels(): Promise<BenchModelInfo[] | { error: "not_admin" }> {
  if (!(await platformAdminEmail())) return { error: "not_admin" };
  return BENCH_MODELS.map((spec) => {
    const vendor = spec.split(":")[0] as AiProviderName;
    const envName = PROVIDER_KEY_ENV[vendor];
    return { spec, keyPresent: envName !== undefined && (process.env[envName] ?? "") !== "" };
  });
}

function providerFor(spec: string) {
  const [vendor, ...rest] = spec.split(":");
  const model = rest.join(":");
  switch (vendor) {
    case "gemini":
      return createGeminiProvider(model);
    case "openai":
      return createOpenAiProvider(model);
    case "anthropic":
      return createAnthropicProvider(model);
    case "xai":
      return createXaiProvider(model);
    default:
      return null;
  }
}

export type BenchReadResult =
  | {
      ok: true;
      spec: string;
      elapsedMs: number;
      costMicros: number | null;
      vendorCalls: number;
      /** Structural probes only — never a name, never a figure. */
      summary: {
        fieldsRead: number;
        attendees: number;
        apologies: number;
        headcountCounted: boolean;
        resolutions: number;
        figures: number;
        officeBearers: number;
        checkFields: number;
      };
    }
  | { ok: false; spec: string; elapsedMs: number; costMicros: number | null; vendorCalls: number; error: string };

/**
 * ONE read of ONE page with ONE model — the same extraction /api/intake runs.
 * Called once per (page, model) by the card, sequentially, after J confirmed
 * the estimate. `timeoutMs` is longer than the live route's 20s wall on
 * purpose: a slow model must be SEEN to be judged; whether it fits the wall
 * is what the time column says.
 */
export async function adminBenchRead(input: {
  spec: string;
  imageBase64: string;
  mimeType: string;
  orgName?: string;
}): Promise<BenchReadResult | { error: "not_admin" | "bad_model" | "bad_image" }> {
  if (!(await platformAdminEmail())) return { error: "not_admin" };
  if (!(BENCH_MODELS as readonly string[]).includes(input.spec)) return { error: "bad_model" };
  if (typeof input.imageBase64 !== "string" || input.imageBase64.length < 100 || input.imageBase64.length > 12 * 1024 * 1024) {
    return { error: "bad_image" };
  }
  const provider = providerFor(input.spec);
  if (!provider) return { error: "bad_model" };

  const started = Date.now();
  let cost: number | null = 0;
  let calls = 0;
  const onUsage = (u: { costMicros: number | null }) => {
    calls += 1;
    cost = cost === null || u.costMicros === null ? null : cost + u.costMicros;
  };
  const prompt = extractMeetingNotesPrompt({
    orgName: input.orgName?.trim() || "Persatuan Contoh",
    todayIso: new Date().toISOString().slice(0, 10),
  });
  const req = {
    prompt,
    imageBase64: input.imageBase64,
    mimeType: input.mimeType || "image/jpeg",
    maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
    onUsage,
    timeoutMs: 50_000,
  };
  const attempt = async (p: string) => parseMeetingNotesExtraction(await provider.extractJson({ ...req, prompt: p }));
  try {
    let parsed = await attempt(prompt);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
      parsed = await attempt(
        `${prompt}\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION with these errors — fix them and respond with ONLY the corrected JSON:\n${issues}`,
      );
    }
    const elapsedMs = Date.now() - started;
    if (!parsed.success) {
      return { ok: false, spec: input.spec, elapsedMs, costMicros: cost, vendorCalls: calls, error: "failed the extraction contract twice" };
    }
    const e = parsed.data;
    const present = (f?: { confidence: string }) => f !== undefined && f.confidence !== "missing";
    const headline = [e.meeting_type, e.meeting_date, e.meeting_time, e.meeting_venue, e.attendance_count, e.adjournment];
    let checkFields = 0;
    const countCheck = (o: unknown) => {
      if (Array.isArray(o)) {
        o.forEach(countCheck);
        return;
      }
      if (typeof o !== "object" || o === null) return;
      const obj = o as Record<string, unknown>;
      if (obj.confidence === "check") checkFields += 1;
      for (const v of Object.values(obj)) countCheck(v);
    };
    countCheck(e);
    const hc =
      e.attendance_count && e.attendance_count.confidence !== "missing"
        ? parseHeadcount(e.attendance_count.value)
        : null;
    return {
      ok: true,
      spec: input.spec,
      elapsedMs,
      costMicros: cost,
      vendorCalls: calls,
      summary: {
        fieldsRead: headline.filter(present).length,
        attendees: e.attendees.length,
        apologies: (e.apologies ?? []).length,
        headcountCounted: hc !== null,
        resolutions: e.resolutions.length,
        figures: e.figures.length,
        officeBearers: e.office_bearers.length,
        checkFields,
      },
    };
  } catch (err) {
    void captureAppError("/admin/bench", err, { code: "bench_read" });
    return {
      ok: false,
      spec: input.spec,
      elapsedMs: Date.now() - started,
      costMicros: cost,
      vendorCalls: calls,
      error: err instanceof Error ? err.message.slice(0, 160) : "failed",
    };
  }
}
