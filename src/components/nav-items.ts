import {
  Activity,
  Banknote,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileSignature,
  FileCheck,
  FileText,
  Gauge,
  History,
  Home,
  Landmark,
  Languages,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Palette,
  Receipt,
  ScrollText,
  ClipboardCheck,
  Settings,
  Sparkles,
  TriangleAlert,
  Upload,
  UserRound,
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
   * optional, default off) — AND, since D49, only to the operator: the
   * provider ANDs the beta gate into `einvoisVisible` before it gets here.
   * The route itself 404s for non-operators while the gate stands.
   */
  einvoisOnly?: true;
  /**
   * D49 (work order 94): shown only to the e-Invois beta operator, but
   * REGARDLESS of the org switch — the Settings row that holds the switch
   * itself, which the operator must reach while it is still off.
   */
  einvoisOperatorOnly?: true;
  /** D49: entry belongs to the e-Invois beta — menus hang a BETA pill on it. */
  beta?: true;
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
  // #3 (launch feedback): step 2 of the round — receipts for what was just
  // recorded. A mid-flow step: the money rail navigates it, not the menus.
  { href: "/money/issue", icon: Receipt, bm: "Resit pusingan ini", zh: "开收据（这一轮）", en: "This round's receipts", railOnly: true },
  // Stage E: spending + the claim flow — the row J's 錢-group list reserved.
  { href: "/money/expenses", icon: CreditCard, bm: "Rekod perbelanjaan & tuntutan", zh: "记开支与报销", en: "Spending & claims" },
  // 97 §5 (J 8/30 拍板): "Manage receipts" left the sidebar — railOnly, so
  // the menus render no row but the money group still lights when you are
  // there. Its doors: one tap from Receipt history's header, and the round's
  // own issue page links it. Route, register, fences, counters untouched.
  { href: "/money/receipts", icon: Receipt, bm: "Urus resit", zh: "开收据 · 管理", en: "Manage receipts", railOnly: true },
  // 97 §4 (J 8/30 拍板): three rows LEFT the sidebar — every route stays.
  //   * /money/custody (Hand over cash): row hidden; the custody engine,
  //     tests and page are untouched. Direction in DECISIONS D50: custody
  //     becomes a hand-over state ON the income records, not its own page.
  //   * /money/balance (Current funds): merged — the card (eye and all, D31;
  //     the no-piggy-bank iconography rule lives in that card's file now)
  //     sits at the top of /money/report, and the route redirects there.
  //   * /orgs (Organisations & branches): row hidden; its doors are the
  //     avatar menu's org row, /settings/general's two links, /more's header
  //     link and every empty state — the create-org guided flow
  //     (/orgs/new → /constitution → /orgs/welcome) never used the sidebar.
  // Stage F: the financial statement — computed, never typed.
  { href: "/money/report", icon: BarChart3, bm: "Penyata kewangan", zh: "财报", en: "Financial statement" },
  { href: "/money/history", icon: ClipboardList, bm: "Sejarah resit", zh: "收据历史", en: "Receipt history" },
  // The calendar: the society's OWN activities (plus statutory deadlines as
  // reminders). J's launch feedback #7 (2026-08-27 evening): it is not a
  // filing tool, so it does not live in the 申报 group.
  { href: "/calendar", icon: CalendarClock, bm: "Kalendar & peringatan", zh: "日历与提醒", en: "Calendar & reminders" },
  { href: "/filings", icon: FileCheck, bm: "Pemfailan eROSES", zh: "eROSES 申报", en: "eROSES filings" },
  // The organisation's own facts. 97 §3(d): the "All clauses" sidebar row is
  // gone — /constitution's own "whole book" block carries the same search
  // and list now. The /constitution/clauses ROUTE stays (AI answers cite
  // clauses by linking there); dropping `exact` lets it light this row.
  { href: "/constitution", icon: ScrollText, bm: "Perlembagaan", zh: "章程", en: "Constitution" },
  { href: "/members", icon: Users, bm: "Ahli", zh: "成员", en: "Members" },
  { href: "/inbox", icon: Upload, bm: "Gambar asal", zh: "原始照片", en: "Original photos" },
  { href: "/history", icon: History, bm: "Sejarah", zh: "历史", en: "History" },
  // e-Invois: optional (org switch, default off). The >RM10,000 individual
  // e-invois warning inside the money pages stays regardless of this flag.
  { href: "/money/einvois", icon: Banknote, bm: "Fail cukai (e-Invois)", zh: "税务文件（e-Invois）", en: "Tax file (e-Invois)", einvoisOnly: true, beta: true },
  // THE SETTINGS FAMILY (violet redesign §7.2, 8/27 下午 — supersedes the
  // morning's four-page split): /settings redirects to /settings/display;
  // thirteen directly-linkable screens behind a sub-sidebar.
  { href: "/settings", icon: Settings, bm: "Tetapan", zh: "设置", en: "Settings", exact: true },
  { href: "/settings/profile", icon: UserRound, bm: "Profil saya", zh: "我的账号", en: "My profile" },
  { href: "/settings/display", icon: Palette, bm: "Paparan & bahasa", zh: "显示与语言", en: "Display & language" },
  { href: "/settings/security", icon: Lock, bm: "Kata laluan & keselamatan", zh: "密码与安全", en: "Password & security" },
  { href: "/settings/general", icon: Building2, bm: "Pertubuhan", zh: "机构", en: "Organisation" },
  // 100 §5 (J 8/31 pointed at the screenshot): tucked away — railOnly, so
  // menus skip it while the page, its URL and every invite code keep working.
  // The door is on /members ("invite codes & sign-ins →").
  { href: "/settings/members", icon: Users, bm: "Ahli & jemputan", zh: "成员与邀请", en: "Members & invites", railOnly: true },
  { href: "/settings/receipts", icon: Receipt, bm: "Nombor resit", zh: "收据字号", en: "Receipt numbers" },
  { href: "/settings/glossary", icon: Languages, bm: "Perkataan kami", zh: "我们的词库", en: "Our words" },
  { href: "/settings/einvois", icon: Banknote, bm: "e-Invois (LHDN)", zh: "e-Invois（LHDN）", en: "e-Invois (LHDN)", einvoisOperatorOnly: true, beta: true },
  { href: "/settings/ai", icon: Sparkles, bm: "Penggunaan AI", zh: "AI 用量", en: "AI usage" },
  { href: "/settings/plan", icon: Gauge, bm: "Pelan & langganan", zh: "方案与订阅", en: "Plan & subscription" },
  { href: "/settings/system", icon: Activity, bm: "Semakan sistem", zh: "系统检查", en: "System check" },
  { href: "/settings/feedback", icon: MessageSquare, bm: "Maklum balas", zh: "反馈", en: "Feedback" },
  { href: "/settings/danger", icon: TriangleAlert, bm: "Zon bahaya", zh: "危险区", en: "Danger zone" },
  // G-4 (8/26): back in the menus — the pack builds from the REAL roster now.
  // Spelled out, no bare abbreviation (G-4).
  // 100 §5 (J 8/31): tucked away until the roster has real data and the
  // agent is live — railOnly, so menus skip it while the page, its URL and
  // every feature keep working. The door is on /filings/eroses (a quiet
  // footer row beside the laporan one).
  { href: "/agm-pack", icon: Landmark, bm: "Pek Mesyuarat Agung (AGM)", zh: "常年大会文件包", en: "AGM pack", railOnly: true },
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
      byHref("/money/issue"),
      byHref("/money/expenses"),
      byHref("/money/receipts"),
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
      byHref("/members"),
      byHref("/inbox"),
      byHref("/history"),
      byHref("/money/einvois"),
      // The whole settings family (§7.2) — reached from /more's Settings
      // entry; listed here so the coverage guard knows the phone can reach
      // every one of them.
      byHref("/settings"),
      byHref("/settings/profile"),
      byHref("/settings/display"),
      byHref("/settings/security"),
      byHref("/settings/general"),
      byHref("/settings/members"),
      byHref("/settings/receipts"),
      byHref("/settings/glossary"),
      byHref("/settings/einvois"),
      byHref("/settings/ai"),
      byHref("/settings/plan"),
      byHref("/settings/system"),
      byHref("/settings/feedback"),
      byHref("/settings/danger"),
    ],
  },
];

