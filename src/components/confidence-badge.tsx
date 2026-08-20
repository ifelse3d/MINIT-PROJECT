"use client";

import { GlassBadge } from "@/components/v2/glass";
import { useTriText } from "@/components/language-provider";
import type { Confidence } from "@/lib/extraction";

// The product's core visual language (CLAUDE.md rule 9):
// confirmed = green, check = amber, missing = red. Reused on every
// review screen from Phase 1 onward. GlassBadge carries the same three
// tones in the Studio glass style.
//
// 2026-07-28 audit fix: this badge is the most-repeated label in the whole
// product (every minutes field, every ledger row, every filings row) and it
// used to hardcode "Disahkan / Confirmed" — Malay and English joined, NO
// Chinese, bypassing the language switcher entirely. A Chinese-only temple
// treasurer could not read the app's core vocabulary. It now goes through the
// same trilingual helper as everything else, and the wording is plain rather
// than clerical ("AI tak dapat baca" instead of "Tiada").

const LABELS: Record<Confidence, { bm: string; zh: string; en: string }> = {
  confirmed: { bm: "Sudah betul", zh: "已确认", en: "Confirmed" },
  check: { bm: "Tolong semak", zh: "请核对", en: "Please check" },
  missing: { bm: "Tiada dalam nota", zh: "笔记里没有", en: "Not in the notes" },
};

export function ConfidenceBadge({ level }: { level: Confidence }) {
  const t = useTriText();
  const l = LABELS[level];
  return <GlassBadge tone={level}>{t(l.bm, l.zh, l.en)}</GlassBadge>;
}
