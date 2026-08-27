// ---------------------------------------------------------------------------
// COMPLIANCE CALENDAR — Phase 5 pure logic (no AI, no I/O). All date math is
// deterministic TypeScript (CLAUDE.md Hard Rule 2 applies to dates the same
// as money: the LLM never computes a deadline).
//
// Dates are ISO strings (YYYY-MM-DD) manipulated in UTC only — no timezone
// surprises, fully unit-testable.
// ---------------------------------------------------------------------------

export const DEADLINE_KINDS = ["annual_return_60d", "einvois_monthend", "custom"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export type Deadline = {
  kind: DeadlineKind;
  /** YYYY-MM-DD */
  dueDateIso: string;
  /** e.g. "Minit AGM disahkan pada 2026-06-20" — audit trail, never invented */
  source: string;
  status: "open" | "done";
};

// --- ISO date helpers (UTC, deterministic) ----------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(iso: string): void {
  if (!ISO_RE.test(iso) || Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) {
    throw new Error(`Not a valid YYYY-MM-DD date: "${iso}"`);
  }
}

export function addDaysIso(iso: string, days: number): string {
  assertIsoDate(iso);
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `fromIso` to `toIso` (negative when overdue). */
export function daysBetween(fromIso: string, toIso: string): number {
  assertIsoDate(fromIso);
  assertIsoDate(toIso);
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Last day of the month containing `iso`. */
export function monthEndIso(iso: string): string {
  assertIsoDate(iso);
  const d = new Date(`${iso}T00:00:00Z`);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}

// --- deadline creation -------------------------------------------------------

/**
 * ROS Annual Return: due 60 days after the AGM. Created automatically the
 * moment an AGM minutes doc is CONFIRMED (never from a draft).
 */
export function annualReturnDeadline(
  meetingDateIso: string,
  confirmedByName: string,
  confirmedOnIso: string
): Deadline {
  assertIsoDate(meetingDateIso);
  assertIsoDate(confirmedOnIso);
  return {
    kind: "annual_return_60d",
    dueDateIso: addDaysIso(meetingDateIso, 60),
    source: `Minit AGM ${meetingDateIso} disahkan oleh ${confirmedByName} pada ${confirmedOnIso}`,
    status: "open",
  };
}

/**
 * Recurring month-end e-Invois consolidation deadline. Given today, the next
 * `count` month-ends (including this month's if not yet past).
 */
export function upcomingEinvoisDeadlines(todayIso: string, count: number): Deadline[] {
  assertIsoDate(todayIso);
  if (count < 1) return [];
  const out: Deadline[] = [];
  let cursor = todayIso;
  while (out.length < count) {
    const end = monthEndIso(cursor);
    if (daysBetween(todayIso, end) >= 0) {
      out.push({
        kind: "einvois_monthend",
        dueDateIso: end,
        source: "Penyatuan e-Invois bulanan (berulang)",
        status: "open",
      });
    }
    cursor = addDaysIso(end, 1); // first day of next month
  }
  return out;
}

// --- urgency (drives the badges) ---------------------------------------------

export type Urgency = "done" | "overdue" | "due_soon" | "ok";

export const DUE_SOON_DAYS = 14;

export function deadlineUrgency(d: Deadline, todayIso: string): Urgency {
  if (d.status === "done") return "done";
  const left = daysBetween(todayIso, d.dueDateIso);
  if (left < 0) return "overdue";
  if (left <= DUE_SOON_DAYS) return "due_soon";
  return "ok";
}

/** Sort: overdue first, then soonest due date; done last. */
export function sortDeadlines(deadlines: Deadline[], todayIso: string): Deadline[] {
  const rank: Record<Urgency, number> = { overdue: 0, due_soon: 1, ok: 2, done: 3 };
  return [...deadlines].sort((a, b) => {
    const ra = rank[deadlineUrgency(a, todayIso)];
    const rb = rank[deadlineUrgency(b, todayIso)];
    if (ra !== rb) return ra - rb;
    return a.dueDateIso.localeCompare(b.dueDateIso);
  });
}

// --- human wording ------------------------------------------------------------

export const DEADLINE_LABELS: Record<DeadlineKind, { bm: string; zh: string; en: string }> = {
  annual_return_60d: {
    bm: "Penyata Tahunan ROS (60 hari selepas AGM)",
    zh: "社团注册局年度呈报（大会后60天内）",
    en: "ROS Annual Return (60 days after the AGM)",
  },
  einvois_monthend: {
    bm: "Penyatuan e-Invois LHDN (hujung bulan)",
    zh: "税务局电子发票整合（月底）",
    en: "LHDN e-Invois consolidation (month end)",
  },
  custom: { bm: "Lain-lain", zh: "其他", en: "Other" },
};

/**
 * "days left" wording as SEPARATE language parts, so screens can render it
 * through <Tri> and it follows the user's language switcher like every other
 * label. Use this in the UI — never the joined string below.
 */
export function daysLeftParts(
  d: Deadline,
  todayIso: string
): { bm: string; zh: string; en: string } {
  const left = daysBetween(todayIso, d.dueDateIso);
  if (left === 0) return { bm: "HARI INI", zh: "今天", en: "today" };
  if (left < 0) {
    return {
      bm: `LEWAT ${-left} hari`,
      zh: `逾期${-left}天`,
      en: `${-left} days overdue`,
    };
  }
  return { bm: `${left} hari lagi`, zh: `还有${left}天`, en: `${left} days left` };
}

/**
 * All three languages joined. ONLY for text that leaves the app (the WhatsApp
 * reminder), where every committee member must be able to read it whatever the
 * sender's interface preference was. Screens use daysLeftParts + <Tri>.
 */
export function daysLeftTextBm(d: Deadline, todayIso: string): string {
  const p = daysLeftParts(d, todayIso);
  return `${p.bm} · ${p.zh} · ${p.en}`;
}

/**
 * Reminders v1 (no Twilio): WhatsApp text the secretary copies into the
 * committee group manually.
 */
export function reminderWhatsappText(d: Deadline, todayIso: string, orgName: string): string {
  const label = DEADLINE_LABELS[d.kind];
  return [
    `⏰ Peringatan ${orgName}`,
    `${label.bm}`,
    `${label.zh}`,
    `Tarikh akhir / 截止 / due: ${d.dueDateIso} (${daysLeftTextBm(d, todayIso)})`,
    `— dijana oleh MinitAI / generated by MinitAI`,
  ].join("\n");
}
