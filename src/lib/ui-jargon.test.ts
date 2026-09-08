import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// 118 §4 — 行話不准出現在用戶面前 (J 8/31 第 22 條 / 第 20 條③). Two guards
// over the UI SOURCE, not over a fixture: every user-facing string lives in
// a <Tri bm zh en> or a t(bm, zh, en) call, so a banned phrase anywhere in a
// .tsx file's non-comment text is a banned phrase on a screen.
//
//   1. the cost of a button is a percentage of the org's pool, never
//      "1 AI action" / "1 tindakan AI" / "1 次 AI 额度";
//   2. our own words for the machinery — re-read, extraction, staging,
//      fallback, payload — never reach a reader.
//
// Comments are stripped first: the history of WHY a rule exists may quote
// the phrase it banned.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "..");
const UI_DIRS = ["app", "components"].map((d) => path.join(ROOT, d));

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

/** The file with every comment removed — line comments, block comments and
 *  JSX {/* … *\/} alike. Strings survive. */
function withoutComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

const files = UI_DIRS.flatMap(tsxFiles);

describe("118 §4 — no jargon in front of a person", () => {
  it("a button's cost is a percentage, never '1 AI action' (three languages)", () => {
    // 130 §10: any COUNT of actions in front of a person, not just "1" —
    // the constitution estimate line used to say "N 次 AI 用量" /
    // "deducts N AI actions" (the last "N 页／N 次" quote on a deep page).
    // `${e.actions}` in a template literal is caught by the interpolation
    // forms below; a literal digit by the plain ones.
    const banned = [
      /1 AI action/i,
      /1 tindakan AI/i,
      /1 次 AI 额度/,
      /1 次 AI 額度/,
      /\d+ AI actions?/i,
      /\d+ tindakan AI/i,
      /\d+ 次 AI/,
      /\$\{[^}]*\} AI action/i,
      /\$\{[^}]*\} tindakan AI/i,
      /\$\{[^}]*\} 次 AI/,
    ];
    const hits: string[] = [];
    for (const f of files) {
      const text = withoutComments(readFileSync(f, "utf-8"));
      for (const re of banned) if (re.test(text)) hits.push(`${path.relative(ROOT, f)} ~ ${re}`);
    }
    expect(hits).toEqual([]);
  });

  it("re-read / extraction / staging / fallback / payload never reach the screen", () => {
    // Only inside string literals and JSX text — an identifier such as
    // `mergeMeetingExtractions` is code, not copy.
    const banned = [
      /["'`][^"'`\n]*\bre-read\b[^"'`\n]*["'`]/i,
      />[^<{\n]*\bre-read\b/i,
      /(?:bm|zh|en)=["'`][^"'`\n]*\b(extraction|staging|fallback|payload)\b/i,
      /t\(\s*["'`][^"'`\n]*\b(extraction|staging|fallback|payload)\b/i,
    ];
    const hits: string[] = [];
    for (const f of files) {
      const text = withoutComments(readFileSync(f, "utf-8"));
      for (const re of banned) {
        const m = re.exec(text);
        if (m) hits.push(`${path.relative(ROOT, f)} ~ ${m[0].slice(0, 80)}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
