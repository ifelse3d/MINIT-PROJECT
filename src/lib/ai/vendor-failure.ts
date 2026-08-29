import "server-only";

import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { VendorTimeoutError } from "./http";
import { VendorOutputTruncatedError } from "./provider";

// ---------------------------------------------------------------------------
// ONE ANSWER TO "the vendor call threw" — P-1 (2026-08-27, work order 31).
//
// Before this, every extraction route's vendor-failure catch did two of the
// three necessary things: refund (yes) and respond (yes) — but RECORD, no.
// `catch { ... return 502 }` swallowed the error entirely, which is how the
// "ai_usage id=5" incident could leave app_errors at 0 rows while a member's
// action vanished. Swallowing the error is the worst part of that chain: an
// unrecorded failure cannot be investigated, only re-experienced.
//
// This helper does record + respond. The REFUND stays in the route, next to
// the charge it undoes, because only the route knows which charge paid for
// the call that failed.
//
// PDPA: captureAppError stores route, error name and a hash — never the
// message body, which for a vendor error can quote the prompt.
// ---------------------------------------------------------------------------

/**
 * Record a failed vendor call and build the honest response for it.
 *
 *   - VendorTimeoutError         → 504, "Minit stopped waiting — your quota
 *     was returned". Only send this on a path that really did refund.
 *   - VendorOutputTruncatedError → 413, "the document is too long — split
 *     it". A retry fails identically, so "try again" would be a lie that
 *     bills the member again (that lie ran twice on J's new-user test,
 *     2026-08-28, at RM0.10 a tap).
 *   - anything else              → 502, "the AI could not be reached".
 *
 * D0-2 (2026-08-29, work order 56): pass `bigDocument: true` when the failed
 * call was reading a MANY-page document (the caller knows the page count).
 * For such a document a timeout is DETERMINISTIC — generation time exceeds
 * the route's whole vendor budget (see EXTRACT_ATTEMPT_TIMEOUT_MS) — so
 * "wait a minute and try again" is the same lie the truncation path already
 * refuses to tell. The honest advice is the same as truncation's: split it.
 */
export function vendorFailureResponse(
  route: string,
  err: unknown,
  orgId: number | null,
  opts?: { bigDocument?: boolean },
): NextResponse {
  // Fire-and-forget on purpose: the person is waiting for their error message,
  // and captureAppError is best-effort by design.
  void captureAppError(route, err, { orgId });
  if (err instanceof VendorTimeoutError) {
    return NextResponse.json(
      {
        error: joinUserError(
          opts?.bigDocument ? USER_ERRORS.documentTooLong : USER_ERRORS.aiTimeout,
        ),
      },
      { status: 504 },
    );
  }
  if (err instanceof VendorOutputTruncatedError) {
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.documentTooLong) },
      { status: 413 },
    );
  }
  return NextResponse.json(
    { error: joinUserError(USER_ERRORS.aiUnavailable) },
    { status: 502 },
  );
}
