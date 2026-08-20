// Who is signing this document, and for which organisation?
//
// WHY THIS FILE EXISTS
// Every official document Minit produces (donation receipts, AGM packs, bank
// resolution extracts, e-Invois packs) carries three facts that decide what
// the document legally means:
//
//   1. the organisation's NAME            — whose letterhead this is
//   2. the organisation's TAX STATUS      — whether the receipt may say the
//                                           donation is tax-deductible under
//                                           s.44(6) of the Income Tax Act
//   3. the CONFIRMING HUMAN's name        — the Hard Rule 8 audit line
//                                           "Drafted by Minit, confirmed by X"
//
// Until now those three arrived in the POST body from the browser, which means
// anyone signed in could type any organisation name and any tax status and get
// back a PDF that claims a donation to someone else's temple is tax-deductible.
// That is a forged legal document, and it breaks Hard Rule 3.
//
// So: the routes never trust the body for these. They call this helper, which
// reads them from the database using the signed-in user's own session (so RLS
// applies) and refuses if nobody is signed in.
import "server-only";

import { getActiveOrg } from "@/lib/active-org";
import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { joinUserError } from "@/lib/user-errors";

export type TaxExemptStatus = "none" | "s44_6" | "pure_religious";

export type DocumentIdentity = {
  orgId: number;
  orgName: string;
  /** From the DB, never from the request body (Hard Rule 3). */
  taxStatus: TaxExemptStatus;
  /** The real human whose name goes on the audit line (Hard Rule 8). */
  confirmedBy: string;
};

/** Fail safe: an unrecognised value must never imply tax-deductibility. */
function narrowTaxStatus(raw: string | null | undefined): TaxExemptStatus {
  return raw === "s44_6" || raw === "pure_religious" ? raw : "none";
}

/**
 * The org + signer for the current request, or `null` when the caller is not
 * signed in or has no organisation. Routes must turn `null` into a 401 and
 * produce no document at all.
 */
export async function getDocumentIdentity(): Promise<DocumentIdentity | null> {
  const user = await getSessionUser();
  if (!user) return null;

  const org = await getActiveOrg();
  if (!org) return null;

  // The person's name as recorded in this org's committee list. Falls back to
  // the login email so the audit line is never blank or invented.
  const supabase = await getSupabaseServer();
  const { data: member } = await supabase
    .from("members_roles")
    .select("name")
    .eq("user_id", user.id)
    .eq("org_id", org.id)
    .maybeSingle();

  const confirmedBy =
    (member?.name as string | undefined)?.trim() || user.email || "";
  if (confirmedBy === "") return null;

  return {
    orgId: org.id,
    orgName: org.name,
    taxStatus: narrowTaxStatus(org.taxExemptStatus),
    confirmedBy,
  };
}

/** Standard 401 body for the document routes (no details — PDPA). */
export const NOT_SIGNED_IN = {
  // Was BM + EN only. Three document routes return this, and a Chinese-only
  // treasurer could not read it. (2026-07-28 audit.)
  error: joinUserError({
    bm: "Sesi anda sudah tamat. Sila log masuk semula, kemudian cuba muat turun sekali lagi.",
    zh: "登入已经过期。请重新登入，然后再按一次下载。",
    en: "Your session has expired. Please sign in again, then try the download once more.",
  }),
} as const;
