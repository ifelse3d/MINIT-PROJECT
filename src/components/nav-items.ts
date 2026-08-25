import {
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardList,
  Coins,
  CreditCard,
  FileSignature,
  FileCheck,
  FileText,
  Gauge,
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
// B-1 (work order 27, J 2026-08-26 #3, 拍板④): the DESKTOP sidebar shows
// SEVEN groups, spread out — group names are headings (not clickable), always
// expanded, no "More" junk drawer:
//
//   主頁 | 會議記錄 | 錢 | 申報 | 組織 | 記錄 | 設置    → SIDEBAR_NAV
//
// The PHONE keeps its FOUR bottom tabs untouched (J 2026-08-24 decision,
// re-confirmed 8/26): Home / Minutes / Money / More → PRIMARY_NAV. The /more
// page renders the same seven-group layout the desktop shows.
//
// Names follow the PERSON's job, not our pipeline ("New minutes", never
// "Photo & check"). e-Invois only shows when the organisation switched it on
// (default OFF — J 2026-08-24: optional; eROSES is the legal requirement).
// railOnly still governs the MINUTES mid-flow steps (attendance, the
// document); the money steps became visible sidebar rows on 8/26 — J listed
// them by name in the 錢 group.
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
  // Money — B-1 (8/26): with expenses and the statement coming, the index is
  // "record income", and the once rail-only steps are sidebar rows J listed
  // by name (记收入·开收据·交现金·收据历史).
  { href: "/money", icon: Wallet, bm: "Rekod wang masuk", zh: "记收入", en: "Record income", exact: true },
  // Stage E: spending + the claim flow — the row J's 錢-group list reserved.
  { href: "/money/expenses", icon: CreditCard, bm: "Rekod perbelanjaan & tuntutan", zh: "记开支与报销", en: "Spending & claims" },
  { href: "/money/receipts", icon: Receipt, bm: "Jana resit", zh: "开收据", en: "Issue receipts" },
  { href: "/money/custody", icon: Coins, bm: "Serah tunai", zh: "交现金", en: "Hand over cash" },
  // Stage F: the financial statement — computed, never typed.
  { href: "/money/report", icon: BarChart3, bm: "Penyata kewangan", zh: "财报", en: "Financial statement" },
  { href: "/money/history", icon: ClipboardList, bm: "Sejarah resit", zh: "收据历史", en: "Receipt history" },
  // Filings & dates.
  { href: "/calendar", icon: CalendarClock, bm: "Kalendar & tarikh akhir", zh: "日历与死线", en: "Calendar & deadlines" },
  { href: "/filings", icon: FileCheck, bm: "Pemfailan eROSES", zh: "eROSES 申报", en: "eROSES filings" },
  // The organisation's own facts.
  { href: "/constitution", icon: ScrollText, bm: "Perlembagaan", zh: "章程", en: "Constitution", exact: true },
  { href: "/constitution/clauses", icon: BookOpen, bm: "Fasal penuh", zh: "条文全文", en: "All clauses" },
  { href: "/members", icon: Users, bm: "Ahli", zh: "成员", en: "Members" },
  { href: "/glossary", icon: Languages, bm: "Perkataan kami", zh: "我们的词库", en: "Our words" },
  { href: "/inbox", icon: Upload, bm: "Gambar asal", zh: "原始照片", en: "Original photos" },
  { href: "/history", icon: History, bm: "Sejarah", zh: "历史", en: "History" },
  // e-Invois: optional (org switch, default off). The >RM10,000 individual
  // e-invois warning inside the money pages stays regardless of this flag.
  { href: "/money/einvois", icon: Banknote, bm: "Fail cukai (e-Invois)", zh: "税务文件（e-Invois）", en: "Tax file (e-Invois)", einvoisOnly: true },
  { href: "/orgs", icon: Building2, bm: "Pertubuhan & cawangan", zh: "组织与分会", en: "Organisations & branches" },
  // C-3: the plan-and-usage page gets its own sidebar row (settings group).
  // /settings is `exact` so standing on /settings/plan lights ONE row.
  { href: "/settings/plan", icon: Gauge, bm: "Pelan & penggunaan", zh: "方案与用量", en: "Plan & usage" },
  { href: "/settings", icon: Settings, bm: "Tetapan", zh: "设置", en: "Settings", exact: true },
  // G-4 (8/26): back in the menus — the pack builds from the REAL roster now.
  // Spelled out, no bare abbreviation (G-4).
  { href: "/agm-pack", icon: Landmark, bm: "Pek Mesyuarat Agung (AGM)", zh: "常年大会文件包", en: "AGM pack" },
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
 * THE PHONE's four entries — the bottom tab bar renders exactly this. Four,
 * not nineteen (J 2026-08-24, kept untouched on 8/26: 拍板④ "手機底欄維持
 * 4 格不動"). The desktop sidebar renders SIDEBAR_NAV below instead; the
 * /more page shows the same grouped layout as the desktop.
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
      byHref("/money/expenses"),
      byHref("/money/receipts"),
      byHref("/money/custody"),
      byHref("/money/report"),
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
      byHref("/agm-pack"),
      byHref("/constitution"),
      byHref("/constitution/clauses"),
      byHref("/members"),
      byHref("/glossary"),
      byHref("/inbox"),
      byHref("/history"),
      byHref("/money/einvois"),
      byHref("/orgs"),
      byHref("/settings/plan"),
      byHref("/settings"),
    ],
  },
];

