import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { z } from "zod";
import { buildBankExtractPdf } from "@/lib/agm-pdf";
import { getActiveOrg } from "@/lib/active-org";
import { chargeFence, getFenceLimits } from "@/lib/fence";
import { stampFenceWatermark } from "@/lib/fence-watermark";
import { getDocumentIdentity, NOT_SIGNED_IN } from "@/lib/doc-identity";
import { getLatestConfirmedExtraction } from "@/db/agm";
import { sampleConfirmedMinutes } from "@/lib/sample-roster";
import { dayIsoMalaysia } from "@/lib/history";

// POST /api/bank-extract-pdf — the certified bank-resolution extract.
//
// G-2/G-3 (work order 27): a bank acts on this document, so NOTHING in it
// comes from the browser any more — the body chooses a path, that is all:
//   * REAL (default, empty body): the resolutions, meeting facts and office
//     bearers are read from the latest CONFIRMED minutes in the database for
//     the signed-in org; the org name and PPM come from the session. No
//     confirmed minutes, or no signatory resolution → an honest 422, never a
//     document. No CONTOH mark — this is the real thing.
//   * SAMPLE ({sample:true} — the clearly-labelled separate entrance): built
//     from the fictional sample society under ITS OWN name, CONTOH on every
//     page. The real organisation's letterhead never touches fiction.
// PDPA (Hard Rule 5): the output carries names — NEVER log it.

const bodySchema = z.object({
  sample: z.boolean().optional(),
  /** D44: fenced orgs get a watermarked extract unless they spend a lifetime
   *  document + clean download on the clean one (a bank only takes clean). */
  clean: z.boolean().optional(),
});

/** MinutesForExtract's type set is the classic three; the widened meeting
 *  types (planning, festival, …) print as committee-meeting extracts. */
function extractMeetingType(v: string): "agm" | "egm" | "committee" {
  return v === "agm" || v === "egm" ? v : "committee";
}

export async function POST(request: Request): Promise<Response> {
  const identity = await getDocumentIdentity();
  if (!identity) return NextResponse.json(NOT_SIGNED_IN, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.downloadFailed) },
      { status: 400 },
    );
  }

  try {
    // --- SAMPLE: fiction, on the fictional society's own name. -------------
    if (parsed.data.sample === true) {
      const bytes = await buildBankExtractPdf(sampleConfirmedMinutes, { sample: true });
      return pdfResponse(bytes, "contoh-petikan-bank.pdf");
    }

    // --- REAL: the latest CONFIRMED minutes, from the database. ------------
    // D44 fence — decided before the build; sample above stays outside it.
    const active = await getActiveOrg().catch(() => null); // cached; identity already resolved it
    const fenceLimits = active ? await getFenceLimits(active) : null;
    if (fenceLimits && parsed.data.clean === true && active) {
      const fence = await chargeFence(active, { docs: 1, downloads: 1 });
      if (!fence.ok) return NextResponse.json(fence.body, { status: fence.status });
    }

    const confirmed = await getLatestConfirmedExtraction();
    if (!confirmed) {
      return NextResponse.json(
        {
          error:
            "Belum ada minit yang DISAHKAN — sahkan minit mesyuarat itu dahulu. / " +
            "还没有已确认的会议记录 —— 请先确认那场会议的记录。 / " +
            "No CONFIRMED minutes yet — confirm the meeting's minutes first.",
        },
        { status: 422 },
      );
    }
    const e = confirmed.extraction;
    const resolutions = e.resolutions
      .map((r) => r.text.value.trim())
      .filter((r) => r !== "");
    const officeBearers = e.office_bearers
      .filter((b) => b.position.value.trim() !== "" && b.person_name.value.trim() !== "")
      .map((b) => ({ position: b.position.value, personName: b.person_name.value }));

    const bytes = await buildBankExtractPdf(
      {
        // G-3: identity is the SERVER's — org name and PPM from the database.
        orgName: identity.orgName,
        orgRegistrationNo: identity.ppmNo ?? undefined,
        meetingType: extractMeetingType(e.meeting_type.value),
        meetingDateIso: e.meeting_date.value || confirmed.confirmedOnIso || dayIsoMalaysia(new Date().toISOString())!,
        status: "confirmed",
        confirmedBy: identity.confirmedBy,
        confirmedOnIso: confirmed.confirmedOnIso ?? undefined,
        resolutions,
        officeBearers,
      },
      { sample: false },
    );
    const out =
      fenceLimits && parsed.data.clean !== true
        ? await stampFenceWatermark(new Uint8Array(bytes))
        : bytes;
    return pdfResponse(out, `petikan-bank-${e.meeting_date.value || "minit"}.pdf`);
  } catch (err) {
    // buildBankResolutionExtractBm refuses (draft / no signatory resolution)
    // by throwing — the refusal reason is a user-facing sentence.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extract refused" },
      { status: 422 },
    );
  }
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
