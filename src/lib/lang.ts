// ---------------------------------------------------------------------------
// Language plumbing shared by SERVER and client (Stage R, 2026-08-25).
//
// No "use client" here on purpose: the root layout (a server component) reads
// the cookie and stamps <html lang> before first paint, and a client-directive
// module's exports cannot be CALLED from a server component. The React
// provider and hooks live in src/components/language-provider.tsx.
// ---------------------------------------------------------------------------

export type LangKey = "bm" | "zh" | "en";
/** A single language, or the advanced side-by-side view. */
export type LangMode = LangKey | "all";

export const LANG_COOKIE = "minit-lang";

/** J's brief: 預設中文. */
export const DEFAULT_LANG_MODE: LangMode = "zh";

export function isLangMode(v: unknown): v is LangMode {
  return v === "bm" || v === "zh" || v === "en" || v === "all";
}

/** The BCP-47 tag <html lang> carries for each mode. */
export function htmlLangFor(mode: LangMode): string {
  switch (mode) {
    case "zh":
      return "zh-CN";
    case "en":
      return "en";
    default:
      // BM for "bm" and for the mixed view (official documents are BM).
      return "ms";
  }
}
