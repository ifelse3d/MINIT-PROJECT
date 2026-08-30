// ---------------------------------------------------------------------------
// READ THE QR BACK OUT OF A RECEIPT PDF (work order 87 ① — test/probe only).
//
// "The PDF has a QR" must be proved from the BYTES, not from trusting the
// drawing code: this module walks the PDF's content streams with a tiny
// interpreter (q/Q, cm, rg/g, m/l/h path building, f fill), collects every
// BLACK-filled axis-aligned rectangle — on a receipt those are exactly the
// QR modules; boxes and dividers are grey fills or strokes — and rebuilds
// the boolean module matrix from their geometry. Tests and probes then hand
// a rasterised copy to jsQR: if a real decoder cannot read what is actually
// in the file, the check fails, whatever the generator thought it drew.
//
// pdf-lib emits rectangles as translate-cm + moveTo/lineTo/closePath + f
// (verified against node_modules/pdf-lib/cjs/api/operations.js, 2026-08-30),
// so the interpreter tracks the CTM and takes each filled subpath's bbox.
// Content streams are uncompressed in pdf-lib output; FlateDecode is still
// handled in case that ever changes.
//
// 🔴 Not imported by app code — only by *.test.ts and scripts/probe-*.
// ---------------------------------------------------------------------------
import { inflateSync } from "node:zlib";

type Rect = { x: number; y: number; w: number; h: number };
type Matrix6 = [number, number, number, number, number, number];

const IDENTITY: Matrix6 = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix6, n: Matrix6): Matrix6 {
  // Applies m "after" the existing n (PDF cm semantics: new = m × current).
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function apply(m: Matrix6, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Every stream body in the file, inflated when marked FlateDecode. */
function contentStreams(bytes: Uint8Array): string[] {
  const latin = Buffer.from(bytes).toString("latin1");
  const out: string[] = [];
  const re = /stream\r?\n/g;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(latin)) !== null) {
    const start = hit.index + hit[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) continue;
    const raw = Buffer.from(latin.slice(start, end), "latin1");
    const dictStart = latin.lastIndexOf("<<", hit.index);
    const dict = dictStart >= 0 ? latin.slice(dictStart, hit.index) : "";
    // Font files, images and XML metadata are streams too — binary noise
    // that would tokenise into phantom operators. Skip anything that says
    // what it is; the printable-ratio check below catches the rest.
    if (/FontFile|Length1|Image|Metadata|ObjStm|XRef/.test(dict)) continue;
    let text: string;
    if (dict.includes("FlateDecode")) {
      try {
        text = inflateSync(raw).toString("latin1");
      } catch {
        continue; // not really deflate (or trimmed trailing EOL) — skip it
      }
    } else {
      text = raw.toString("latin1");
    }
    // A drawing stream is overwhelmingly printable ASCII; binary is not.
    let printable = 0;
    const sampleLen = Math.min(text.length, 2000);
    for (let k = 0; k < sampleLen; k += 1) {
      const code = text.charCodeAt(k);
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code < 127)) {
        printable += 1;
      }
    }
    if (sampleLen > 0 && printable / sampleLen > 0.95) out.push(text);
  }
  return out;
}

/** Tokenises a content stream, skipping (string) literals so an operator
 *  letter inside drawn text can never be misread as an operator. */
function tokens(stream: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < stream.length) {
    const ch = stream[i];
    if (ch === "(") {
      // skip the string literal, honouring \) escapes and nesting
      let depth = 1;
      i += 1;
      while (i < stream.length && depth > 0) {
        if (stream[i] === "\\") i += 1;
        else if (stream[i] === "(") depth += 1;
        else if (stream[i] === ")") depth -= 1;
        i += 1;
      }
      continue;
    }
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < stream.length && !/[\s()]/.test(stream[j])) j += 1;
    out.push(stream.slice(i, j));
    i = j;
  }
  return out;
}

/** All black-filled axis-aligned rectangles (page coordinates, pt). */
export function blackFilledRects(bytes: Uint8Array): Rect[] {
  const rects: Rect[] = [];
  for (const stream of contentStreams(bytes)) {
    const toks = tokens(stream);
    const stack: { ctm: Matrix6; black: boolean }[] = [];
    let ctm: Matrix6 = IDENTITY;
    let black = false;
    let operands: number[] = [];
    let path: [number, number][] = [];
    const flushPath = () => {
      if (path.length >= 3) {
        const xs = path.map((p) => p[0]);
        const ys = path.map((p) => p[1]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        rects.push({
          x,
          y,
          w: Math.max(...xs) - x,
          h: Math.max(...ys) - y,
        });
      }
      path = [];
    };
    for (const t of toks) {
      const num = Number(t);
      if (Number.isFinite(num) && /^[-+.\d]/.test(t)) {
        operands.push(num);
        continue;
      }
      switch (t) {
        case "q":
          stack.push({ ctm, black });
          break;
        case "Q": {
          const prev = stack.pop();
          if (prev) {
            ctm = prev.ctm;
            black = prev.black;
          }
          break;
        }
        case "cm":
          if (operands.length >= 6) {
            ctm = multiply(operands.slice(-6) as Matrix6, ctm);
          }
          break;
        case "rg":
          if (operands.length >= 3) {
            const [r, g, b] = operands.slice(-3);
            black = r === 0 && g === 0 && b === 0;
          }
          break;
        case "g":
          black = operands[operands.length - 1] === 0;
          break;
        case "m":
        case "l":
          if (operands.length >= 2) {
            const [x, y] = operands.slice(-2);
            path.push(apply(ctm, x, y));
          }
          break;
        case "re":
          if (operands.length >= 4) {
            const [x, y, w, h] = operands.slice(-4);
            path.push(apply(ctm, x, y), apply(ctm, x + w, y + h));
          }
          break;
        case "h":
          break; // closePath: bbox unaffected
        case "f":
        case "f*":
        case "b":
        case "b*":
        case "B":
        case "B*":
          if (black) flushPath();
          else path = [];
          break;
        case "n":
        case "S":
        case "s":
          path = [];
          break;
        default:
          break; // text/state ops — no path meaning
      }
      operands = [];
    }
  }
  return rects;
}

/**
 * Rebuilds the QR's boolean module matrix from the black rects, or null when
 * the geometry does not look like one QR grid (e.g. a pre-87 PDF with no QR).
 */
export function qrMatrixFromPdf(bytes: Uint8Array): boolean[][] | null {
  const rects = blackFilledRects(bytes);
  if (rects.length < 20) return null;
  const moduleSize = Math.min(...rects.map((r) => r.h));
  if (!(moduleSize > 0)) return null;
  const minX = Math.min(...rects.map((r) => r.x));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const count = Math.round((maxX - minX) / moduleSize);
  // A QR grid is square, at least version 1 (21 modules) and at most
  // version 40 (177) — anything else is not our QR, whatever it is.
  if (
    !Number.isFinite(count) ||
    count < 21 ||
    count > 177 ||
    Math.abs((maxY - minY) / moduleSize - count) > 0.5
  ) {
    return null;
  }
  const matrix: boolean[][] = Array.from({ length: count }, () =>
    Array.from({ length: count }, () => false),
  );
  for (const r of rects) {
    const row = Math.round((maxY - (r.y + r.h)) / moduleSize);
    const col0 = Math.round((r.x - minX) / moduleSize);
    const span = Math.round(r.w / moduleSize);
    if (row < 0 || row >= count) return null;
    for (let c = col0; c < col0 + span; c += 1) {
      if (c < 0 || c >= count) return null;
      matrix[row][c] = true;
    }
  }
  return matrix;
}
