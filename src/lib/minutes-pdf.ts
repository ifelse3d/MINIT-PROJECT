import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { needsCjkFont, subsetNotoFor, winAnsiSafe } from "@/lib/pdf-fonts";
import { PDF_PRODUCER } from "@/lib/brand";

// ---------------------------------------------------------------------------
// A SAVED MINUTES DOCUMENT AS AN A4 PDF (J review 2026-08-28, item 4:
// 「保存后哪里 PRINT?」).
//
// One PDF, two jobs:
//   * printing — History finally has a Print button;
//   * eROSES — "Muat Naik Minit Mesyuarat" on the portal's meeting form takes
//     a PDF (<25MB); this is that file (J's own eROSES screenshots, 28/8).
//
// The CONTENT is minutes_docs.final_md exactly as confirmed (and possibly
// later edited, with its in-document edit line) — this file does LAYOUT ONLY.
// Same stack and CJK strategy as financial-statement-pdf.ts: pdf-lib +
// per-document Noto subset, degrade to "?" rather than fail.
// ---------------------------------------------------------------------------

export type MinutesPdfLine =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  /** G2: a full-line `**bold**` — the formal meeting-title line under the
   *  letterhead ("MESYUARAT AGUNG TAHUNAN 2026"). Centred, bold, no `**`. */
  | { kind: "strong"; text: string }
  | { kind: "rule" }
  | { kind: "blank" }
  /**
   * §4-⑤ (work order 100, 真件 B): a run of "Label: value" particulars lines
   * (Nama / No. Kad Pengenalan / Alamat / Pekerjaan — or the TARIKH/MASA
   * header block) prints as an ALIGNED two-column block, the way the typeset
   * original looks, instead of ragged prose. Only RUNS of two or more
   * consecutive matching lines qualify — a lone sentence with a colon in it
   * stays prose.
   */
  | { kind: "kv"; label: string; value: string }
  | { kind: "body"; text: string };

/**
 * "Label: value" where the label is short, starts with a letter (an
 * enumerated line like "2.1 Perbincangan: …" must stay prose), and holds no
 * second colon. Both ASCII and fullwidth colons count — the documents mix.
 */
const KV_LINE = /^([A-Za-z一-鿿][^:：]{0,27}?)\s*[:：]\s*(\S.*)$/;

/**
 * The saved Markdown, read as PRINT LINES. Deliberately tiny: the documents
 * are produced by our own composer (minutes-compose.ts / the person's edits),
 * which only ever uses `#`, `##`, `---`, list dashes and plain lines — a full
 * Markdown parser would be surface area for nothing. Pure and unit-tested.
 */
export function minutesPdfLines(finalMd: string): MinutesPdfLine[] {
  const out: MinutesPdfLine[] = [];
  for (const raw of finalMd.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (trimmed === "") {
      out.push({ kind: "blank" });
    } else if (/^---+$/.test(trimmed)) {
      out.push({ kind: "rule" });
    } else if (trimmed.startsWith("# ")) {
      out.push({ kind: "h1", text: trimmed.slice(2).trim() });
    } else if (trimmed.startsWith("## ")) {
      out.push({ kind: "h2", text: trimmed.slice(3).trim() });
    } else if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      out.push({ kind: "strong", text: trimmed.slice(2, -2).trim() });
    } else {
      out.push({ kind: "body", text: line.trimStart() });
    }
  }
  // Trailing blanks only add empty paper.
  while (out.length > 0 && out[out.length - 1].kind === "blank") out.pop();

  // §4-⑤: promote RUNS (≥2 consecutive) of "Label: value" body lines to kv,
  // so the particulars blocks print aligned. Done as a second pass so the
  // run rule is easy to see and to test.
  for (let i = 0; i < out.length; ) {
    const m = out[i].kind === "body" ? KV_LINE.exec((out[i] as { text: string }).text) : null;
    if (!m) {
      i++;
      continue;
    }
    let end = i + 1;
    while (
      end < out.length &&
      out[end].kind === "body" &&
      KV_LINE.test((out[end] as { text: string }).text)
    ) {
      end++;
    }
    if (end - i >= 2) {
      for (let j = i; j < end; j++) {
        const mm = KV_LINE.exec((out[j] as { text: string }).text)!;
        out[j] = { kind: "kv", label: mm[1].trim(), value: mm[2].trim() };
      }
    }
    i = end;
  }
  return out;
}

