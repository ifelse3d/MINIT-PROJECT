"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Undo2 } from "lucide-react";
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
import { loadDoneDeadlines, setDeadlineDone } from "./deadline-actions";
import { AddToCalendar } from "./add-to-calendar";

// ---------------------------------------------------------------------------
// "Akan datang / Upcoming" sidebar — the condensed version of the old
// Deadlines tab: deadline cards (created BY CODE from confirmed minutes) and
// society events, each with the WhatsApp-copy and Google/.ics buttons.
// Event ENTRY lives in events-section.tsx.
//
// 2026-08-23 — a deadline can finally be TICKED OFF. lib/deadlines.ts has had a
// "done" urgency since it was written and `deadlines.status` has had a 'done'
// value since the first migration, but nothing in the app ever set it. So a
// treasurer who filed the annual return in June watched Minit keep shouting
// about it, in red, for the rest of the year — and the only fix available was
// to stop believing the reminders, which is the last thing a compliance product
// should teach anybody. The deadline stays COMPUTED; only the tick is stored.
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
  /** `kind:due_date` of every deadline somebody has ticked off. */
  const [done, setDone] = useState<Set<string>>(new Set());
  /** Why a tick could not be written, or null. "permission" gets the "whose
   *  job is this" sentence — a role refusal recurs on every retry, so "try
   *  again when you have a signal" would be a lie (26 号报告 2-4). */
  const [tickIssue, setTickIssue] = useState<"permission" | "other" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDoneDeadlines().then((keys) => {
      if (!cancelled && keys.length > 0) setDone(new Set(keys));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Tick optimistically, then tell the truth if the write failed.
   *
   * The optimistic half is right — the person knows whether they filed it, and
   * making them wait on a round-trip to say so is rude. The honest half matters
   * more: a tick that only reached this device means the deadline is still red
   * on everybody else's screen, and they need to know that rather than assume
   * the committee has been told.
   */
  function toggleDone(d: Deadline) {
    const key = d.kind + ":" + d.dueDateIso;
    const next = !done.has(key);
    setDone((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(key);
      else copy.delete(key);
      return copy;
    });
    void setDeadlineDone({
      kind: d.kind,
      dueDateIso: d.dueDateIso,
      source: d.source,
      done: next,
    }).then((r) =>
      setTickIssue(r.ok ? null : r.reason === "permission" ? "permission" : "other"),
    );
  }

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
          // The stored tick is applied to the COMPUTED deadline here, at the
          // last moment, rather than being baked into computeStandardDeadlines:
          // that function is pure and unit-tested against the statutory rules,
          // and "a human says this one is handled" is not one of them.
          const isDone = done.has(d.kind + ":" + d.dueDateIso);
          const u = deadlineUrgency(isDone ? { ...d, status: "done" } : d, todayIso);
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleDone(d)}
                  className={isDone ? "" : "text-green-800 dark:text-green-200"}
                >
                  {isDone ? (
                    <>
                      <Undo2 aria-hidden className="size-4" strokeWidth={2.2} />
                      <Tri bm="Belum lagi" zh="其实还没做" en="Not done after all" />
                    </>
                  ) : (
                    <>
                      <Check aria-hidden className="size-4" strokeWidth={2.6} />
                      <Tri bm="Sudah difailkan" zh="已经做了" en="Already filed" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {tickIssue === "permission" && (
        <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Akaun anda baca sahaja, jadi tanda “sudah difailkan” ini tidak dimasukkan ke rekod pertubuhan — ahli lain masih nampak tarikh akhir ini merah. Minta mana-mana ahli jawatankuasa (kecuali juruaudit) menandakannya."
            zh="您的账号是只读（审计）账号，这个「已经做了」的标记进不了机构的记录 —— 其他委员看到的这条死线还是红的。请找除审计外的任何成员来标记。"
            en="Your account is read-only, so this “already filed” tick did not reach the organisation's records — other members will still see this deadline in red. Ask any committee member (except the auditor) to tick it."
          />
        </p>
      )}
      {tickIssue === "other" && (
        <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
          <Tri
            bm="Tanda “sudah difailkan” ini ada pada peranti ini sahaja — ahli jawatankuasa lain masih akan nampak tarikh akhir ini merah. Pilih pertubuhan anda, atau cuba lagi apabila ada talian."
            zh="这个「已经做了」的标记只在这台设备上 —— 其他委员看到的这条死线还是红的。请选好您的机构，或者等有网络时再试。"
            en="This “already filed” tick is on this device only — other committee members will still see this deadline in red. Choose your organisation, or try again when you have a signal."
          />
        </p>
      )}

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
                {/* F-9: derived (lunar offering) events are computed, not
                    stored — nothing to delete, so no button. */}
                {!ev.derived && (
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
                )}
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
