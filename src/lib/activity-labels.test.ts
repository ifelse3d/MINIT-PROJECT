import { describe, expect, it } from "vitest";
import { CATEGORY_STYLE, LINE_TEXT } from "./activity-labels";
import { ACTIVITY_CATEGORIES, HISTORY_CATEGORIES } from "./history";

// ---------------------------------------------------------------------------
// CATEGORY_STYLE is typed Record<ActivityCategory, …>, so TypeScript already
// refuses a missing entry. These tests cover what the type cannot: that the
// map has no LEFTOVER entries for categories that were removed, that every
// recorded-history category has a dot colour to render (a future item uses a
// ring instead, and its dot is legitimately ""), and that a new category never
// ships without its bullet wording — which would silently fall back to the raw
// `kind` string in the /history feed.
// ---------------------------------------------------------------------------

describe("category styles", () => {
  it("covers exactly the known categories, no strays", () => {
    expect(Object.keys(CATEGORY_STYLE).sort()).toEqual([...ACTIVITY_CATEGORIES].sort());
  });

  it("gives every recorded-history category a visible dot colour", () => {
    for (const c of ACTIVITY_CATEGORIES) {
      const s = CATEGORY_STYLE[c];
      if (!s.future) expect(s.dot).not.toBe("");
      else expect(s.ring).not.toBe("");
    }
  });

  it("labels every category in all three languages", () => {
    for (const c of ACTIVITY_CATEGORIES) {
      const s = CATEGORY_STYLE[c];
      expect([s.bm, s.zh, s.en].every((label) => label.length > 0)).toBe(true);
    }
  });

  // A /history chip that is marked `future` would be filtered out of the very
  // feed it claims to filter — an empty-results trap.
  it("keeps every /history chip a non-future category", () => {
    for (const c of HISTORY_CATEGORIES) expect(CATEGORY_STYLE[c].future).toBe(false);
  });
});

describe("bullet wording", () => {
  it("has wording for the categories the history feed shows", () => {
    for (const key of [
      "minutes/minutes",
      "money/receipt",
      "uploads/upload",
      "agm/agm",
      "constitution/constitution",
      "calendar/event",
    ]) {
      const build = LINE_TEXT[key];
      expect(build, `missing LINE_TEXT["${key}"]`).toBeDefined();
      const text = build(1);
      expect([text.bm, text.zh, text.en].every((s) => s.length > 0)).toBe(true);
    }
  });

  it("pluralises the English wording", () => {
    expect(LINE_TEXT["calendar/event"](1).en).toBe("1 event held");
    expect(LINE_TEXT["calendar/event"](3).en).toBe("3 events held");
    expect(LINE_TEXT["agm/agm"](2).en).toBe("2 AGMs held");
  });
});
