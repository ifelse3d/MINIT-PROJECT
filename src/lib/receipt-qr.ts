// ---------------------------------------------------------------------------
// QR MATRIX for the receipt verify link (work order 87, ①).
//
// Encoding is qrcode-generator (Kazuhiko Arase's reference implementation —
// zero dependencies, MIT). We deliberately do NOT hand-roll Reed-Solomon for
// a legal document; the encoder's output is pinned by a unit test that runs
// a real DECODER (jsQR) over a rasterised matrix, so "it encodes" is proved,
// not assumed.
//
// Error correction level M (~15% damage recovery): the standard choice for
// print — a coffee stain on a paper receipt should not kill the code, and L
// would only save one QR version for our URL lengths.
//
// Pure functions, no I/O. The rasteriser exists for tests and probes (jsQR
// wants RGBA pixels); the PDF draws the boolean matrix directly.
// ---------------------------------------------------------------------------
import qrcode from "qrcode-generator";

/** true = dark module. Square matrix, no quiet zone (the caller adds it). */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, "M"); // typeNumber 0 = smallest version that fits
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c += 1) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

/**
 * Rasterise a matrix to greyscale RGBA (what jsQR consumes) with a quiet
 * zone. Test/probe helper — the app never rasterises; the PDF draws vectors.
 */
export function rasterizeQrMatrix(
  matrix: boolean[][],
  scale = 8,
  quietModules = 4,
): { data: Uint8ClampedArray; width: number; height: number } {
  const n = matrix.length;
  const size = (n + quietModules * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!matrix[r][c]) continue;
      const y0 = (r + quietModules) * scale;
      const x0 = (c + quietModules) * scale;
      for (let y = y0; y < y0 + scale; y += 1) {
        for (let x = x0; x < x0 + scale; x += 1) {
          const i = (y * size + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          // alpha stays 255 from the fill above
        }
      }
    }
  }
  return { data, width: size, height: size };
}
