// The nine portal steps, by the portal's own BM names — shared by the client
// rail AND the server step pages. Plain module on purpose: a non-component
// export of a "use client" file is a client REFERENCE on the server (it
// arrives as undefined-ish, not as the array) — this file has no directive
// so both sides import the real thing.

export const LANGKAH = [
  { n: 1, bm: "Mesyuarat", zh: "会议", en: "Meeting" },
  { n: 2, bm: "Maklumat Am", zh: "基本资料", en: "General info" },
  { n: 3, bm: "Maklumat AJK", zh: "理事资料", en: "Committee" },
  { n: 4, bm: "Maklumat Juruaudit", zh: "审计员", en: "Auditors" },
  { n: 5, bm: "Penyata Kewangan", zh: "财务报表", en: "Finances" },
  { n: 6, bm: "Laporan Aktiviti", zh: "活动报告", en: "Activity report" },
  { n: 7, bm: "Sumbangan Dari/Ke Luar Negara", zh: "国外捐款", en: "Foreign contributions" },
  { n: 8, bm: "Paparan", zh: "预览", en: "Preview" },
  { n: 9, bm: "Pengakuan", zh: "宣誓送出", en: "Declaration" },
] as const;
