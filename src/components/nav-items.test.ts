import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  PRIMARY_NAV,
  SIDEBAR_NAV,
  groupHasActiveChild,
  isActivePath,
  menusCoverAllItems,
  navPages,
  sectionWords,
  sidebarPages,
  visibleGroupChildren,
} from "./nav-items";
import { CATEGORY_STYLE } from "@/lib/activity-labels";

// NAV_ITEMS stays the single source of truth for which pages exist; PRIMARY_NAV
// decides where each one is reached from. These tests keep them in sync so a
// page can never silently drop out of every menu, or appear twice.
describe("menu structure (Stage R 2026-08-25, regrouped B-1 2026-08-26)", () => {
  it("lists every non-hidden page exactly once on BOTH surfaces", () => {
    expect(menusCoverAllItems()).toBe(true);
  });

  // FOUR phone tabs — Home, Minutes, Money, More (J 2026-08-24: "手机 19 格
  // 砍成 4", re-confirmed untouched on 8/26: 拍板④). The assertion exists so
  // a fifth tab is a decision somebody makes, not something that happens.
  it("keeps the phone nav to exactly four entries", () => {
    expect(PRIMARY_NAV).toHaveLength(4);
    expect(PRIMARY_NAV[0].kind).toBe("item");
    expect(PRIMARY_NAV.filter((e) => e.kind === "group")).toHaveLength(3);
  });

  // EIGHT desktop entries (B-1, J 8/26 #3; amended by 拍板 30 on 8/27): Home,
  // six collapsible groups, and the calendar as its own row — moved OUT of the
  // 申报 group because deadlines are a daily page, not a filing chore.
  it("keeps the desktop sidebar to Home + calendar + six groups, as J listed them", () => {
    expect(SIDEBAR_NAV).toHaveLength(8);
    expect(SIDEBAR_NAV[0].kind).toBe("item");
    const items = SIDEBAR_NAV.flatMap((e) => (e.kind === "item" ? [e.item.href] : []));
    expect(items).toEqual(["/", "/calendar"]);
    const ids = SIDEBAR_NAV.flatMap((e) => (e.kind === "group" ? [e.id] : []));
    expect(ids).toEqual([
      "minutes",
      "money",
      "filings",
      "organisation",
      "records",
      "settings",
    ]);
  });

  it("composes the sidebar groups exactly as 拍板④ enumerates them", () => {
    const byId = (id: string) => {
      const g = SIDEBAR_NAV.find((e) => e.kind === "group" && e.id === id);
      if (!g || g.kind !== "group") throw new Error(`expected group ${id}`);
      return g;
    };
    // 錢: 记收入 · 记开支与报销 · 开收据 · 交现金 · 财报 ·
    // 税务 e-Invois(开关) · 收据历史 — the full B-1 enumeration, delivered.
    expect(byId("money").children.map((c) => c.href)).toEqual([
      "/money",
      "/money/expenses",
      "/money/receipts",
      "/money/custody",
      "/money/report",
      "/money/einvois",
      "/money/history",
    ]);
    // 申报: eROSES · 常年大会文件包 (G-4 撿回; 拍板 30 moved the calendar out
    // to its own top-level row — asserted above).
    expect(byId("filings").children.map((c) => c.href)).toEqual([
      "/filings",
      "/agm-pack",
    ]);
    // 组织: 成员 · 章程 · 条文全文 · 词库 · 组织与分会.
    expect(byId("organisation").children.map((c) => c.href)).toEqual([
      "/members",
      "/constitution",
      "/constitution/clauses",
      "/glossary",
      "/orgs",
    ]);
    // 记录: 历史 · 原始照片.
    expect(byId("records").children.map((c) => c.href)).toEqual([
      "/history",
      "/inbox",
    ]);
    // 设置: 方案与用量 · 设置.
    expect(byId("settings").children.map((c) => c.href)).toEqual([
      "/settings/plan",
      "/settings",
    ]);
  });

  // /settings is `exact` so standing on /settings/plan lights exactly one row.
  it("never lights the Settings row while on the plan page", () => {
    expect(isActivePath("/settings/plan", "/settings", true)).toBe(false);
    expect(isActivePath("/settings", "/settings", true)).toBe(true);
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
      "/money/expenses",
      "/money/receipts",
      "/money/custody",
      "/money/report",
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

  // G-4 (8/26): AGM is BACK in the menus — the pack builds from the real
  // roster now, so hiding it stopped being a mercy and became a hole.
  it("lists the AGM pack again, on both surfaces", () => {
    const agm = NAV_ITEMS.find((i) => i.href === "/agm-pack");
    expect(agm).toBeDefined();
    expect(agm?.hidden).toBeUndefined();
    expect(navPages().map((i) => i.href)).toContain("/agm-pack");
    expect(sidebarPages().map((i) => i.href)).toContain("/agm-pack");
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

  // E-2 (2026-08-25, J #18) narrowed by B-1 (8/26): the MINUTES mid-flow
  // steps stay rail-only — the menus list the jobs, the section's tab rail
  // owns the steps. The MONEY steps became visible sidebar rows on 8/26
  // because J listed them by name in the 錢 group (开收据 · 交现金).
  it("keeps the minutes steps rail-only while the money rows are visible", () => {
    const minutes = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "minutes")!;
    const money = PRIMARY_NAV.find((e) => e.kind === "group" && e.id === "money")!;

    expect(visibleGroupChildren(minutes, true).map((c) => c.href)).toEqual([
      "/minutes",
      "/minutes/history",
    ]);
    expect(visibleGroupChildren(money, true).map((c) => c.href)).toEqual([
      "/money",
      "/money/expenses",
      "/money/receipts",
      "/money/custody",
      "/money/report",
      "/money/history",
    ]);

    // The group still opens on the steps the menu does not list — landing on
    // /minutes/attendance from a link must not leave the menu blank about
    // where you are.
    for (const path of ["/minutes/attendance", "/minutes/document"]) {
      expect(groupHasActiveChild(minutes, path)).toBe(true);
    }
    for (const path of ["/money/receipts", "/money/custody"]) {
      expect(groupHasActiveChild(money, path)).toBe(true);
    }
  });

  // The desktop sidebar and the /more page draw from the SAME structure and
  // the SAME visibility filter, so the two can never disagree (B-2).
  it("filters the sidebar groups through the shared helper too", () => {
    const money = SIDEBAR_NAV.find((e) => e.kind === "group" && e.id === "money")!;
    expect(visibleGroupChildren(money, false).map((c) => c.href)).not.toContain(
      "/money/einvois",
    );
    expect(visibleGroupChildren(money, true).map((c) => c.href)).toContain(
      "/money/einvois",
    );
    expect(sidebarPages().map((i) => i.href)).toContain("/settings/plan");
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
