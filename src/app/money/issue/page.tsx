import { IssueRound } from "./issue-round";

// Step 2 of the money-in flow (J's launch feedback #3, 2026-08-27 evening):
// issue receipts for THIS ROUND — exactly the rows recorded in step 1, never
// the whole mixed register. The management view over everything lives at
// /money/receipts.
export default function IssueRoundPage() {
  return <IssueRound />;
}
