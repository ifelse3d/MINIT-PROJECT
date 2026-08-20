import { MinutesReview } from "./minutes-review";
import { getDocumentIdentity } from "@/lib/doc-identity";

// Phase 1 hero screen: extraction review → BM minutes draft → eROSES
// paste-pack.
//
// 2026-07-28 audit fix: the review screen used to render its preview with
// SAMPLE_ORG_NAME ("Persatuan Penganut Dewa Guan Di Selangor — Cawangan Klang")
// and the signer "Setiausaha (Demo)". A treasurer photographing her own notes
// saw — and saved — a compliance document naming someone else's temple. The
// real organisation and the real signed-in human are resolved here, on the
// server, and passed down, so the on-screen preview matches exactly what
// saveConfirmedMinutes() will store.
export default async function MinutesPage() {
  const identity = await getDocumentIdentity();
  return (
    <MinutesReview
      orgName={identity?.orgName ?? null}
      signerName={identity?.confirmedBy ?? null}
    />
  );
}
