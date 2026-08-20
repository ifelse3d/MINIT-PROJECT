"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tri, useTriText } from "@/components/language-provider";
import { URGENCY_BADGE, URGENCY_CARD } from "@/lib/activity-labels";
import {
  daysBetween,
  daysLeftParts,
  deadlineUrgency,
  DEADLINE_LABELS,
  reminderWhatsappText,
  type Deadline,
} from "@/lib/deadlines";
import { eventWhatsappText, type SimpleEvent } from "@/lib/local-events";
import {
  computeStandardDeadlines,
  type ConfirmedAgm,
} from "@/lib/standard-deadlines";
import { AddToCalendar } from "./add-to-calendar";

// ---------------------------------------------------------------------------
// "Akan datang / Upcoming" sidebar — the condensed version of the old
// Deadlines tab: deadline cards (created BY CODE from confirmed minutes) and
// society events, each with the WhatsApp-copy and Google/.ics buttons.
// Read-only; event ENTRY lives in events-section.tsx.
// ---------------------------------------------------------------------------

export function UpcomingSidebar({
  todayIso,
  events,
  onRemove,
  agm,
  orgName,
}: {
  todayIso: string;
  events: SimpleEvent[];
  onRemove: (id: string) => void;
  /** This org's latest confirmed AGM (null = none). */
  agm: ConfirmedAgm | null;
  /** The REAL organisation name for outgoing WhatsApp reminders. */
  orgName: string | null;
}) {
  const t = useTriText();
  const [copied, setCopied] = useState<string | null>(null);

  const deadlines = useMemo(
    () => computeStandardDeadlines(todayIso, { agm }),
    [todayIso, agm],
  );

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt(t("Salin teks ini", "复制这段文字", "copy this text"), text);
    }
  }

  function copyReminder(d: Deadline) {
    void copyText(
      d.kind + d.dueDateIso,
      // AUDIT FIX: this used to name the FICTIONAL sample temple in a message
      // the user then pastes into a real WhatsApp group.
      reminderWhatsappText(
        d,
        todayIso,
        orgName ??
          t("pertubuhan anda", "您的机构", "your organisation"),
      ),
    );
  }

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
      <h2 className="text-lg font-semibold">
        <Tri bm="Akan datang" zh="即将到来" en="Upcoming" />
      </h2>

      {/* Deadlines, condensed */}
      <div className="flex flex-col gap-3">
        {deadlines.map((d) => {
          const u = deadlineUrgency(d, todayIso);
          const s = URGENCY_BADGE[u];
          const label = DEADLINE_LABELS[d.kind];
          const key = d.kind + d.dueDateIso;
          return (
            <div key={key} className={`flex flex-col gap-2 rounded-xl border-2 p-3 ${URGENCY_CARD[u]}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span>{s.icon}</span>
                <span className="flex-1 text-sm font-semibold leading-snug">
                  <Tri bm={label.bm} zh={label.zh} en={label.en} sep=" " />
                </span>
                <Badge variant="outline" className={`text-sm ${s.cls}`}>
                  <Tri bm={s.bm} zh={s.zh} en={s.en} />
                </Badge>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-lg font-bold tabular-nums">{d.dueDateIso}</span>
                <span className="text-sm font-medium">
                  <Tri {...daysLeftParts(d, todayIso)} />
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => copyReminder(d)}>
                  {copied === key ? (
                    <Tri bm="✓ Disalin!" zh="✓ 已复制" en="✓ Copied!" />
                  ) : (
                    <Tri bm="Salin WhatsApp" zh="复制提醒" en="Copy WhatsApp" />
                  )}
                </Button>
                {/* PDPA: the export title is the FIXED deadline label only */}
                <AddToCalendar
                  item={{
                    title: label.bm,
                    dateIso: d.dueDateIso,
                    description: `${label.zh} / ${label.en} — Minit`,
                    uidKey: `deadline-${d.kind}-${d.dueDateIso}`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Society events, condensed */}
      <h3 className="text-sm font-semibold text-muted-foreground">
        🎉 <Tri bm="Acara persatuan" zh="社团活动" en="Society events" />
      </h3>
      {events.length === 0 && (
        <p className="text-sm text-muted-foreground">
          <Tri bm="Tiada acara" zh="还没有活动" en="No events yet" />
        </p>
      )}
      <div className="flex flex-col gap-2">
        {events.map((ev) => {
          const left = daysBetween(todayIso, ev.dateIso);
          const past = left < 0;
          return (
            <div
              key={ev.id}
              className={`flex flex-col gap-2 rounded-xl border-2 p-3 ${
                past ? "border-muted bg-muted/30 text-muted-foreground" : "border-sky-300 bg-sky-50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-sm font-semibold">{ev.title}</span>
                <button
                  type="button"
                  onClick={() => {
                    // Was an unconfirmed ~16px "✕" that deleted the event
                    // instantly with no undo, while harmless actions in the app
                    // DID confirm. (2026-07-28 audit.)
                    const ok = window.confirm(
                      t(
                        `Padam acara "${ev.title}" (${ev.dateIso})? Tidak boleh dibatalkan.`,
                        `要删除活动「${ev.title}」（${ev.dateIso}）吗？删了就无法复原。`,
                        `Delete the event "${ev.title}" (${ev.dateIso})? This cannot be undone.`,
                      ),
                    );
                    if (ok) onRemove(ev.id);
                  }}
                  aria-label={t(
                    `Padam acara ${ev.title}`,
                    `删除活动 ${ev.title}`,
                    `Delete the event ${ev.title}`,
                  )}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground hover:bg-red-100 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
              <div className="text-sm tabular-nums">
                {ev.dateIso}
                {ev.timeText && ` · ${ev.timeText}`} ·{" "}
                {past
                  ? t("sudah berlalu", "已过", "past")
                  : left === 0
                    ? t("HARI INI", "今天", "TODAY")
                    : t(`${left} hari lagi`, `还有${left}天`, `${left} days left`)}
              </div>
              {!past && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void copyText(ev.id, eventWhatsappText(ev))}
                  >
                    {copied === ev.id ? (
                      <Tri bm="✓ Disalin!" zh="✓ 已复制" en="✓ Copied!" />
                    ) : (
                      <Tri bm="Salin hebahan" zh="复制通知" en="Copy announcement" />
                    )}
                  </Button>
                  {/* PDPA: only the user's own event title goes into the export */}
                  <AddToCalendar
                    item={{
                      title: ev.title,
                      dateIso: ev.dateIso,
                      description: ev.timeText || undefined,
                      uidKey: `event-${ev.id}-${ev.dateIso}`,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

    </aside>
  );
}
