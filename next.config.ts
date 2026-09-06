import type { NextConfig } from "next";

// 122 §5 (2026-09-07, from 121 §2-9): the live site answered with only the
// HSTS header Vercel adds and an "X-Powered-By: Next.js" it did not need.
// Four plain response headers close the obvious gaps; deliberately NO
// Content-Security-Policy (§0 ruling) — Next's inline scripts would be
// caught by it and the whole page would go blank, which is worse than the
// risk it guards against here.
const SECURITY_HEADERS = [
  // /login must never be embeddable in someone else's page (click-jacking,
  // phishing frames). DENY, not SAMEORIGIN: nothing in the app frames itself.
  { key: "X-Frame-Options", value: "DENY" },
  // The browser trusts our Content-Type and does not sniff a PDF into HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // A receipt-verify URL carries a signed token in its query string; the
  // token must not ride along in the Referer to a third-party site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Camera for photographing paper; microphone for voice-input.tsx (Web
  // Speech). Both self-only. Geolocation is not used anywhere: off.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Advertising the framework version helps nobody but an attacker.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
  // These packages load .wasm/font files from disk at runtime; bundling them
  // breaks those internal paths (symptom: CJK falls back to "?" on receipts).
  // Keep them external so Node requires them directly from node_modules.
  serverExternalPackages: ["subset-font", "harfbuzzjs", "fontverter", "@pdf-lib/fontkit", "pdf-lib"],
  experimental: {
    serverActions: {
      // 工作单 48: the transfer-proof screenshot rides a server action, and
      // Next's DEFAULT limit is 1MB — smaller than the 4MB the client-side
      // gate (src/lib/shrink-photo.ts) promises. 4400kb: above 4MB + multipart
      // overhead, below Vercel's ~4.5MB platform cap on request bodies.
      bodySizeLimit: "4400kb",
    },
  },
};

export default nextConfig;
