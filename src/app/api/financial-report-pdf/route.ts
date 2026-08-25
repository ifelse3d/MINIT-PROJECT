import { NextResponse } from "next/server";
import { z } from "zod";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { buildFinancialStatement, StatementError } from "@/lib/financial-statement";
import { buildStatementPdf } from "@/lib/financial-statement-pdf";
import { loadStatementRows } from "@/app/money/report/data";
import { dayIsoMalaysia } from "@/lib/history";
import { getDocumentIdentity, NOT_SIGNED_IN } from "@/lib/doc-identity";

// POST /api/financial-report-pdf — body: { fromIso, toIso } ONLY.
//
// Stage F (work order 27): every figure is read back from the DATABASE under
// RLS and summed by lib/financial-statement.ts — the browser sends a period,
// never a number (the same S0-1 principle as /api/receipt-pdf: a document
// generator that prints what it is sent is a forgery machine). The org name,
// PPM line and audit identity come from the session (Hard Rule 8). AI is
// involved nowhere. PDPA: figures flow out in the PDF, never into a log.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const bodySchema = z.object({
  fromIso: z.string().regex(ISO_DAY),
  toIso: z.string().regex(ISO_DAY),
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

  const rows = await loadStatementRows(identity.orgId, parsed.data);
  if (rows === null) {
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }

  let statement;
  try {
    statement = buildFinancialStatement(rows, parsed.data);
  } catch (e) {
    if (e instanceof StatementError) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.downloadFailed) },
        { status: 400 },
      );
    }
    throw e;
  }

  const todayIso = dayIsoMalaysia(new Date().toISOString())!;
  const bytes = await buildStatementPdf({
    orgName: identity.orgName,
    orgRegistrationNo: identity.ppmNo ?? undefined,
    statement,
    confirmedBy: identity.confirmedBy,
    confirmedOnIso: todayIso,
  });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="penyata-${parsed.data.fromIso}-${parsed.data.toIso}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
