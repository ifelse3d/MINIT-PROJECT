import { describe, expect, it } from "vitest";
import {
  ACCOUNT_NAV,
  NAV_ITEMS,
  SIDEBAR_NAV,
  groupHasActiveChild,
  isActivePath,
  menusCoverAllItems,
  sectionWords,
  sidebarPages,
} from "./nav-items";
import { CATEGORY_STYLE } from "@/lib/activity-labels";

// NAV_ITEMS stays the single source of truth for which pages exist; SIDEBAR_NAV
// and ACCOUNT_NAV decide where each one is reached from. These tests keep them in
// sync so a page can never silently drop out of every menu, or appear twice.
describe("menu structure", () => {
  it("lists every page exactly once across sidebar + account menu", () => {
    expect(menusCoverAllItems()).toBe(true);
  });

  // Six rows: five pages you open while doing the work, plus one Documents group.
  // The cap matters — a wall of near-identical thin rows is what we are avoiding.
  // Seven since 2026-08-19: /members joined the daily rows. The number itself
  // is not sacred; the assertion exists so that adding a row is a decision
  // somebody made, not something that happened.
  it("keeps the sidebar to seven rows", () => {
    expect(SIDEBAR_NAV).toHaveLength(7);
  });

  it("keeps the daily pages one click away", () => {
    const topLevel = SIDEBAR_NAV.filter((e) => e.kind === "item").map((e) =>
      e.kind === "item" ? e.item.href : "",
    );
    expect(topLevel).toContain("/");
    // 2026-08-23: /minutes and /money became GROUPS when those pages were split
    // into steps, so they are no longer plain rows. They stay one click away all
    // the same — a group opens by itself whenever you are anywhere inside it.
    expect(topLevel).not.toContain("/minutes");
    expect(topLevel).not.toContain("/money");
    expect(topLevel).toContain("/calendar");
    // 2026-07-28, user: "为什么 history 不在 sidebar 那边呢？" — you check what was
    // already recorded constantly, so it earns a row.
    expect(topLevel).toContain("/history");
    // 2026-08-19, user: "我也想这个系统有一个地方可以看到成员名单" — "who is our
    // treasurer" is asked while doing the work, so it is a row, not a submenu.
    expect(topLevel).toContain("/members");
  });

  // 2026-08-23: three groups now — Minutes and Money (each the steps of ONE
  // job, split out of a 2039- and a 1734-line page) and Documents (occasional
  // pages that are not a flow). The assertion exists so a FOURTH group is a
  // decision somebody makes, not something that happens.
  it("keeps the sidebar to three groups", () => {
    expect(SIDEBAR_NAV.filter((e) => e.kind === "group")).toHaveLength(3);
  });

  it("puts the minutes flow inside one group, in the order it is done", () => {
    const group = SIDEBAR_NAV.find((e) => e.kind === "group" && e.id === "minutes");
    if (!group || group.kind !== "group") throw new Error("expected a minutes group");
    expect(group.children.map((c) => c.href)).toEqual([
      "/minutes",
      "/minutes/attendance",
      "/minutes/document",
      // 2026-08-07, J's UX list item N5: finding an old set of minutes was hard
      // because /minutes/history was linked only from inside step 3.
      "/minutes/history",
    ]);
    expect(group.children[0].exact).toBe(true);
  });

  it("puts the money flow inside one group, in the order it is done", () => {
    const group = SIDEBAR_NAV.find((e) => e.kind === "group" && e.id === "money");
    if (!group || group.kind !== "group") throw new Error("expected a money group");
    expect(group.children.map((c) => c.href)).toEqual([
      "/money",
      "/money/receipts",
      "/money/custody",
      "/money/einvois",
      "/money/history",
    ]);
    // The index page must be `exact`, or standing on /money/receipts lights up
    // two rows: the step you are on and the step you are not.
    expect(group.children[0].exact).toBe(true);
  });

  it("puts the occasional documents inside one group", () => {
    const group = SIDEBAR_NAV.find((e) => e.kind === "group" && e.id === "documents");
    if (!group || group.kind !== "group") throw new Error("expected a documents group");
    expect(group.children.map((c) => c.href)).toEqual([
      "/filings",
      "/agm-pack",
      "/constitution",
      // 2026-08-23, J's UX list N7: reading the constitution end to end, as
      // opposed to asking it a question, is its own screen and its own row.
      "/constitution/clauses",
      // 2026-08-19: the glossary was only reachable from Settings, i.e. not
      // reachable. It is set up once and then rarely, so it belongs in the
      // group rather than on a row of its own.
      "/glossary",
      "/inbox",
    ]);
  });

  // 2026-07-28, user: "choose org 就不需要放在 sidebar，为什么会有 choose org 呢？"
  // Choosing an organisation is a once-a-month ACCOUNT action, not work, so it
  // belongs with Settings behind the gear. The sidebar footer now just SHOWS
  // which organisation you are recording into.
  it("keeps account actions out of the sidebar", () => {
    const sidebar = sidebarPages().map((i) => i.href);
    for (const href of ["/orgs", "/settings"]) {
      expect(sidebar).not.toContain(href);
      expect(ACCOUNT_NAV.map((i) => i.href)).toContain(href);
    }
  });

  // 2026-07-28 audit: Uploads USED to be `hidden`, justified by "History, the
  // Home recent block and the ask router all link to it" — but that block was
  // imported by nothing (the file has since been deleted), so the only place to
  // see the ORIGINAL PHOTO of a document had no menu entry at all. That photo is
  // the evidence behind every extracted field, so it now sits in Documents.
  it("gives Uploads a real menu entry", () => {
    const inbox = NAV_ITEMS.find((i) => i.href === "/inbox");
    expect(inbox).toBeDefined();
    expect(inbox?.hidden).toBeUndefined();
    expect(sidebarPages().map((i) => i.href)).toContain("/inbox");
  });

  it("resolves every entry to a real NavItem", () => {
    const known = new Set(NAV_ITEMS.map((i) => i.href));
    for (const item of [...sidebarPages(), ...ACCOUNT_NAV]) {
      expect(known.has(item.href)).toBe(true);
      expect(item.bm.length).toBeGreaterThan(0);
      expect(item.zh.length).toBeGreaterThan(0);
      expect(item.en.length).toBeGreaterThan(0);
    }
  });
});

