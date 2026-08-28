import { NextResponse } from "next/server";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { buildMinutesPdf } from "@/lib/minutes-pdf";
import { captureAppError } from "@/lib/app-errors";
import { chargeFence, getFenceLimits } from "@/lib/fence";
import { stampFenceWatermark } from "@/lib/fence-watermark";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";

// ---------------------------------------------------------------------------
// GET /api/minutes-pdf?id=N — one SAVED minutes document as an A4 PDF.
//
// J review 2026-08-28, item 4 (「保存后哪里 PRINT?」) + his eROSES screenshots:
// the portal's meeting form ends with "Muat Naik Minit Mesyuarat" (PDF <25MB).
// This route is both the Print button on /minutes/history and the file that
// upload slot takes — one document, one source of truth (final_md as stored).
//
// GET on purpose: History links to it in a new tab, the browser's own PDF
// viewer supplies Print/Save, and the session cookie is the auth. The query
// is scoped org_id = active org (Hard Rule 5) ON TOP of RLS.
// PDPA: the document contents are returned to their owner, never logged.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await getSessionUser();
    const active = await getActiveOrg();
    if (!user || !active) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 401 },
      );
    }

    const idRaw = new URL(request.url).searchParams.get("id") ?? "";
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.downloadFailed) },
        { status: 400 },
      );
    }

    const supabase = await getSupabaseServer();
    // `title` arrives with migration 30 — until it is applied, asking
    // PostgREST for the column fails the WHOLE query, so fall back a step
    // (same ladder every schema-ahead reader in this repo uses).
    let row:
      | { meeting_date: string | null; final_md: string; title?: string | null }
      | null = null;
    {
      const withTitle = await supabase
        .from("minutes_docs")
        .select("meeting_date, final_md, title")
        .eq("org_id", active.id)
        .eq("id", id)
        .maybeSingle();
      if (!withTitle.error) {
        row = withTitle.data;
      } else {
        const bare = await supabase
          .from("minutes_docs")
          .select("meeting_date, final_md")
          .eq("org_id", active.id)
          .eq("id", id)
          .maybeSingle();
        if (bare.error) throw bare.error;
        row = bare.data;
      }
    }
    if (!row || typeof row.final_md !== "string" || row.final_md.trim() === "") {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.downloadFailed) },
        { status: 404 },
      );
    }

    let bytes: Uint8Array = new Uint8Array(
      await buildMinutesPdf({
        finalMd: row.final_md,
        title: row.title ?? null,
      }),
    );

    // D44 fence: a free org VIEWS and PRINTS this for free — watermarked.
    // The clean file (the one eROSES's upload slot takes) leaves only through
    // ?clean=1, which spends one of the plan's lifetime clean downloads.
    const wantClean =
      new URL(request.url).searchParams.get("clean") === "1";
    const fenceLimits = await getFenceLimits(active);
    let disposition = "inline";
    if (fenceLimits) {
      if (wantClean) {
        const fence = await chargeFence(active, { downloads: 1 });
        if (!fence.ok) {
          return NextResponse.json(fence.body, { status: fence.status });
        }
        disposition = "attachment"; // a counted download IS a download
      } else {
        bytes = await stampFenceWatermark(bytes);
      }
    }

    const datePart = row.meeting_date ?? String(id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        // inline: opens in the browser's viewer, where Print lives; the same
        // viewer's Save button produces the file eROSES's upload slot takes.
        "Content-Disposition": `${disposition}; filename="minit-${datePart}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    void captureAppError("/api/minutes-pdf", e);
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
