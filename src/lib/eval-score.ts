// ---------------------------------------------------------------------------
// EVAL SCORING (Phase 6) — pure deterministic logic, NO AI, NO I/O.
//
// Compares what the AI extracted against a human-written "golden" answer
// (/eval/cases/*/case.json) and counts, per field type, how often the AI was
// right. This produces the deck's headline number:
//   "X% of fields extracted correctly across N real filings."
//
// Scoring rules (simple on purpose — a beginner must be able to audit them):
//   date / enum / amount → must match exactly (after trivial normalising)
//   name                 → equal after lowercasing + whitespace/punct cleanup
//   text                 → same as name, OR one contains the other when the
//                          expected text is long (≥ 12 chars) — handwriting
//                          transcriptions legitimately differ in small ways
//   expected EMPTY but AI gave a value → wrong AND counted as INVENTED
//     (the worst failure class — Hard Rule 1 says the AI never invents)
//   expected value but AI said missing → an honest miss (wrong, not invented)
//
// Lists (attendees, ledger rows, clauses, events) are matched greedily: each
// expected item is paired with the unused AI item that agrees on the most
// sub-fields. Extra AI items nobody expected are counted as invented.
// ---------------------------------------------------------------------------

import type {
  MeetingNotesExtraction,
  LedgerExtraction,
  ConstitutionExtraction,
  EventsExtraction,
} from "./extraction";

export type EvalCaseType = "minutes" | "ledger" | "constitution" | "events";

export type FieldKind = "date" | "amount" | "enum" | "name" | "text";

/** One compared field — the atom of the accuracy number. */
export type FieldResult = {
  /** Human-readable path, e.g. "rows[2].amount_cents" */
  field: string;
  kind: FieldKind;
  expected: string;
  got: string;
  ok: boolean;
  /** true when the AI produced a value the golden answer says does not exist */
  invented: boolean;
};

// --- Golden (expected) shapes — plain values only, no confidence/source_ref.
// A missing field is "" (or null for amounts), same convention as extraction.

export type ExpectedMinutes = {
  meeting_type: string;
  meeting_date: string;
  meeting_venue: string;
  attendees: string[];
  resolutions: string[];
  figures: { description: string; amount_cents: number | null }[];
  office_bearers: { position: string; person_name: string }[];
};

export type ExpectedLedger = {
  page_title: string;
  rows: {
    donor_name: string;
    donor_phone: string;
    amount_cents: number | null;
    purpose: string;
    donated_at: string;
  }[];
};

export type ExpectedConstitution = {
  document_title: string;
  clauses: { clause_no: string; heading: string; text: string; page_ref: string }[];
};

export type ExpectedEvents = {
  events: { title: string; date: string; time: string }[];
};

// ---------------------------------------------------------------------------
// Normalising + comparing single values
// ---------------------------------------------------------------------------

/** Lowercase, unicode-normalise, drop punctuation, collapse spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.,;:!?'"“”‘’()\[\]{}\-–—/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LONG_TEXT_CHARS = 12;

function compareValue(kind: FieldKind, expected: string, got: string): boolean {
  if (kind === "date" || kind === "enum") return expected === got;
  if (kind === "amount") return expected === got; // both already stringified sen
  const e = normalizeText(expected);
  const g = normalizeText(got);
  if (e === g) return true;
  if (
    kind === "text" &&
    e.length >= LONG_TEXT_CHARS &&
    g.length >= LONG_TEXT_CHARS
  ) {
    // Long transcriptions may differ at the edges; containment counts.
    return e.includes(g) || g.includes(e);
  }
  return false;
}

/** Builds the FieldResult for one scalar field. */
function scoreField(
  field: string,
  kind: FieldKind,
  expectedRaw: string | number | null,
  gotRaw: string | number | null
): FieldResult {
  const expected = expectedRaw === null ? "" : String(expectedRaw);
  const got = gotRaw === null ? "" : String(gotRaw);
  const expectedEmpty = expected === "";
  const gotEmpty = got === "";

  if (expectedEmpty && gotEmpty) {
    return { field, kind, expected, got, ok: true, invented: false };
  }
  if (expectedEmpty && !gotEmpty) {
    return { field, kind, expected, got, ok: false, invented: true };
  }
  if (!expectedEmpty && gotEmpty) {
    return { field, kind, expected, got, ok: false, invented: false };
  }
  const ok = compareValue(kind, expected, got);
  return { field, kind, expected, got, ok, invented: false };
}

// ---------------------------------------------------------------------------
// Greedy list matching
// ---------------------------------------------------------------------------

type SubField = {
  name: string;
  kind: FieldKind;
  expected: string | number | null;
};

/**
 * Pairs each expected item with the unused actual item agreeing on the most
 * sub-fields, then scores every sub-field. Extra actual items → invented.
 */
