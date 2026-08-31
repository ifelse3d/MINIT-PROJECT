// ---------------------------------------------------------------------------
// AI USAGE METERING — pure logic, no I/O, fully unit-tested (Phase 7.5a).
// The decisions (charge free quota? spend a credit? block?) live HERE in
// deterministic TypeScript — never in the LLM, never scattered in routes.
// The database work happens in usage.ts, which only APPLIES what this file
// decides.
// ---------------------------------------------------------------------------

/** Every chargeable AI action. Stored in ai_usage.action — a short machine
 *  code ONLY (PDPA, Hard Rule 5: never text, contents or personal data). */
export const AI_ACTIONS = [
  "extract_minutes",
  "extract_ledger",
  "extract_events",
  // 2026-07-28: constitution ingestion. The prompt (src/prompts/extract-constitution.ts)
  // had been written since Phase 5 but had ZERO importers — there was no route
  // and no file input, while the home page invited the user to "photograph your
  // constitution". This action makes it chargeable like the others.
  "extract_constitution",
  // 2026-07-28: the home page "drop a file here" box. Minit decides WHAT the
  // file is (meeting notes / ledger page / constitution) before extracting it,
  // so the person does not have to know which page to go to first. One cheap
  // classify call, charged separately from the extraction that follows.
  "classify_upload",
  // 2026-07-28: one turn of the Minit assistant conversation. Charged per turn
  // — this is the main cost control now that the assistant is multi-turn.
  "chat_turn",
  "ask_classify",
  "ask_summarise",
  // 2026-08-19: step 3 of the minutes pipeline — turning the CONFIRMED
  // extraction into the formal BM document. Until today this step called no
  // model at all (it reprinted the confirmed strings under BM headings), so
  // it cost nothing and measured nothing. Now that it is a real generation
  // it is charged like the others. Cheap per call, but it runs once per
  // finished meeting, so it belongs in the meter.
  "draft_minutes",
  // 2026-08-19: reading a PHOTOGRAPHED or scanned committee list. A .xlsx or
  // .csv never lands here — columns are read by code, for free. This is only
  // for the page on the noticeboard, which is the case a model is actually
  // needed for.
  "import_roster",
  // Stage E (work order 27): reading a photographed shop receipt / invoice
  // for the expense book or a member's claim. One receipt, one action.
  "extract_expense",
  // 2026-08-28 (J review 27-evening #31, approved with billing 改一次算一次):
  // one exchange of "discuss this section with the AI" on the minutes review.
  // The model proposes wording; the person applies each proposal by hand.
  "discuss_minutes",
  // D2-3 (work order 56): drafting the eROSES Laporan Aktiviti wording from
  // the org's own event/minutes records. One draft, one action; the facts
  // come from the database, the model only words them.
  "draft_activity_report",
] as const;

export type AiAction = (typeof AI_ACTIONS)[number];

export function isAiAction(v: string): v is AiAction {
  return (AI_ACTIONS as readonly string[]).includes(v);
}

/** How many AI actions each "Tanya Minit" intent costs (Phase 7.5b).
 *  record_search = classify + summarise; navigation/constitution = classify
 *  only (constitution Q&A itself is deterministic — costs nothing).
 *
 *  out_of_scope is 1, not 0, since 2026-08-21: the classify call is what TELLS
 *  us the question was out of scope, so the vendor has already been paid by the
 *  time we know. Refusals used to be refunded, which made off-topic chat free
 *  for the user and billable to us on every turn.
 *  See docs/助手重做-设计.md section 4.5. */
export const ASK_INTENT_COSTS = {
  record_search: 2,
  constitution_question: 1,
  navigation_help: 1,
  out_of_scope: 1,
} as const;

export type UsageSnapshot = {
  /** ai_usage rows for this org in the current Malaysian calendar month */
  usedThisMonth: number;
  /** orgs.monthly_free_quota */
  monthlyFreeQuota: number;
  /** orgs.extra_credits (does not reset monthly) */
  extraCredits: number;
};

