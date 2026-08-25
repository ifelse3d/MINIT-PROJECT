import {
  Banknote,
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardList,
  Coins,
  FileSignature,
  FileCheck,
  FileText,
  History,
  Home,
  Landmark,
  Languages,
  MoreHorizontal,
  Receipt,
  ScrollText,
  ClipboardCheck,
  Settings,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// The ONE source of truth for navigation.
//
// 2026-08-25 (Stage R redesign, J: "手机 19 格砍成 4"). The whole app now
// navigates through FOUR entries, identical on desktop (left rail) and phone
// (bottom tab bar):
//
//   1. Home          — "what do I do today"
//   2. Minutes       — the minutes flow, in the order it is done
//   3. Money         — the money flow, in the order it is done
//   4. More          — everything occasional: calendar, filings, constitution,
//                      members, glossary, photos, history, tax file, account
//
// Names follow the PERSON's job, not our pipeline ("New minutes", never
// "Photo & check"). e-Invois lives under More and only shows when the
// organisation says it needs it (default OFF — J 2026-08-24: optional;
// eROSES is the legal requirement and stays first). /agm-pack keeps its
// route but leaves every menu (hidden) — same decision.
// ---------------------------------------------------------------------------

export type NavItem = {
  href: string;
  icon: LucideIcon;
  bm: string;
  zh: string;
  en: string;
  /**
   * Reachable by link, but deliberately absent from every menu. Excluded from
   * the menusCoverAllItems() guard so it does not count as "silently dropped".
   */
  hidden?: true;
  /** Highlight only on its own URL, never on the routes underneath it. */
  exact?: true;
  /**
   * Only shown when the organisation has switched e-Invois on (J 2026-08-24:
   * optional, default off). The shell filters on this flag; the ROUTE always
   * exists, so a saved link still works.
   */
  einvoisOnly?: true;
  /**
   * E-2 (2026-08-25): a mid-flow step whose navigation is the section's own
   * tab rail, not the menus. It STAYS a group child — so the group still
   * opens/lights anywhere inside the flow and menusCoverAllItems() still
   * counts it — but no menu renders a row for it. The sidebar lists the JOBS
   * (start the flow, see the records); the rail on every page of the section
   * is where the steps live. Two mirrors of the same four steps was noise
   * (J #18), and the fix is one owner per question: "where can I go" = menu,
   * "where am I in this job" = rail.
   */
  railOnly?: true;
};

/** Every page that has a menu entry anywhere. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: Home, bm: "Utama", zh: "主页", en: "Home" },
  // Minutes flow — named after the JOB, not the pipeline step.
  { href: "/minutes", icon: FileText, bm: "Minit baru", zh: "新的会议记录", en: "New minutes", exact: true },
  { href: "/minutes/attendance", icon: ClipboardCheck, bm: "Kehadiran", zh: "出席者", en: "Attendance", railOnly: true },
  { href: "/minutes/document", icon: FileSignature, bm: "Dokumen siap", zh: "做好的文件", en: "The document", railOnly: true },
  { href: "/minutes/history", icon: History, bm: "Minit lama", zh: "以前的记录", en: "Past minutes" },
  // Money flow.
  { href: "/money", icon: Wallet, bm: "Rekod derma", zh: "记录捐款", en: "Record donations", exact: true },
  { href: "/money/receipts", icon: Receipt, bm: "Jana resit", zh: "开收据", en: "Issue receipts", railOnly: true },
  { href: "/money/custody", icon: Coins, bm: "Serah tunai", zh: "交现金", en: "Hand over cash", railOnly: true },
  { href: "/money/history", icon: ClipboardList, bm: "Sejarah resit", zh: "收据历史", en: "Receipt history" },
  // More — occasional pages.
  { href: "/calendar", icon: CalendarClock, bm: "Kalendar", zh: "日历", en: "Calendar" },
  { href: "/filings", icon: FileCheck, bm: "Pemfailan eROSES", zh: "eROSES 申报", en: "eROSES filings" },
  { href: "/constitution", icon: ScrollText, bm: "Perlembagaan", zh: "章程", en: "Constitution", exact: true },
  { href: "/constitution/clauses", icon: BookOpen, bm: "Fasal penuh", zh: "条文全文", en: "All clauses" },
  { href: "/members", icon: Users, bm: "Ahli", zh: "成员", en: "Members" },
  { href: "/glossary", icon: Languages, bm: "Perkataan kami", zh: "我们的词库", en: "Our words" },
  { href: "/inbox", icon: Upload, bm: "Gambar asal", zh: "原始照片", en: "Original photos" },
  { href: "/history", icon: History, bm: "Sejarah", zh: "历史", en: "History" },
  // e-Invois: optional (org switch, default off). The >RM10,000 individual
  // e-invois warning inside the money pages stays regardless of this flag.
  { href: "/money/einvois", icon: Banknote, bm: "Fail cukai (e-Invois)", zh: "税务文件（e-Invois）", en: "Tax file (e-Invois)", einvoisOnly: true },
  { href: "/orgs", icon: Building2, bm: "Pertubuhan", zh: "组织", en: "Organisations" },
  { href: "/settings", icon: Settings, bm: "Tetapan", zh: "设置", en: "Settings" },
  // Route kept, menu entry removed (J 2026-08-24: AGM out of the nav for now).
  { href: "/agm-pack", icon: Landmark, bm: "Pek AGM", zh: "年度大会", en: "AGM", hidden: true },
];

export function isActivePath(pathname: string, href: string, exact = false): boolean {
  if (href === "/" || exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const byHref = (href: string): NavItem => {
  const found = NAV_ITEMS.find((i) => i.href === href);
  if (!found) throw new Error(`No NavItem for ${href}`);
  return found;
};

/** One nav entry: a plain link, or a group of links. */
export type NavEntry =
  | { kind: "item"; item: NavItem }
  | {
      kind: "group";
      /** Stable id for open/closed state. */
      id: string;
      icon: LucideIcon;
      bm: string;
      zh: string;
      en: string;
      children: NavItem[];
    };

/**
 * THE four entries — the desktop rail and the phone tab bar both render
 * exactly this. Four, not nineteen (J, 2026-08-24).
 */
export const PRIMARY_NAV: NavEntry[] = [
  { kind: "item", item: byHref("/") },
  {
    kind: "group",
    id: "minutes",
    icon: FileText,
    bm: "Minit",
    zh: "会议记录",
    en: "Minutes",
    children: [
      byHref("/minutes"),
      byHref("/minutes/attendance"),
      byHref("/minutes/document"),
      byHref("/minutes/history"),
    ],
  },
  {
    kind: "group",
    id: "money",
    icon: Wallet,
    bm: "Wang",
    zh: "钱",
    en: "Money",
    children: [
      byHref("/money"),
      byHref("/money/receipts"),
      byHref("/money/custody"),
      byHref("/money/history"),
    ],
  },
  {
    kind: "group",
    id: "more",
    icon: MoreHorizontal,
    bm: "Lagi",
    zh: "更多",
    en: "More",
    children: [
      byHref("/calendar"),
      byHref("/filings"),
      byHref("/constitution"),
      byHref("/constitution/clauses"),
      byHref("/members"),
      byHref("/glossary"),
      byHref("/inbox"),
      byHref("/history"),
      byHref("/money/einvois"),
      byHref("/orgs"),
      byHref("/settings"),
    ],
  },
];

/** Every page the primary nav links to, groups flattened. */
export function navPages(): NavItem[] {
  return PRIMARY_NAV.flatMap((entry) =>
    entry.kind === "item" ? [entry.item] : entry.children,
  );
}

/**
 * What a MENU actually renders for a group: rail-only steps are skipped
 * (their navigation is the section's tab rail), and e-Invois obeys the org
 * switch. One function, used by the desktop sidebar and the /more page, so
 * the two menus cannot disagree about what exists.
 */
export function visibleGroupChildren(
  entry: NavEntry,
  einvoisVisible: boolean,
): NavItem[] {
  if (entry.kind !== "group") return [];
  return entry.children.filter(
    (c) => !c.railOnly && (!c.einvoisOnly || einvoisVisible),
  );
}

/** True when a group contains the current route (so it lights up / opens). */
export function groupHasActiveChild(
  entry: NavEntry,
  pathname: string,
): boolean {
  if (entry.kind !== "group") return false;
  return entry.children.some((child) => isActivePath(pathname, child.href, child.exact));
}

/**
 * The three words the MENU uses for a section, wherever they live.
 *
 * A section can be a group whose own label is the section name while its
 * children are named after the jobs inside it. The activity feed still talks
 * about "the money section" as one thing, so it asks for the section's words.
 */
export function sectionWords(href: string): { bm: string; zh: string; en: string } {
  const group = PRIMARY_NAV.find(
    (e) => e.kind === "group" && e.children[0].href === href && e.children[0].exact,
  );
  if (group && group.kind === "group") {
    return { bm: group.bm, zh: group.zh, en: group.en };
  }
  const item = byHref(href);
  return { bm: item.bm, zh: item.zh, en: item.en };
}

/**
 * Sanity guard used in tests: every NAV_ITEM that is not `hidden` appears
 * exactly once across the four primary entries — no page silently drops out of
 * every menu, and none is listed twice. `hidden` items must NOT appear.
 */
export function menusCoverAllItems(): boolean {
  const listed = navPages().map((i) => i.href);
  const unique = new Set(listed);
  const expected = NAV_ITEMS.filter((i) => !i.hidden);
  return (
    listed.length === unique.size &&
    unique.size === expected.length &&
    expected.every((i) => unique.has(i.href)) &&
    NAV_ITEMS.filter((i) => i.hidden).every((i) => !unique.has(i.href))
  );
}
