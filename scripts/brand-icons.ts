// ---------------------------------------------------------------------------
// BRAND ICONS — every copy of the mark, from J's own artwork.
//
// 🔴 THE SOURCE OF TRUTH IS scripts/assets/minit-logo.png. That is the logo J
// supplied and the one J means when he says "the MinitAI logo". Do not
// generate the mark from anything else, and do not redraw it.
//
// History, so this is not undone a third time. There used to be TWO drawings:
// this artwork (used for the favicon and the PWA icons) and a hand-made vector
// "redraw" of it (used inside the app), which was thinner and more saturated
// than the real thing. On 2026-08-28 J pointed out the browser tab did not
// match the app; the tab was right and the app was wrong, but the first fix
// went the wrong way and made everything use the redraw. J caught it
// immediately: 「MinitAI 的 LOGO 應該是這個，爲什麼你換了呢」. The redraw is
// deleted; the artwork is the only mark now.
//
// Produces — a logo swap is: replace the PNG, then `npm run icons`:
//   public/icon-512.png, public/icon-192.png   PWA icons (manifest); 192 is
//                                              also what <BrandLogo> shows in
//                                              the app — one picture, not a
//                                              second copy under another name
//   public/apple-touch-icon.png (180px)        iOS home screen
//   public/brand-logo-96.png                   small raster fallback
//   src/app/favicon.ico                        48+32+16, PNG-compressed
//
// The artwork is a tile painted onto a WHITE background, so the pipeline is:
// trim the white margin → square it → apply a rounded-rect alpha mask so the
// corners are transparent (white corners look broken on a dark browser tab).
// The 22% mask radius was matched to the artwork's own corner by eye and is
// verified by looking at the 512 output — change it only against that.
//
// ⚠️ iOS ignores transparency on the home screen and composites onto black,
// so apple-touch-icon is flattened onto the tile's own deep violet instead.
// ---------------------------------------------------------------------------
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "assets", "minit-logo.png");
const PUBLIC = join(here, "..", "public");
const RADIUS_RATIO = 0.22;
/** The gradient's deep end — the flat ground for iOS. */
const FLAT = "#7029E5";

/** The artwork, trimmed and squared, with transparent rounded corners. */
async function tileBuffer(): Promise<Buffer> {
  const trimmed = await sharp(SRC).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const edge = Math.min(meta.width ?? 0, meta.height ?? 0);
  // Square it — trim can be off by a pixel or two per side.
  const square = await sharp(trimmed).resize(edge, edge, { fit: "cover" }).png().toBuffer();
  const r = Math.round(edge * RADIUS_RATIO);
  const mask = Buffer.from(
    `<svg width="${edge}" height="${edge}"><rect x="0" y="0" width="${edge}" height="${edge}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
  return sharp(square).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
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
  const tile = await tileBuffer();
  const at = (size: number) =>
    sharp(tile).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

  for (const [size, file] of [
    [512, "icon-512.png"],
    [192, "icon-192.png"],
    [96, "brand-logo-96.png"],
  ] as const) {
    const buf = await at(size);
    writeFileSync(join(PUBLIC, file), buf);
    console.log(`OK public/${file} (${size}px, ${Math.round(buf.length / 1024)}KB)`);
  }

  const apple = await sharp(await at(180)).flatten({ background: FLAT }).png().toBuffer();
  writeFileSync(join(PUBLIC, "apple-touch-icon.png"), apple);
  console.log(`OK public/apple-touch-icon.png (180px, flattened on ${FLAT})`);

  const icoSizes = [48, 32, 16];
  const icoPngs: { size: number; buf: Buffer }[] = [];
  for (const size of icoSizes) icoPngs.push({ size, buf: await at(size) });
  writeFileSync(join(here, "..", "src", "app", "favicon.ico"), buildIco(icoPngs));
  console.log(`OK src/app/favicon.ico (${icoSizes.join("/")}px, PNG-compressed)`);
}

main().catch((e) => {
  console.error("brand-icons failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
