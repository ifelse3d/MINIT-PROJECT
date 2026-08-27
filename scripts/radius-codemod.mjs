// ---------------------------------------------------------------------------
// §2.4 radius migration (violet redesign spec) — SINGLE-PASS lookup, exactly
// as the spec warns: running the rows as sequential find/replace would send
// rounded-3xl → rounded-lg → rounded-sm and land 26px on 6px. One regex pass
// per file maps every size token directly to its destination:
//
//   rounded-3xl / -2xl / -xl  →  rounded-md   (8px; modals hand-set to -lg)
//   rounded-lg                →  rounded-sm   (6px)
//   rounded-md / -sm / -xs    →  unchanged
//   rounded-full              →  UNTOUCHED — case-by-case by hand (avatars,
//                                the AI FAB and status dots keep it; buttons
//                                and chips are edited individually)
//
// Corner variants (rounded-br-md, rounded-tl-lg) and responsive/hover
// prefixes (md:rounded-xl) are covered because the regex matches the token
// anywhere and rewrites only the size suffix. Run once:
//   node scripts/radius-codemod.mjs
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk("src");
const re = /\brounded((?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?)-(3xl|2xl|xl|lg)\b/g;

let touched = 0;
let total = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  let count = 0;
  const out = src.replace(re, (_m, corner, size) => {
    count++;
    const dest = size === "lg" ? "sm" : "md";
    return `rounded${corner}-${dest}`;
  });
  if (count > 0) {
    writeFileSync(file, out);
    touched++;
    total += count;
  }
}
console.log(`rewrote ${total} radius classes across ${touched} files`);