/**
 * THE DESKTOP's seven groups (B-1, J 8/26 #3, 拍板④) — and the layout the
 * /more page shows. Group names are HEADINGS: not clickable, always expanded.
 * The 錢 rows are the ones J listed by name; /money/expenses joined when its
 * real page landed (Stage E) and /money/report joins with Stage F — a menu
 * row pointing at a stub would be a dressed-up dead link.
 */
export const SIDEBAR_NAV: NavEntry[] = [
  { kind: "item", item: byHref("/") },
  {
    kind: "group",
    id: "minutes",
    icon: FileText,
    bm: "Minit mesyuarat",
    zh: "会议记录",
    en: "Meeting minutes",
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
      byHref("/money/expenses"),
      byHref("/money/receipts"),
      byHref("/money/custody"),
      byHref("/money/report"),
      byHref("/money/einvois"),
      byHref("/money/history"),
    ],
  },
  {
    kind: "group",
    id: "filings",
    icon: FileCheck,
    bm: "Pemfailan",
    zh: "申报",
    en: "Filings",
    children: [byHref("/filings"), byHref("/calendar"), byHref("/agm-pack")],
  },
  {
    kind: "group",
    id: "organisation",
    icon: Building2,
    bm: "Pertubuhan",
    zh: "组织",
    en: "Organisation",
    children: [
      byHref("/members"),
      byHref("/constitution"),
      byHref("/constitution/clauses"),
      byHref("/glossary"),
      byHref("/orgs"),
    ],
  },
  {
    kind: "group",
    id: "records",
    icon: History,
    bm: "Rekod",
    zh: "记录",
    en: "Records",
    children: [byHref("/history"), byHref("/inbox")],
  },
  {
    kind: "group",
    id: "settings",
    icon: Settings,
    bm: "Tetapan",
    zh: "设置",
    en: "Settings",
    children: [byHref("/settings/plan"), byHref("/settings")],
  },
];

/** Every page the phone nav links to, groups flattened. */
export function navPages(): NavItem[] {
  return PRIMARY_NAV.flatMap((entry) =>
    entry.kind === "item" ? [entry.item] : entry.children,
  );
}

/** Every page the desktop sidebar links to, groups flattened. */
export function sidebarPages(): NavItem[] {
  return SIDEBAR_NAV.flatMap((entry) =>
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
 * exactly once in the PHONE nav (PRIMARY_NAV) AND exactly once in the DESKTOP
 * sidebar (SIDEBAR_NAV) — no page silently drops out of either surface, and
 * none is listed twice. `hidden` items must NOT appear in either.
 */
export function menusCoverAllItems(): boolean {
  const expected = NAV_ITEMS.filter((i) => !i.hidden);
  const hiddenHrefs = NAV_ITEMS.filter((i) => i.hidden).map((i) => i.href);
  const covers = (pages: NavItem[]): boolean => {
    const listed = pages.map((i) => i.href);
    const unique = new Set(listed);
    return (
      listed.length === unique.size &&
      unique.size === expected.length &&
      expected.every((i) => unique.has(i.href)) &&
      hiddenHrefs.every((href) => !unique.has(href))
    );
  };
  return covers(navPages()) && covers(sidebarPages());
}
