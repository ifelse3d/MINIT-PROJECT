import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { z } from "zod";
import { buildReceiptPdf } from "@/lib/receipt-pdf";
import { getDocumentIdentity, NOT_SIGNED_IN } from "@/lib/doc-identity";

// POST /api/receipt-pdf — body: the donation facts only. Returns the PDF bytes.
//
// The organisation name, its s.44(6) tax status and the confirming person are
// NOT accepted from the body — they are read server-side from the signed-in
// user's active org (see src/lib/doc-identity.ts). Trusting the body here let
// any signed-in user mint a forged tax-deductible receipt for any org.
// PDPA (Hard Rule 5): the body contains donor data — NEVER log it.

const bodySchema = z.object({
  // No DB column exists for these two yet, so they still come from the client.
  // TODO(Phase B): add registration_no / address to `orgs` and derive them here.
  orgRegistrationNo: z.string().optional(),
  orgAddress: z.string().optional(),
  receiptNo: z.string().min(1),
  donorName: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purpose: z.string(),
  collector: z.string().min(1),
  confirmedOnIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

  const bytes = await buildReceiptPdf({
    ...parsed.data,
    orgName: identity.orgName,
    taxStatus: identity.taxStatus,
    confirmedBy: identity.confirmedBy,
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="resit-${parsed.data.receiptNo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
