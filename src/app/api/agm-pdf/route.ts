import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { z } from "zod";
import { buildAgmPackPdf } from "@/lib/agm-pdf";
import { getDocumentIdentity, NOT_SIGNED_IN } from "@/lib/doc-identity";

// POST /api/agm-pdf — body: the meeting facts. Returns the full pack as one PDF.
//
// The organisation name and the confirming person are read server-side from
// the signed-in user's active org, never from the body (Hard Rule 8: the audit
// line must name the real human who confirmed it).
// PDPA (Hard Rule 5): the body contains member names — NEVER log it.

const memberSchema = z.object({
  position: z.string().min(1),
  personName: z.string().min(1),
});

const bodySchema = z.object({
  // No DB column exists for these two yet (see doc-identity.ts TODO).
  orgRegistrationNo: z.string().optional(),
  orgAddress: z.string().optional(),
  year: z.number().int().min(2000).max(2100),
  meetingDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meetingTimeText: z.string().min(1),
  venue: z.string().min(1),
  noticePeriodDays: z.number().int().nonnegative(),
  noticePeriodSource: z.enum(["constitution", "org_setting"]),
  constitutionClauseRef: z.string().optional(),
  roster: z.array(memberSchema),
  secretaryName: z.string().min(1),
  agendaItems: z.array(z.string().min(1)).optional(),
  // The client says WHETHER the pack is confirmed and on what date; WHO
  // confirmed it comes from the session, not the body.
  confirmed: z
    .object({ onIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    .nullable()
    .optional(),
});

export async function POST(request: Request): Promise<Response> {
  const identity = await getDocumentIdentity();
  if (!identity) return NextResponse.json(NOT_SIGNED_IN, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // Only zod's field paths — never the submitted values (PDPA).
    return NextResponse.json(
      {
        error: joinUserError(USER_ERRORS.downloadFailed),
      // Field paths are for the developer, never the person: shown only in dev
      // (PDPA also forbids echoing the submitted values). (2026-07-28 audit.)
      ...(process.env.NODE_ENV === "development"
        ? { fields: parsed.error.issues.map((i) => i.path.join(".")) }
        : {}),
      },
      { status: 400 }
    );
  }
  // ---------------------------------------------------------------------
  // 2026-07-28 AUDIT: this pack's CONTENT is not yet backed by the database.
  //
  // There is no committee-roster ingestion, no AGM date input and no venue
  // input anywhere in the app, so every field below arrives from the browser —
  // in practice from `sample-roster.ts` (a fictional committee, a meeting date
  // nobody chose, registration no "PPM-000-00-00000000"). doc-identity.ts then
  // correctly stamps the REAL organisation's name on it, which produced an
  // authentic-looking official document full of invented facts.
  //
  // Until a real roster/AGM source exists, every pack is marked as a sample on
  // every page. When that source lands, compute `sample` from whether the
  // payload is DB-backed and delete this constant.
  const SAMPLE_UNTIL_ROSTER_INGESTION = true;

  const bytes = await buildAgmPackPdf(
    {
      ...parsed.data,
      orgName: identity.orgName,
      confirmed: parsed.data.confirmed
        ? { by: identity.confirmedBy, onIso: parsed.data.confirmed.onIso }
        : parsed.data.confirmed,
    },
    { sample: SAMPLE_UNTIL_ROSTER_INGESTION },
  );
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pek-agm-${parsed.data.year}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
