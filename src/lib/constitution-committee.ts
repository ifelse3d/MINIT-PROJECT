// ---------------------------------------------------------------------------
// WHAT THE CONSTITUTION SAYS THE COMMITTEE LOOKS LIKE.
//
// H1 (work order 69, §1-5): when the society has confirmed its constitution,
// the members page can say "照章程要 X 名，现在有 Y 名" next to the roster.
//
// This is ARITHMETIC over a clause the human already confirmed — never an AI
// call (能用程式解析的，不要送去 AI). And it is display-only: a wrong count
// here would nag a secretary about their own committee, so the parser is
// deliberately conservative — it answers null unless it finds the classic
// composition sentence ("Jawatankuasa hendaklah terdiri daripada seorang
// Pengerusi, … dan tujuh orang Ahli Jawatankuasa Biasa") and reads at least
// two positions out of it. No clause, odd wording, an English constitution
// it cannot be sure of → no banner, no guess (一道检查如果会误杀正确结果，
// 就不要装上去 — and a missing display is the harmless direction here).
// ---------------------------------------------------------------------------

export type PositionRequirement = {
  /** The title as the constitution writes it ("Pengerusi", "Ahli Jawatankuasa Biasa"). */
  title: string;
  count: number;
};

export type CommitteeRequirement = {
  positions: PositionRequirement[];
  total: number;
  /** Which clause said so — shown so the person can check us. */
  clauseNo: string;
};

type ClauseLike = { clause_no: string; heading: string; text: string };

/** Malay number words as constitutions write them. "seorang" = one person. */
const NUMBER_WORDS: Record<string, number> = {
  satu: 1,
  dua: 2,
  tiga: 3,
  empat: 4,
  lima: 5,
  enam: 6,
  tujuh: 7,
  lapan: 8,
  sembilan: 9,
  sepuluh: 10,
  sebelas: 11,
};

function wordToCount(raw: string): number | null {
  const w = raw.toLowerCase().trim();
  if (w === "seorang") return 1;
  if (/^\d+$/.test(w)) {
    const n = Number(w);
    return n >= 1 && n <= 99 ? n : null;
  }
  const belas = w.match(/^(\w+)\s+belas$/);
  if (belas) {
    const base = NUMBER_WORDS[belas[1]];
    return base !== undefined && base >= 1 && base <= 9 ? base + 10 : null;
  }
  const puluh = w.match(/^(\w+)\s+puluh$/);
  if (puluh) {
    const base = NUMBER_WORDS[puluh[1]];
    return base !== undefined ? base * 10 : null;
  }
  return NUMBER_WORDS[w] ?? null;
}

/** "seorang Pengerusi" · "tujuh orang Ahli Jawatankuasa Biasa" · "2 orang AJK" */
const POSITION_RE =
  /\b(seorang|\d+\s+orang|(?:satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh|sebelas)(?:\s+belas|\s+puluh)?\s+orang)\s+([^,;.]+?)(?=\s*(?:,|;|\.|\bdan\b|$))/gi;

/**
 * The committee composition, read from the confirmed clauses — or null when
 * no clause states it plainly enough to repeat.
 */
export function committeeRequirementFromClauses(
  clauses: ClauseLike[],
): CommitteeRequirement | null {
  for (const clause of clauses) {
    const inScope = /jawatankuasa/i.test(clause.heading + " " + clause.text);
    if (!inScope) continue;
    const at = clause.text.toLowerCase().indexOf("terdiri daripada");
    if (at < 0) continue;

    // Only the sentence that states the composition — the rest of the clause
    // talks about terms and elections, where a stray "dua tahun" would
    // otherwise read as two more people.
    const sentence = clause.text.slice(at).split(/(?<=\.)\s/)[0];

    const positions: PositionRequirement[] = [];
    for (const m of sentence.matchAll(POSITION_RE)) {
      const count = wordToCount(m[1].replace(/\s+orang$/i, ""));
      const title = m[2].trim();
      if (count === null || title === "") continue;
      // "dua tahun" or a lowercase fragment is not a position title.
      if (!/^[A-Z一-鿿]/.test(title)) continue;
      positions.push({ title, count });
    }

    // One match could be a coincidence in prose; the composition sentence of
    // a real constitution always names several offices.
    if (positions.length < 2) continue;
    return {
      positions,
      total: positions.reduce((sum, p) => sum + p.count, 0),
      clauseNo: clause.clause_no,
    };
  }
  return null;
}

/**
 * How many of the CURRENT roster fill each required title — matched by the
 * BM title appearing in the row's own position text ("Pengerusi / 主席"
 * contains "Pengerusi"). Longest title wins, so a "Timbalan Pengerusi" row
 * never also counts as a "Pengerusi". Display-only, like everything here.
 */
export function countRosterAgainstRequirement(
  requirement: CommitteeRequirement,
  rosterPositions: string[],
): { title: string; required: number; have: number }[] {
  const byLength = [...requirement.positions].sort(
    (a, b) => b.title.length - a.title.length,
  );
  const have = new Map<string, number>(
    requirement.positions.map((p) => [p.title, 0]),
  );
  for (const raw of rosterPositions) {
    const pos = raw.toLowerCase();
    const hit = byLength.find((p) => pos.includes(p.title.toLowerCase()));
    if (hit) have.set(hit.title, (have.get(hit.title) ?? 0) + 1);
  }
  return requirement.positions.map((p) => ({
    title: p.title,
    required: p.count,
    have: have.get(p.title) ?? 0,
  }));
}
