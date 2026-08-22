import {
  Banknote,
  Building2,
  CalendarClock,
  ClipboardList,
  Coins,
  FileSignature,
  FileCheck,
  FileText,
  FolderOpen,
  History,
  Home,
  Landmark,
  Languages,
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
// The ONE source of truth for navigation: the floating sidebar, the mobile menu
// and the account (gear) menu all read from here, so a page can never appear in
// one menu and be missing from another.
//
// Shape of the menus:
//   SIDEBAR_NAV   — five rows: Home, Minutes, Money, Documents▾, Calendar.
//                   "Documents" is a collapsible group (Filings / AGM /
//                   Constitution), so the daily pages stay one click away while
//                   the occasional ones stay out of sight.
//   ACCOUNT_NAV   — History, Organisations, Settings: reached from the gear menu
//                   in the top bar, NOT from the sidebar. These are lookup/config
//                   surfaces, not places you work. (Settings used to sit in both
//                   places.)
//
// Uploads (/inbox) sits inside the Documents group. It used to be `hidden` on the
// grounds that "History rows, the Home recent block and the ask router all resolve
// to it" — but that Home recent block was imported by nothing (the file has since
// been deleted), so the only place to see the ORIGINAL PHOTO of a document had no
// menu entry at all. That photo is the evidence behind every extracted field, so
// it gets a real entry. (2026-07-28 audit.)
//
// Icons are lucide (recolorable for the white-on-gradient active state,
// identical on every platform); emoji stay in page CONTENT, where warmth helps.
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
  /**
   * Highlight this row ONLY on its own URL, never on the routes underneath it.
   *
   * Needed since the 2026-08-23 split: /money is now the first STEP of the
   * money flow as well as the folder containing /money/receipts and the rest.
   * Without this, standing on /money/receipts lit up two rows at once — the
   * step you are on and the step you are not.
   */
  exact?: true;
};

/** Every page that has a menu entry anywhere. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: Home, bm: "Utama", zh: "主页", en: "Home" },
  // 2026-07-28 AUDIT: this used to be `hidden: true`, justified by "reached from
  // History / Home recent / the ask router". But the Home recent block was
  // imported by NOTHING (dead code, since deleted), so in practice the only place
  // to see the ORIGINAL PHOTO of a document had no menu entry and no working link
  // path. It is the evidence behind every extracted field, so it gets a real entry.
  { href: "/inbox", icon: Upload, bm: "Gambar asal", zh: "原始照片", en: "Original photos" },
  // The /minutes flow, one row per step (2026-08-23 split). "Minutes" itself is
  // the GROUP's name; these are the steps inside it. /minutes/history used to be
  // reachable only from a link buried inside step 3.
  { href: "/minutes", icon: FileText, bm: "Gambar & semak", zh: "拍照与核对", en: "Photo & check", exact: true },
  { href: "/minutes/attendance", icon: ClipboardCheck, bm: "Kehadiran", zh: "出席者", en: "Attendance" },
  { href: "/minutes/document", icon: FileSignature, bm: "Minit siap", zh: "做好的记录", en: "The document" },
  { href: "/minutes/history", icon: History, bm: "Sejarah minit", zh: "记录历史", en: "Minutes history" },
  // The /money flow, one row per step (2026-08-23 split). "Money" itself is the
  // GROUP's name — see MONEY_GROUP below — and these are the steps inside it.
  { href: "/money", icon: Wallet, bm: "Baca lejar", zh: "读账页", en: "Read the ledger", exact: true },
  { href: "/money/receipts", icon: Receipt, bm: "Daftar & resit", zh: "登记与收据", en: "Register & receipts" },
  { href: "/money/custody", icon: Coins, bm: "Serah wang", zh: "交现金", en: "Hand over cash" },
  { href: "/money/einvois", icon: Banknote, bm: "Fail cukai", zh: "税务文件", en: "Tax file" },
  { href: "/money/history", icon: ClipboardList, bm: "Sejarah resit", zh: "收据历史", en: "Receipt history" },
  { href: "/filings", icon: FileCheck, bm: "Pemfailan", zh: "申报", en: "Filings" },
  { href: "/agm-pack", icon: Landmark, bm: "Pek AGM", zh: "年度大会", en: "AGM" },
  { href: "/constitution", icon: ScrollText, bm: "Perlembagaan", zh: "章程", en: "Constitution" },
  { href: "/calendar", icon: CalendarClock, bm: "Kalendar", zh: "日历", en: "Calendar" },
  { href: "/history", icon: History, bm: "Sejarah", zh: "历史", en: "History" },
  // 2026-08-19, user: "我也想这个系统有一个地方可以看到成员名单". Top-level, not
  // buried in Documents: "who is our treasurer" is a question asked while
  // doing the work, which is the rule for earning a sidebar row.
  { href: "/members", icon: Users, bm: "Ahli", zh: "成员", en: "Members" },
  // 2026-08-19, user: "沒看到有 /glossary". It was only linked from Settings,
  // which is where things go to not be found.
  { href: "/glossary", icon: Languages, bm: "Perkataan Kami", zh: "我们的词库", en: "Our Words" },
  { href: "/orgs", icon: Building2, bm: "Pertubuhan", zh: "组织", en: "Organisations" },
  { href: "/settings", icon: Settings, bm: "Tetapan", zh: "设置", en: "Settings" },
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

/** One sidebar row: a plain link, or a collapsible group of links. */
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
 * 2026-07-28, user feedback:
 *   "为什么 history 不在 sidebar 那边呢？"  → it is now a top-level row.
 *   "choose org 就不需要放在 sidebar"       → gone; the sidebar footer now SHOWS
 *                                            which organisation you are in, and
 *                                            switching lives in the gear menu
 *                                            with the other account actions.
 *
 * The rule for what earns a sidebar row: something you open while DOING the
 * work. History qualifies — you check what was already recorded constantly.
 * Choosing an organisation is a once-a-month account action, not work.
 */
