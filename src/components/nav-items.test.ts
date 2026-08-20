import { describe, expect, it } from "vitest";
import {
  ACCOUNT_NAV,
  NAV_ITEMS,
  SIDEBAR_NAV,
  groupHasActiveChild,
  isActivePath,
  menusCoverAllItems,
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
    expect(topLevel).toContain("/minutes");
    expect(topLevel).toContain("/money");
    expect(topLevel).toContain("/calendar");
    // 2026-07-28, user: "为什么 history 不在 sidebar 那边呢？" — you check what was
    // already recorded constantly, so it earns a row.
    expect(topLevel).toContain("/history");
    // 2026-08-19, user: "我也想这个系统有一个地方可以看到成员名单" — "who is our
    // treasurer" is asked while doing the work, so it is a row, not a submenu.
    expect(topLevel).toContain("/members");
  });

  it("puts the occasional documents inside one group", () => {
    const groups = SIDEBAR_NAV.filter((e) => e.kind === "group");
    expect(groups).toHaveLength(1);
    const group = groups[0];
    if (group.kind !== "group") throw new Error("expected a group");
    expect(group.children.map((c) => c.href)).toEqual([
      "/filings",
      "/agm-pack",
      "/constitution",
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
  const group = SIDEBAR_NAV.find((e) => e.kind === "group")!;

  it("opens the group when a child route is active", () => {
    expect(groupHasActiveChild(group, "/agm-pack")).toBe(true);
    expect(groupHasActiveChild(group, "/filings")).toBe(true);
  });

  it("stays closed elsewhere", () => {
    expect(groupHasActiveChild(group, "/money")).toBe(false);
    expect(groupHasActiveChild(group, "/")).toBe(false);
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

  it.each(pairs)("uses the same three words for $href", ({ href, category }) => {
    const navItem = NAV_ITEMS.find((i) => i.href === href);
    if (!navItem) throw new Error(`no nav item for ${href}`);
    const label = CATEGORY_STYLE[category];
    expect({ bm: label.bm, zh: label.zh, en: label.en }).toEqual({
      bm: navItem.bm,
      zh: navItem.zh,
      en: navItem.en,
    });
  });
});
