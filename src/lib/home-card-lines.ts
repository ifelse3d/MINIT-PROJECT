// ---------------------------------------------------------------------------
// THE WORDS UNDER EACH HOME CARD (design pass 2026-08-28).
//
// Pure, so the rule the design turns on is testable rather than asserted:
//
//   null  the figure could not be read  -> NO status line at all
//   0     read fine, the society has none -> an invitation, not a number
//   n     read fine                       -> the count
//
// The three cases exist because a brand-new society and a broken query look
// identical if you only check for falsy. "No minutes yet" is a claim about
// the society; making it on the strength of a failed read is how a
// compliance tool tells someone their records are gone.
//
// Trilingual (Hard Rule 9). Money is formatted by the app's one formatter.
// ---------------------------------------------------------------------------

import { formatRm } from "@/lib/minutes-draft";
import type { HomeStats } from "@/lib/home-stats";

/** One card's status line, in the three languages. */
export type Line = { bm: string; zh: string; en: string };

// --- the status lines ------------------------------------------------------
// null = the figure could not be read, so the card shows no line. A count of
// zero is NOT that case: a brand-new society has zero of everything, and the
// line is written as an invitation instead of a number.

export function minutesLine(drafts: number | null): Line | null {
  if (drafts === null) return null;
  if (drafts === 0) {
    return {
      bm: "Belum ada minit — mula dengan satu gambar",
      zh: "还没有会议记录 —— 拍一张笔记就开始",
      en: "No minutes yet — start with a photo",
    };
  }
  return {
    bm: `${drafts} draf belum ditandatangani`,
    zh: `${drafts} 份草稿还没签`,
    en: `${drafts} draft${drafts === 1 ? "" : "s"} unsigned`,
  };
}

export function moneyLine(cents: number | null): Line | null {
  if (cents === null) return null;
  if (cents === 0) {
    return {
      bm: "Belum ada wang direkod bulan ini",
      zh: "这个月还没记录钱",
      en: "Nothing recorded this month",
    };
  }
  const rm = formatRm(cents);
  return {
    bm: `${rm} masuk bulan ini`,
    zh: `这个月进账 ${rm}`,
    en: `${rm} in this month`,
  };
}

export function statementLine(records: HomeStats["moneyRecords"]): Line | null {
  if (records === null) return null;
  if (records.latestMonth === null) {
    return {
      bm: "Belum ada apa-apa untuk dilaporkan",
      zh: "还没有东西可以做报表",
      en: "Nothing to report yet",
    };
  }
  // The month stays as 2026-08 rather than "August": it reads the same in all
  // three languages, and it is the form the filing itself uses.
  return {
    bm: `Rekod terkini ${records.latestMonth}`,
    zh: `最新记录 ${records.latestMonth}`,
    en: `Latest record ${records.latestMonth}`,
  };
}

export function aiLine(left: number | null, total: number | null): Line | null {
  if (left === null || total === null) return null;
  return {
    bm: `${left} daripada ${total} tindakan AI berbaki`,
    zh: `AI 还剩 ${left} / ${total} 次`,
    en: `${left} of ${total} asks left`,
  };
}
