import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { receiptPdfBodySchema } from "@/lib/document-request";
import { buildReceiptPdf } from "@/lib/receipt-pdf";
import { getSupabaseServer } from "@/db/supabase-server";
import { dayIsoMalaysia } from "@/lib/history";
import { getDocumentIdentity, NOT_SIGNED_IN } from "@/lib/doc-identity";

// POST /api/receipt-pdf — body: { receiptNo } ONLY. Returns the PDF bytes.
//
// 2026-08-25 (S0-1): the body used to carry the donor name, the amount, the
// date, the purpose and the collector, and the server printed whatever it was
// sent. Any signed-in user could therefore mint a receipt for their own org
// with ANY contents — a forged legal document whose number happens to be real.
// Now the body names a receipt and nothing else; every printed fact is read
// back from `receipts` + `donations` under RLS. No row = 404, no PDF.
// PDPA (Hard Rule 5): donor data flows out in the PDF — NEVER into a log.

const bodySchema = receiptPdfBodySchema;

/** The columns the PDF needs, verbatim from the database. */
const RECEIPT_SELECT =
  "receipt_no, issued_at, donation:donations!receipts_donation_id_fkey (donor_name, amount_cents, purpose, donated_at, collector_name)" as const;
/** Fallback while migration 20260827000000 (collector_name) is not yet applied:
 *  PostgREST fails the WHOLE query over one unknown column. */
const RECEIPT_SELECT_LEGACY =
  "receipt_no, issued_at, donation:donations!receipts_donation_id_fkey (donor_name, amount_cents, purpose, donated_at)" as const;

type ReceiptRow = {
  receipt_no: string;
  issued_at: string;
  donation: {
    donor_name: string | null;
    amount_cents: number;
    purpose: string | null;
    donated_at: string | null;
    collector_name?: string | null;
  } | null;
};

export async function POST(request: Request): Promise<Response> {
  const identity = await getDocumentIdentity();
  if (!identity) return NextResponse.json(NOT_SIGNED_IN, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.downloadFailed) },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseServer();
  let { data, error } = await supabase
    .from("receipts")
    .select(RECEIPT_SELECT)
    .eq("org_id", identity.orgId)
    .eq("receipt_no", parsed.data.receiptNo)
    .maybeSingle<ReceiptRow>();
  if (error) {
    // 42703 = undefined column: the collector_name migration has not been run
    // yet. The receipt is still printable without a collector line.
    const retry = await supabase
      .from("receipts")
      .select(RECEIPT_SELECT_LEGACY)
      .eq("org_id", identity.orgId)
      .eq("receipt_no", parsed.data.receiptNo)
      .maybeSingle<ReceiptRow>();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 }
    );
  }
  if (!data || !data.donation) {
    // No such receipt in THIS org. 404, never a PDF of made-up facts.
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.downloadFailed) },
      { status: 404 }
    );
  }

  const issuedIso = dayIsoMalaysia(data.issued_at) ?? "";
  const bytes = await buildReceiptPdf({
    receiptNo: data.receipt_no,
    donorName: data.donation.donor_name ?? "",
    amountCents: Number(data.donation.amount_cents),
    dateIso: data.donation.donated_at ?? issuedIso,
    purpose: data.donation.purpose ?? "",
    // Until collector_name exists in the DB the honest fallback is the person
    // whose audit line is on the document anyway.
    collector: data.donation.collector_name ?? identity.confirmedBy,
    confirmedOnIso: issuedIso,
    orgName: identity.orgName,
    // C-1: the admin-entered PPM/ROS number on the letterhead (undefined =
    // entered nothing → the line simply does not print).
    orgRegistrationNo: identity.ppmNo ?? undefined,
    taxStatus: identity.taxStatus,
    confirmedBy: identity.confirmedBy,
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="resit-${data.receipt_no}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
