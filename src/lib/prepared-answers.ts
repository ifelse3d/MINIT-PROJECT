// ---------------------------------------------------------------------------
// PREPARED ANSWERS — the free layer in front of the assistant (work order 82
// K1, J's 8/30 call). Navigation and fixed-knowledge questions ("where do I
// make receipts", "what is e-Invois") are answered from THIS list: zero AI
// calls, zero quota. Only what the list cannot answer goes to the model.
// The Q&A form of the standing rule 能用程式解析的，不要送去 AI.
//
// CONSERVATIVE ON PURPOSE. A free-typed question only matches when the topic
// AND the intent are both unmistakable; anything with trouble-words ("salah",
// "错", "why", "delete"…) or real length goes to the model — 寧可花錢也不要答錯
// (61 §1-6 ②). Latin phrases match on WORD BOUNDARIES so "cek" can never fire
// inside "kecekapan" (the work order 69 mis-hit, pinned in tests here too).
//
// THE DEEP-LINK BUTTONS COME FROM THE EXISTING WHITELISTS (ask-routes.ts) —
// never a hand-typed href. That is the dead-button lesson: a route that only
// exists in prose is a button that goes nowhere.
//
// Pure logic: no I/O, no React. The UI (ai-panel.tsx, ask-box.tsx) calls
// matchPreparedAnswer() before /api/chat and renders the hit itself.
// ---------------------------------------------------------------------------

import {
  ASK_ACTION_ROUTES,
  ASK_ROUTES,
  isAskActionKey,
  withAiMarker,
  type AskActionKey,
  type AskRouteKey,
} from "@/lib/ask-routes";
import type { LangKey } from "@/lib/lang";

export type PreparedAnswer = {
  id: string;
  /** Where the button lands — a key into the EXISTING route whitelists. */
  route: AskRouteKey | AskActionKey;
  answer: { bm: string; zh: string; en: string };
  /** Per language: a question matches when EVERY `all` phrase appears and at
   *  least one phrase from EACH `any` group appears. */
  patterns: Record<LangKey, Pattern[]>;
};

export type Pattern = {
  all?: string[];
  any?: string[][];
};

export type PreparedHit = {
  entry: PreparedAnswer;
  /** Language of the matched pattern = the language the answer is given in
   *  (the same "answer follows the question" rule the model is under, K4). */
  lang: LangKey;
};

/** Shown under every prepared answer (61 §1-6 ④): honest about being free. */
export const PREPARED_FREE_NOTE = {
  bm: "Jawapan terus daripada sistem — kuota AI tidak digunakan.",
  zh: "系统直接回答，不扣 AI 用量。",
  en: "Answered directly by the system — no AI allowance used.",
};

/**
 * The "Try asking" chips, shared by the floating panel and the home box.
 * Living HERE is the guarantee of 61 §1-6 ①: every chip is a question this
 * file answers for free — the test pins each one, in all three languages.
 */
export const SUGGESTED_QUESTIONS = [
  {
    bm: "Bila saya kena hantar Penyata Tahunan?",
    zh: "年度呈报什么时候要交？",
    en: "When do I file the Annual Return?",
  },
  {
    bm: "Di mana saya buat resit?",
    zh: "在哪里做收据？",
    en: "Where do I make receipts?",
  },
  // D49: the e-Invois chip belongs to the beta — marked so the two chat
  // surfaces can drop it behind the gate (a chip must NEVER cost quota, and
  // with the entry gated off this one would go to the model).
  { bm: "Apa itu e-Invois?", zh: "e-Invois 是什么？", en: "What is e-Invois?", einvois: true },
];

/** D49: the chips a given session may see. Chips and the prepared layer obey
 *  the SAME gate — every chip shown must still be answered for free. */
export function suggestedQuestionsFor(einvois: boolean) {
  return SUGGESTED_QUESTIONS.filter((q) => einvois || !("einvois" in q));
}

// --- matching ---------------------------------------------------------------

const CJK_RE = /[㐀-鿿豈-﫿]/;

/**
 * Lowercase, canonicalise the e-Invois spellings, turn punctuation into
 * spaces. CJK characters survive untouched.
 */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/e[\s\-‑–—]?invois/g, "einvois")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-boundary containment for Latin phrases; substring for CJK phrases. */
function hasPhrase(normalized: string, phrase: string): boolean {
  if (CJK_RE.test(phrase)) return normalized.includes(phrase);
  return ` ${normalized} `.includes(` ${phrase} `);
}

