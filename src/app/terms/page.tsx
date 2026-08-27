import type { Metadata } from "next";
import { LegalDocument } from "../legal/legal-document";
import { TERMS_MARKDOWN, TERMS_VERSION } from "@/legal/documents";

// Public on purpose (src/proxy.ts PUBLIC_PATHS): sign-up asks people to agree
// to this, so it has to be readable BEFORE there is an account.
export const metadata: Metadata = {
  title: "Syarat Penggunaan / Terms of Use — MinitAI",
};

export default function TermsPage() {
  return <LegalDocument markdown={TERMS_MARKDOWN} version={TERMS_VERSION} />;
}
