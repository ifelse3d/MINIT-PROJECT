"use client";

import Link from "next/link";
import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// THE FOUR TASK CARDS (A-1, work order 27 — J 2026-08-26 #1, 拍板①).
//
// The home page's entrances, above the chat box. J walked the system and the
// chips were too quiet: a first-time secretary looked at one box and did not
// know Minit makes DOCUMENTS. Four big cards name the four jobs:
//
//   ① Meeting minutes — "交报告" IS making minutes: many meeting kinds exist
//     and whether a society files eROSES is their own business; Minit's job is
//     a formal, usable meeting report (J 8/26 #1).
//   ② Record money & donations.
//   ③ Financial statement (an honest stub page until Stage F builds it —
//     CLAUDE.md #13: a step that cannot be done yet is still a real page).
//   ④ Hand it to AI — NOT a page: it focuses the chat box right below,
//     because the box is already the answer and a fourth route would be a
//     second copy of it.
//
// The chat box stays put underneath (拍板①: "聊天框保留在卡下方常驻").
// ---------------------------------------------------------------------------

/** The chat box textarea carries this id so card ④ can hand focus to it. */
export const ASK_INPUT_ID = "minit-ask-input";

const CARD_CLASS =
  "flex min-h-28 flex-col justify-between gap-2 rounded-2xl border-2 " +
  "border-[color:var(--v2-outline-border)] bg-[color:var(--v2-card)] p-4 " +
  "text-left transition-colors hover:border-[color:var(--v2-primary)] " +
  "hover:bg-[color:var(--v2-primary-soft)]";

function CardBody({
  icon,
  bm,
  zh,
  en,
  subBm,
  subZh,
  subEn,
}: {
  icon: string;
  bm: string;
  zh: string;
  en: string;
  subBm: string;
  subZh: string;
  subEn: string;
}) {
  return (
    <>
      <span aria-hidden className="text-3xl leading-none">
        {icon}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-lg font-semibold leading-snug text-[color:var(--v2-text)]">
          <Tri bm={bm} zh={zh} en={en} />
        </span>
        <span className="text-sm leading-snug text-[color:var(--v2-text-soft)]">
          <Tri bm={subBm} zh={subZh} en={subEn} />
        </span>
      </span>
    </>
  );
}

export function TaskCards() {
  return (
    <section aria-label="Tugas / 任务 / Tasks" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Link href="/minutes" className={CARD_CLASS}>
        <CardBody
          icon="📝"
          bm="Minit mesyuarat"
          zh="会议记录"
          en="Meeting minutes"
          subBm="Gambar nota → laporan mesyuarat rasmi"
          subZh="拍下笔记 → 正式的会议报告"
          subEn="Photo of notes → a formal meeting report"
        />
      </Link>
      <Link href="/money" className={CARD_CLASS}>
        <CardBody
          icon="🧾"
          bm="Rekod wang & derma"
          zh="记钱 · 捐款"
          en="Record money & donations"
          subBm="Lejar, resit bernombor, serah wang"
          subZh="账页、连号收据、交现金"
          subEn="Ledger, numbered receipts, cash hand-over"
        />
      </Link>
      <Link href="/money/report" className={CARD_CLASS}>
        <CardBody
          icon="📊"
          bm="Penyata kewangan"
          zh="财报"
          en="Financial statement"
          subBm="Kira masuk & keluar mengikut tempoh"
          subZh="按期间算出收支表"
          subEn="Income & spending, by period"
        />
      </Link>
      {/* ④ is a BUTTON: it hands focus to the chat box below, it does not
          navigate — the box is the feature, not a page about the feature. */}
      <button
        type="button"
        className={CARD_CLASS}
        onClick={() => {
          const input = document.getElementById(ASK_INPUT_ID);
          input?.scrollIntoView({ behavior: "smooth", block: "center" });
          input?.focus({ preventScroll: true });
        }}
      >
        <CardBody
          icon="✨"
          bm="Serah kepada AI"
          zh="交给 AI"
          en="Hand it to AI"
          subBm="Tanya, atau letak apa sahaja di tangan anda"
          subZh="问问题，或把手上的东西丢给它"
          subEn="Ask, or drop in whatever you are holding"
        />
      </button>
    </section>
  );
}
