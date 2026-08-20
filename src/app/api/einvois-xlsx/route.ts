import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { z } from "zod";
import { buildMonthEndPack, EInvoisError } from "@/lib/einvois";
import { buildEInvoisXlsxFiles } from "@/lib/einvois-xlsx";
import { getDocumentIdentity, NOT_SIGNED_IN } from "@/lib/doc-identity";

// POST /api/einvois-xlsx — body: confirmed donations + month (+ fileIndex when
// the month splits past 100 documents). Returns ONE .xlsx.
//
// The organisation name is read server-side from the signed-in user's active
// org, never from the body — a MyInvois submission file naming the wrong
// organisation is a false tax filing.
// PDPA (Hard Rule 5): donor data in the body — NEVER log it.

const donationSchema = z.object({
  id: z.string(),
  donorName: z.string(),
  donorPhone: z.string().nullable(),
  amountCents: z.number().int().nonnegative(),
  purpose: z.string(),
  donatedAtIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  collector: z.string(),
  receiptNo: z.string().nullable(),
  custodyStatus: z.enum(["collected", "pending_remittance", "settled"]),
});

const bodySchema = z.object({
  donations: z.array(donationSchema),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  fileIndex: z.number().int().nonnegative().default(0),
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
    const { donations, month, fileIndex } = parsed.data;
    const orgName = identity.orgName;
    const pack = buildMonthEndPack(donations, { month, orgName });
    const files = await buildEInvoisXlsxFiles(pack, { orgName });
    const file = files[fileIndex];
    if (!file) {
      return NextResponse.json(
        // Was raw developer English reaching a red banner in front of an
            // 80-year-old ("fileIndex 3 out of range — pack has 2 file(s)").
            { error: joinUserError(USER_ERRORS.downloadFailed) },
        { status: 400 }
      );
    }
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "X-Einvois-File-Count": String(files.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof EInvoisError) {
      // EInvoisError messages are written for a treasurer (e.g. "3 donations in
      // 2026-07 have no receipt yet"), so they are shown — with a plain-language
      // lead-in, because on their own they are still English-only.
      return NextResponse.json(
        {
          error: `${joinUserError({
            bm: "Fail cukai bulan ini belum boleh disiapkan:",
            zh: "这个月的税务文件还不能做出来：",
            en: "This month's tax file cannot be prepared yet:",
          })}\n${e.message}`,
        },
        { status: 422 },
      );
    }
    // Anything else used to `throw`, escaping the handler as an unstyled 500
    // instead of the bilingual JSON error every sibling route returns.
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
