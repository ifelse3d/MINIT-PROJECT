import { LedgerReview } from "./ledger-review";

// Step 1 of the /money flow. The organisation, the tax status and the signed-in
// person are resolved once in layout.tsx and shared by every page here.
export default function MoneyPage() {
  return <LedgerReview />;
}
