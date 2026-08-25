import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  PRIMARY_NAV,
  groupHasActiveChild,
  isActivePath,
  menusCoverAllItems,
  navPages,
  sectionWords,
  visibleGroupChildren,
} from "./nav-items";
import { CATEGORY_STYLE } from "@/lib/activity-labels";

// NAV_ITEMS stays the single source of truth for which pages exist; PRIMARY_NAV
// decides where each one is reached from. These tests keep them in sync so a
// page can never silently drop out of every menu, or appear twice.
describe("menu structure (Stage R, 2026-08-25)", () => {
  it("lists every non-hidden page exactly once across the four entries", () => {
    expect(menusCoverAllItems()).toBe(true);
  });

  // FOUR entries — Home, Minutes, Money, More — identical on the desktop rail
  // and the phone tab bar (J, 2026-08-24: "手机 19 格砍成 4"). The assertion
  // exists so a fifth entry is a decision somebody makes, not something that
  // happens.
  it("keeps the primary nav to exactly four entries", () => {
    expect(PRIMARY_NAV).toHaveLength(4);
    expect(PRIMARY_NAV[0].kind).toBe("item");
    expect(PRIMARY_NAV.filter((e) => e.kind === "group")).toHaveLength(3);
  });

  it("puts the minutes flow inside one group, in the order it is done", () => {
    const group = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "minutes");
    if (!group || group.kind !== "group") throw new Error("expected a minutes group");
    expect(group.children.map((c) => c.href)).toEqual([
      "/minutes",
      "/minutes/attendance",
      "/minutes/document",
      "/minutes/history",
    ]);
    expect(group.children[0].exact).toBe(true);
  });

  it("puts the money flow inside one group, in the order it is done", () => {
    const group = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "money");
    if (!group || group.kind !== "group") throw new Error("expected a money group");
    expect(group.children.map((c) => c.href)).toEqual([
      "/money",
      "/money/receipts",
      "/money/custody",
      "/money/history",
    ]);
    // The index page must be `exact`, or standing on /money/receipts lights up
    // two rows: the step you are on and the step you are not.
    expect(group.children[0].exact).toBe(true);
  });

  // e-Invois is OPTIONAL (J 2026-08-24): it lives under More, flagged
  // einvoisOnly so the shell can hide it for orgs that do not need it. It must
  // NOT sit inside the money flow any more.
  it("moves e-Invois under More, behind the einvoisOnly flag", () => {
    const money = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "money");
    if (!money || money.kind !== "group") throw new Error("expected a money group");
    expect(money.children.map((c) => c.href)).not.toContain("/money/einvois");

    const more = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "more");
    if (!more || more.kind !== "group") throw new Error("expected a more group");
    const einvois = more.children.find((c) => c.href === "/money/einvois");
    expect(einvois).toBeDefined();
    expect(einvois?.einvoisOnly).toBe(true);
  });

  // AGM keeps its route (a saved link still works) but leaves every menu
  // (J 2026-08-24).
  it("hides AGM from every menu while keeping its route registered", () => {
    const agm = NAV_ITEMS.find((i) => i.href === "/agm-pack");
    expect(agm).toBeDefined();
    expect(agm?.hidden).toBe(true);
    expect(navPages().map((i) => i.href)).not.toContain("/agm-pack");
  });

  it("keeps the occasional pages under More", () => {
    const more = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "more");
    if (!more || more.kind !== "group") throw new Error("expected a more group");
    const hrefs = more.children.map((c) => c.href);
    for (const href of [
      "/calendar",
      "/filings",
      "/constitution",
      "/constitution/clauses",
      "/members",
      "/glossary",
      "/inbox",
      "/history",
      "/orgs",
      "/settings",
    ]) {
      expect(hrefs).toContain(href);
    }
  });

  // E-2 (2026-08-25, J #18): the sidebar and the in-page tab rail used to be
  // mirrors of the same four steps. Now the MENUS list the jobs (start the
  // flow, see the records) while the mid-flow steps are navigated by the
  // section's own rail. The steps stay group children — the group must still
  // open and light anywhere inside the flow — but no menu renders them.
  it("keeps rail-only steps out of the menus while the group still covers them", () => {
    const minutes = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "minutes")!;
    const money = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "money")!;

    expect(visibleGroupChildren(minutes, true).map((c) => c.href)).toEqual([
      "/minutes",
      "/minutes/history",
    ]);
    expect(visibleGroupChildren(money, true).map((c) => c.href)).toEqual([
      "/money",
      "/money/history",
    ]);

    // The group still opens on the steps the menu no longer lists — landing on
    // /money/custody from a link must not leave the menu blank about where
    // you are.
    for (const path of ["/minutes/attendance", "/minutes/document"]) {
      expect(groupHasActiveChild(minutes, path)).toBe(true);
    }
    for (const path of ["/money/receipts", "/money/custody"]) {
      expect(groupHasActiveChild(money, path)).toBe(true);
    }
  });

  it("still filters e-Invois by the org switch through the shared helper", () => {
    const more = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "more")!;
    expect(visibleGroupChildren(more, false).map((c) => c.href)).not.toContain(
      "/money/einvois",
    );
    expect(visibleGroupChildren(more, true).map((c) => c.href)).toContain(
      "/money/einvois",
    );
  });

  it("resolves every entry to a real NavItem with all three languages", () => {
    const known = new Set(NAV_ITEMS.map((i) => i.href));
    for (const item of navPages()) {
      expect(known.has(item.href)).toBe(true);
      expect(item.bm.length).toBeGreaterThan(0);
      expect(item.zh.length).toBeGreaterThan(0);
      expect(item.en.length).toBeGreaterThan(0);
    }
  });
});

