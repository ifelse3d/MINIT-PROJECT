import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