function patternMatches(normalized: string, p: Pattern): boolean {
  for (const phrase of p.all ?? []) {
    if (!hasPhrase(normalized, phrase)) return false;
  }
  for (const group of p.any ?? []) {
    if (!group.some((phrase) => hasPhrase(normalized, phrase))) return false;
  }
  return (p.all?.length ?? 0) > 0 || (p.any?.length ?? 0) > 0;
}

/**
 * Words that mean "something specific went wrong / is being undone" — those
 * questions are never navigation, so the model (which can look at their real
 * records) answers them. Checked before any entry.
 */
const TROUBLE_WORDS = [
  // BM
  "salah", "silap", "gagal", "tak boleh", "tidak boleh", "kenapa", "mengapa",
  "padam", "batal", "masalah", "rosak", "hilang",
  // zh (simplified + the traditional forms our testers actually type)
  "错", "錯", "坏", "壞", "不行", "失败", "失敗", "删", "刪", "为什么", "為什麼",
  "问题", "問題", "不见", "不見", "取消",
  // EN — NOT the bare word "fail": in Malay "fail" IS the word for a file
  // ("macam mana nak upload fail"), and blocking it would kill the K6 answer.
  "wrong", "error", "failed", "fails", "cannot", "can t", "cant", "delete",
  "cancel", "why", "problem", "broken", "missing", "not working",
];

/** Questions longer than this are too specific for a canned answer. */
const MAX_PREPARED_QUESTION_CHARS = 120;

// --- the list ---------------------------------------------------------------
//
// ③ (61 §1-6): the page references are the CURRENT doors — /filings is a 308
// to /filings/eroses since work order 78, and the answers describe the three
// cards that really sit there. Anyone editing an answer: walk the path first.