export type MinutesPdfParams = {
  /** The confirmed (possibly later edited) document, as stored. */
  finalMd: string;
  /** The society's own name for the document — the PDF's metadata title and
   *  printed under the letterhead when present. */
  title?: string | null;
};

export async function buildMinutesPdf(params: MinutesPdfParams): Promise<Uint8Array> {
  const lines = minutesPdfLines(params.finalMd);
  const doc = await PDFDocument.create();
  doc.setTitle((params.title ?? "").trim() || "Minit Mesyuarat");
  doc.setProducer(PDF_PRODUCER);

  const allText = [params.title ?? "", params.finalMd].join(" ");
  let noto: PDFFont | null = null;
  if (winAnsiSafe(allText) !== allText) {
    const subBytes = await subsetNotoFor(allText);
    if (subBytes) {
      doc.registerFontkit(fontkit);
      noto = await doc.embedFont(subBytes, { subset: false });
    }
  }

  const pageW = 595.28;
  const pageH = 841.89;
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const helvBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.09, 0.12);
  const grey = rgb(0.42, 0.44, 0.5);
  const margin = 56;
  const width = pageW - margin * 2;

  let page: PDFPage = doc.addPage([pageW, pageH]);
  let y = pageH - margin - 10;

  const pick = (str: string, wantBold: boolean): { font: PDFFont; text: string } => {
    if (needsCjkFont(str) && noto) return { font: noto, text: str };
    return { font: wantBold ? helvBold : helv, text: winAnsiSafe(str) };
  };
  const widthOf = (str: string, size: number, wantBold = false): number => {
    const { font, text } = pick(str, wantBold);
    return font.widthOfTextAtSize(text, size);
  };
  const drawAt = (
    str: string,
    x: number,
    yy: number,
    size: number,
    opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const { font, text } = pick(str, opts.bold ?? false);
    page.drawText(text, { x, y: yy, size, font, color: opts.color ?? ink });
  };

  const ensureRoom = (need: number) => {
    if (y - need < margin) {
      page = doc.addPage([pageW, pageH]);
      y = pageH - margin - 10;
    }
  };

  /**
   * Greedy wrap that survives Chinese: prefer breaking at spaces, but a run
   * with no space that overflows (normal for zh prose) breaks between
   * characters. Width is measured with the exact font that will draw it.
   */
  const wrap = (str: string, size: number, bold: boolean, maxW: number): string[] => {
    if (widthOf(str, size, bold) <= maxW) return [str];
    const outLines: string[] = [];
    let line = "";
    // Tokens: space-separated words, but CJK-containing tokens split to chars
    // so they can break anywhere, the way the language itself breaks.
    const tokens: string[] = [];
    for (const word of str.split(/(\s+)/)) {
      if (needsCjkFont(word)) tokens.push(...[...word]);
      else if (word !== "") tokens.push(word);
    }
    for (const tk of tokens) {
      const candidate = line + tk;
      if (line !== "" && widthOf(candidate, size, bold) > maxW) {
        outLines.push(line.trimEnd());
        line = tk.trimStart() === "" ? "" : tk;
      } else {
        line = candidate;
      }
    }
    if (line.trim() !== "") outLines.push(line.trimEnd());
    return outLines.length > 0 ? outLines : [str];
  };

  const subtitle = (params.title ?? "").trim();
  let firstH1Seen = false;

  /** §4-⑤: the label-column width of the kv RUN starting at index i. */
  const kvRunLabelWidth = (start: number): number => {
    let w = 0;
    for (let j = start; j < lines.length && lines[j].kind === "kv"; j++) {
      const kv = lines[j] as { label: string };
      w = Math.max(w, widthOf(kv.label, 11));
    }
    return w;
  };
  let kvLabelW = 0;

  for (let li = 0; li < lines.length; li++) {
    const item = lines[li];
    switch (item.kind) {
      case "blank": {
        y -= 8;
        break;
      }
      case "rule": {
        ensureRoom(18);
        page.drawLine({
          start: { x: margin, y: y + 4 },
          end: { x: pageW - margin, y: y + 4 },
          thickness: 0.7,
          color: grey,
        });
        y -= 14;
        break;
      }
      case "h1": {
        for (const l of wrap(item.text, 16, true, width)) {
          ensureRoom(26);
          drawAt(l, (pageW - widthOf(l, 16, true)) / 2, y, 16, { bold: true });
          y -= 22;
        }
        // The society's own name for the document rides under the letterhead
        // once — where a reader (or the Registrar's clerk) looks first.
        if (!firstH1Seen && subtitle !== "") {
          for (const l of wrap(subtitle, 11.5, false, width)) {
            ensureRoom(20);
            drawAt(l, (pageW - widthOf(l, 11.5)) / 2, y, 11.5, { color: grey });
            y -= 16;
          }
        }
        firstH1Seen = true;
        y -= 4;
        break;
      }
      case "h2": {
        y -= 6;
        for (const l of wrap(item.text, 12.5, true, width)) {
          ensureRoom(24);
          drawAt(l, margin, y, 12.5, { bold: true });
          y -= 18;
        }
        y -= 2;
        break;
      }
      case "strong": {
        // The meeting-title line — centred under the letterhead, like the
        // printed documents societies actually file.
        for (const l of wrap(item.text, 12.5, true, width)) {
          ensureRoom(22);
          drawAt(l, (pageW - widthOf(l, 12.5, true)) / 2, y, 12.5, { bold: true });
          y -= 18;
        }
        break;
      }
      case "body": {
        // J 28/8 evening item 3 (「签名部分太窄」): a line that IS only
        // underscores is a signature slot — draw it as a real rule, wide
        // enough to sign on, with room above for the hand. This also fixes
        // every already-saved document, whose stored text still carries the
        // old 20-underscore line.
        if (/^_{8,}$/.test(item.text.trim())) {
          ensureRoom(40);
          y -= 22; // space for the signature itself
          page.drawLine({
            start: { x: margin, y: y + 4 },
            end: { x: margin + Math.min(280, width), y: y + 4 },
            thickness: 0.9,
            color: ink,
          });
          y -= 16;
          break;
        }
        for (const l of wrap(item.text, 11, false, width)) {
          ensureRoom(18);
          drawAt(l, margin, y, 11);
          y -= 16;
        }
        break;
      }
      case "kv": {
        // §4-⑤ (真件 B): particulars print as an aligned two-column block.
        // Column width is the RUN's widest label, measured with the fonts
        // that will draw it; the value wraps in the remaining width, with
        // continuation lines indented under the value column.
        if (li === 0 || lines[li - 1].kind !== "kv") kvLabelW = kvRunLabelWidth(li);
        const valueX = margin + 18 + kvLabelW + 14;
        const valueW = pageW - margin - valueX;
        const valueLines = wrap(item.value, 11, false, Math.max(80, valueW));
        ensureRoom(18);
        drawAt(item.label, margin + 18, y, 11);
        drawAt(":", margin + 18 + kvLabelW + 5, y, 11);
        drawAt(valueLines[0] ?? "", valueX, y, 11);
        y -= 16;
        for (const l of valueLines.slice(1)) {
          ensureRoom(18);
          drawAt(l, valueX, y, 11);
          y -= 16;
        }
        break;
      }
    }
  }

  return doc.save();
}
