import { ConstitutionReview } from "./constitution-review";
import { loadConstitutionClauses } from "./actions";
import { getActiveOrg } from "@/lib/active-org";

// ?q= lets "Tanya Minit" (Phase 7.5b) hand a constitution question straight
// to this page — the existing deterministic Q&A answers it on arrival.
//
// ?setup=1 means the person has just created their organisation and was sent
// here by /orgs/new (2026-08-22). It only adds a banner — nothing about the
// page behaves differently, and every button on it can be skipped. See
// new-org-banner.tsx for why that path exists at all.
export default async function ConstitutionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; setup?: string }>;
}) {
  const { q, setup } = await searchParams;
  // 2026-08-05: the constitution now has a durable copy in the organisation's
  // records, so a device that has never seen it is no longer an empty page.
  // The browser's own copy still wins when it has one — it is the newer of the
  // two while a page is being photographed.
  const storedClauses = await loadConstitutionClauses();
  // For the identity panel: the name Minit currently uses, so it can be put
  // beside the one printed in the constitution.
  const active = await getActiveOrg().catch(() => null);
  return (
    <ConstitutionReview
      initialQuestion={typeof q === "string" ? q : ""}
      orgClauses={storedClauses}
      justCreatedOrg={setup === "1"}
      orgName={active?.name ?? null}
      orgId={active?.id ?? null}
    />
  );
}
