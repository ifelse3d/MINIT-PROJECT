// ---------------------------------------------------------------------------
// CONSTITUTION Q&A — Phase 5 pure logic (no AI, no I/O). Deterministic and
// unit-tested: keyword filtering to pick candidate clauses, and the strict
// "no clause → no answer" rule (CLAUDE.md Hard Rule 1 applied to Q&A:
// we only ever SHOW what the constitution SAYS; we never give legal advice).
//
// When the API key is connected, the LLM's only job is to phrase an answer
// AROUND the clauses this filter found — it receives ONLY these clauses and
// must cite them. If this filter finds nothing, the app refuses BEFORE any
// model is called. The refusal path costs RM0 and can never hallucinate.
// ---------------------------------------------------------------------------

/** A clause AFTER human confirmation — plain strings, matching
 *  `constitutions.clauses_json` in the migration. */
export type ConfirmedClause = {
  clause_no: string;
  heading: string;
  /** Verbatim clause body, original language */
  text: string;
  page_ref: string;
};

export type ClauseMatch = {
  clause: ConfirmedClause;
  score: number;
};

/**
 * Merge a freshly-read page of clauses into the ones already held.
 *
 * A constitution is many photographs, so uploading page 2 must never throw away
 * page 1 — and re-photographing a bad page must be able to FIX it. Later wins on
 * a repeated clause number; order of first appearance is otherwise preserved.
 *
 * Extracted from constitution-review.tsx on 2026-08-05, where this loop was
 * written out twice (once for the upload path, once for the home-page intake
 * hand-off). It moved here to be unit-tested, because it is now also the merge
 * used when clauses come back from the database on a second device — a bug here
 * silently drops clauses from a legal document.
 */
export function mergeClauses(
  previous: readonly ConfirmedClause[],
  incoming: readonly ConfirmedClause[],
): ConfirmedClause[] {
  const merged = new Map<string, ConfirmedClause>();
  for (const c of previous) merged.set(c.clause_no, c);
  for (const c of incoming) merged.set(c.clause_no, c);
  return [...merged.values()];
}

/**
 * Is this really an array of confirmed clauses?
 *
 * Used on BOTH untrusted paths: the localStorage blob and the `clauses_json`
 * column. Anything that fails is discarded rather than handed to the Q&A —
 * a wrong-shaped clause would otherwise surface as `undefined` inside a
 * quoted "verbatim" clause body.
 */
export function isConfirmedClauseArray(parsed: unknown): parsed is ConfirmedClause[] {
  return (
    Array.isArray(parsed) &&
    parsed.every((c) => {
      if (typeof c !== "object" || c === null) return false;
      const x = c as Record<string, unknown>;
      return (
        typeof x.clause_no === "string" &&
        typeof x.heading === "string" &&
        typeof x.text === "string" &&
        typeof x.page_ref === "string"
      );
    })
  );
}

// --- tokenisation ----------------------------------------------------------

/** Words too common to mean anything (BM + EN). Kept tiny on purpose. */
const STOPWORDS = new Set([
  // BM
  "yang", "untuk", "dengan", "dalam", "adalah", "atau", "dan", "ini", "itu",
  "boleh", "tidak", "akan", "pada", "kepada", "daripada", "hendaklah", "oleh",
  "apa", "apakah", "bagaimana", "bila", "bilakah", "siapa", "berapa", "kah",
  "kami", "kita", "saya", "anda", "persatuan", "pertubuhan",
  // EN
  "the", "and", "for", "with", "what", "when", "who", "how", "can", "our",
  "are", "was", "does", "do", "did", "will", "shall", "may", "must", "have",
  "has", "this", "that", "society", "association",
]);

/**
 * Same-meaning words across BM / EN / 中文 for the governance terms a
 * committee member actually asks about. Content-like data, kept small and
 * readable so the team can extend it.
 */
const SYNONYMS: string[][] = [
  ["agm", "mesyuarat agung", "annual general meeting", "大会", "会员大会", "常年大会"],
  ["egm", "mesyuarat agung khas", "extraordinary general meeting", "特别大会"],
  ["notis", "notice", "通知"],
  ["kuorum", "quorum", "法定人数"],
  ["yuran", "fee", "fees", "subscription", "会费"],
  ["ahli", "member", "members", "keahlian", "membership", "会员"],
  ["jawatankuasa", "committee", "理事会", "理事"],
  ["pengerusi", "chairman", "president", "主席", "会长"],
  ["setiausaha", "secretary", "秘书"],
  ["bendahari", "treasurer", "财政"],
  ["akaun", "accounts", "audit", "juruaudit", "auditor", "账目", "查账", "审计"],
  ["pindaan", "amendment", "amend", "meminda", "修改", "修订"],
  ["bubar", "pembubaran", "dissolution", "dissolve", "解散"],
  ["undi", "mengundi", "vote", "voting", "投票", "表决"],
  ["derma", "donation", "kutipan", "捐款", "募捐"],
  ["bank", "cek", "cheque", "tandatangan", "signatory", "银行", "签名"],
  ["pemilihan", "election", "elect", "选举"],
];

