import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { recordUpload } from "@/lib/record-upload";
import { getVisionProvider } from "@/lib/ai/provider";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { parseEventsExtraction } from "@/lib/extraction";
import { extractEventsPrompt } from "@/prompts/extract-events";
import { SAMPLE_ORG_NAME } from "@/lib/sample-data";
import { dayIsoMalaysia } from "@/lib/history";

// ---------------------------------------------------------------------------
// AI event intake: pasted text, a PHOTO (paper plan / whiteboard), or a
// SPREADSHEET (.xlsx/.csv) → proposed events the human confirms one by one.
// NOT a chatbot (CLAUDE.md rule 10). zod-validated; retry once with errors
// appended (rule 7). No content logging (PDPA).
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CHARS = 8000;
const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

async function xlsxToText(buf: Buffer): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const lines: string[] = [];
  wb.eachSheet((sheet) => {
    lines.push(`[Sheet: ${sheet.name}]`);
    sheet.eachRow((row) => {
      const cells = (row.values as unknown[])
        .slice(1)
        .map((v) => (v == null ? "" : String(typeof v === "object" && v && "text" in (v as object) ? (v as { text: string }).text : v)))
        .join(" | ");
      if (cells.replace(/\|/g, "").trim()) lines.push(cells);
    });
  });
  return lines.join("\n").slice(0, MAX_CHARS);
}

export async function POST(req: Request) {
  try {
    let text = "";
    let imageBase64: string | undefined;
    let mimeType: string | undefined;
    let uploadedFile: File | null = null;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const pasted = form.get("text");
      if (typeof pasted === "string") text = pasted.trim();
      const file = form.get("file");
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_BYTES) {
          return NextResponse.json(
            { error: joinUserError(USER_ERRORS.fileTooLarge) },
            { status: 400 }
          );
        }
        const buf = Buffer.from(await file.arrayBuffer());
        const name = file.name.toLowerCase();
        uploadedFile = file;
        if (IMAGE_MIME.has(file.type)) {
          imageBase64 = buf.toString("base64");
          mimeType = file.type;
        } else if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
          text = [text, await xlsxToText(buf)].filter(Boolean).join("\n\n");
        } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
          text = [text, buf.toString("utf-8").slice(0, MAX_CHARS)].filter(Boolean).join("\n\n");
        } else {
          return NextResponse.json(
            { error: joinUserError(USER_ERRORS.unsupportedEventFile) },
            { status: 400 }
          );
        }
      }
    } else {
      const body = (await req.json().catch(() => null)) as { text?: string } | null;
      text = body?.text?.trim() ?? "";
    }

    if (!text && !imageBase64) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.nothingToRead) },
        { status: 400 }
      );
    }
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

    // Phase 7.5a: charge the quota BEFORE any AI vendor is called.
    // One extraction = one action (the rule-7 retry below is not charged).
    const gate = await requireAiQuota(["extract_events"]);
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const todayIso = dayIsoMalaysia(new Date().toISOString())!;
    const prompt = extractEventsPrompt({
      orgName: SAMPLE_ORG_NAME,
      todayIso,
      text: text || "(see the attached image — read the plans/dates written in it)",
    });
    const provider = getVisionProvider();

    // 2026-08-18: attach what the vendor actually charged to the ai_usage row
    // that paid for it — the pattern extract-ledger has had since 2026-08-03.
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);

    let raw: unknown;
    try {
      raw = await provider.extractJson({ prompt, imageBase64, mimeType, onUsage });
    } catch {
      // A refusal must never eat someone's quota (CLAUDE.md rule 10).
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiUnavailable) },
        { status: 502 }
      );
    }

    let parsed = parseEventsExtraction(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n");
      const retryPrompt = `${prompt}

YOUR PREVIOUS ATTEMPT FAILED VALIDATION with these errors — fix them and respond with ONLY the corrected JSON:
${issues}`;
      try {
        raw = await provider.extractJson({ prompt: retryPrompt, imageBase64, mimeType, onUsage });
        parsed = parseEventsExtraction(raw);
      } catch {
        // fall through
      }
    }

    if (!parsed || !parsed.success) {
      // Two attempts, nothing readable came back: the person keeps the credit.
      await refundUsage(gate.org.id, gate.charges[0]);
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiCouldNotRead) },
        { status: 422 }
      );
    }

    // Phase 7: keep the file + a history row for the active org (best-effort).
    if (uploadedFile) await recordUpload(uploadedFile, "other");

    return NextResponse.json({ events: parsed.data.events, provider: provider.name });
  } catch {
    return NextResponse.json({ error: joinUserError(USER_ERRORS.serverError) }, { status: 500 });
  }
}
