import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { z } from "zod";
import {
  docKindOfUpload,
  joinUserError,
  tooManyPagesError,
  USER_ERRORS,
} from "@/lib/user-errors";
import { getVisionProvider } from "@/lib/ai/provider";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { readRosterPrompt } from "@/prompts/read-roster";
import { chargeFence, refundFence } from "@/lib/fence";
import { checkPageLimit, countPdfPages } from "@/lib/pdf-pages";
import {
  EXTRACT_ATTEMPT_TIMEOUT_MS,
  ROUTE_AI_DEADLINE_MS,
  TIMEOUT_SPLIT_ADVICE_PAGES,
} from "@/lib/ai/http";
import { vendorFailureResponse } from "@/lib/ai/vendor-failure";
import { fileFromRelay } from "@/lib/upload-relay-server";

// A PHOTO, A PDF, OR A PASTE THE PARSER REFUSED → the text of the paste box.
//
// 2026-08-19: this takes `file` OR `text`, and the second one is not a nicety.
// The person who needs help most is the one whose paste has just been rejected
// — "these lines were not understood, nothing was added" — and at that moment
// they are holding TEXT, not a file. An escape hatch reachable only by picking
// a file is not reachable by the person it is for. A text-only call also skips
// the image entirely, which is the cheaper of the two roads.
//
// Nothing is written to the database here. The model's reading lands in the box
// the person is already looking at; they check it, fix it, and press Import.
// That keeps the one rule this app is built on — a human confirms before a
// document becomes a record — without building a second confirmation screen.
//
// Charged as one `import_roster` action and refunded whenever we cannot deliver
// rows (CLAUDE.md rule 10). A spreadsheet never comes here: code reads columns
// for free, and spending the org's quota to do it worse would be indefensible.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
/** 200 committee members is already the import ceiling; this is generous for
 *  that and still bounds what one call can be made to cost. */