function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= 0x4e00 && code <= 0x9fff;
}

/** Latin words (len ≥ 3, minus stopwords) + CJK bigrams + CJK single chars. */
export function tokenise(input: string): string[] {
  const lower = input.toLowerCase();
  const tokens = new Set<string>();

  for (const word of lower.split(/[^a-z0-9À-ɏ]+/)) {
    if (word.length >= 3 && !STOPWORDS.has(word)) tokens.add(word);
  }

  const cjk = [...lower].filter(isCjk);
  for (let i = 0; i < cjk.length; i++) {
    tokens.add(cjk[i]);
    if (i + 1 < cjk.length) tokens.add(cjk[i] + cjk[i + 1]);
  }
  return [...tokens];
}

/** Expands question tokens with cross-language synonyms. */
export function expandWithSynonyms(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const group of SYNONYMS) {
    const hit = group.some((term) =>
      tokens.some((t) => t.includes(term) || term.includes(t))
    );
    if (hit) for (const term of group) expanded.add(term);
  }
  return [...expanded];
}

// --- filtering -------------------------------------------------------------

export const MAX_CANDIDATE_CLAUSES = 6;

/**
 * Finds the clauses that could support an answer. Heading/clause_no hits
 * weigh double (a question about "AGM" should surface the AGM clause first).
 * Returns [] when nothing matches — the caller MUST then refuse.
 */
export function filterClauses(
  question: string,
  clauses: ConfirmedClause[]
): ClauseMatch[] {
  const tokens = expandWithSynonyms(tokenise(question));
  if (tokens.length === 0) return [];

  const matches: ClauseMatch[] = [];
  for (const clause of clauses) {
    const head = `${clause.clause_no} ${clause.heading}`.toLowerCase();
    const body = clause.text.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      // CJK bigrams count more than single chars (less noise).
      const weight = isCjk(t[0]) ? (t.length >= 2 ? 2 : 0.5) : 2;
      if (head.includes(t)) score += weight * 2;
      else if (body.includes(t)) score += weight;
    }
    if (score > 0) matches.push({ clause, score });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, MAX_CANDIDATE_CLAUSES);
}

// --- reading the whole thing ------------------------------------------------

/**
 * Order clauses the way the printed document does.
 *
 * The stored order is "order first photographed", because a constitution
 * arrives as a stack of photos and mergeClauses preserves first appearance.
 * That is right for merging and wrong for READING: photograph page 4 before
 * page 2 and the book comes out shuffled. So the reading page sorts.
 *
 * Clause numbers are not integers — "12", "12.1", "12.10", "Fasal 3(a)" — so
 * this compares them segment by segment, numerically where both segments are
 * numeric and textually otherwise. That puts 12.2 before 12.10, which plain
 * string sorting gets backwards, and it leaves unnumbered oddities in a stable
 * place at the end rather than scattered through the middle.
 */
export function sortClauses(clauses: readonly ConfirmedClause[]): ConfirmedClause[] {
  const segmentsOf = (no: string): (number | string)[] =>
    no
      .toLowerCase()
      // \ud83d\udd34 \u00a74 (work order 104). The LABEL WORD is not part of the number.
      //
      // J, 2026-08-31 evening: \u300c8.2\u20138.8 \u6392\u5728 FASAL 1 \u524d\u9762\u300d. Half a real book
      // writes "Fasal 8" and the other half writes its sub-clauses bare
      // ("8.2"), because that is how the document is typeset. Tokenising the
      // word made the two styles sort in different universes: "fasal" is a
      // word, "8" is a number, and the rule below puts numbers before words \u2014
      // so EVERY bare sub-clause landed above Fasal 1, and the book looked
      // broken. Dropping the label first makes "8.2" sort as what it is: the
      // second sub-clause of clause 8, right after "Fasal 8".
      .replace(/^\s*(fasal|clause|perkara|artikel|article)\b\s*/, "")
      .split(/[^0-9a-z\u4e00-\u9fff]+/)
      .filter((x) => x !== "")
      .map((x) => (/^\d+$/.test(x) ? Number(x) : x));

  return [...clauses].sort((a, b) => {
    const A = segmentsOf(a.clause_no);
    const B = segmentsOf(b.clause_no);
    // A clause number with no digits or letters at all sorts LAST, so a stray
    // blank sits at the end of the book instead of at the top of it.
    if (A.length === 0 || B.length === 0) {
      return (A.length === 0 ? 1 : 0) - (B.length === 0 ? 1 : 0);
    }
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const x = A[i];
      const y = B[i];
      if (x === undefined) return -1;
      if (y === undefined) return 1;
      if (typeof x === "number" && typeof y === "number") {
        if (x !== y) return x - y;
      } else {
        // Numbers before words at the same depth: "12" before "12a".
        const sx = typeof x === "number" ? String(x).padStart(8, "0") : "~" + x;
        const sy = typeof y === "number" ? String(y).padStart(8, "0") : "~" + y;
        if (sx !== sy) return sx < sy ? -1 : 1;
      }
    }
    return 0;
  });
}

