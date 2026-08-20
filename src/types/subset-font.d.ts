declare module "subset-font" {
  /** Subsets a font buffer to the glyphs needed for `text` (HarfBuzz wasm). */
  export default function subsetFont(
    font: Buffer | Uint8Array,
    text: string,
    options?: { targetFormat?: "sfnt" | "woff" | "woff2" | "truetype" }
  ): Promise<Buffer>;
}
