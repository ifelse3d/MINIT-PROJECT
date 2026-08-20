// ---------------------------------------------------------------------------
// PASTING A LIST YOU ALREADY HAVE.
//
// 2026-08-19 (user: "沒得 upload 已經有的。可能有些地方有做過成員名單，然後 upload
// 上來而已"). Typing a 20-person committee into a form one at a time is not a
// feature, it is a punishment — and every society already has this list, in a
// Word table, a WhatsApp message, or an Excel sheet.
//
// So the input is TEXT, not a file format. Copying rows out of Excel gives you
// tab-separated lines; Word tables and WhatsApp give commas, colons or dashes.
// Accepting all of them costs a regex and removes the need for a spreadsheet
// parser (and for guessing which column is which).
//
// THE RULE THAT MATTERS: a line we cannot read is REPORTED, never dropped. A
// bulk import that silently skips three rows is worse than one that refuses,
// because nobody re-counts a list of twenty.
// ---------------------------------------------------------------------------

/** Tab, comma, full-width comma, colon, full-width colon, or a spaced dash. */
const SEPARATOR = /\t|,|，|:|：|\s+[-–—]\s+/;

export type ParsedLine<T> = { row: T; lineNumber: number };
export type BadLine = { lineNumber: number; text: string };
export type BulkResult<T> = { rows: ParsedLine<T>[]; bad: BadLine[] };

function splitFields(line: string): string[] {
  return line
    .split(SEPARATOR)
    .map((f) => f.trim())
    .filter((f) => f !== "");
}

function eachLine(text: string): { lineNumber: number; text: string }[] {
  return text
    .split(/\r?\n/)
    .map((t, i) => ({ lineNumber: i + 1, text: t.trim() }))
    .filter((l) => l.text !== "");
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type CommitteeRow = {
  position: string;
  personName: string;
  /** As printed on the identity card / as filed with the Registrar. Never
   *  produced by translating personName — see the migration comment. */
  nameOfficial: string | null;
  termStart: string | null;
  termEnd: string | null;
};

/**
 * "Pengerusi, 陈大明" · "主席<TAB>陈大明<TAB>2026-01-01<TAB>2027-12-31"
 *
 * Position first, then name: that is the order the roster is written in, on
 * every society letterhead we have seen. A line with only one field cannot be
 * guessed at — a lone word could be either — so it goes to `bad`.
 */
export function parseCommitteePaste(text: string): BulkResult<CommitteeRow> {
  const rows: ParsedLine<CommitteeRow>[] = [];
  const bad: BadLine[] = [];

  for (const line of eachLine(text)) {
    const fields = splitFields(line.text);
    if (fields.length < 2) {
      bad.push(line);
      continue;
    }
    const [position, personName, ...rest] = fields;
    const dates = rest.filter((f) => ISO_DATE.test(f));
    const others = rest.filter((f) => !ISO_DATE.test(f));

    // A third field that is not a date is the name as it appears on the
    // identity card — the one eROSES wants. Anything BEYOND that we cannot
    // place, and guessing would file a phone number as a term date. Lists
    // written before this column existed still parse, because a date is still
    // recognised as a date wherever it sits.
    if (others.length > 1) {
      bad.push(line);
      continue;
    }
    rows.push({
      lineNumber: line.lineNumber,
      row: {
        position: position.slice(0, 120),
        personName: personName.slice(0, 120),
        nameOfficial: others[0] ? others[0].slice(0, 160) : null,
        termStart: dates[0] ?? null,
        termEnd: dates[1] ?? null,
      },
    });
  }
  return { rows, bad };
}

export type GlossaryRow = {
  term: string;
  action: "keep" | "translate";
  translation: string | null;
  note: string | null;
};

/** Words that mean "leave this one alone", in the three languages of the UI. */
const KEEP_WORDS = new Set([
  "keep",
  "kekal",
  "asal",
  "保持原字",
  "保持",
  "原字",
  "不翻译",
  "不翻譯",
]);

/**
 * "崇德" · "家长班 = Kelas Ibu Bapa" · "青班 → Kelas Qing" · "点传师, 保持原字"
 *
 * A bare word means "keep it exactly" — which is the safe default: leaving a
 * word alone can never turn it into a different word.
 */
export function parseGlossaryPaste(text: string): BulkResult<GlossaryRow> {
  const rows: ParsedLine<GlossaryRow>[] = [];
  const bad: BadLine[] = [];

  for (const line of eachLine(text)) {
    // A TAB means this came out of a spreadsheet, where an empty cell is a
    // POSITION and not an absence: "崇德<TAB><TAB>ajaran" says keep it and here
    // is a note, not translate it as "ajaran". Collapsing empties there read
    // the third column as the second and quietly rewrote the ruling.
    const tabbed = line.text.includes("\t");
    const fields = tabbed
      ? line.text.split("\t").map((f) => f.trim())
      : line.text
          .split(/=|→|=>|,|，|:|：/)
          .map((f) => f.trim())
          .filter((f) => f !== "");

    const term = (fields[0] ?? "").slice(0, 80);
    if (term === "") {
      bad.push(line);
      continue;
    }
    const written = (fields[1] ?? "").trim();
    const note = tabbed ? (fields[2] ?? "").trim() : "";
    const rest = tabbed ? written : fields.slice(1).join(" ").trim();

    if (rest === "" || KEEP_WORDS.has(rest.toLowerCase())) {
      rows.push({
        lineNumber: line.lineNumber,
        row: { term, action: "keep", translation: null, note: note === "" ? null : note.slice(0, 200) },
      });
    } else {
      rows.push({
        lineNumber: line.lineNumber,
        row: {
          term,
          action: "translate",
          translation: rest.slice(0, 160),
          note: note === "" ? null : note.slice(0, 200),
        },
      });
    }
  }
  return { rows, bad };
}

/** One short sentence naming the lines that were not imported. */
export function describeBadLines(bad: BadLine[]): string {
  return bad.map((b) => `${b.lineNumber}: ${b.text}`).join("\n");
}
