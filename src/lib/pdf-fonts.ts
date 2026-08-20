import fs from "node:fs";
import path from "node:path";
import subsetFont from "subset-font";

// ---------------------------------------------------------------------------
// Shared CJK font support for all server-generated PDFs (receipts, AGM pack).
// Latin text uses the built-in Helvetica fonts. Any string containing
// non-WinAnsi characters is drawn with Noto Sans SC, pre-subsetted per
// document with subset-font (HarfBuzz wasm) because pdf-lib's own subsetter
// is broken for this font (glyphs go missing — verified 10 Jul 2026).
// If anything fails we fall back to "?" substitution — never crash.
// ---------------------------------------------------------------------------

/** Replaces characters the PDF standard fonts cannot encode (non-WinAnsi) with "?". */
export function winAnsiSafe(s: string): string {
  return [...s]
    .map((ch) => {
      const c = ch.codePointAt(0) as number;
      if (c >= 0x20 && c <= 0x7e) return ch;
      if (c >= 0xa0 && c <= 0xff) return ch;
      if ("‘’“”–—…•".includes(ch)) return ch;
      return "?";
    })
    .join("");
}

/** True when the string contains characters Helvetica cannot encode. */
export function needsCjkFont(s: string): boolean {
  return winAnsiSafe(s) !== s;
}

// Full font bytes are read once per process, not once per document.
let notoBytesCache: Uint8Array | null | undefined;
function loadNotoBytes(): Uint8Array | null {
  if (notoBytesCache !== undefined) return notoBytesCache;
  try {
    notoBytesCache = new Uint8Array(
      fs.readFileSync(
        path.join(process.cwd(), "src", "assets", "fonts", "NotoSansSC-Regular.ttf")
      )
    );
  } catch {
    notoBytesCache = null;
  }
  return notoBytesCache;
}

const ASCII =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

/**
 * Returns a tiny per-document font containing exactly the characters in
 * `text` (plus ASCII so mixed strings render), or null when unavailable.
 */
export async function subsetNotoFor(text: string): Promise<Uint8Array | null> {
  const big = loadNotoBytes();
  if (!big) return null;
  const chars = [...new Set([...(text + ASCII)])].join("");
  try {
    const sub = await subsetFont(Buffer.from(big), chars, { targetFormat: "truetype" });
    return new Uint8Array(sub);
  } catch {
    return null;
  }
}
