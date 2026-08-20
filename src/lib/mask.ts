// PDPA masking helpers (CLAUDE.md Hard Rule 5: donor personal data is masked
// in list views by default). Pure functions — unit-tested in mask.test.ts.

/**
 * Mask a person's name for list views: keep the first character of each word,
 * replace the rest with bullets. "Tan Ah Kow" → "T•• A• K••".
 * Empty/whitespace input returns "—" so the UI never shows a blank cell.
 */
export function maskName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "—";
  return trimmed
    .split(/\s+/)
    .map((word) =>
      // Array.from handles multi-byte characters (Chinese names) correctly.
      Array.from(word)
        .map((ch, i) => (i === 0 ? ch : "•"))
        .join(""),
    )
    .join(" ");
}

/**
 * Mask a Malaysian IC number: keep the birth-date part visible enough to be
 * recognisable, hide the rest. "880101-07-5231" → "880101-••-••••".
 * Anything that doesn't look like an IC is masked to its first 4 characters.
 */
export function maskIc(ic: string): string {
  const trimmed = ic.trim();
  if (!trimmed) return "—";
  const match = trimmed.match(/^(\d{6})-?(\d{2})-?(\d{4})$/);
  if (match) return `${match[1]}-••-••••`;
  return (
    Array.from(trimmed)
      .map((ch, i) => (i < 4 ? ch : "•"))
      .join("")
  );
}
