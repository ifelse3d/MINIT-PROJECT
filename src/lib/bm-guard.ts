// ---------------------------------------------------------------------------
// BM GUARD (J, 2026-08-27 下午): 「report 那邊如果要馬來文交去 eROSES，
// 不可以有華語的，需要要求 user 填馬來語。」
//
// Pure, deterministic detection of Chinese text inside a document that is
// about to be presented as a Bahasa Malaysia official document (the BM
// minutes, the eROSES paste pack). Detection is FREE and runs at the moment
// of generating/saving; what happens next is the USER's choice (J's ruling):
// fix it themselves, or let the AI write the BM version (the existing
// metered draft path). Nothing is auto-translated behind anyone's back.
//
// What counts as Chinese here: CJK unified ideographs (+ext A, compat) and
// CJK punctuation. Deliberately NOT flagged: Latin-script names, digits,
// "RM", emoji — and this guard is never applied to donor/member NAMES as a
// person's name (names go through the roster's official IC names; a Chinese
// name inside eROSES content still flags, because the fix is to use the
// official name, and the flag says so at the field where it happens).
// ---------------------------------------------------------------------------

const CJK_RE =
  // Ideographs: URO + Ext A + compatibility; CJK symbols/punct + fullwidth forms.
  /[㐀-䶿一-鿿豈-﫿　-〿！-／：-＠［-｀｛-･]/;

/** True when the text contains any Chinese character or CJK punctuation. */
export function hasCjk(text: string): boolean {
  return CJK_RE.test(text);
}

const MAX_SNIPPETS = 12;

/**
 * The offending LINES of a document, trimmed and de-duplicated, capped so a
 * fully-Chinese document does not render a wall. Line-level on purpose: a
 * secretary fixes text a line at a time, and a whole line is enough context
 * to find it in the editor.
 *
 * `allow`: strings that are ALLOWED to be Chinese and must print verbatim —
 * the organisation's registered name (never rewritten, anywhere) and the
 * signer's account name. A line is exempt only for the Chinese those
 * strings themselves carry: other Chinese on the same line still flags.
 */
export function cjkSnippets(text: string, allow: string[] = []): string[] {
  const allowed = allow.filter((a) => a.trim() !== "");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    let probe = line;
    for (const a of allowed) probe = probe.split(a).join("");
    if (!CJK_RE.test(probe)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= MAX_SNIPPETS) break;
  }
  return out;
}
