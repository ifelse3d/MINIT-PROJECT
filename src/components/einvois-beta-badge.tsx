"use client";

import { useTriText } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// D49 (work order 94): the ONE "BETA" pill every e-Invois entry wears while
// the beta gate stands. Only the operator ever sees an e-Invois entry, so
// only the operator ever sees this. The word "BETA" is deliberately the same
// in all three languages (it is on every Malaysian app store screen); the
// tooltip carries the trilingual explanation.
// ---------------------------------------------------------------------------

export function EinvoisBetaBadge() {
  const t = useTriText();
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-800 dark:border-violet-400/40 dark:bg-violet-400/10 dark:text-violet-200"
      title={t(
        "Ciri percubaan — hanya kelihatan kepada pentadbir platform MinitAI",
        "测试中功能 —— 只有 MinitAI 平台管理员看得到",
        "Beta feature — visible to the MinitAI platform operator only",
      )}
    >
      BETA
    </span>
  );
}
