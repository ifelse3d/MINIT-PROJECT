import { MoneyReview } from "./money-review";
import { getActiveOrg } from "@/lib/active-org";
import { getDocumentIdentity } from "@/lib/doc-identity";

// 2026-07-28 audit fix: the receipt PDF, the WhatsApp message sent to the donor,
// the month-end summary and the e-Invois pack all used to be built with
// SAMPLE_ORG_NAME hardcoded, so a real receipt for a real donor went out under a
// fictional temple's name. The real organisation is resolved here and passed in.
export const dynamic = "force-dynamic";

export default async function MoneyPage() {
  const active = await getActiveOrg();
  // The real signed-in human, for the cash-custody trail (see MoneyReview).
  const identity = await getDocumentIdentity();
  // The receipt PDF derives the tax status server-side from the organisation
  // record (lib/doc-identity.ts). The SCREEN and the WhatsApp message to the
  // donor used to hardcode "none", so an org with an approved s.44(6) status
  // would show "NOT tax-deductible" on screen while the attached PDF claimed the
  // opposite — a contradiction on a legal document, in the donor's hands.
  return (
    <MoneyReview
      orgName={active?.name ?? null}
      taxStatus={active?.taxExemptStatus === "s44_6" ? "s44_6" : "none"}
      signerName={identity?.confirmedBy ?? null}
    />
  );
}
