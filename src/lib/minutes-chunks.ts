// ---------------------------------------------------------------------------
// SPLITTING A MINUTES DOCUMENT INTO SEARCHABLE PIECES — pure, no I/O, tested.
//
// 2026-08-20, J: the assistant has to answer "我記得有一次開會說了什麼，你幫我
// 找出來". docs/助手重做-设计.md §3 settled how: embeddings in pgvector, not
// ILIKE (needs the exact characters) and not Postgres full-text (does not
// segment Chinese).
//
// 🔴 WHY CHUNKS AND NOT ONE VECTOR PER DOCUMENT.
// A set of minutes recording twelve resolutions, squeezed into one 768-number
// vector, is twelve things averaged into one point — and "I remember one
// meeting where we said something" is precisely the question that loses most
// from that averaging. It also makes the citation useless: the answer can only
// point at a whole document, so the person still has to read it all. One vector
// per SECTION means the hit is the section, and the quote is the section.
// (This is the same reasoning the migration's own header gives for making
// minutes_embeddings a table rather than a column on minutes_docs.)
//
// HOW IT SPLITS: on Markdown headings first, because a minutes document is
// already divided the way the meeting was — "Kehadiran", "Ucapan Pengerusi",
// "Keputusan". Those boundaries are meaningful, so they are kept. A section too
// long to embed well is then split on blank lines, and only a paragraph that is
// STILL too long gets cut mid-text.
//
// Sizes are in CHARACTERS, not tokens, on purpose: the documents are mixed
// Malay/Chinese/English, and a token count that is right for one is wrong for
// the others. Characters are the honest common unit, and the limits below are
// set low enough that the worst case (all Chinese, ~1 token per character)
// still fits comfortably in every embedding model's window.
// ---------------------------------------------------------------------------

/** Aim for this much text per chunk. */
export const TARGET_CHARS = 900;

/** Never emit a chunk longer than this. */
export const MAX_CHARS = 1400;

/** Below this, a chunk is merged into its neighbour instead of standing alone.
 *  A heading with two words under it is not a searchable idea; attached to the
 *  section that follows, it is context. */
export const MIN_CHARS = 120;

export type MinutesChunk = {
  /** 0-based, and the value stored in minutes_embeddings.chunk_index. */
  index: number;
  text: string;
};

/**
 * Split a confirmed minutes document into chunks ready to embed.
 *
 * Returns [] for an empty or whitespace-only document — a document with no text
 * is not an error, it is a document with nothing to find.
 */
export function chunkMinutes(markdown: string): MinutesChunk[] {
  const clean = markdown.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const merged = mergeSmall(splitLongSections(splitOnHeadings(clean)));
  return merged.map((text, index) => ({ index, text }));
}

/** Split at Markdown headings, keeping each heading with the text under it. */
function splitOnHeadings(text: string): string[] {
  const lines = text.split("\n");
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    // A heading starts a new section — but only if we have collected something,
    // so a document that opens with a heading does not begin with a blank one.
    if (/^#{1,6}\s+\S/.test(line) && current.join("\n").trim() !== "") {
      sections.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  const last = current.join("\n").trim();
  if (last) sections.push(last);
  return sections.length > 0 ? sections : [text];
}

/** Any section over MAX_CHARS is broken down: paragraphs first, hard cut last. */
function splitLongSections(sections: string[]): string[] {
  const out: string[] = [];
  for (const section of sections) {
    if (section.length <= MAX_CHARS) {
      out.push(section);
      continue;
    }
    let buffer = "";
    for (const para of section.split(/\n\s*\n/)) {
      const piece = para.trim();
      if (!piece) continue;
      if (piece.length > MAX_CHARS) {
        // A single paragraph longer than the ceiling: flush what we have, then
        // cut this one into ceiling-sized pieces. Rare (a wall-of-text
        // resolution), and a hard cut is better than dropping it.
        if (buffer) {
          out.push(buffer);
          buffer = "";
        }
        for (let i = 0; i < piece.length; i += MAX_CHARS) {
          out.push(piece.slice(i, i + MAX_CHARS));
        }
        continue;
      }
      const candidate = buffer ? `${buffer}\n\n${piece}` : piece;
      if (candidate.length > TARGET_CHARS && buffer) {
        out.push(buffer);
        buffer = piece;
      } else {
        buffer = candidate;
      }
    }
    if (buffer) out.push(buffer);
  }
  return out;
}

/** Fold a too-short chunk into the next one (or the previous, at the end). */
function mergeSmall(chunks: string[]): string[] {
  const out: string[] = [];
  let held = "";

  for (const chunk of chunks) {
    const candidate = held ? `${held}\n\n${chunk}` : chunk;
    if (candidate.length < MIN_CHARS) {
      held = candidate;
      continue;
    }
    // Merging would blow the ceiling: emit the small one on its own rather
    // than produce a chunk no embedding model handles well.
    if (held && candidate.length > MAX_CHARS) {
      out.push(held);
      held = "";
      out.push(chunk);
      continue;
    }
    out.push(candidate);
    held = "";
  }

  if (held) {
    if (out.length > 0 && out[out.length - 1].length + held.length <= MAX_CHARS) {
      out[out.length - 1] = `${out[out.length - 1]}\n\n${held}`;
    } else {
      out.push(held);
    }
  }
  return out;
}

/**
 * A stable fingerprint of the text a chunk was embedded from.
 *
 * Stored in minutes_embeddings.source_hash so a later run can tell which rows
 * are stale after someone edited a document, and re-embed only those instead of
 * the whole corpus. Deliberately NOT a cryptographic hash: this guards against
 * accidental staleness, not an attacker, and it must run identically in Node
 * and in the browser without importing anything.
 */
export function chunkHash(text: string): string {
  // FNV-1a, 32-bit, printed as hex. Cheap, dependency-free, and collisions
  // would at worst mean one chunk is not re-embedded when it should be.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
