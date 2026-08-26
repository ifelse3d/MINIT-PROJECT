import { CashCustody } from "../cash-custody";

// The cash custody RECORD (B-3, D19): who is holding how much, tick off what
// arrived. Not a step of the money flow any more.
export default function MoneyCustodyPage() {
  return <CashCustody />;
}
