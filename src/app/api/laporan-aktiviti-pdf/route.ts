import { NextResponse } from "next/server";
import { z } from "zod";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { buildLaporanText } from "@/lib/laporan-aktiviti";
import { buildTextDocPdf } from "@/lib/agm-pdf";
import { dayIsoMalaysia } from "@/lib/history";
import { getActiveOrg } from "@/lib/active-org";
import { chargeFence, getFenceLimits } from "@/lib/fence";
import { stampFenceWatermark } from "@/lib/fence-watermark";
import { getDocumentIdentity, NOT_SIGNED_IN } from "@/lib/doc-identity";

// POST /api/laporan-aktiviti-pdf (D2-3, work order 56) — renders the REVIEWED
// activity report as an A4 PDF.
//
// The body carries the wording the person just read and edited on
// /filings/laporan — their own confirmed text, which is what Hard Rule 8's
// audit line attests ("disahkan oleh [name]"). What the body must NOT carry
// is IDENTITY: the org name, PPM number and confirmer come from the session
// (the S0-1 principle — a generator that prints a claimed identity is a
// forgery machine; one that prints a person's own reviewed prose over their
// own session identity is a typewriter).
//
// D44 fence: same document line as the financial statement — free plan gets
// a watermarked PDF; `clean: true` spends docs:1 + downloads:1.

const bodySchema = z.object({
  periodLabel: z.string().min(1).max(80),
  pengenalan: z.string().min(1).max(2000),
  aktiviti: z
    .array(
      z.object({
        tarikh: z.string().max(40),
        nama: z.string().min(1).max(200),
        penerangan: z.string().max(1000),
      }),
    )
    .min(1)
    .max(120),
  clean: z.boolean().optional(),
});

export const runtime = "nodejs";
export const maxDuration = 60;

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

  // D44 fence — decided before the build so a blocked request costs nothing.
  const active = await getActiveOrg().catch(() => null);
  const fenceLimits = active ? await getFenceLimits(active) : null;
  if (fenceLimits && parsed.data.clean === true && active) {
    const fence = await chargeFence(active, { docs: 1, downloads: 1 });
    if (!fence.ok) return NextResponse.json(fence.body, { status: fence.status });
  }

  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  const text = buildLaporanText({
    orgName: identity.orgName,
    orgRegistrationNo: identity.ppmNo ?? null,
    periodLabel: parsed.data.periodLabel,
    pengenalan: parsed.data.pengenalan,
    aktiviti: parsed.data.aktiviti,
    confirmedBy: identity.confirmedBy,
    confirmedOnIso: todayIso,
  });

  let bytes: Uint8Array = new Uint8Array(
    await buildTextDocPdf(text, {
      title: `Laporan Aktiviti — ${identity.orgName}`,
    }),
  );
  if (fenceLimits && parsed.data.clean !== true) {
    bytes = await stampFenceWatermark(bytes);
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="laporan-aktiviti.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