export type UsageState = {
  usedThisMonth: number;
  monthlyFreeQuota: number;
  extraCredits: number;
  /** Free-quota actions left this month (never negative) */
  freeRemaining: number;
  /** Free remaining + credits — what the UI shows as "left" */
  totalRemaining: number;
  /** True when the next AI action would be refused */
  blocked: boolean;
  /**
   * EVERYTHING THIS MONTH'S METER MEASURES: what has been used plus what is
   * still there (free remaining + credits). The denominator of every
   * percentage the user is shown — §5 (work order 104).
   *
   * Written as used+remaining rather than quota+credits on purpose: when
   * credits have been SPENT they have already left `extraCredits` and already
   * arrived in `usedThisMonth`, so quota+credits would shrink as the month
   * went on and the percentages would not add up to what is actually left.
   * Where nothing has been spent from credits the two are identical, which is
   * J's rule 「已用 ÷（月額度＋充值）」 exactly.
   */
  quotaPool: number;
  /**
   * How much of that pool is spent, 0–100, rounded.
   *
   * 2026-08-22: J asked for percentages instead of raw counts.
   *
   * 🔴 §5 (work order 104) CHANGED THE DENOMINATOR, and this is why. It used
   * to measure the FREE quota only, on the argument that a denominator which
   * grows when you top up makes the gauge fall when you spend money. That
   * argument lost to what it produced on J's own screen: "100% used · 0% left"
   * beside "+607% extra credits", on an account that could still do 91 things.
   * Two numbers on one line calling each other liars. J, 2026-08-31 evening:
   * 「607% extra credit 是什麽鬼」.
   *
   * THE INVARIANT, and it is the whole point: if the screen says 0% left, the
   * next action must really be refused; if the next action would go through,
   * the screen must not say 0%. The clamps below are what enforce it — a
   * rounded 100% on an account with credits left would break it just as badly
   * as the old formula did.
   */
  usedPct: number;
};

export function computeUsageState(s: UsageSnapshot): UsageState {
  const freeRemaining = Math.max(0, s.monthlyFreeQuota - s.usedThisMonth);
  const totalRemaining = freeRemaining + Math.max(0, s.extraCredits);
  const blocked = totalRemaining <= 0;
  const quotaPool = Math.max(0, s.usedThisMonth) + totalRemaining;
  let usedPct = usedPercent(s.usedThisMonth, quotaPool);
  // §5's invariant, both ways round.
  if (!blocked && usedPct >= 100) usedPct = 99;
  if (s.usedThisMonth > 0 && usedPct <= 0) usedPct = 1;
  return {
    usedThisMonth: s.usedThisMonth,
    monthlyFreeQuota: s.monthlyFreeQuota,
    extraCredits: s.extraCredits,
    freeRemaining,
    totalRemaining,
    quotaPool,
    blocked,
    usedPct,
  };
}

/**
 * Spent share of a monthly quota as 0–100.
 *
 * Clamped at both ends on purpose: overspend (possible via purchased credits)
 * must read as 100%, not 140%, and a quota of 0 must not produce NaN — an org
 * with no free quota is fully spent by definition, not undefined.
 */
export function usedPercent(used: number, quota: number): number {
  if (quota <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((used / quota) * 100)));
}

/** What to do for ONE upcoming action, given the current snapshot. */
export type ChargeDecision = "free" | "credit" | "blocked";

export function decideCharge(s: UsageSnapshot): ChargeDecision {
  if (s.usedThisMonth < s.monthlyFreeQuota) return "free";
  if (s.extraCredits > 0) return "credit";
  return "blocked";
}

// --- rate limit --------------------------------------------------------------
//
// WHY A SECOND LIMIT EXISTS (2026-08-21, docs/安全与仓库体检.md P4)
//
// The monthly quota is a CEILING, not a SPEED limit. Nothing stopped a script
// (or a stuck retry loop, or an impatient double-tap on a slow phone) from
// firing a month's worth of calls in ten seconds: each one passes decideCharge
// on its own, and we pay the vendor for every one of them before the quota
// notices. The quota is what the organisation bought; this is what stops it
// being spent in one burst.
//
// It counts ai_usage rows, so it counts ATTEMPTS THAT REACHED A VENDOR --
// including refunded ones. That is deliberate: a refund means we did not charge
// the member, never that we did not pay.

/** How many AI actions one org may start per minute.
 *
 *  PROVISIONAL VALUE. 20/min is a guess with one property worth having: it is
 *  far above anything a human does (the slowest step in the app is a photo
 *  upload) and far below what a script does. The real number needs two weeks of
 *  live usage -- docs/方案与权益设计.md section 6 -- so it is an env var, not a
 *  constant to be edited and redeployed: set AI_RATE_LIMIT_PER_MIN in the
 *  environment and it takes effect on the next request, no build. */
export const DEFAULT_AI_RATE_LIMIT_PER_MIN = 20;

/** Seconds in the sliding window the count is taken over. */
export const AI_RATE_WINDOW_SECONDS = 60;

/** Reads the limit from the environment, falling back to the provisional
 *  default. A junk or non-positive value falls back too -- a typo in an env var
 *  must never silently switch the limiter off. */
