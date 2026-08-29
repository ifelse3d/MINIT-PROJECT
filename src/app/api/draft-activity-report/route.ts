import { NextResponse } from "next/server";
import { captureAppError } from "@/lib/app-errors";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { EXTRACT_OUTPUT_CEILING, getVisionProvider } from "@/lib/ai/provider";
import {
  EXTRACT_ATTEMPT_TIMEOUT_MS,
  ROUTE_AI_DEADLINE_MS,
} from "@/lib/ai/http";
import { vendorFailureResponse } from "@/lib/ai/vendor-failure";
import { createUsageRecorder, refundUsage, requireAiQuota } from "@/lib/ai/usage";
import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { dayIsoMalaysia } from "@/lib/history";
import {
  parseLaporanDraft,
  type ActivitySource,
} from "@/lib/laporan-aktiviti";
import { draftActivityReportPrompt } from "@/prompts/draft-activity-report";

// ---------------------------------------------------------------------------
// DRAFT THE LAPORAN AKTIVITI (D2-3, work order 56) — the activity report
// eROSES Penyata Tahunan step 6 asks the society to upload.
//
// WHAT HAPPENED comes from the organisation's OWN records: events_meetings
// rows plus confirmed minutes, loaded here under RLS (user-scoped client).
// The model's only job is WORDING those records in plain BM — the prompt
// forbids inventing activities, dates, numbers or outcomes (Hard Rule 1),
// and the person edits every sentence before any PDF exists.
//
// COST: one draft_activity_report action, refunded when no draft could be
// delivered (rule 10). No fence pages — nothing on paper is read; the PDF
// route charges the document line instead.
// PDPA: activity titles/venues only — no donor data is even selected.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const maxDuration = 60;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      fromIso?: string;
      toIso?: string;
    } | null;
    const fromIso = ISO_DAY.test(body?.fromIso ?? "") ? body!.fromIso! : null;
    const toIso = ISO_DAY.test(body?.toIso ?? "") ? body!.toIso! : null;

    const deadlineAt = Date.now() + ROUTE_AI_DEADLINE_MS;

    // The records FIRST, before anything is charged: an empty year must be a
    // cheap, honest refusal, not a charge-and-refund cycle.
    const activeOrg = await getActiveOrg();
    if (!activeOrg) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 401 },
      );
    }

    const supabase = await getSupabaseServer();
    let eventsQ = supabase
      .from("events_meetings")
      .select("title, starts_at, venue_text, kind, note")
      .eq("org_id", activeOrg.id)
      .order("starts_at", { ascending: true })
      .limit(100);
    if (fromIso) eventsQ = eventsQ.gte("starts_at", `${fromIso}T00:00:00Z`);
    if (toIso) eventsQ = eventsQ.lte("starts_at", `${toIso}T23:59:59Z`);
    type EventRow = {
      title: string;
      starts_at: string;
      venue_text: string | null;
      kind: string;
      note?: string | null;
    };
    let events = (await eventsQ).data as unknown as EventRow[] | null;
    if (events === null) {
      // A database behind migration 16's `note` column answers with an
      // unknown-column error — retry without it (the select-ladder rule).
      const retry = await supabase
        .from("events_meetings")
        .select("title, starts_at, venue_text, kind")
        .eq("org_id", activeOrg.id)
        .order("starts_at", { ascending: true })
        .limit(100);
      events = (retry.data ?? []) as unknown as EventRow[];
    }

    let minutesQ = supabase
      .from("minutes_docs")
      .select("title, meeting_type, meeting_date, status")
      .eq("org_id", activeOrg.id)
      .eq("status", "confirmed")
      .order("meeting_date", { ascending: true })
      .limit(100);
    if (fromIso) minutesQ = minutesQ.gte("meeting_date", fromIso);
    if (toIso) minutesQ = minutesQ.lte("meeting_date", toIso);
    const minutes = (await minutesQ).data ?? [];

    const activities: ActivitySource[] = [
      ...(events ?? []).map((e) => ({
        dateIso: dayIsoMalaysia(e.starts_at) ?? "",
        title: e.title,
        kind: e.kind,
        venue: e.venue_text,
        note: e.note ?? null,
      })),
      ...minutes.map((m) => ({
        dateIso: (m.meeting_date as string | null) ?? "",
        title:
          (m.title as string | null) ??
          `Mesyuarat (${(m.meeting_type as string | null) ?? "jawatankuasa"})`,
        kind: "mesyuarat",
      })),
    ]
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso))
      .slice(0, 100);

    if (activities.length === 0) {
      return NextResponse.json(
        {
          error: joinUserError({
            bm: "Tiada aktiviti atau mesyuarat dalam tempoh itu — tiada apa untuk dilaporkan. Rekod aktiviti di Kalendar, atau sahkan minit mesyuarat dahulu.",
            zh: "这段时间里没有任何活动或会议记录 —— 没有内容可以写。请先在日历记录活动，或先确认会议记录。",
            en: "No activities or meetings in that period — there is nothing to report. Record activities on the Calendar, or confirm meeting minutes first.",
          }),
        },
        { status: 400 },
      );
    }

    // Charge only now — the records exist, so a draft can be delivered.
    const gate = await requireAiQuota(["draft_activity_report"], { cap: "upload" });
    if (!gate.ok) {
      return NextResponse.json(gate.body, { status: gate.status });
    }

    const periodLabel =
      fromIso && toIso ? `${fromIso} hingga ${toIso}` : "keseluruhan rekod";
    const provider = getVisionProvider("long_doc");
    const onUsage = createUsageRecorder(gate.org.id, gate.charges[0]);
    const prompt = draftActivityReportPrompt({
      orgName: gate.org.name,
      periodLabel,
      activities,
    });

    // Ask; on a shape miss retry ONCE with the errors appended (rule 7).
    let draft = null as ReturnType<typeof parseLaporanDraft>["data"] | null;
    let lastIssues = "";
    for (let attempt = 0; attempt < 2 && draft === null; attempt++) {
      let raw: unknown;
      try {
        raw = await provider.extractJson({
          prompt:
            attempt === 0
              ? prompt
              : `${prompt}

YOUR PREVIOUS ATTEMPT FAILED VALIDATION with these errors — fix them and respond with ONLY the corrected JSON:
${lastIssues}`,
          onUsage,
          deadlineAt,
          maxOutputTokens: EXTRACT_OUTPUT_CEILING.minutes,
          timeoutMs: EXTRACT_ATTEMPT_TIMEOUT_MS,
        });
      } catch (e) {
        await refundUsage(gate.org.id, gate.charges[0]);
        return vendorFailureResponse("/api/draft-activity-report", e, gate.org.id);
      }
      const parsed = parseLaporanDraft(raw);
      if (parsed.success) {
        draft = parsed.data;
      } else {
        lastIssues = parsed.error.issues
          .slice(0, 10)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("\n");
      }
    }

    if (draft === null) {
      await refundUsage(gate.org.id, gate.charges[0]);
      void captureAppError(
        "/api/draft-activity-report",
        new Error("draft failed validation twice"),
        { orgId: gate.org.id, code: "unreadable_twice" },
      );
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.aiUnavailable) },
        { status: 502 },
      );
    }

    return NextResponse.json({
      draft,
      activities,
      periodLabel,
      provider: provider.name,
    });
  } catch (e) {
    void captureAppError("/api/draft-activity-report", e);
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
