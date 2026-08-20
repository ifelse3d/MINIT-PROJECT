import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { z } from "zod";
import { buildBankExtractPdf } from "@/lib/agm-pdf";
import { getDocumentIdentity, NOT_SIGNED_IN } from "@/lib/doc-identity";

// POST /api/bank-extract-pdf — body: the minutes facts. Returns the certified
// extract PDF, or 422 with the refusal reason (draft minutes / no signatory
// resolution — the AI never invents one).
//
// A bank acts on this document. The organisation name and the certifying
// person therefore come from the signed-in session, never from the body.
// PDPA (Hard Rule 5): the body contains names — NEVER log it.

const bodySchema = z.object({
  // No DB column exists for this yet (see doc-identity.ts TODO).
  orgRegistrationNo: z.string().optional(),
  meetingType: z.enum(["agm", "egm", "committee"]),
  meetingDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["draft", "confirmed"]),
  confirmedOnIso: z.string().optional(),
  resolutions: z.array(z.string()),
  officeBearers: z.array(z.object({ position: z.string().min(1), personName: z.string().min(1) })),
});

export async function POST(request: Request): Promise<Response> {
  const identity = await getDocumentIdentity();
  if (!identity) return NextResponse.json(NOT_SIGNED_IN, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
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
  try {
    // -------------------------------------------------------------------
    // 2026-07-28 AUDIT — the most dangerous artifact in the app.
    //
    // The resolutions rendered here arrive in the request body. There is no
    // picker over the organisation's own saved `minutes_docs`, so in practice
    // they come from `sample-roster.ts`, whose resolutions include changing the
    // society's bank signatories to invented people. Combined with the (correct)
    // server-side org name and certifier, the output was a certified,
    // unwatermarked bank-signatory-change extract on a real temple's letterhead.
    // A bank acts on this document.
    //
    // Until this route reads the resolutions from a confirmed `minutes_docs` row
    // for `identity.orgId`, every extract is stamped as a sample.
    const SAMPLE_UNTIL_MINUTES_PICKER = true;

    const bytes = await buildBankExtractPdf(
      {
        ...parsed.data,
        orgName: identity.orgName,
        // Only a confirmed extract carries a certifying name.
        confirmedBy:
          parsed.data.status === "confirmed" ? identity.confirmedBy : undefined,
      },
      { sample: SAMPLE_UNTIL_MINUTES_PICKER },
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="petikan-bank-${parsed.data.meetingDateIso}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Extract refused" },
      { status: 422 }
    );
  }
}