function scoreList<A>(
  listName: string,
  expectedItems: SubField[][],
  actualItems: A[],
  subFieldsOf: (item: A) => (string | number | null)[],
  /** index of the sub-field used to describe an extra (invented) item */
  keyIndex: number
): FieldResult[] {
  const results: FieldResult[] = [];
  const used = new Set<number>();

  for (let e = 0; e < expectedItems.length; e++) {
    const exp = expectedItems[e];
    let bestIdx = -1;
    let bestScore = -1;
    for (let a = 0; a < actualItems.length; a++) {
      if (used.has(a)) continue;
      const got = subFieldsOf(actualItems[a]);
      let score = 0;
      for (let f = 0; f < exp.length; f++) {
        const r = scoreField("tmp", exp[f].kind, exp[f].expected, got[f] ?? "");
        if (r.ok) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = a;
      }
    }
    const got =
      bestIdx >= 0 ? subFieldsOf(actualItems[bestIdx]) : exp.map(() => "");
    if (bestIdx >= 0) used.add(bestIdx);
    for (let f = 0; f < exp.length; f++) {
      results.push(
        scoreField(
          `${listName}[${e}].${exp[f].name}`,
          exp[f].kind,
          exp[f].expected,
          got[f] ?? ""
        )
      );
    }
  }

  // Actual items nobody expected = invented rows.
  for (let a = 0; a < actualItems.length; a++) {
    if (used.has(a)) continue;
    const got = subFieldsOf(actualItems[a]);
    const kind = expectedItems[0]?.[keyIndex]?.kind ?? "text";
    const name = expectedItems[0]?.[keyIndex]?.name ?? "item";
    results.push({
      field: `${listName}[extra].${name}`,
      kind,
      expected: "",
      got: got[keyIndex] === null ? "" : String(got[keyIndex] ?? ""),
      ok: false,
      invented: true,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Per-type scorers
// ---------------------------------------------------------------------------

export function scoreMinutes(
  expected: ExpectedMinutes,
  actual: MeetingNotesExtraction
): FieldResult[] {
  return [
    scoreField("meeting_type", "enum", expected.meeting_type, actual.meeting_type.value),
    scoreField("meeting_date", "date", expected.meeting_date, actual.meeting_date.value),
    scoreField("meeting_venue", "text", expected.meeting_venue, actual.meeting_venue.value),
    ...scoreList(
      "attendees",
      expected.attendees.map((name) => [{ name: "name", kind: "name" as const, expected: name }]),
      actual.attendees,
      (a) => [a.name.value],
      0
    ),
    ...scoreList(
      "resolutions",
      expected.resolutions.map((text) => [{ name: "text", kind: "text" as const, expected: text }]),
      actual.resolutions,
      (r) => [r.text.value],
      0
    ),
    ...scoreList(
      "figures",
      expected.figures.map((f) => [
        { name: "description", kind: "text" as const, expected: f.description },
        { name: "amount_cents", kind: "amount" as const, expected: f.amount_cents },
      ]),
      actual.figures,
      (f) => [f.description.value, f.amount_cents.value],
      0
    ),
    ...scoreList(
      "office_bearers",
      expected.office_bearers.map((o) => [
        { name: "position", kind: "text" as const, expected: o.position },
        { name: "person_name", kind: "name" as const, expected: o.person_name },
      ]),
      actual.office_bearers,
      (o) => [o.position.value, o.person_name.value],
      1
    ),
  ];
}

export function scoreLedger(
  expected: ExpectedLedger,
  actual: LedgerExtraction
): FieldResult[] {
  return [
    scoreField("page_title", "text", expected.page_title, actual.page_title.value),
    ...scoreList(
      "rows",
      expected.rows.map((r) => [
        { name: "donor_name", kind: "name" as const, expected: r.donor_name },
        { name: "donor_phone", kind: "text" as const, expected: r.donor_phone },
        { name: "amount_cents", kind: "amount" as const, expected: r.amount_cents },
        { name: "purpose", kind: "text" as const, expected: r.purpose },
        { name: "donated_at", kind: "date" as const, expected: r.donated_at },
      ]),
      actual.rows,
      (r) => [
        r.donor_name.value,
        r.donor_phone.value,
        r.amount_cents.value,
        r.purpose.value,
        r.donated_at.value,
      ],
      0
    ),
  ];
}

export function scoreConstitution(
  expected: ExpectedConstitution,
  actual: ConstitutionExtraction
): FieldResult[] {
  return [
    scoreField("document_title", "text", expected.document_title, actual.document_title.value),
    ...scoreList(
      "clauses",
      expected.clauses.map((c) => [
        { name: "clause_no", kind: "text" as const, expected: c.clause_no },
        { name: "heading", kind: "text" as const, expected: c.heading },
        { name: "text", kind: "text" as const, expected: c.text },
        { name: "page_ref", kind: "text" as const, expected: c.page_ref },
      ]),
      actual.clauses,
      (c) => [c.clause_no.value, c.heading.value, c.text.value, c.page_ref.value],
      0
    ),
  ];
}

export function scoreEvents(
  expected: ExpectedEvents,
  actual: EventsExtraction
): FieldResult[] {
  return scoreList(
    "events",
    expected.events.map((e) => [
      { name: "title", kind: "text" as const, expected: e.title },
      { name: "date", kind: "date" as const, expected: e.date },
      { name: "time", kind: "text" as const, expected: e.time },
    ]),
    actual.events,
    (e) => [e.title.value, e.date.value, e.time.value],
    0
  );
}

// ---------------------------------------------------------------------------
// Aggregation — turns FieldResults into the report numbers
// ---------------------------------------------------------------------------

export type EvalSummary = {
  byKind: Record<FieldKind, { correct: number; total: number }>;
  overall: { correct: number; total: number; pct: number };
  inventedCount: number;
  failures: FieldResult[];
};

export function summarize(results: FieldResult[]): EvalSummary {
  const byKind: EvalSummary["byKind"] = {
    date: { correct: 0, total: 0 },
    amount: { correct: 0, total: 0 },
    enum: { correct: 0, total: 0 },
    name: { correct: 0, total: 0 },
    text: { correct: 0, total: 0 },
  };
  let correct = 0;
  let inventedCount = 0;
  const failures: FieldResult[] = [];

  for (const r of results) {
    byKind[r.kind].total++;
    if (r.ok) {
      byKind[r.kind].correct++;
      correct++;
    } else {
      failures.push(r);
      if (r.invented) inventedCount++;
    }
  }

  const total = results.length;
  return {
    byKind,
    overall: {
      correct,
      total,
      pct: total === 0 ? 0 : Math.round((correct / total) * 1000) / 10,
    },
    inventedCount,
    failures,
  };
}
