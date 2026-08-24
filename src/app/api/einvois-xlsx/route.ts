import { NextResponse } from "next/server";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { einvoisXlsxBodySchema } from "@/lib/document-request";
import { buildMonthEndPack, EInvoisError } from "@/lib/einvois";
import { buildEInvoisXlsxFiles } from "@/lib/einvois-xlsx";
import { getSupabaseServer } from "@/db/supabase-server";
import { getDocumentIdentity, NOT_SIGNED_IN } from "@/lib/doc-identity";
import type { RegisterDonation } from "@/lib/receipts";

// POST /api/einvois-xlsx — body: { month, fileIndex } ONLY. Returns ONE .xlsx.
//
// 2026-08-25 (S0-1): the body used to carry the whole donation list — names,
// phones, amounts — and the server built a tax submission file out of whatever
// the browser said. A signed-in user could file a month of invented donations
// under their own org's name. Now the server reads that month's donations back
// from the database under RLS; the browser only names the month.
// PDPA (Hard Rule 5): donor data goes into the file — NEVER into a log.

const bodySchema = einvoisXlsxBodySchema;

const DONATION_SELECT =
  "id, donor_name, donor_phone, amount_cents, purpose, donated_at, custody_status, collector_name, receipt:receipts!donations_receipt_id_fkey (receipt_no)" as const;
/** While migration 20260827000000 (collector_name) is not applied, PostgREST
 *  fails the whole query over the unknown column — retry without it. */
const DONATION_SELECT_LEGACY =
  "id, donor_name, donor_phone, amount_cents, purpose, donated_at, custody_status, receipt:receipts!donations_receipt_id_fkey (receipt_no)" as const;

type DonationRow = {
  id: number;
  donor_name: string | null;
  donor_phone: string | null;
  amount_cents: number;
  purpose: string | null;
  donated_at: string | null;
  custody_status: "collected" | "pending_remittance" | "settled";
  collector_name?: string | null;
  receipt: { receipt_no: string } | null;
};

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

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
  const { month, fileIndex } = parsed.data;

  const supabase = await getSupabaseServer();
  const query = (select: string) =>
    supabase
      .from("donations")
      .select(select)
      .eq("org_id", identity.orgId)
      .gte("donated_at", `${month}-01`)
      .lte("donated_at", lastDayOfMonth(month));

  let { data, error } = await query(DONATION_SELECT).returns<DonationRow[]>();
  if (error) {
    const retry = await query(DONATION_SELECT_LEGACY).returns<DonationRow[]>();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 }
    );
  }

  const donations: RegisterDonation[] = (data ?? []).map((d) => ({
    id: String(d.id),
    donorName: d.donor_name ?? "",
    donorPhone: d.donor_phone,
    amountCents: Number(d.amount_cents),
    purpose: d.purpose ?? "",
    donatedAtIso: d.donated_at ?? "",
    collector: d.collector_name ?? "",
    receiptNo: d.receipt?.receipt_no ?? null,
    custodyStatus: d.custody_status,
  }));

  try {
    const orgName = identity.orgName;
    const pack = buildMonthEndPack(donations, { month, orgName });
    const files = await buildEInvoisXlsxFiles(pack, { orgName });
    const file = files[fileIndex];
    if (!file) {
      return NextResponse.json(
        // Also reached when the month has no receipted donations at all: an
        // empty month has no files, and index 0 finds nothing.
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
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
