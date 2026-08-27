import type { Metadata } from "next";
import { LegalDocument } from "../legal/legal-document";
import { PRIVACY_MARKDOWN, PRIVACY_VERSION } from "@/legal/documents";

// Public on purpose (src/proxy.ts PUBLIC_PATHS). PDPA s.7: the notice must be
// given in Bahasa Malaysia AND English, in writing, before personal data is
// collected — which means before the sign-up form is submitted, not after.
export const metadata: Metadata = {
  title: "Notis Privasi / Privacy Notice — MinitAI",
};

export default function PrivacyPage() {
  return <LegalDocument markdown={PRIVACY_MARKDOWN} version={PRIVACY_VERSION} />;
}