const MAX_TEXT_CHARS = 20_000;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const rosterSchema = z.object({
  rows: z.array(
    z.object({
      position: z.string(),
      name: z.string(),
      name_official: z.string().default(""),
      term_start: z.string().default(""),
      term_end: z.string().default(""),
    }),
  ),
});

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const posted = form.get("file");
    let resolved: File | null =
      posted instanceof File && posted.size > 0 ? posted : null;
    let viaRelay = false;
    if (!resolved) {
      // A-4 (work order 51): a roster PDF too big for Vercel's body cap
      // (the tester's 6MB scan) arrives as a Storage path instead.
      const relayed = await fileFromRelay(form.get("storagePath"));
      if (relayed && !relayed.ok) {
        return NextResponse.json(
          { error: joinUserError(relayed.error) },
          { status: relayed.status },
        );
      }
      if (relayed) {
        resolved = relayed.file;
        viaRelay = true;
      }
    }
    // Const from here on, so TypeScript keeps narrowing through `hasFile`.
    const file = resolved;
    const hasFile = file !== null;
    const pastedText = String(form.get("text") ?? "").trim();

    if (!file && pastedText === "") {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.rosterNothingToRead) },
        { status: 400 },
      );
    }
    if (file && !ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.unsupportedImage) },
        { status: 400 },
      );
    }
    // Relay files were already size-checked against the vendor ceiling.
    if (file && !viaRelay && file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.fileTooLarge) },
        { status: 400 },
      );
    }
    if (!hasFile && pastedText.length > MAX_TEXT_CHARS) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.rosterTextTooLong) },
        { status: 400 },
      );
    }

    // 2026-08-21: pages are counted BEFORE the quota is charged. A roster can
    // arrive as a scanned PDF, and a scanner set to "whole tray" produces a
    // long one. See src/lib/pdf-pages.ts.
    const bytes = hasFile ? await file.arrayBuffer() : null;
    if (hasFile && bytes) {
      const pages = await checkPageLimit(bytes, file.type, "roster");
      if (!pages.ok) {
        return NextResponse.json(
          {
            error: joinUserError(
              tooManyPagesError(pages.pages, pages.limit),
            ),
          },
          { status: 400 },
        );
      }
    }

    const gate = await requireAiQuota(["import_roster"], { cap: "upload" });
    if (!gate.ok) return NextResponse.json(gate.body, { status: gate.status });

    // D44 fence: lifetime 20 AI-read pages on the free plan. Pasted TEXT is
    // not an upload — only the file path spends pages.
    const pageCount =
      hasFile && bytes
        ? file.type === "application/pdf"
          ? ((await countPdfPages(bytes)) ?? 1)
          : 1
        : 0;
    const fenceGate = await chargeFence(gate.org, { pages: pageCount });
    if (!fenceGate.ok) {
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(fenceGate.body, { status: fenceGate.status });
    }
    const fenceCharge = fenceGate.charge;

    const provider = getVisionProvider("extract");
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);

    // A file wins if both arrive: the picture is the more faithful record of
    // what the society actually has on paper.
    const image =
      hasFile && bytes
        ? {
            imageBase64: Buffer.from(bytes).toString("base64"),
            mimeType: file.type,
          }
        : null;

    let raw: unknown;
    try {
      raw = await provider.extractJson({
        prompt: readRosterPrompt(gate.org.name, image ? undefined : pastedText),
        ...(image ?? {}),
        onUsage,
        // P-1: bounded so the refund + app_errors + honest message run before
        // Vercel's 60s kill (single call — no shared budget needed here).
        deadlineAt: Date.now() + ROUTE_AI_DEADLINE_MS,
        // D0-2: a long roster PDF is a document read — long attempt.
        timeoutMs: EXTRACT_ATTEMPT_TIMEOUT_MS,
      });
    } catch (e) {
      // P-1: the failure is also recorded now (app_errors) — see id=5.
      await refundUsage(gate.org.id, gate.charges[0]);
      await refundFence(fenceCharge);
      return vendorFailureResponse("/api/import-roster", e, gate.org.id, {
        bigDocument: pageCount > TIMEOUT_SPLIT_ADVICE_PAGES,
        docKind: file ? docKindOfUpload(file.type, file.name) : "unknown",
      });
    }

    const parsed = rosterSchema.safeParse(raw);
    if (!parsed.success || parsed.data.rows.length === 0) {
      await refundUsage(gate.org.id, gate.charges[0]);
      await refundFence(fenceCharge);
      // A-1: the REAL reason lands in app_errors (typed marker, no contents).
      void captureAppError(
        "/api/import-roster",
        new Error("roster reading produced no usable rows"),
        { orgId: gate.org.id, code: "unreadable_twice" },
      );
      return NextResponse.json(
        {
          // A-1: advice split by INPUT — camera talk only for actual photos.
          error: joinUserError(
            image
              ? file?.type === "application/pdf"
                ? USER_ERRORS.aiCouldNotReadPdf
                : USER_ERRORS.aiCouldNotRead
              : USER_ERRORS.rosterTextCouldNotRead,
          ),
        },
        { status: 422 },
      );
    }

    // Tab-separated, because that is what the one parser takes — and because
    // empty cells stay in position, which is how a missing IC name survives the
    // trip instead of sliding into the term column. B-1 (work order 51): the
    // model may still read a term_end off an old paper list (the schema
    // tolerates it), but it is dropped here — the feature keeps only the
    // appointment date.
    const text = parsed.data.rows
      .map((r) =>
        [r.position, r.name, r.name_official, r.term_start]
          .map((f) => f.trim())
          .join("\t")
          .replace(/\t+$/, ""),
      )
      .join("\n");

    return NextResponse.json({ text, provider: provider.name });
  } catch (e) {
    // S-7: count the failure for the ops console — never its contents (PDPA).
    void captureAppError("/api/import-roster", e);
    // No contents in logs (PDPA).
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
