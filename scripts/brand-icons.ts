// ---------------------------------------------------------------------------
// BRAND ICONS — every raster copy of the mark, from the ONE vector.
//
// 🔴 Replaces scripts/brand-icons.mjs (2026-08-28). That script rasterised
// scripts/assets/minit-logo.png — J's supplied artwork — while the app drew
// the vector redraw in src/lib/brand-mark.ts. The two are visibly different
// (the PNG's gradient is paler), so the browser tab never matched the logo in
// the sidebar. J: 「上面TAB那邊有問題，不是最新LOGO」. Now both come from
// brandMarkSvg(), and they cannot drift again.
//
// Produces, deterministically — a logo swap is one edit to brand-mark.ts plus
// `npm run icons`:
//   public/icon-512.png, public/icon-192.png   — PWA icons (manifest)
//   public/apple-touch-icon.png (180px)        — iOS home screen
//   public/brand-logo-96.png                   — raster fallback
//   src/app/favicon.ico                        — 48+32+16, PNG-compressed
//
// The tile's corners are transparent because the SVG's own rounded rect
// leaves them so — no trim step and no alpha mask, both of which the old
// script needed only because its source was a tile painted onto white.
//
// ⚠️ iOS ignores transparency on the home screen and composites onto black,
// which is why apple-touch-icon is flattened onto the tile's own end colour
// rather than shipped with transparent corners.
// ---------------------------------------------------------------------------
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { BRAND_MARK, brandMarkSvg } from "../src/lib/brand-mark";

const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(here, "..", "public");

/** Render the mark at one size. 1024 in the SVG then downscale: librsvg
 *  rasterises at the requested size, and going through a larger buffer keeps
 *  the round caps clean at 16px. */
async function markPng(size: number): Promise<Buffer> {
  const svg = Buffer.from(brandMarkSvg(1024));
  return sharp(svg).resize(size, size).png().toBuffer();
}

/** A valid .ico whose entries are PNG-compressed (supported everywhere that
 *  matters since Vista). sharp cannot write ICO; the container is trivial. */
function buildIco(pngs: { size: number; buf: Buffer }[]): Buffer {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * count;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

async function main() {
  for (const [size, file] of [
    [512, "icon-512.png"],
    [192, "icon-192.png"],
    [96, "brand-logo-96.png"],
  ] as const) {
    writeFileSync(join(PUBLIC, file), await markPng(size));
    console.log(`OK public/${file} (${size}px)`);
  }

  // iOS: flattened onto the gradient's darkest stop, never transparent.
  const flat = BRAND_MARK.gradient[BRAND_MARK.gradient.length - 1].color;
  const apple = await sharp(await markPng(180))
    .flatten({ background: flat })
    .png()
    .toBuffer();
  writeFileSync(join(PUBLIC, "apple-touch-icon.png"), apple);
  console.log(`OK public/apple-touch-icon.png (180px, flattened on ${flat})`);

  const icoSizes = [48, 32, 16];
  const icoPngs: { size: number; buf: Buffer }[] = [];
  for (const size of icoSizes) icoPngs.push({ size, buf: await markPng(size) });
  const icoPath = join(here, "..", "src", "app", "favicon.ico");
  writeFileSync(icoPath, buildIco(icoPngs));
  console.log(`OK src/app/favicon.ico (${icoSizes.join("/")}px, PNG-compressed)`);
}

main().catch((e) => {
  console.error("brand-icons failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