/**
 * THE DESKTOP's layout (B-1, J 8/26 #3, 拍板④; amended by 拍板 30 on 8/27) —
 * and the layout the /more page shows. Home and the calendar are top-level
 * rows; the six groups are COLLAPSIBLE headers (default open, remembered per
 * device — shell.tsx owns that state). The 錢 rows are the ones J listed by
 * name; /money/expenses joined when its real page landed (Stage E) and
 * /money/report joins with Stage F — a menu row pointing at a stub would be a
 * dressed-up dead link.
 */
export const SIDEBAR_NAV: NavEntry[] = [
  { kind: "item", item: byHref("/") },
  // J's launch feedback #7 (overturns §1-9's "back into 申报"): the calendar
  // is the society's own activities, not a filing chore — a top-level row.
  // With the groups now closed-by-default dropdowns (#2), a lone row no
  // longer clashes with the column.
  { kind: "item", item: byHref("/calendar") },
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
      byHref("/money/issue"),
      byHref("/money/expenses"),
      byHref("/money/receipts"),
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
    children: [byHref("/filings"), byHref("/agm-pack")],
  },
  {
    kind: "group",
    id: "organisation",
    icon: Building2,
    bm: "Pertubuhan",
    zh: "组织",
    en: "Organisation",
    // "Our words" moved to /settings/glossary (§3.2 — one route, one entry).
    children: [byHref("/members"), byHref("/constitution")],
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
];