describe("groupHasActiveChild", () => {
  const more = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "more")!;
  const money = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "money")!;

  it("opens the group when a child route is active", () => {
    expect(groupHasActiveChild(more, "/filings")).toBe(true);
    expect(groupHasActiveChild(more, "/settings")).toBe(true);
  });

  it("stays closed elsewhere", () => {
    expect(groupHasActiveChild(more, "/money")).toBe(false);
    expect(groupHasActiveChild(more, "/")).toBe(false);
  });

  // The money group must open on EVERY step of the flow, including the deep
  // ones — otherwise you land on /money/custody from a link and the menu shows
  // you nothing about where you are.
  it("opens the money group anywhere inside the money flow", () => {
    for (const path of [
      "/money",
      "/money/receipts",
      "/money/custody",
      "/money/history",
    ]) {
      expect(groupHasActiveChild(money, path)).toBe(true);
    }
    expect(groupHasActiveChild(money, "/minutes")).toBe(false);
  });

  it("is false for plain items", () => {
    const plain = PRIMARY_NAV.find((e) => e.kind === "item")!;
    expect(groupHasActiveChild(plain, "/")).toBe(false);
  });
});

describe("isActivePath", () => {
  it("matches Home only exactly", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/money", "/")).toBe(false);
  });

  it("highlights the parent for nested routes", () => {
    expect(isActivePath("/money/history", "/money")).toBe(true);
    expect(isActivePath("/minutes/history", "/minutes")).toBe(true);
  });

  it("does not false-match sibling prefixes", () => {
    expect(isActivePath("/minutes-archive", "/minutes")).toBe(false);
  });

  it("marks an `exact` row active only on its own URL", () => {
    expect(isActivePath("/money", "/money", true)).toBe(true);
    expect(isActivePath("/money/receipts", "/money", true)).toBe(false);
    expect(isActivePath("/money/receipts", "/money/receipts")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The same concept must carry the same words on every screen: the nav and the
// activity feed are both display vocabulary for the same sections.
// ---------------------------------------------------------------------------
describe("terminology is consistent between the nav and the activity feed", () => {
  const pairs: { href: string; category: keyof typeof CATEGORY_STYLE }[] = [
    { href: "/minutes", category: "minutes" },
    { href: "/money", category: "money" },
    { href: "/filings", category: "filings" },
    { href: "/agm-pack", category: "agm" },
    { href: "/constitution", category: "constitution" },
    { href: "/calendar", category: "calendar" },
  ];

  it.each(pairs)("uses the same three words for $href", ({ href, category }) => {
    const label = CATEGORY_STYLE[category];
    expect({ bm: label.bm, zh: label.zh, en: label.en }).toEqual(sectionWords(href));
  });
});
