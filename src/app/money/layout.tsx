import { type ReactNode } from "react";
import { getActiveOrg } from "@/lib/active-org";
import { getDocumentIdentity } from "@/lib/doc-identity";
import { RegisterProvider } from "./register-store";
import { MoneyChrome } from "./money-chrome";

// ---------------------------------------------------------------------------
// The /money section (2026-08-23). Everything under this route — the ledger,
// the receipts, the cash hand-over, the month-end tax file, the history — is
// one job split across pages, so it gets one layout.
//
// Two things live here rather than in the pages:
//
//  * RegisterProvider owns the donation register ONCE. Next keeps a layout
//    mounted while you move between the routes inside it, so the register (and
//    a half-checked ledger photo) survives navigation, and no two copies of it
//    can ever disagree. See register-store.tsx for why that mattered.
//  * The identity below is resolved on the SERVER and passed down. It is never
//    client-chosen: the receipt PDF, the WhatsApp message to the donor, the
//    month-end summary and the e-Invois pack all used to be built with
//    SAMPLE_ORG_NAME hardcoded, so a real receipt for a real donor went out
//    under a fictional temple's name (2026-07-28 audit).
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";

export default async function MoneyLayout({ children }: { children: ReactNode }) {
  const active = await getActiveOrg();
  // The real signed-in human, for the cash-custody trail.
  const identity = await getDocumentIdentity();
  return (
    <RegisterProvider
      orgName={active?.name ?? null}
      // The receipt PDF derives the tax status server-side from the
      // organisation record (lib/doc-identity.ts). The SCREEN and the WhatsApp
      // message to the donor used to hardcode "none", so an org with an
      // approved s.44(6) status would show "NOT tax-deductible" on screen while
      // the attached PDF claimed the opposite — a contradiction on a legal
      // document, in the donor's hands.
      taxStatus={active?.taxExemptStatus === "s44_6" ? "s44_6" : "none"}
      signerName={identity?.confirmedBy ?? null}
    >
      <MoneyChrome>{children}</MoneyChrome>
    </RegisterProvider>
  );
}
