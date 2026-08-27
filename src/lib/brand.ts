// ---------------------------------------------------------------------------
// THE BRAND LEVER (work order 31 Stage E, 拍板 38 / D20)
//
// The name is DECIDED: "MinitAI" (J, 2026-08-27, work order 32 拍板 0-1 —
// this supersedes D13's "decide after the competition"). The lever stays:
// everything user-visible that says the brand name imports from here —
// layout metadata, the sidebar logo, the home page, the ask-panel title,
// PDF footers ("Drafted by …"), how-it-works copy.
//
// What deliberately does NOT go through this constant:
//   · prompts (src/prompts/*) — changing a prompt invalidates measurements
//   · code comments and identifiers (cari_minit, minit_admin, …)
//   · the receipt number prefix — MIN-2026-xxxx is LOCKED for issued books
//     (E-2 / D20); a renamed brand only changes the DEFAULT prefix offered
//     to organisations that have not issued their first receipt yet
//   · legal/PDPA documents already published — reviewed by a human per D13
//
// Acceptance: edit BRAND_NAME → `npm run build` → every screen and PDF
// footer follows. (Verified 2026-08-28 with a throwaway name, then reverted.)
// ---------------------------------------------------------------------------

/** The one line to edit when the rename lands. (Landed: 拍板 0-1.) */
export const BRAND_NAME = "MinitAI";

/** The single letter on the square logo tile (sidebar + phone top bar). */
export const BRAND_INITIAL = BRAND_NAME.slice(0, 1).toUpperCase();

/** What the assistant is called when spoken TO ("Tanya Minit" / "Ask Minit").
 *  Same as the brand today; kept separate so a rename can keep a shorter
 *  assistant nickname if the new brand is a mouthful. */
export const ASSISTANT_NAME = BRAND_NAME;

/** PDF metadata Producer field (receipt-pdf, financial-statement-pdf…). */
export const PDF_PRODUCER = BRAND_NAME;

/** The audit line every confirmed official document carries (Hard Rule 8).
 *  BM + EN variants; the zh variant lives in minutes-lang.ts next to its
 *  sibling strings. Keep the sentence shape identical across documents. */
export const draftedByLine = {
  bm: (confirmedBy: string, dateIso: string) =>
    `Disediakan oleh ${BRAND_NAME}, disahkan oleh ${confirmedBy} pada ${dateIso}`,
  zh: (confirmedBy: string, dateIso: string) =>
    `由 ${BRAND_NAME} 起草，${confirmedBy} 于 ${dateIso} 确认`,
  en: (confirmedBy: string, dateIso: string) =>
    `Drafted by ${BRAND_NAME}, confirmed by ${confirmedBy} on ${dateIso}`,
  /** Unconfirmed drafts (AGM pack watermark line). */
  draftEn: () => `Drafted by ${BRAND_NAME}.`,
};
