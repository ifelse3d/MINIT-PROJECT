/**
 * Normalise a model reply for display.
 *
 * 2026-08-18 (J, testing the home Ask box): the same question asked twice gave
 * two answers, and the second one printed a literal `\n1)` `\n2)` in the middle
 * of the sentence instead of starting a new line. The reply bubble already
 * renders with `whitespace-pre-line`, so a REAL newline works — what arrived
 * was the two characters backslash and n, and no amount of CSS turns those into
 * a line break. It happens when the model writes an escaped newline inside the
 * JSON string field, which then survives JSON.parse as ordinary text.
 *
 * Display layer only. This does not change what the model said — only how the
 * line breaks it asked for are spelled.
 */
export function tidyReply(text: string): string {
  return text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
