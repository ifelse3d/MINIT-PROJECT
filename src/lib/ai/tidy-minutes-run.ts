import { tidyMinutesPrompt } from "@/prompts/tidy-minutes";
import { checkCoverage, minutesPlanSchema } from "@/lib/minutes-compose";
import { buildTidyDocument, type TidyDocument } from "@/lib/tidy-minutes";
import type { MeetingNotesExtraction } from "@/lib/extraction";
import type { TokenUsage, VisionJsonProvider } from "./provider";

// ---------------------------------------------------------------------------
// THE TIDY LOOP, ONE COPY (work order 105 §2) — the twin of
// draft-minutes-run.ts, and written the same way for the same reason: ask the
// model to arrange, check the arrangement by counting, and on a miss send the
// exact indices back ONCE (CLAUDE.md rule 7).
//
// 🔴 IT NEVER SEES A PHOTOGRAPH. Its whole input is the verbatim text another
// step already extracted, so the extraction prompt — and the eval baseline
// measured on it — cannot be affected by anything here.
//
// Vendor errors PROPAGATE: the route owns the money (charge, refund), this
// function owns none.
// ---------------------------------------------------------------------------

export type TidyRunResult =
  | { ok: true; doc: TidyDocument }
  /** Two attempts and the arithmetic still does not add up. The caller shows
   *  the verbatim layer, which is what it would have shown anyway — a reading
   *  copy is a convenience, never a prerequisite.
   *
   *  `detail` carries INDICES ONLY (never a line), so it is safe to record in
   *  app_errors and safe to print in a probe — and without it "the tidy pass
   *  refused" is a dead end nobody can act on. */
  | { ok: false; reason: "coverage" | "invalid"; detail?: string };

export async function runTidyMinutes(opts: {
  provider: VisionJsonProvider;
  extraction: MeetingNotesExtraction;
  orgName: string;
  items: { index: number; text: string; sectionNo?: string; sectionTitle?: string }[];
  onUsage?: (usage: TokenUsage) => void;
  deadlineAt?: number;
  timeoutMs?: number;
  maxOutputTokens?: number;
}): Promise<TidyRunResult> {
  const { provider, extraction, orgName, items, onUsage, deadlineAt, timeoutMs } = opts;
  if (items.length === 0) return { ok: false, reason: "invalid" };

  let repair = "";
  let lastReason: "coverage" | "invalid" = "invalid";
  let lastDetail = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.extractJson({
      prompt: tidyMinutesPrompt({ orgName, items }) + repair,
      onUsage,
      deadlineAt,
      timeoutMs,
      maxOutputTokens: opts.maxOutputTokens,
    });

    const parsed = minutesPlanSchema.safeParse(raw);
    if (!parsed.success) {
      lastReason = "invalid";
      lastDetail = parsed.error.issues
        .slice(0, 4)
        .map((i) => i.path.join("."))
        .join(", ");
      repair = `

YOUR PREVIOUS ANSWER WAS NOT VALID JSON IN THE REQUIRED SHAPE. Answer again with ONLY the JSON described above.`;
      continue;
    }

    const coverage = checkCoverage(parsed.data, items.length);
    if (!coverage.ok) {
      lastReason = "coverage";
      lastDetail = `missing [${coverage.missing.join(",")}] twice [${coverage.duplicated.join(",")}] unknown [${coverage.unknown.join(",")}]`;
      // Indices only — never the lines themselves (PDPA: this string can end
      // up in a prompt, and it must carry no page content).
      repair = `

YOUR PREVIOUS ANSWER DID NOT PLACE EVERY LINE EXACTLY ONCE.${
        coverage.missing.length > 0
          ? ` Never placed: [${coverage.missing.join(", ")}].`
          : ""
      }${
        coverage.duplicated.length > 0
          ? ` Placed more than once: [${coverage.duplicated.join(", ")}].`
          : ""
      }${
        coverage.unknown.length > 0
          ? ` These numbers do not exist: [${coverage.unknown.join(", ")}].`
          : ""
      } Answer again with every index from 0 to ${items.length - 1} appearing exactly once.`;
      continue;
    }

    const doc = buildTidyDocument(parsed.data, extraction);
    if (!doc) {
      lastReason = "coverage";
      lastDetail = "buildTidyDocument refused";
      continue;
    }
    return { ok: true, doc };
  }

  return { ok: false, reason: lastReason, detail: lastDetail };
}
