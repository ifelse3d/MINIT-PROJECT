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

/** A field that can only be an email address — the @ gives it away. */
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The 13 states + 3 federal territories, in the spellings people type.
 *  Used ONLY to recognise a field as the Negeri column in a headerless
 *  paste — the stored value is whatever the person wrote. */
const STATE_WORDS = [
  "johor",
  "kedah",
  "kelantan",
  "melaka",
  "malacca",
  "negeri sembilan",
  "pahang",
  "perak",
  "perlis",
  "pulau pinang",
  "penang",
  "sabah",
  "sarawak",
  "selangor",
  "terengganu",
  "kuala lumpur",
  "labuan",
  "putrajaya",
];
function looksLikeState(field: string): boolean {
  const f = field.toLowerCase().replace(/^w\.?p\.?\s*/, "").trim();
  return STATE_WORDS.some((s) => f === s || f === s + " darul ehsan");
}

export type CommitteeRow = {
  position: string;
  personName: string;
  /** As printed on the identity card / as filed with the Registrar. Never
   *  produced by translating personName — see the migration comment. */
  nameOfficial: string | null;
  termStart: string | null;
  termEnd: string | null;
  /** H1 (work order 69): the rest of what the eROSES AJK step asks. All
   *  optional; null when the line (or the template column) left them out. */
  honorific: string | null;
  note: string | null;
  email: string | null;
  state: string | null;
};

type CommitteeField = keyof CommitteeRow;

/** Which committee column a template header cell names. Checked in order —
 *  "Nama seperti dalam IC" contains both "nama" and "IC", so IC wins first. */
const HEADER_RULES: [RegExp, CommitteeField][] = [
  [/ic\b|kad pengenalan|身份证/i, "nameOfficial"],
  [/gelaran|称呼|职衔|title/i, "honorific"],
  [/e-?mel|e-?mail|电邮/i, "email"],
  [/negeri|州|state/i, "state"],
  [/nota|备注|note/i, "note"],
  [/tamat|end/i, "termEnd"],
  [/tarikh|日期|appoint|mula|date/i, "termStart"],
  [/jawatan|职位|position/i, "position"],
  [/nama|姓名|name/i, "personName"],
];

/** Our own template's header line, if that is what this line is. */
function committeeHeaderMap(line: string): (CommitteeField | null)[] | null {
  if (!/jawatan|职位|position/i.test(line)) return null;
  const sep = line.includes("\t") ? "\t" : ",";
  const cells = line.split(sep).map((c) => c.trim());
  const map = cells.map(
    (cell) => HEADER_RULES.find(([re]) => re.test(cell))?.[1] ?? null,
  );
  // A header is only trusted when it names the two required columns —
  // otherwise this is somebody's data line that happens to say "AJK position".
  if (!map.includes("position") || !map.includes("personName")) return null;
  return map;
}

const LIMITS: Record<CommitteeField, number> = {
  position: 120,
  personName: 120,
  nameOfficial: 160,
  termStart: 10,
  termEnd: 10,
  honorific: 60,
  note: 120,
  email: 160,
  state: 60,
};

function emptyRow(): CommitteeRow {
  return {
    position: "",
    personName: "",
    nameOfficial: null,
    termStart: null,
    termEnd: null,
    honorific: null,
    note: null,
    email: null,
    state: null,
  };
}

/**
 * "Pengerusi, 陈大明" · "主席<TAB>陈大明<TAB>2026-01-01" · the filled-in
 * Excel template, header row and all.
 *
 * Two roads (H1, work order 69):
 *   * The first line IS our template header → every later cell is placed by
 *     ITS COLUMN, empties preserved. That is how Gelaran/Email/Negeri/Nota
 *     travel without guessing.
 *   * No header → the old heuristics: position first, then name; a date is a
 *     date wherever it sits; an @ makes a field the email; a field spelling a
 *     Malaysian state is the Negeri. ONE leftover field is the IC name; more
 *     than one cannot be placed and the line is refused, never guessed at.
 */
export function parseCommitteePaste(text: string): BulkResult<CommitteeRow> {
  const rows: ParsedLine<CommitteeRow>[] = [];
  const bad: BadLine[] = [];

  const lines = eachLine(text);
  const headerMap = lines.length > 0 ? committeeHeaderMap(lines[0].text) : null;
  const dataLines = headerMap ? lines.slice(1) : lines;
  const headerSep = headerMap && lines[0].text.includes("\t") ? "\t" : ",";

  for (const line of dataLines) {
    if (headerMap) {
      // Positional: an empty cell is a POSITION, not an absence (the same
      // lesson parseGlossaryPaste learned about spreadsheet tabs). A column
      // whose header we cannot name is refused line-by-line the moment it
      // holds data — never guessed into the wrong field, never dropped.
      const cells = line.text.split(headerSep).map((c) => c.trim());
      const row = emptyRow();
      let refuse = false;
      cells.forEach((cell, i) => {
        if (cell === "") return;
        const field = i < headerMap.length ? headerMap[i] : null;
        if (!field) {
          refuse = true;
          return;
        }
        // The template's date column must stay unambiguous: "1/1/2026" reads
        // as two different dates depending on who is reading, so anything
        // that is not YYYY-MM-DD is refused rather than filed.
        if ((field === "termStart" || field === "termEnd") && !ISO_DATE.test(cell)) {
          refuse = true;
          return;
        }
        row[field] = cell.slice(0, LIMITS[field]);
      });
      if (refuse || row.position === "" || row.personName === "") {
        bad.push(line);
        continue;
      }
      rows.push({ lineNumber: line.lineNumber, row });
      continue;
    }

    const fields = splitFields(line.text);
    if (fields.length < 2) {
      bad.push(line);
      continue;
    }
    const [position, personName, ...rest] = fields;
    const dates = rest.filter((f) => ISO_DATE.test(f));
    const emails = rest.filter((f) => !ISO_DATE.test(f) && EMAIL_LIKE.test(f));
    const states = rest.filter(
      (f) => !ISO_DATE.test(f) && !EMAIL_LIKE.test(f) && looksLikeState(f),
    );
    const others = rest.filter(
      (f) => !ISO_DATE.test(f) && !EMAIL_LIKE.test(f) && !looksLikeState(f),
    );

    // ONE leftover field is the name as it appears on the identity card — the
    // one eROSES wants. Anything beyond that we cannot place, and guessing
    // would file a phone number as a term date.
    if (others.length > 1 || emails.length > 1 || states.length > 1) {
      bad.push(line);
      continue;
    }
    rows.push({
      lineNumber: line.lineNumber,
      row: {
        ...emptyRow(),
        position: position.slice(0, 120),
        personName: personName.slice(0, 120),
        nameOfficial: others[0] ? others[0].slice(0, 160) : null,
        termStart: dates[0] ?? null,
        termEnd: dates[1] ?? null,
        email: emails[0] ? emails[0].slice(0, 160) : null,
        state: states[0] ? states[0].slice(0, 60) : null,
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

  // Our own template's header row, when the whole sheet was uploaded. The
  // parsers consume their own headers (H1, work order 69) — xlsxToPasteText
  // passes everything through so the committee parser can read ITS header
  // as a column map.
  const all = eachLine(text);
  const lines =
    all.length > 0 && /perkataan|那个词|the word/i.test(all[0].text)
      ? all.slice(1)
      : all;

  for (const line of lines) {
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
