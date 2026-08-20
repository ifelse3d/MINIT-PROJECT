import { ConstitutionReview } from "./constitution-review";
import { loadConstitutionClauses } from "./actions";

// ?q= lets "Tanya Minit" (Phase 7.5b) hand a constitution question straight
// to this page — the existing deterministic Q&A answers it on arrival.
export default async function ConstitutionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  // 2026-08-05: the constitution now has a durable copy in the organisation's
  // records, so a device that has never seen it is no longer an empty page.
  // The browser's own copy still wins when it has one — it is the newer of the
  // two while a page is being photographed.
  const storedClauses = await loadConstitutionClauses();
  return (
    <ConstitutionReview
      initialQuestion={typeof q === "string" ? q : ""}
      orgClauses={storedClauses}
    />
  );
}
