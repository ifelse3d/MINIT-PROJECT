// ---------------------------------------------------------------------------
// A VERY SMALL MARKDOWN PARSER — for the legal documents, and nothing else.
//
// WHY NOT A LIBRARY (2026-08-22)
// /terms and /privacy have to show `legal/*.md` word for word: PDPA s.7 wants a
// written notice in Bahasa Malaysia AND English, and a lawyer will eventually
// edit those files. Pulling in a markdown renderer for two static pages means
// adding a dependency (and, for most of them, an HTML sanitiser as well) to
// display text WE wrote and control. CLAUDE.md's stack rule is deliberately
// short on dependencies, so this parses the handful of constructs those two
// files actually use and ignores the rest.
//
// It returns a BLOCK TREE, not HTML: no string of markup is ever produced, so
// there is nothing for dangerouslySetInnerHTML to render and no injection path.
// React renders the blocks (src/app/(legal)/legal-document.tsx).
//
// Supported, because the legal files use them:
//   # / ## / ###   headings
//   > quote        (used for the DRAFT banners — worth showing prominently)
//   - / * item     bullet lists
//   | a | b |      tables (the privacy notice has 36 table rows)
//   ---            horizontal rule
//   **bold**       inline, plus `code`
// Everything else is a paragraph. Unknown syntax degrades to its own text
// rather than disappearing — for a legal document, showing the raw characters
// is always better than silently dropping a clause.
// ---------------------------------------------------------------------------

/** Inline run: plain text, or text meant to stand out. */
export type Span =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "code"; text: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "quote"; lines: Span[][] }
  | { kind: "list"; items: Span[][] }
  | { kind: "table"; header: Span[][]; rows: Span[][][] }
  | { kind: "rule" };

/**
 * Split one line into bold / code / plain runs.
 *
 * Deliberately non-recursive: `**bold `code`**` is not a thing in these files,
 * and a nesting parser is where a hand-written one starts getting things wrong.
 */
export function parseInline(line: string): Span[] {
  const spans: Span[] = [];
  // Alternation order matters: ** before `, and both before plain text.
  const pattern = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(line)) !== null) {
    if (m.index > last) {
      spans.push({ kind: "text", text: line.slice(last, m.index) });
    }
    if (m[1] !== undefined) spans.push({ kind: "strong", text: m[1] });
    else if (m[2] !== undefined) spans.push({ kind: "code", text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < line.length) spans.push({ kind: "text", text: line.slice(last) });
  return spans.length ? spans : [{ kind: "text", text: "" }];
}

function tableCells(line: string): Span[][] {
  // "| a | b |" -> ["a", "b"]. A trailing/leading pipe is optional in the wild;
  // dropping empty ends handles both shapes.
  const raw = line.split("|");
  if (raw[0]?.trim() === "") raw.shift();
  if (raw[raw.length - 1]?.trim() === "") raw.pop();
  return raw.map((cell) => parseInline(cell.trim()));
}

/** True for the "|---|---|" line under a table header. */
function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line);
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      continue;
    }

    // --- rule ---------------------------------------------------------------
    if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ kind: "rule" });
      continue;
    }

    // --- heading ------------------------------------------------------------
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({
        kind: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        spans: parseInline(heading[2]!),
      });
      continue;
    }

    // --- table --------------------------------------------------------------
    // A header row is only a table if the NEXT line is the |---| divider;
    // otherwise it is an ordinary sentence that happens to contain a pipe.
    if (trimmed.includes("|") && isTableDivider(lines[i + 1]?.trim() ?? "")) {
      flushParagraph();
      const header = tableCells(trimmed);
      const rows: Span[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().includes("|")) {
        rows.push(tableCells(lines[i]!.trim()));
        i++;
      }
      i--; // the loop's own i++ will step past the line that ended the table
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // --- quote --------------------------------------------------------------
    if (trimmed.startsWith(">")) {
      flushParagraph();
      const quoted: Span[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith(">")) {
        quoted.push(parseInline(lines[i]!.trim().replace(/^>\s?/, "")));
        i++;
      }
      i--;
      blocks.push({ kind: "quote", lines: quoted });
      continue;
    }

    // --- list ---------------------------------------------------------------
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      const items: Span[][] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!.trim())) {
        items.push(parseInline(lines[i]!.trim().replace(/^[-*]\s+/, "")));
        i++;
      }
      i--;
      blocks.push({ kind: "list", items });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks;
}
