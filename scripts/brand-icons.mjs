// ---------------------------------------------------------------------------
// BRAND ICONS from the green "two people = M" logo (拍板 0-8, work order 32 P1).
//
// Source: scripts/assets/minit-logo.png (J's asset from the avocado pack —
// a green rounded-square tile with a white margin around it).
//
// What this produces, deterministically, so a future logo swap is ONE command
// (`node scripts/brand-icons.mjs`):
//   public/icon-192.png, public/icon-512.png   — PWA icons (manifest)
//   public/brand-logo-96.png                   — the sidebar / login tile
//   src/app/favicon.ico                        — 48+32+16 PNG-compressed ICO
//
// Steps: trim the white margin → apply a rounded-rect alpha mask so the
// corners are TRANSPARENT (the tile's own corners are painted on white in the
// source; white corners look broken on a dark browser tab) → resize.
// The mask radius (22% of the edge) was eyeballed against the source tile and
// verified visually on the 512 output.
// ---------------------------------------------------------------------------
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "assets", "minit-logo.png");
const PUBLIC = join(here, "..", "public");
const RADIUS_RATIO = 0.22;

async function tileBuffer() {
  // Trim the white margin down to the green tile itself.
  const trimmed = await sharp(SRC).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const edge = Math.min(meta.width, meta.height);
  // Square it (trim can be off by a pixel or two per side).
  const square = await sharp(trimmed)
    .resize(edge, edge, { fit: "cover" })
    .png()
    .toBuffer();
  // Rounded-rect mask → transparent corners.
  const r = Math.round(edge * RADIUS_RATIO);
  const mask = Buffer.from(
    `<svg width="${edge}" height="${edge}"><rect x="0" y="0" width="${edge}" height="${edge}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
  return sharp(square)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** A valid .ico whose entries are PNG-compressed (supported everywhere that
 *  matters since Vista). sharp cannot write ICO; the container is trivial. */
function buildIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = [];
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

const tile = await tileBuffer();
const out = async (size, file) => {
  await sharp(tile).resize(size, size).png().toFile(join(PUBLIC, file));
  console.log(`✓ public/${file} (${size}px)`);
};

await out(512, "icon-512.png");
await out(192, "icon-192.png");
await out(96, "brand-logo-96.png");

const icoSizes = [48, 32, 16];
const icoPngs = [];
for (const size of icoSizes) {
  icoPngs.push({ size, buf: await sharp(tile).resize(size, size).png().toBuffer() });
}
const icoPath = join(here, "..", "src", "app", "favicon.ico");
writeFileSync(icoPath, buildIco(icoPngs));
console.log(`✓ src/app/favicon.ico (${icoSizes.join("/")}px, PNG-compressed)`);