export const SIDEBAR_NAV: NavEntry[] = [
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
  // 2026-08-23: /money used to be ONE row leading to ONE 1734-line page. It is
  // now five steps, so it is a group — same shape as Documents, which is the
  // pattern the sidebar already knew. The GROUP carries the section's name
  // ("Wang / 财务 / Money"); the rows inside it are the steps.
  {
    kind: "group",
    id: "money",
    icon: Wallet,
    bm: "Wang",
    zh: "财务",
    en: "Money",
    children: [
      byHref("/money"),
      byHref("/money/receipts"),
      byHref("/money/custody"),
      byHref("/money/einvois"),
      byHref("/money/history"),
    ],
  },
  { kind: "item", item: byHref("/calendar") },
  { kind: "item", item: byHref("/history") },
  { kind: "item", item: byHref("/members") },
  {
    kind: "group",
    id: "documents",
    icon: FolderOpen,
    bm: "Dokumen",
    zh: "文件",
    en: "Documents",
    children: [
      byHref("/filings"),
      byHref("/agm-pack"),
      byHref("/constitution"),
      byHref("/glossary"),
      byHref("/inbox"),
    ],
  },
];

/** Reached from the gear menu in the top bar (and the mobile drawer). */
export const ACCOUNT_NAV: NavItem[] = [byHref("/orgs"), byHref("/settings")];

/** Every page the sidebar links to, groups flattened — used by the mobile menu. */
export function sidebarPages(): NavItem[] {
  return SIDEBAR_NAV.flatMap((entry) =>
    entry.kind === "item" ? [entry.item] : entry.children,
  );
}

/** True when a group contains the current route (so it opens by itself). */
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
 * Since the /money split a section can be a group whose own label is the
 * section name while its children are named after the steps inside it. The
 * activity feed still talks about "the money section" as one thing, so it needs
 * to ask for the section's words rather than reading them off an item that may
 * now be called "Read the ledger".
 */
export function sectionWords(href: string): { bm: string; zh: string; en: string } {
  // Only a group that is a FLOW has a section name of its own, and the mark of
  // one is an `exact` index route at its head (/money → /money/receipts → …).
  // "Documents" is a folder of unrelated pages, so /filings keeps its own words.
  const group = SIDEBAR_NAV.find(
    (e) => e.kind === "group" && e.children[0].href === href && e.children[0].exact,
  );
  if (group && group.kind === "group") {
    return { bm: group.bm, zh: group.zh, en: group.en };
  }
  const item = byHref(href);
  return { bm: item.bm, zh: item.zh, en: item.en };
}

/**
 * Sanity guard used in tests: every NAV_ITEM that is not `hidden` appears exactly
 * once across the sidebar and the account menu — no page silently drops out of
 * every menu, and none is listed twice (Settings used to be in the sidebar AND
 * the top bar). `hidden` items must NOT appear in either menu.
 */
export function menusCoverAllItems(): boolean {
  const listed = [...sidebarPages(), ...ACCOUNT_NAV].map((i) => i.href);
  const unique = new Set(listed);
  const expected = NAV_ITEMS.filter((i) => !i.hidden);
  return (
    listed.length === unique.size &&
    unique.size === expected.length &&
    expected.every((i) => unique.has(i.href)) &&
    NAV_ITEMS.filter((i) => i.hidden).every((i) => !unique.has(i.href))
  );
}