describe("groupHasActiveChild", () => {
  const group = SIDEBAR_NAV.find((e) => e.kind === "group" && e.id === "documents")!;
  const money = SIDEBAR_NAV.find((e) => e.kind === "group" && e.id === "money")!;

  it("opens the group when a child route is active", () => {
    expect(groupHasActiveChild(group, "/agm-pack")).toBe(true);
    expect(groupHasActiveChild(group, "/filings")).toBe(true);
  });

  it("stays closed elsewhere", () => {
    expect(groupHasActiveChild(group, "/money")).toBe(false);
    expect(groupHasActiveChild(group, "/")).toBe(false);
  });

  // The money group must open on EVERY step of the flow, including the deep
  // ones — otherwise you land on /money/custody from a link and the menu shows
  // you nothing about where you are.
  it("opens the money group anywhere inside the money flow", () => {
    for (const path of [
      "/money",
      "/money/receipts",
      "/money/custody",
      "/money/einvois",
      "/money/history",
    ]) {
      expect(groupHasActiveChild(money, path)).toBe(true);
    }
    expect(groupHasActiveChild(money, "/minutes")).toBe(false);
  });

  it("is false for plain items", () => {
    const plain = SIDEBAR_NAV.find((e) => e.kind === "item")!;
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

  // 2026-08-23: /money is both the first STEP and the folder holding the rest.
  it("marks an `exact` row active only on its own URL", () => {
    expect(isActivePath("/money", "/money", true)).toBe(true);
    expect(isActivePath("/money/receipts", "/money", true)).toBe(false);
    expect(isActivePath("/money/receipts", "/money/receipts")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2026-07-28 audit: the same concept was named differently on different
// screens — the /history badge said "Failing" (not a Malay word) and 钱款 while
// the nav said "Pemfailan" and 财务. Both files are display vocabulary for the
// same sections, so they must agree word for word.
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

  // sectionWords, not NAV_ITEMS, because since 2026-08-23 a section can be a
  // GROUP whose own label is the section name ("Money") while its first child is
  // named after a step ("Read the ledger"). The feed talks about the section.
  it.each(pairs)("uses the same three words for $href", ({ href, category }) => {
    const label = CATEGORY_STYLE[category];
    expect({ bm: label.bm, zh: label.zh, en: label.en }).toEqual(sectionWords(href));
  });
});
