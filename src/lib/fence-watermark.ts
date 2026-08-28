// ---------------------------------------------------------------------------
// FREE-PLAN WATERMARK (D44, 2026-08-28) — re-opens an already-generated PDF
// and stamps every page. This is the "看得到、拿不走" half of the fence: a
// fenced org may VIEW and PRINT any document for free, but what it sees
// carries this stamp; the clean file only leaves through a counted download.
//
// Deliberately a separate pass over finished bytes (not a flag inside each
// builder): five builders would need five flags, and the first forgotten one
// would hand a fenced org a clean legal document. One stamper, applied at the
// route door where the fence decision is made.
//
// FAILS CLOSED. If stamping breaks, the route returns an error — it must
// never fall back to sending the clean bytes to a fenced org.
// ---------------------------------------------------------------------------
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { subsetNotoFor, winAnsiSafe } from "@/lib/pdf-fonts";

const STAMP = "PERCUBAAN · 免費版 · FREE PLAN";
const FOOT =
  "Pelan percuma MinitAI — pratonton bertera air / 免費版預覽 — 乾淨版請用「乾淨下載」 / watermarked preview";

const stampRed = rgb(0.45, 0.16, 0.9); // brand-purple family, unmistakably a stamp

export async function stampFenceWatermark(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, {
    updateMetadata: false,
    ignoreEncryption: true,
  });

  // One subset font for both strings when CJK is available; Helvetica with
  // "?" substitution otherwise (never crash over a font file).
  let font: PDFFont;
  let stampText = STAMP;
  let footText = FOOT;
  const sub = await subsetNotoFor(STAMP + FOOT);
  if (sub) {
    doc.registerFontkit(fontkit);
    font = await doc.embedFont(sub, { subset: false });
  } else {
    font = await doc.embedFont(StandardFonts.HelveticaBold);
    stampText = winAnsiSafe(STAMP);
    footText = winAnsiSafe(FOOT);
  }

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    // Size the diagonal stamp to the page, not to a constant: fit ~72% of the
    // diagonal, clamped so tiny receipts and huge posters both stay legible.
    const diagonal = Math.hypot(width, height);
    const at100 = font.widthOfTextAtSize(stampText, 100);
    const fit = at100 > 0 ? ((diagonal * 0.72) / at100) * 100 : 32;
    const size = Math.min(Math.max(fit, 16), 64);
    const angle = (Math.atan2(height, width) * 180) / Math.PI;

    // Two passes so a long document cannot show a clean screenful.
    page.drawText(stampText, {
      x: width * 0.08,
      y: height * 0.18,
      size,
      font,
      color: stampRed,
      rotate: degrees(angle),
      opacity: 0.16,
    });
    page.drawText(stampText, {
      x: width * 0.3,
      y: height * 0.06,
      size: size * 0.6,
      font,
      color: stampRed,
      rotate: degrees(angle),
      opacity: 0.12,
    });

    // A fully-opaque footer line: the diagonal mark can be cropped away; a
    // printed page should still say on its face which plan produced it.
    const footSize = 7.5;
    const footWidth = font.widthOfTextAtSize(footText, footSize);
    page.drawText(footText, {
      x: Math.max((width - footWidth) / 2, 12),
      y: 6,
      size: footSize,
      font,
      color: stampRed,
      opacity: 0.75,
    });
  }

  return await doc.save();
}