/**
 * Plain substring search across a constitution, for the person READING it
 * rather than asking a question about it.
 *
 * Deliberately NOT filterClauses(). That one is the Q&A retriever: it expands
 * synonyms across three languages, weighs headings double and returns the six
 * best guesses. Excellent for "how much notice for an AGM"; wrong for somebody
 * who typed "12.3" and wants clause 12.3 — and actively confusing when it
 * silently drops the seventh match from a document they are trying to read in
 * full. Here, a match is a match, everything that matches is returned, and the
 * order of the book is preserved.
 *
 * An empty query returns everything, which is what a reading page should show.
 */
export function searchClauses(
  clauses: readonly ConfirmedClause[],
  query: string,
): ConfirmedClause[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...clauses];
  return clauses.filter(
    (c) =>
      c.clause_no.toLowerCase().includes(q) ||
      c.heading.toLowerCase().includes(q) ||
      c.text.toLowerCase().includes(q),
  );
}

// --- answer / refusal text (deterministic, BM-first) ------------------------

export const QA_DISCLAIMER_BM =
  "MinitAI hanya menunjukkan apa yang TERTULIS dalam perlembagaan anda — ini bukan nasihat undang-undang.";
// 2026-07-28 audit: the Chinese variant was missing, so a 中文-only reader got
// the disclaimer in two languages they may not read.
export const QA_DISCLAIMER_ZH =
  "MinitAI 只会把您章程里「写着的」内容显示出来 —— 这不是法律意见。";
export const QA_DISCLAIMER_EN =
  "MinitAI only shows what is WRITTEN in your constitution — this is not legal advice.";

/** Polite refusal when no clause supports an answer. Never guesses. */
export function buildRefusalBm(question: string): string {
  return [
    `Maaf — perlembagaan anda tidak menyentuh perkara ini, jadi MinitAI tidak boleh menjawab soalan "${question.trim()}".`,
    "抱歉——您的章程没有提到这件事，MinitAI 不能猜测答案。",
    "Sorry — your constitution does not cover this, so MinitAI will not guess an answer.",
    "",
    QA_DISCLAIMER_BM,
    QA_DISCLAIMER_ZH,
    QA_DISCLAIMER_EN,
  ].join("\n");
}

/**
 * The no-AI answer: the matched clauses themselves, verbatim, with citations.
 * (With the API connected, the LLM rephrases AROUND these same clauses and
 * must cite these same clause numbers — nothing else is in its context.)
 */
export function buildClauseAnswerBm(matches: ClauseMatch[]): string {
  if (matches.length === 0) {
    throw new Error("buildClauseAnswerBm requires at least one match — refuse instead.");
  }
  const lines: string[] = ["Ini yang tertulis dalam perlembagaan anda / 您的章程是这样写的:", ""];
  for (const { clause } of matches) {
    const heading = clause.heading ? ` — ${clause.heading}` : "";
    const page = clause.page_ref ? ` (${clause.page_ref})` : "";
    lines.push(`【${clause.clause_no}${heading}】${page}`);
    lines.push(clause.text);
    lines.push("");
  }
  lines.push(QA_DISCLAIMER_BM);
  return lines.join("\n");
}

/** clause_nos to store in qa_log.cited_clause_ids */
export function citedClauseNos(matches: ClauseMatch[]): string[] {
  return matches.map((m) => m.clause.clause_no);
}

// --- notice-period lookup (feeds the Phase 4 AGM pack warning) --------------

/**
 * Tries to read the AGM notice period (days) from the constitution itself,
 * so the AGM pack can stop relying on the org SETTING (the amber warning).
 * Only trusts an explicit "<n> hari/days/天" inside an AGM-related clause.
 */
export function findNoticePeriodDays(
  clauses: ConfirmedClause[]
): { days: number; clause: ConfirmedClause } | null {
  const agmMatches = filterClauses("notis mesyuarat agung tahunan", clauses);
  for (const { clause } of agmMatches) {
    const m = /(\d{1,3})\s*(?:hari|days?|天)/i.exec(clause.text);
    if (m) {
      const days = Number(m[1]);
      if (days >= 1 && days <= 90) return { days, clause };
    }
  }
  return null;
}
