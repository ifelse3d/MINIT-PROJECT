import type { LunarRepeatDays } from "@/lib/lunar";

// ---------------------------------------------------------------------------
// LUNAR-RECURRING TEXT DETECTION (launch feedback #13/#14, 2026-08-27
// evening). J pasted 「農曆每月初一及十五」，標題寫「拜拜」 into the
// AI organiser and got one undated row back — the model cannot answer
// "which dates" for a rule, only for a date. But a RULE is exactly what
// deterministic code is for: detect it here, expand it with lib/lunar.ts,
// spend zero AI quota (the standing lesson: 能用程式解析的，不要送去 AI).
//
// Pure and unit-tested. Returns null when the text is not a lunar-recurring
// rule — the caller then sends it to the AI as before.
// ---------------------------------------------------------------------------

export type LunarRecurringRule = {
  days: LunarRepeatDays;
  /** The society's own word for the day (拜拜, 诵经, sembahyang…). "" when
   *  the text names none — the UI asks. */
  title: string;
};

/** 初一 in its common spellings (初1 happens on phones). */
const DAY1 = /初[一1]/;
/** The "every month" / "lunar" framing that makes it a RULE, not a date. */
const RECURRING = /每月|每个月|每個月|农历|農曆|lunar|setiap bulan/i;

/**
 * Detect a lunar-recurring rule in free text.
 *
 *   「農曆每月初一及十五」，標題寫「拜拜」 → { days: "both", title: "拜拜" }
 *   帮我把每一个初一十五都写有拜拜         → { days: "both", title: "拜拜" }
 *   农历每月初一诵经                       → { days: "1",    title: "诵经" }
 */
export function parseLunarRecurring(raw: string): LunarRecurringRule | null {
  const text = raw.trim();
  if (text === "" || text.length > 400) return null;

  const has1 = DAY1.test(text);
  const has15 = /十五/.test(text);
  if (!has1 && !has15) return null;
  // A bare "初一" with no recurring frame could be one specific day of one
  // specific month — leave that to the AI rather than over-claim.
  if (!RECURRING.test(text) && !(has1 && has15)) return null;

  const days: LunarRepeatDays = has1 && has15 ? "both" : has1 ? "1" : "15";
  return { days, title: extractTitle(text) };
}

/** The society's word for the day, out of quotes or common phrasings. */
function extractTitle(text: string): string {
  // Quoted wins: 「拜拜」 『拜拜』 "拜拜" “拜拜”. A text can quote the RULE
  // too (「農曆每月初一及十五」，標題寫「拜拜」) — walk every quote and take
  // the first whose content is not just rule words.
  const quoteRe = /[「『"“]([^」』"”]{1,30})[」』"”]/g;
  for (let m = quoteRe.exec(text); m !== null; m = quoteRe.exec(text)) {
    const inside = clean(m[1]);
    if (inside !== "") return inside;
  }
  // 写有X / 寫上X / 标题写X / 標題寫X / 叫X — take what follows.
  const after = /(?:写有|寫有|写上|寫上|标题写|標題寫|标题是|標題是|叫做|叫)\s*([^，。,.!？?\s「」『』"“”]{1,30})/.exec(
    text,
  );
  if (after) {
    const rest = clean(after[1]);
    if (rest !== "") return rest;
  }
  return "";
}

/** Strip the rule words so 「初一十五拜拜」-style captures leave just 拜拜. */
function clean(s: string): string {
  return s
    .replace(/农历|農曆|每月|每个月|每個月|初[一1]|十五|及|和|与|與|都|lunar/gi, "")
    .trim();
}