export const PREPARED_ANSWERS: PreparedAnswer[] = [
  {
    id: "annual_return",
    route: "filings",
    answer: {
      bm: "Penyata Tahunan dihantar di portal eROSES kerajaan — MinitAI menyediakan maklumat untuk anda salin, langkah demi langkah. Tarikh akhir boleh dilihat pada kad “Tarikh akhir” di halaman yang sama. Tekan butang di bawah untuk ke sana.",
      zh: "年度呈报（Penyata Tahunan）要在政府的 eROSES 网站提交 —— MinitAI 会把要贴的资料一步一步整理好给您复制。截止日期在同一页的「截止日」卡里看得到。按下面的按钮就到。",
      en: "The Annual Return is filed on the government's eROSES portal — MinitAI prepares what to paste, step by step. The deadlines are on the “Deadlines” card on the same page. Tap the button below to go there.",
    },
    patterns: {
      // Topic + a question word. The bare topic is NOT enough on purpose:
      // "penyata tahunan dah hantar ke belum?" is a question about THEIR
      // records — the model (with tarikh_akhir) answers that, not this list.
      bm: [{ all: ["penyata tahunan"], any: [["bila", "macam mana", "bagaimana", "apa", "mana"]] }],
      zh: [
        {
          any: [
            ["年度呈报", "年度呈報"],
            ["什么时候", "什麼時候", "几时", "幾時", "怎么", "怎麼", "如何", "是什么", "是什麼", "在哪", "哪里", "哪裡"],
          ],
        },
      ],
      en: [{ all: ["annual return"], any: [["when", "how", "what", "where"]] }],
    },
  },
  {
    id: "where_receipts",
    route: "money_receipts",
    answer: {
      bm: "Resit bernombor dibuat di bahagian Wang: sahkan dahulu rekod derma, kemudian keluarkan resit di halaman resit. Tekan butang di bawah untuk terus ke sana.",
      zh: "编号收据在「财务」区开：先把捐款记录确认好，再到开收据页按「开收据」。按下面的按钮直接到那一页。",
      en: "Numbered receipts are issued in the Money section: confirm the donation records first, then issue them on the receipts page. Tap the button below to go straight there.",
    },
    patterns: {
      bm: [{ all: ["resit"], any: [["mana", "buat", "bagaimana", "keluarkan"]] }],
      zh: [
        {
          any: [
            ["收据", "收據"],
            ["哪里", "哪裡", "在哪", "怎么", "怎麼", "如何", "开", "開"],
          ],
        },
      ],
      en: [{ any: [["receipt", "receipts"], ["where", "how", "make", "issue"]] }],
    },
  },
  {
    id: "what_is_einvois",
    route: "money_einvois",
    answer: {
      bm: "e-Invois ialah sistem invois elektronik LHDN. Kebiasaannya pertubuhan menyatukan rekod hujung bulan menjadi satu fail untuk dimuat naik ke MyInvois. MinitAI boleh jana fail itu untuk anda — tekan butang di bawah.",
      zh: "e-Invois 是马来西亚税务局（LHDN）的电子发票制度。社团一般在月底把收入整理成一份汇总文件，自己上传到 MyInvois。MinitAI 可以帮您生成这份文件 —— 按下面的按钮。",
      en: "e-Invois is LHDN's electronic invoicing system. Societies usually consolidate the month's records into one file and upload it to MyInvois. MinitAI can generate that file for you — tap the button below.",
    },
    patterns: {
      bm: [{ all: ["einvois"], any: [["apa", "apakah"]] }],
      zh: [{ all: ["einvois"], any: [["是什么", "是什麼", "什么是", "什麼是", "是啥"]] }],
      en: [{ all: ["einvois"], any: [["what"]] }],
    },
  },
  {
    id: "make_einvois",
    route: "money_einvois",
    answer: {
      bm: "Fail e-Invois hujung bulan dijana di halaman Wang → e-Invois: pilih bulan, jana fail, kemudian muat naik sendiri ke portal MyInvois. Tekan butang di bawah untuk ke sana.",
      zh: "月底的 e-Invois 上传文件在「财务 → e-Invois」页生成：选好月份、按生成，MinitAI 做出官方格式的文件，您再自己上传到 MyInvois。按下面的按钮就到。",
      en: "The month-end e-Invois upload file is generated on Money → e-Invois: pick the month, generate the file, then upload it to the MyInvois portal yourself. Tap the button below to go there.",
    },
    patterns: {
      bm: [{ all: ["einvois"], any: [["jana", "buat", "hantar", "sediakan"]] }],
      zh: [{ all: ["einvois"], any: [["生成", "怎么做", "怎麼做", "上传", "上傳", "导出", "匯出", "汇出"]] }],
      en: [{ all: ["einvois"], any: [["generate", "make", "create", "upload", "prepare"]] }],
    },
  },
  {
    id: "where_calendar",
    route: "calendar",
    answer: {
      bm: "Kalendar ada di halaman Kalendar: tarikh akhir pematuhan dan acara pertubuhan semuanya di situ. Tekan butang di bawah untuk membukanya.",
      zh: "日历在「日历」页：合规截止日期和机构的活动都在那里。按下面的按钮直接打开。",
      en: "The calendar is on the Calendar page: compliance deadlines and the organisation's events all live there. Tap the button below to open it.",
    },
    patterns: {
      bm: [{ all: ["kalendar"], any: [["mana", "buka"]] }],
      zh: [
        { any: [["日历", "日曆"], ["哪里", "哪裡", "在哪", "哪儿", "哪兒", "怎么看", "怎麼看"]] },
        { all: ["calendar"], any: [["在哪", "哪里", "哪裡"]] },
      ],
      en: [{ all: ["calendar"], any: [["where", "open", "find"]] }],
    },
  },
  {
    id: "where_minutes",
    route: "minutes",
    answer: {
      bm: "Minit mesyuarat dibuat di halaman Minit: ambil gambar nota mesyuarat, MinitAI merangka draf, anda semak dan sahkan, kemudian jana PDF rasmi. Tekan butang di bawah.",
      zh: "会议记录在「会议记录」页做：拍下笔记的照片，MinitAI 起草，您核对确认后就能生成正式 PDF。按下面的按钮就到。",
      en: "Meeting minutes are made on the Minutes page: photograph your notes, MinitAI drafts them, you check and confirm, then generate the official PDF. Tap the button below.",
    },
    patterns: {
      bm: [{ all: ["minit mesyuarat"], any: [["mana", "buat", "bagaimana"]] }],
      zh: [{ any: [["会议记录", "會議記錄"], ["哪里", "哪裡", "在哪", "怎么做", "怎麼做", "怎么写", "怎麼寫"]] }],
      en: [{ all: ["meeting minutes"], any: [["where", "how", "make", "write"]] }],
    },
  },
  {
    id: "what_is_eroses",
    route: "filings",
    answer: {
      bm: "eROSES ialah sistem dalam talian Jabatan Pendaftaran Pertubuhan (ROS) — penyata tahunan dan pendaftaran mesyuarat dibuat di situ. MinitAI menyediakan maklumat untuk anda salin-tampal. Tekan butang di bawah untuk melihat caranya.",
      zh: "eROSES 是马来西亚社团注册局（ROS）的线上系统，社团的年度呈报、会议登记都在那里办。MinitAI 会把要填的资料整理好让您复制粘贴。按下面的按钮看怎么用。",
      en: "eROSES is the online system of the Registry of Societies (ROS) — the annual return and meeting registrations are done there. MinitAI prepares the details for you to copy-paste. Tap the button below to see how.",
    },
    patterns: {
      bm: [{ all: ["eroses"], any: [["apa", "apakah"]] }],
      zh: [{ all: ["eroses"], any: [["是什么", "是什麼", "什么是", "什麼是"]] }],
      en: [{ all: ["eroses"], any: [["what"]] }],
    },
  },
  {
    // K6 (82 §7): file intent in the chat = point at the door, never open one
    // here. The chat takes no uploads (Hard Rule 11 — one door, on the home
    // page); this answer walks them there.
    id: "upload_file",
    route: "home",
    answer: {
      bm: "Perbualan ini tidak menerima fail. Untuk MinitAI membaca dokumen anda, guna kotak muat naik di halaman Utama — gambar, PDF dan fail Office semuanya boleh, dan MinitAI akan cam sendiri dokumen apa itu. Tekan butang di bawah.",
      zh: "这个对话框收不了文件。要让 MinitAI 读文件，请用主页的上传框 —— 照片、PDF、Office 文件都可以，MinitAI 会自己认出是什么文件。按下面的按钮回主页。",
      en: "This chat cannot take files. To have MinitAI read a document, use the upload box on the Home page — photos, PDFs and Office files all work, and MinitAI works out what the document is by itself. Tap the button below.",
    },
    patterns: {
      bm: [
        {
          any: [
            ["fail", "gambar", "dokumen", "pdf", "foto"],
            ["hantar", "muat naik", "upload", "bagi", "beri", "ada"],
          ],
        },
      ],
      zh: [
        {
          any: [
            ["文件", "档案", "檔案", "照片", "图片", "圖片", "pdf"],
            ["上传", "上傳", "传给", "傳給", "怎么传", "怎麼傳", "丢", "丟", "我有", "可以放", "可以给", "可以給"],
          ],
        },
      ],
      en: [
        { any: [["upload", "attach", "attachment"]] },
        { all: ["i have a"], any: [["pdf", "photo", "document", "file", "picture"]] },
        { all: ["can i send"], any: [["pdf", "photo", "document", "file", "picture"]] },
      ],
    },
  },
];