/**
 * THE SETTINGS SUB-SIDEBAR (violet redesign §7.2): four groups, thirteen
 * directly-linkable screens. Rendered by settings/layout.tsx as a second
 * column ≥1024px and a horizontal tab strip below.
 */
export const SETTINGS_SUBNAV: {
  id: string;
  bm: string;
  zh: string;
  en: string;
  children: NavItem[];
}[] = [
  {
    id: "account",
    bm: "Akaun",
    zh: "账号",
    en: "Account",
    children: [
      byHref("/settings/profile"),
      byHref("/settings/display"),
      byHref("/settings/security"),
    ],
  },
  {
    id: "organisation",
    bm: "Pertubuhan",
    zh: "机构",
    en: "Organisation",
    children: [
      byHref("/settings/general"),
      byHref("/settings/members"),
      byHref("/settings/receipts"),
      byHref("/settings/glossary"),
      byHref("/settings/einvois"),
    ],
  },
  {
    id: "usage",
    bm: "Penggunaan",
    zh: "用量",
    en: "Usage",
    children: [byHref("/settings/ai"), byHref("/settings/plan")],
  },
  {
    id: "system",
    bm: "Sistem",
    zh: "系统",
    en: "System",
    children: [
      byHref("/settings/system"),
      byHref("/settings/feedback"),
      byHref("/settings/danger"),
    ],
  },
];

/**
 * THE SETTINGS FAMILY, flat (§3.2/§7): settings screens left the scrolling
 * rail — the rail pins ONE Settings entry at its bottom, and these pages
 * live in the settings sub-sidebar. Still part of the coverage guard: a
 * page may live on the rail OR here, never nowhere.
 */
export const SETTINGS_NAV: NavItem[] = [
  byHref("/settings"),
  ...SETTINGS_SUBNAV.flatMap((g) => g.children),
];

/** Every page the phone nav links to, groups flattened. */
export function navPages(): NavItem[] {
  return PRIMARY_NAV.flatMap((entry) =>
    entry.kind === "item" ? [entry.item] : entry.children,
  );
}

/** Every page the desktop rail links to, groups flattened — INCLUDING the
 *  settings family (pinned Settings entry + the settings sub-sidebar), so
 *  the coverage guard still sees one desktop surface. */
export function sidebarPages(): NavItem[] {
  return [
    ...SIDEBAR_NAV.flatMap((entry) =>
      entry.kind === "item" ? [entry.item] : entry.children,
    ),
    ...SETTINGS_NAV,
  ];
}

/** D49: the two e-Invois predicates a menu needs, resolved by the provider. */
export type EinvoisGate = {
  /** operator AND the org switch — gates the working e-Invois pages. */
  visible: boolean;
  /** operator alone — gates the Settings row that holds the switch. */
  operator: boolean;
};

/**
 * What a MENU actually renders for a group: rail-only steps are skipped
 * (their navigation is the section's tab rail), and e-Invois obeys the org
 * switch AND the D49 beta gate. One function, used by the desktop sidebar and
 * the /more page, so the two menus cannot disagree about what exists.
 */
export function visibleGroupChildren(
  entry: NavEntry,
  einvois: EinvoisGate,
): NavItem[] {
  if (entry.kind !== "group") return [];
  return entry.children.filter(
    (c) =>
      !c.railOnly &&
      (!c.einvoisOnly || einvois.visible) &&
      (!c.einvoisOperatorOnly || einvois.operator),
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
