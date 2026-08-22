import { type ReactNode } from "react";
import { getDocumentIdentity } from "@/lib/doc-identity";
import { MinutesProvider } from "./minutes-store";
import { MinutesChrome } from "./minutes-chrome";

// ---------------------------------------------------------------------------
// The /minutes section (2026-08-23). Photo → check → attendance → document →
// history is one job across several pages, so it gets one layout.
//
// The extraction is owned ONCE here (minutes-store.tsx) rather than per page:
// every page edits the same set of facts, and Next keeps a layout mounted while
// you move between the routes inside it, so nothing reloads and the
// restore-from-localStorage pass runs once for the whole section.
//
// 2026-07-28 audit fix: the review screen used to render its preview with
// SAMPLE_ORG_NAME and the signer "Setiausaha (Demo)". A treasurer photographing
// her own notes saw — and saved — a compliance document naming someone else's
// temple. The real organisation and the real signed-in human are resolved here,
// on the server, and passed down, so the on-screen preview matches exactly what
// saveConfirmedMinutes() will store.
// ---------------------------------------------------------------------------
export default async function MinutesLayout({ children }: { children: ReactNode }) {
  const identity = await getDocumentIdentity();
  return (
    <MinutesProvider
      orgName={identity?.orgName ?? null}
      signerName={identity?.confirmedBy ?? null}
    >
      <MinutesChrome>{children}</MinutesChrome>
    </MinutesProvider>
  );
}