// --- the matcher ------------------------------------------------------------

/**
 * The free layer's one question: can THIS be answered without the model?
 * Null means "not sure" — and not sure goes to the model, always.
 */
export function matchPreparedAnswer(
  question: string,
  opts?: {
    /**
     * D49 (work order 94): may THIS session see e-Invois? Defaults to true so
     * the pure matcher stays policy-free; the two chat surfaces pass the real
     * gate. When false the e-Invois entries are skipped — their answers point
     * at pages that 404 behind the beta gate, and a prepared answer with a
     * dead button is worse than letting the model answer generically.
     */
    einvois?: boolean;
  },
): PreparedHit | null {
  const einvoisOk = opts?.einvois ?? true;
  const trimmed = question.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PREPARED_QUESTION_CHARS) {
    return null;
  }
  const normalized = normalizeQuestion(trimmed);
  if (normalized === "") return null;
  for (const w of TROUBLE_WORDS) {
    if (hasPhrase(normalized, w)) return null;
  }
  for (const entry of PREPARED_ANSWERS) {
    if (!einvoisOk && entry.route === "money_einvois") continue;
    const matched: LangKey[] = [];
    for (const lang of ["bm", "zh", "en"] as const) {
      if (entry.patterns[lang].some((p) => patternMatches(normalized, p))) {
        matched.push(lang);
      }
    }
    if (matched.length === 0) continue;
    // Answer language = question language. When several languages matched
    // (the tri-joined "all" interface mode, or a mixed question), CJK in the
    // question means the person reads Chinese; otherwise BM outranks EN
    // (official society language).
    const lang: LangKey =
      matched.includes("zh") && CJK_RE.test(question)
        ? "zh"
        : matched.includes("bm")
          ? "bm"
          : matched[0];
    return { entry, lang };
  }
  return null;
}

/** The deep-link button for a hit — hrefs only ever from the whitelists. */
export function preparedButtonFor(entry: PreparedAnswer): {
  href: string;
  bm: string;
  zh: string;
  en: string;
} {
  const r = isAskActionKey(entry.route)
    ? ASK_ACTION_ROUTES[entry.route]
    : ASK_ROUTES[entry.route as AskRouteKey];
  return { href: withAiMarker(r.href), bm: r.bm, zh: r.zh, en: r.en };
}