export function aiRateLimitPerMin(
  raw: string | undefined = process.env.AI_RATE_LIMIT_PER_MIN,
): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_AI_RATE_LIMIT_PER_MIN;
}

/** True when this org has already started `limit` actions inside the window
 *  and the next one must wait. Pure -- the counting happens in usage.ts. */
export function isRateLimited(recentCount: number, limit: number): boolean {
  return recentCount >= limit;
}

/**
 * What the person sees when the burst limit trips. Three languages and a
 * concrete next step, per the rules at the top of src/lib/user-errors.ts.
 *
 * It says "tunggu sekejap", never "you sent too many requests": the only human
 * who realistically meets this message is someone whose phone was slow and who
 * tapped the button four times, and blaming them for that is both wrong and
 * useless. It also states plainly that nothing was charged, because the very
 * next thing they will worry about is their quota.
 */
export const RATE_LIMITED_MESSAGE = {
  bm: "Terlalu banyak permintaan serentak. Tunggu kira-kira satu minit, kemudian cuba sekali lagi. Tiada kuota AI yang digunakan untuk percubaan ini.",
  zh: "同一时间的请求太多了。请等大约一分钟，再试一次。这一次没有用掉您的 AI 用量。",
  en: "Too many requests at once. Wait about a minute, then try again. This attempt did not use any of your AI quota.",
} as const;

/** Thrown before any vendor call when the org is going too fast. */
export class RateLimitedError extends Error {
  readonly code = "RATE_LIMITED";
  constructor(public readonly limitPerMin: number) {
    super("Terlalu banyak permintaan / too many requests.");
    this.name = "RateLimitedError";
  }
}

// --- Malaysian calendar month ------------------------------------------------

const MALAYSIA_UTC_OFFSET_HOURS = 8;

/** "YYYY-MM" of the given instant in Malaysia (UTC+8, no DST). */
export function usageMonthMalaysia(now: Date): string {
  const shifted = new Date(
    now.getTime() + MALAYSIA_UTC_OFFSET_HOURS * 3_600_000,
  );
  return shifted.toISOString().slice(0, 7);
}

/** UTC window [startUtc, endUtc) covering the Malaysian month of `now` —
 *  used to COUNT ai_usage rows (created_at is timestamptz/UTC). */
export function usageMonthUtcWindow(now: Date): {
  startUtc: string;
  endUtc: string;
} {
  const ym = usageMonthMalaysia(now);
  const [y, m] = ym.split("-").map(Number);
  const startMs =
    Date.UTC(y, m - 1, 1) - MALAYSIA_UTC_OFFSET_HOURS * 3_600_000;
  const endMs = Date.UTC(y, m, 1) - MALAYSIA_UTC_OFFSET_HOURS * 3_600_000;
  return {
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
  };
}

// --- typed error -------------------------------------------------------------

/** Thrown by checkAndRecordUsage BEFORE any AI vendor is called. */
export class QuotaExceededError extends Error {
  readonly code = "QUOTA_EXCEEDED";
  constructor(public readonly state: UsageState) {
    super(
      "Kuota AI bulan ini telah habis / this month's AI quota is used up.",
    );
    this.name = "QuotaExceededError";
  }
}

/** Bilingual message the UI shows when blocked (single source of truth). */
/**
 * 2026-07-28 audit: "Kuota habis / 配额用完" never said what a quota IS, and
 * "contact us" gave no phone number, email or link — an unactionable recovery
 * instruction. Everything the user can still do themselves is now spelled out.
 */
/* 0-2 (2026-08-25, J's #14): the "each photo uses about 1–2%" promise was
 * removed here too — the only usage number anywhere is "X% used this month". */
export const QUOTA_BLOCKED_MESSAGE = {
  bm: "Bantuan AI untuk bulan ini sudah habis digunakan. Ia akan bermula semula pada 1 hari bulan depan. Sementara itu, semua rekod, resit dan dokumen anda masih boleh dibuka dan dimuat turun seperti biasa — hanya pembacaan gambar baharu yang terhenti. Untuk menambah sekarang, hubungi orang yang memasang Minit untuk pertubuhan anda.",
  zh: "这个月的 AI 用量已经用完了。下个月 1 号会自动重新开始。在这之前，您所有的记录、收据和文件都还能照常打开和下载，只是不能再让 AI 读新的照片。想现在增加用量，请联系帮您安装 Minit 的人。",
  en: "This month's AI help has all been used. It starts again on the 1st of next month. Until then all your records, receipts and documents still open and download as normal — only reading new photos is paused. To add more now, contact whoever set Minit up for your organisation.",
} as const;
