// ---------------------------------------------------------------------------
// GOLDEN CASES FOR TOOL CHOICE — which lookup should the assistant reach for?
//
// The tool DESCRIPTIONS in src/lib/ai/org-tools.ts are the highest-leverage
// strings in the assistant: they are the only thing the model has to go on when
// it decides whether "how much did we collect" means the donations table or the
// meeting minutes. Nobody can tell by reading them whether they work. This file
// is how you find out.
//
// The questions are written the way a committee member actually types — Malay,
// Chinese and English, often mixed, often without saying which month they mean.
// A description that only works for a well-formed English question is a
// description that does not work.
//
// PDPA: every name and figure here is FICTIONAL.
// ---------------------------------------------------------------------------

export type ToolChoiceCase = {
  id: string;
  question: string;
  /**
   * The tool that should be called first.
   *
   * `null` means NO tool should be called — the question is about how to use
   * Minit, or is off-topic, and reaching for a lookup would be wrong. Those
   * cases matter as much as the positive ones: a model that calls a tool for
   * every question turns every "hello" into a database query and a vendor call.
   */
  expect: string | null;
  /** Why this case exists, in one line. */
  note: string;
};

export const TOOL_CHOICE_CASES: ToolChoiceCase[] = [
  // --- money -------------------------------------------------------------
  {
    id: "money-01",
    question: "Berapa kita kutip bulan Julai?",
    expect: "cari_derma",
    note: "The plain money question, in Malay. If this fails, nothing else matters.",
  },
  {
    id: "money-02",
    question: "我们七月收了多少钱？",
    expect: "cari_derma",
    note: "Same question in Chinese — most of the pilot's users type this way.",
  },
  {
    id: "money-03",
    question: "how much donation last month ah",
    expect: "cari_derma",
    note: "Malaysian English, no punctuation, relative month. Should still reach for donations.",
  },
  {
    id: "money-04",
    question: "还有多少钱在收款人手上还没交上来？",
    expect: "cari_derma",
    note: "Cash in hand is a custody question, but the answer lives in the donation rows.",
  },
  {
    id: "money-05",
    question: "Ada tak derma yang belum ada resit?",
    expect: "cari_derma",
    note: "Donations without a receipt — named in the description on purpose.",
  },

  // --- receipts ----------------------------------------------------------
  {
    id: "receipt-01",
    question: "Resit PSH-2026-0042 ni betul ke?",
    expect: "cari_resit",
    note: "A named receipt number must go to the receipt tool, not the donation tool.",
  },
  {
    id: "receipt-02",
    question: "0042 那张收据是几时开的？",
    expect: "cari_resit",
    note: "A partial number, in Chinese.",
  },

  // --- constitution ------------------------------------------------------
  {
    id: "clause-01",
    question: "Berapa hari notis untuk mesyuarat agung?",
    expect: "cari_fasal",
    note: "The notice period is in the constitution, not the minutes.",
  },
  {
    id: "clause-02",
    question: "谁可以签支票？",
    expect: "cari_fasal",
    note: "Cheque signatories — a rule, not a record.",
  },
  {
    id: "clause-03",
    question: "我们要改章程的话要怎样？",
    expect: "cari_fasal",
    note: "How to amend the constitution is itself a clause of it.",
  },

  // --- roster ------------------------------------------------------------
  {
    id: "ajk-01",
    question: "Siapa bendahari kita sekarang?",
    expect: "senarai_ajk",
    note: "The committee list, not the minutes that recorded the election.",
  },
  {
    id: "ajk-02",
    question: "我们的秘书是谁？",
    expect: "senarai_ajk",
    note: "Same, in Chinese.",
  },

  // --- deadlines ---------------------------------------------------------
  {
    id: "due-01",
    question: "Bila tarikh akhir penyata tahunan kita?",
    expect: "tarikh_akhir",
    note: "The annual return date is computed from the AGM — the deadline tool knows it.",
  },
  {
    id: "due-02",
    question: "有什么是快要到期的吗？",
    expect: "tarikh_akhir",
    note: "An open 'what is coming up' question.",
  },

  // --- no tool at all ----------------------------------------------------
  // These matter as much as the rest: a model that calls a tool for every
  // question turns "hello" into a database query and a metered vendor call.
  {
    id: "none-01",
    question: "Macam mana nak buat resit?",
    expect: null,
    note: "HOW to do something in Minit. No lookup — the answer is which page to open.",
  },
  {
    id: "none-02",
    question: "什么是 e-Invois？",
    expect: null,
    note: "A definition. Nothing about this society's records.",
  },
  {
    id: "none-03",
    question: "Selamat pagi",
    expect: null,
    note: "A greeting. Calling anything here is money spent on nothing.",
  },
  {
    id: "none-04",
    question: "今天天气怎么样？",
    expect: null,
    note: "Off-topic. Should be declined, not looked up.",
  },
];
