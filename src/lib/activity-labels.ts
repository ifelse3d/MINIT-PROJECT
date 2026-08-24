// ---------------------------------------------------------------------------
// Shared display vocabulary for activity records — used by BOTH the /calendar
// grid (dots, day panel, hover cards) and the /history feed, so the two pages
// never describe the same record differently. Pure data, no JSX, no I/O.
// ---------------------------------------------------------------------------

import type { Urgency } from "./deadlines";
import type { ActivityCategory } from "./history";

export const CATEGORY_STYLE: Record<
  ActivityCategory,
  { dot: string; ring: string; bm: string; zh: string; en: string; future: boolean }
> = {
  // 2026-07-28 AUDIT — terminology consistency.
  // These labels must match src/components/nav-items.ts exactly, because the
  // same concept appeared under different words on different screens. Three
  // were wrong:
  //   * filings.bm was "Failing" — NOT a Malay word. A Malay speaker read it as
  //     the English word "failing". The app's own correct term is "Pemfailan".
  //   * money.zh was 钱款 here but 财务 in the nav — two Chinese words for one
  //     section, so the nav and the history badge disagreed.
  //   * qa.zh was 章程问答, which is ALSO the /constitution page heading, so one
  //     Chinese string named two different things.
  // If you add a category, add it to nav-items.ts too, with the same words.
  minutes: { dot: "bg-violet-500", ring: "", bm: "Minit", zh: "会议记录", en: "Minutes", future: false },
  money: { dot: "bg-green-600", ring: "", bm: "Wang", zh: "钱", en: "Money", future: false },
  filings: { dot: "bg-blue-500", ring: "", bm: "Pemfailan eROSES", zh: "eROSES 申报", en: "eROSES filings", future: false },
  uploads: { dot: "bg-amber-500", ring: "", bm: "Gambar asal", zh: "原始照片", en: "Original photos", future: false },
  agm: { dot: "bg-indigo-500", ring: "", bm: "Pek AGM", zh: "年度大会", en: "AGM", future: false },
  constitution: { dot: "bg-teal-600", ring: "", bm: "Perlembagaan", zh: "章程", en: "Constitution", future: false },
  calendar: { dot: "bg-sky-500", ring: "", bm: "Kalendar", zh: "日历", en: "Calendar", future: false },
  qa: { dot: "bg-rose-500", ring: "", bm: "Soal jawab", zh: "提问与回答", en: "Q&A", future: false },
  deadline: { dot: "", ring: "border-red-500", bm: "Tarikh akhir", zh: "截止", en: "Deadline", future: true },
  event: { dot: "", ring: "border-sky-500", bm: "Acara", zh: "活动", en: "Event", future: true },
};

/** Deadline urgency badge — shared by the home dashboard, the /calendar
 *  sidebar and the /calendar grid so a deadline never changes colour or
 *  wording between pages. */
export const URGENCY_BADGE: Record<
  Urgency,
  { cls: string; bm: string; zh: string; en: string; icon: string }
> = {
  overdue: { cls: "border-red-400 bg-red-100 text-red-900", bm: "LEWAT", zh: "已逾期", en: "overdue", icon: "🔴" },
  due_soon: { cls: "border-amber-400 bg-amber-100 text-amber-900", bm: "HAMPIR", zh: "快到期", en: "due soon", icon: "🟡" },
  ok: { cls: "border-green-400 bg-green-100 text-green-900", bm: "OK", zh: "还早", en: "on track", icon: "🟢" },
  done: { cls: "bg-muted text-muted-foreground", bm: "SELESAI", zh: "已完成", en: "done", icon: "✅" },
};

/** Card border/background tint matching URGENCY_BADGE. */
export const URGENCY_CARD: Record<Urgency, string> = {
  overdue: "border-red-400 bg-red-50",
  due_soon: "border-amber-400 bg-amber-50",
  ok: "border-green-300 bg-green-50",
  done: "border-muted bg-muted/30",
};

/** Bullet wording per (category/kind) group — count is spliced in. */
export const LINE_TEXT: Record<string, (n: number) => { bm: string; zh: string; en: string }> = {
  "minutes/minutes": (n) => ({
    bm: n === 1 ? "Minit mesyuarat disahkan" : `${n} minit mesyuarat disahkan`,
    zh: `${n} 份会议记录已确认`,
    en: `${n} minutes document${n === 1 ? "" : "s"} confirmed`,
  }),
  "money/receipt": (n) => ({
    bm: `${n} resit dikeluarkan`,
    zh: `开出 ${n} 张收据`,
    en: `${n} receipt${n === 1 ? "" : "s"} issued`,
  }),
  "money/donation": (n) => ({
    bm: `${n} derma direkod (belum ada resit)`,
    zh: `记录 ${n} 笔捐款（未开收据）`,
    en: `${n} donation${n === 1 ? "" : "s"} recorded (no receipt yet)`,
  }),
  "money/expense": (n) => ({
    bm: `${n} perbelanjaan direkod`,
    zh: `记录 ${n} 笔开销`,
    en: `${n} expense${n === 1 ? "" : "s"} recorded`,
  }),
  "money/remittance": (n) => ({
    bm: `${n} penyerahan wang ke HQ`,
    zh: `${n} 次上缴总部`,
    en: `${n} remittance batch${n === 1 ? "" : "es"} to HQ`,
  }),
  "filings/einvois": (n) => ({
    bm: `${n} pek e-Invois dijana`,
    zh: `生成 ${n} 份 e-Invois 汇总包`,
    en: `${n} e-Invois pack${n === 1 ? "" : "s"} generated`,
  }),
  "filings/paste_pack": (n) => ({
    bm: `${n} pek eROSES disediakan`,
    zh: `准备 ${n} 份 eROSES 粘贴包`,
    en: `${n} eROSES paste-pack${n === 1 ? "" : "s"} prepared`,
  }),
  "uploads/upload": (n) => ({
    bm: `${n} muat naik diproses`,
    zh: `处理 ${n} 个上传`,
    en: `${n} upload${n === 1 ? "" : "s"} processed`,
  }),
  "agm/agm": (n) => ({
    bm: n === 1 ? "Mesyuarat Agung diadakan" : `${n} Mesyuarat Agung diadakan`,
    zh: `召开 ${n} 场年度大会`,
    en: `${n} AGM${n === 1 ? "" : "s"} held`,
  }),
  "constitution/constitution": (n) => ({
    bm: `${n} perlembagaan dimasukkan`,
    zh: `导入 ${n} 份章程`,
    en: `${n} constitution${n === 1 ? "" : "s"} ingested`,
  }),
  "calendar/event": (n) => ({
    bm: `${n} acara diadakan`,
    zh: `举办 ${n} 项活动`,
    en: `${n} event${n === 1 ? "" : "s"} held`,
  }),
  "qa/qa": (n) => ({
    bm: `${n} soalan perlembagaan dijawab`,
    zh: `回答 ${n} 个章程问题`,
    en: `${n} constitution question${n === 1 ? "" : "s"} answered`,
  }),
};
