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
    bm: "Arkib muat naik: dokumen yang telah diproses dan gambar asalnya.",
    zh: "上传记录：已处理的文件和原始照片。",
    en: "Upload records: documents already processed, with the original photo.",
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

export const ASK_ROUTE_KEYS = Object.keys(ASK_ROUTES) as AskRouteKey[];

export function isAskRouteKey(v: string): v is AskRouteKey {
  return (ASK_ROUTE_KEYS as string[]).includes(v);
}

/** One line per route, embedded into the classifier prompt. */
export function routeCatalogueForPrompt(): string {
  return ASK_ROUTE_KEYS.map((k) => `- ${k}: ${ASK_ROUTES[k].en}`).join("\n");
}
