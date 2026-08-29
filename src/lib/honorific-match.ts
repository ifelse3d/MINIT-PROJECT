// ---------------------------------------------------------------------------
// HONORIFIC → ROSTER MATCH (work order 68 §4, 拍板 7 後半).
//
// Meeting notes constantly name people the way people actually talk: 陈讲师,
// 王老师, "Ustaz Rahman". The AI copies what it sees (Hard Rule 1 — it never
// resolves a nickname into a legal name), so the resolution happens HERE, by
// code, against the roster the society itself typed: surname + honorific in
// the note, surname + honorific column in committee_roster (B-7 laid the
// column). The person taps a match to apply it — a normal human edit.
//
// 寧缺勿濫: no match beats a wrong match. A suggestion appears only when the
// surname matches character-for-character AND the honorific matches the
// roster's own honorific column. Never fuzzy, never AI.
// ---------------------------------------------------------------------------

export type HonorificRosterEntry = {
  name: string;
  position?: string;
  honorific?: string | null;
  nameOfficial?: string | null;
};

export type HonorificSuggestion = {
  /** What the chip shows: the roster name (+ official name when different). */
  label: string;
  /** What tapping writes into the field: the roster's recorded name. */
  value: string;
};

const CJK = /^[㐀-䶿一-鿿豈-﫿]+$/;

/**
 * Roster matches for an honorific-style name the AI read off the page.
 *
 * Chinese form: "陈讲师" = surname 陈 + honorific 讲师 — matched against
 * entries whose honorific equals/contains the term and whose name starts
 * with the same surname character.
 * Latin form: "Ustaz Rahman" — matched when the roster entry's honorific
 * equals the first word (case-insensitive) and the rest appears in the name.
 */
export function honorificSuggestions(
  raw: string,
  roster: readonly HonorificRosterEntry[],
): HonorificSuggestion[] {
  const value = raw.trim();
  if (value === "" || roster.length === 0) return [];

  const matches: HonorificRosterEntry[] = [];

  if (CJK.test(value) && value.length >= 2 && value.length <= 8) {
    const surname = value[0];
    const term = value.slice(1);
    for (const entry of roster) {
      const hon = (entry.honorific ?? "").trim();
      if (hon === "") continue;
      if (!entry.name.startsWith(surname)) continue;
      // The note's term and the roster's column must agree — either can be
      // the longer form (讲师 vs 陈讲师课讲师? no: containment either way).
      if (hon === term || hon.includes(term) || term.includes(hon)) {
        matches.push(entry);
      }
    }
  } else {
    const words = value.split(/\s+/);
    if (words.length >= 2) {
      const [first, ...rest] = words;
      const restJoined = rest.join(" ").toLowerCase();
      for (const entry of roster) {
        const hon = (entry.honorific ?? "").trim().toLowerCase();
        if (hon === "" || hon !== first.toLowerCase()) continue;
        if (entry.name.toLowerCase().includes(restJoined)) matches.push(entry);
      }
    }
  }

  // The exact string the note used needs no suggestion.
  const out: HonorificSuggestion[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (m.name === value) continue;
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    const official = (m.nameOfficial ?? "").trim();
    out.push({
      label:
        official !== "" && official !== m.name ? `${m.name} (${official})` : m.name,
      value: m.name,
    });
    if (out.length >= 4) break; // more than a handful is a search, not a match
  }
  return out;
}
