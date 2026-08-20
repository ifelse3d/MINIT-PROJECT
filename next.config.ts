import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages load .wasm/font files from disk at runtime; bundling them
  // breaks those internal paths (symptom: CJK falls back to "?" on receipts).
  // Keep them external so Node requires them directly from node_modules.
  serverExternalPackages: ["subset-font", "harfbuzzjs", "fontverter", "@pdf-lib/fontkit", "pdf-lib"],
};

export default nextConfig;
