// ---------------------------------------------------------------------------
// "TANYA MINIT" — static route map (Phase 7.5b). Navigation questions
// ("where do I make receipts?") are answered from THIS list — the classifier
// only picks a key, so a navigation answer costs one cheap classify call and
// can never invent a page. Pure data: no I/O, unit-tested for completeness
// against the CLAUDE.md folder conventions.
// ---------------------------------------------------------------------------

export type AskRouteKey =
  | "home"
  | "inbox"
  | "minutes"
  | "filings"
  | "money"
  | "agm_pack"
  | "constitution"
  | "orgs"
  | "calendar"
  | "history"
  | "settings";

export type AskRoute = {
  href: string;
  /** What lives on this page — shown as the navigation answer. */
  bm: string;
  zh: string;
  en: string;
};

export const ASK_ROUTES: Record<AskRouteKey, AskRoute> = {
  home: {
    href: "/",
    bm: "Utama: ambil gambar dokumen, dan lihat tarikh akhir yang akan datang.",
    zh: "主页：拍摄文件，查看即将到期的事项。",
    en: "Home: photograph a document, and see what is due next.",
  },
  inbox: {
    href: "/inbox",
    bm: "Gambar asal: gambar sebenar setiap dokumen yang pernah dibaca oleh MinitAI.",
    zh: "原始照片：MinitAI 读过的每一份文件，那张真正的照片。",
    en: "Original photos: the actual photograph behind every document MinitAI has read.",
  },
  minutes: {
    href: "/minutes",
    bm: "Minit mesyuarat: draf daripada gambar nota, sahkan, jana PDF.",
    zh: "会议记录：从笔记照片起草、确认、生成 PDF。",
    en: "Meeting minutes: drafted from note photos, confirm, generate the PDF.",
  },
  filings: {
    href: "/filings",
    bm: "Penyata Tahunan eROSES: pek salin-tampal untuk difailkan.",
    zh: "eROSES 年度申报：复制粘贴资料包。",
    en: "eROSES Annual Return: the copy-paste pack for filing.",
  },
  money: {
    href: "/money",
    bm: "Wang: daftar derma, resit bernombor, serahan kutipan, pek e-Invois.",
    zh: "财务：捐款登记、编号收据、上缴交接、e-Invois 资料包。",
    en: "Money: donation register, numbered receipts, custody handover, e-Invois pack.",
  },
  agm_pack: {
    href: "/agm-pack",
    bm: "Pek AGM: notis, agenda, kehadiran, borang proksi.",
    zh: "会员大会资料包：通知、议程、出席表、委托书。",
    en: "AGM pack: notice, agenda, attendance sheet, proxy forms.",
  },
  constitution: {
    href: "/constitution",
    bm: "Perlembagaan: tanya soalan, jawapan memetik fasal sebenar.",
    zh: "章程：提问，答案注明真实条款。",
    en: "Constitution: ask questions, answers cite the real clause.",
  },
  orgs: {
    href: "/orgs",
    bm: "Pertubuhan: tukar organisasi aktif, cipta cawangan, urus kredit AI.",
    zh: "组织：切换当前组织、创建分会、管理 AI 额度。",
    en: "Organisations: switch the active org, create branches, manage AI credits.",
  },
  calendar: {
    href: "/calendar",
    bm: "Kalendar: tarikh akhir pematuhan dan acara pertubuhan.",
    zh: "日历：合规截止日期和组织活动。",
    en: "Calendar: compliance deadlines and organisation events.",
  },
  history: {
    href: "/history",
    bm: "Sejarah: semua aktiviti pertubuhan mengikut bulan.",
    zh: "历史：按月查看组织的所有活动。",
    en: "History: all organisation activity by month.",
  },
  settings: {
    href: "/settings",
    bm: "Tetapan: akaun, status cukai, meter penggunaan AI, padam pertubuhan.",
    zh: "设置：账户、税务状态、AI 使用量、删除组织。",
    en: "Settings: account, tax status, AI usage meter, delete organisation.",
  },
};

// ---------------------------------------------------------------------------
// F-6 (work order 31, J's old #16): ACTION deep links. The section map above
// answers "where does X live"; these answer "I want to DO X right now" — the
// button lands on the page with the form on it, not the section front door.
// A separate map on purpose: ask-core.test pins ASK_ROUTES to exactly the
// sidebar's user-facing sections, and these are deeper addresses inside them.
// ---------------------------------------------------------------------------

export type AskActionKey =
  | "calendar_add"
  | "money_receipts"
  | "money_einvois"
  | "money_expenses";

export const ASK_ACTION_ROUTES: Record<AskActionKey, AskRoute> = {
  calendar_add: {
    href: "/calendar/add",
    bm: "Tambah acara ke kalendar pertubuhan.",
    zh: "把活动加进组织日历。",
    en: "Add an event to the organisation calendar.",
  },
  money_receipts: {
    href: "/money/receipts",
    bm: "Keluarkan resit bernombor untuk derma yang disahkan.",
    zh: "为已确认的捐款开出编号收据。",
    en: "Issue numbered receipts for confirmed donations.",
  },
  money_einvois: {
    href: "/money/einvois",
    bm: "Jana fail e-Invois hujung bulan untuk dimuat naik.",
    zh: "生成月底 e-Invois 上传文件。",
    en: "Generate the month-end e-Invois upload file.",
  },
  money_expenses: {
    href: "/money/expenses",
    bm: "Rekod perbelanjaan atau tuntutan sendiri.",
    zh: "记录开支或自己的报销。",
    en: "Record an expense or your own claim.",
  },
};

export const ASK_ACTION_KEYS = Object.keys(ASK_ACTION_ROUTES) as AskActionKey[];

export function isAskActionKey(v: string): v is AskActionKey {
  return (ASK_ACTION_KEYS as string[]).includes(v);
}

/** F-6: mark an href as "the AI sent me here", so the landing page can greet
 *  the person with one orienting line (`<FromAiNote>` reads this). */
export function withAiMarker(href: string): string {
  return href.includes("?") ? `${href}&dari=ai` : `${href}?dari=ai`;
}

export const ASK_ROUTE_KEYS = Object.keys(ASK_ROUTES) as AskRouteKey[];

export function isAskRouteKey(v: string): v is AskRouteKey {
  return (ASK_ROUTE_KEYS as string[]).includes(v);
}

/** One line per route, embedded into the classifier prompt. */
export function routeCatalogueForPrompt(): string {
  return ASK_ROUTE_KEYS.map((k) => `- ${k}: ${ASK_ROUTES[k].en}`).join("\n");
}
