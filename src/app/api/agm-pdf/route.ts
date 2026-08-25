import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { z } from "zod";
import { buildAgmPackPdf } from "@/lib/agm-pdf";
import { getDocumentIdentity, NOT_SIGNED_IN } from "@/lib/doc-identity";
import { loadFilingRoster } from "@/app/minutes/roster-actions";
import { sampleAgmPackParams } from "@/lib/sample-roster";

// POST /api/agm-pdf — Returns the full AGM pack as one PDF.
//
// G-2/G-3 (work order 27, J 8/26 #5 "不要再一直 CONTOH 了"):
//   * REAL path (default): the committee list comes from the DATABASE roster
//     (committee_roster) and the org name / PPM from the session — everything
//     the browser sent about identity or membership is DISCARDED. An empty
//     roster is refused with an honest error, never padded with fiction.
//     The document carries the ordinary DRAF watermark until confirmed
//     (Hard Rule 8) and NO CONTOH mark.
//   * SAMPLE path ({sample:true} — the clearly-labelled separate entrance):
//     built ENTIRELY from the fictional sample org, CONTOH on every page,
//     and the REAL organisation's name never touches it — a sample must not
//     wear anyone's letterhead.
// The meeting facts (date, time, venue…) are the human's own answers — the
// AGM being announced is a future event only they know.
// PDPA (Hard Rule 5): the body contains names — NEVER log it.

const bodySchema = z.object({
  sample: z.boolean().optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  meetingDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  meetingTimeText: z.string().min(1).max(60).optional(),
  venue: z.string().min(1).max(300).optional(),
  noticePeriodDays: z.number().int().nonnegative().max(90).optional(),
  agendaItems: z.array(z.string().min(1).max(300)).max(30).optional(),
  secretaryName: z.string().max(120).optional(),
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
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.downloadFailed) },
      { status: 400 },
    );
  }

  // --- SAMPLE: the fictional org, marked CONTOH, on ITS OWN name. ----------
  if (parsed.data.sample === true) {
    const bytes = await buildAgmPackPdf(sampleAgmPackParams, { sample: true });
    return pdfResponse(bytes, `contoh-pek-agm-${sampleAgmPackParams.year}.pdf`);
  }

  // --- REAL: roster from the DATABASE, identity from the session. ----------
  const facts = parsed.data;
  if (
    facts.year === undefined ||
    facts.meetingDateIso === undefined ||
    facts.meetingTimeText === undefined ||
    facts.venue === undefined
  ) {
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.downloadFailed) },
      { status: 400 },
    );
  }

  const roster = await loadFilingRoster();
  if (roster.length === 0) {
    // No fiction to fill the gap (拍板⑥): the honest answer is "add your
    // committee first", said by the page before this button even shows.
    return NextResponse.json(
      {
        error:
          "Senarai AJK belum ada dalam sistem — tambah ahli di halaman Ahli dahulu. / " +
          "理事名单还没进系统 —— 请先到「成员」页添加。 / " +
          "The committee roster is not in the system yet — add members on the Members page first.",
      },
      { status: 409 },
    );
  }

  const bytes = await buildAgmPackPdf(
    {
      year: facts.year,
      meetingDateIso: facts.meetingDateIso,
      meetingTimeText: facts.meetingTimeText,
      venue: facts.venue,
      noticePeriodDays: facts.noticePeriodDays ?? 14,
      noticePeriodSource: "org_setting",
      agendaItems: facts.agendaItems,
      // G-3: identity is the SERVER's — org name and PPM from the database.
      orgName: identity.orgName,
      orgRegistrationNo: identity.ppmNo ?? undefined,
      // The roster as the society records it (display names — the IC-name
      // requirement is the eROSES filing's, not the meeting pack's).
      roster: roster.map((m) => ({ position: m.position, personName: m.name })),
      secretaryName: facts.secretaryName?.trim() || identity.confirmedBy,
      confirmed: facts.confirmed
        ? { by: identity.confirmedBy, onIso: facts.confirmed.onIso }
        : null,
    },
    { sample: false },
  );
  return pdfResponse(bytes, `pek-agm-${facts.year}.pdf`);
}

function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
