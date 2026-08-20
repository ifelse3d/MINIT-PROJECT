"use client";

import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "@/components/confidence-badge";
import {
  NextAction,
  StepCard,
  StepFlow,
  StepGroup,
  StepNextButton,
  StepProgress,
} from "@/components/step-card";
import { Tri, useTriText } from "@/components/language-provider";
import {
  emptyMeetingNotesExtraction,
  type EventExtraction,
  type MeetingNotesExtraction,
} from "@/lib/extraction";
import { formatDateLong, isIsoDate, toIsoDate } from "@/lib/date-input";
import {
  MEETING_TYPES,
  MEETING_TYPE_LABEL,
  meetingTypeLabel,
} from "@/lib/meeting-types";
import { loadEvents, saveEvents, sortedByDate } from "@/lib/local-events";
import { formatRm, renderMinutesDraftBm } from "@/lib/minutes-draft";
import { parseRmToCents } from "@/lib/receipts";
import { buildPastePack } from "@/lib/paste-pack";
import { dayIsoMalaysia } from "@/lib/history";
import { MINUTES_LANGUAGES, type MinutesLang } from "@/lib/minutes-lang";
import { consumeIntake } from "@/lib/intake-handoff";
import {
  SAMPLE_ORG_NAME,
  SAMPLE_UPLOAD_LABEL,
  sampleMeetingExtraction,
} from "@/lib/sample-data";
import Link from "next/link";
import { saveConfirmedMinutes } from "./actions";

// ---------------------------------------------------------------------------
// MEETING MINUTES — the hero flow: photo of handwritten notes → check what Minit
// read → the official Malay document → the values to paste into eROSES.
//
// The eROSES test: the human only confirms/corrects what the AI proposed — they
// never key in structured data from scratch.
//
// 2026-07-28 LAYOUT REBUILD (user: "太多太乱… 我也不懂要如何下手，哪里看这些东西")
// This page was one ~4000px scroll: a photo card, then TWENTY-ODD expanded field
// rows, then a document preview, then an eROSES pack — all open at once, all
// looking equally important. It answered no question, least of all "what now?".
//
// It is now four numbered StepCards (components/step-card.tsx), collapsed by
// default, with exactly ONE opening itself: the first that needs the person.
// Inside step 2 the field rows are grouped (meeting details / who attended /
// what was decided / money / positions), each group saying how many rows still
// need a check, and again only the first unfinished group opens.
//
// Steps 3 and 4 are LOCKED until the review is done, and say what unlocks them
// — Minit must not write an official document from unconfirmed facts, and a
// disabled button with no explanation is what made this page feel broken.
// ---------------------------------------------------------------------------

type TextLikeField = {
  value: string;
  confidence: "confirmed" | "check" | "missing";
  source_ref: { location: string; snippet: string } | null;
};

/**
 * HOW A ROW IS EDITED.
 *
 * 🔴 2026-08-20. Every row used to share one plain text <input>. That box did
 * not know whether it was editing free text, an enum or a date — so "event
 * meeting" and "2/2/2026" were both accepted on screen and both refused by the
 * schema AND the database CHECK, and what the person was shown was "Something
 * went wrong on Minit's side". Nothing was saved; History looked empty.
 *
 * A shared component saves code and pays for it in the data contract. The fix
 * is not a longer validation message: it is a box that can only produce a legal
 * value in the first place.
 */
type FieldEditor =
  | { kind: "text" }
  | { kind: "date" }
  | { kind: "choice"; choices: readonly { value: string; label: string }[] };

/** Does this browser give a real date picker, or will type="date" fall back to
 *  a plain text box? Old Android WebViews do the latter, and on those the
 *  person types the date by hand — so we must be able to read what they type. */
function useNativeDateInput(): boolean {
  return useMemo(() => {
    if (typeof document === "undefined") return true;
    const probe = document.createElement("input");
    probe.setAttribute("type", "date");
    probe.value = "bukan-tarikh";
    return probe.value === "";
  }, []);
}

/** One reviewable row: label + value + badge + source + confirm/edit. */
function FieldRow({
  labelBm,
  labelZh,
  labelEn,
  field,
  display,
  editor = { kind: "text" },
  onConfirm,
  onEdit,
  onMarkAbsent,
}: {
  labelBm: string;
  labelZh: string;
  labelEn: string;
  field: TextLikeField;
  /** Optional pretty value (falls back to field.value). */
  display?: string;
  /** Defaults to a plain text box — the behaviour every other row has. */
  editor?: FieldEditor;
  onConfirm: () => void;
  onEdit: (value: string) => void;
  /** See EditableField.onMarkAbsent — the escape hatch for a fact that was
   *  never written down. Without it a `missing` field blocks saving forever and
   *  the only way out is for the human to invent a value. */
  onMarkAbsent?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.value);
  /** Set when Save was pressed on something this row cannot accept. Shown
   *  right under the box, in the person's own languages. */
  const [problem, setProblem] = useState<ReactNode>(null);
  const nativeDate = useNativeDateInput();
  const t = useTriText();

  const isMissing = field.confidence === "missing";

  /** What the row would store, or null when it cannot read the draft. */
  const commitValue = (): string | null => {
    if (editor.kind === "date") return toIsoDate(draft);
    if (editor.kind === "choice") return draft === "" ? null : draft;
    return draft.trim();
  };

  const startEditing = () => {
    setDraft(field.value);
    setProblem(null);
    setEditing(true);
  };

  return (
    <div className="flex flex-col gap-1.5 border-b py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-44 text-base font-semibold">
          <Tri bm={labelBm} zh={labelZh} en={labelEn} />
        </span>
        <ConfidenceBadge level={field.confidence} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            {editor.kind === "choice" ? (
              <select
                autoFocus
                value={draft}
                onChange={(ev) => {
                  setDraft(ev.target.value);
                  setProblem(null);
                }}
                className="h-12 w-full max-w-md rounded-lg border border-input bg-white px-3 text-base dark:bg-transparent"
                aria-label={labelEn}
              >
                <option value="">
                  {t("— Pilih satu —", "— 请选一个 —", "— Choose one —")}
                </option>
                {editor.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : editor.kind === "date" && nativeDate ? (
              <input
                autoFocus
                type="date"
                // A native picker can only ever hand back YYYY-MM-DD. An older
                // value that is not a real date starts the box empty rather
                // than being silently rewritten.
                value={isIsoDate(draft) ? draft : ""}
                onChange={(ev) => {
                  setDraft(ev.target.value);
                  setProblem(null);
                }}
                className="h-12 w-full max-w-md rounded-lg border border-input bg-white px-3 text-base dark:bg-transparent"
                aria-label={labelEn}
              />
            ) : (
              <input
                autoFocus
                value={draft}
                inputMode={editor.kind === "date" ? "numeric" : undefined}
                placeholder={
                  editor.kind === "date"
                    ? t(
                        "hari/bulan/tahun — 2/2/2026",
                        "日/月/年 —— 2/2/2026",
                        "day/month/year — 2/2/2026",
                      )
                    : undefined
                }
                onChange={(ev) => {
                  setDraft(ev.target.value);
                  setProblem(null);
                }}
                className="h-12 w-full max-w-md rounded-lg border border-input bg-white px-3 text-base dark:bg-transparent"
                aria-label={labelEn}
              />
            )}
            <Button
              onClick={() => {
                const value = commitValue();
                if (value === null) {
                  // Refuse HERE, saying which box and how — not three screens
                  // later as "something went wrong on Minit's side".
                  setProblem(
                    editor.kind === "date" ? (
                      <Tri
                        bm="Minit tidak faham tarikh itu. Tulis hari/bulan/tahun — contohnya 2/2/2026 untuk 2 Februari 2026."
                        zh="Minit 看不懂这个日期。请写「日/月/年」—— 例如 2/2/2026 就是 2026 年 2 月 2 日。"
                        en="Minit could not read that date. Write day/month/year — 2/2/2026 means 2 February 2026."
                      />
                    ) : (
                      <Tri
                        bm="Pilih satu daripada senarai dahulu."
                        zh="请先从清单里选一个。"
                        en="Choose one from the list first."
                      />
                    ),
                  );
                  return;
                }
                onEdit(value);
                setProblem(null);
                setEditing(false);
              }}
            >
              <Tri bm="Simpan" zh="保存" en="Save" />
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setProblem(null);
                setEditing(false);
              }}
            >
              <Tri bm="Batal" zh="取消" en="Cancel" />
            </Button>
          </>
        ) : (
          <>
            <span
              className={
                isMissing
                  ? "text-base font-medium text-red-700 italic"
                  : "text-base"
              }
            >
              {isMissing ? (
                <Tri
                  bm="— tiada dalam nota —"
                  zh="— 记录中没有 —"
                  en="— not in the notes —"
                />
              ) : (
                display ?? field.value
              )}
            </span>
            {field.confidence === "check" && (
              <Button variant="outline" onClick={onConfirm}>
                ✓&nbsp;<Tri bm="Betul" zh="没错" en="Correct" />
              </Button>
            )}
            <Button variant="outline" onClick={startEditing}>
              {isMissing ? (
                editor.kind === "choice" ? (
                  <Tri bm="Pilih" zh="选一个" en="Choose" />
                ) : (
                  <Tri bm="Isi sendiri" zh="自己填写" en="Fill in" />
                )
              ) : (
                <Tri bm="Ubah" zh="修改" en="Edit" />
              )}
            </Button>
            {isMissing && onMarkAbsent && (
              <Button variant="outline" onClick={onMarkAbsent}>
                <Tri bm="Tiada dalam nota" zh="笔记里没写" en="Not in the notes" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* What Minit understood, in words, BEFORE it is saved. 2/2/2026 and
          3/12/2026 are both day-first here (the Malaysian convention) and no
          parser can prove that is what was meant — so the month is spelled out
          where a wrong reading is still one tap from being fixed. */}
      {editing && editor.kind === "date" && toIsoDate(draft) && (
        <p className="text-base text-muted-foreground">
          →{" "}
          <span className="font-medium text-foreground">
            <Tri
              bm={formatDateLong(toIsoDate(draft) as string, "bm")}
              zh={formatDateLong(toIsoDate(draft) as string, "zh")}
              en={formatDateLong(toIsoDate(draft) as string, "en")}
            />
          </span>
        </p>
      )}

      {problem && (
        <p className="text-base font-medium text-red-700" role="alert">
          {problem}
        </p>
      )}

      {field.source_ref && (
        <p className="text-base text-muted-foreground">
          <Tri bm="AI baca di" zh="AI 读到的位置" en="The AI read this at" />{" "}
          {field.source_ref.location} ·{" "}
          <span className="font-mono">&ldquo;{field.source_ref.snippet}&rdquo;</span>
        </p>
      )}
      {isMissing && (
        <p className="text-base text-muted-foreground">
          <Tri
            bm="AI tidak jumpa ini dalam nota anda. Isi sendiri, atau tandakan tiada dalam nota."
            zh="AI 在您的笔记里找不到这一项。可以自己填写，或标示笔记里没写。"
            en="The AI could not find this in your notes. Fill it in yourself, or mark it as not written down."
          />
        </p>
      )}
    </div>
  );
}

// --- keep work on this device so navigating away loses NOTHING (Phase 7
// moves this into the shared database). Photo is stored compressed so the
// original handwriting can always be checked against the extraction.
const MINUTES_STORE_KEY = "minit.minutes.v1";

type SavedMinutes = {
  extraction: MeetingNotesExtraction;
  sourceLabel: string | null;
  photoDataUrl: string | null;
};

function loadSavedMinutes(): SavedMinutes | null {
  try {
    const raw = localStorage.getItem(MINUTES_STORE_KEY);
    return raw ? (JSON.parse(raw) as SavedMinutes) : null;
  } catch {
    return null;
  }
}

/** "ok" | "photo-dropped" | "failed" — the caller must tell the user. */
type SaveOutcome = "ok" | "photo-dropped" | "failed";

function saveMinutes(state: SavedMinutes): SaveOutcome {
  try {
    localStorage.setItem(MINUTES_STORE_KEY, JSON.stringify(state));
    return "ok";
  } catch {
    // Quota exceeded — keep the fields rather than losing everything, but the
    // photo is the ONLY way to check the extraction against the handwriting, so
    // silently dropping it (the old behaviour) meant the audit evidence
    // vanished with no notice and the failing write repeated on every keystroke.
    // We now report the outcome so the UI can say so. (2026-07-28 audit.)
    try {
      localStorage.setItem(
        MINUTES_STORE_KEY,
        JSON.stringify({ ...state, photoDataUrl: null }),
      );
      return "photo-dropped";
    } catch {
      return "failed";
    }
  }
}

/** Downscale the photo to ≤1400px JPEG so it fits localStorage. */
async function compressPhoto(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}

/** Each choice is written in the language it produces — a person looking for
 *  中文 finds 中文, whatever language the interface happens to be in. */
const LANGUAGE_CHOICE: Record<MinutesLang, string> = {
  bm: "Bahasa Malaysia (eROSES)",
  zh: "华语 / 中文",
  en: "English",
};

export function MinutesReview({
  orgName,
  signerName,
}: {
  /** The REAL active organisation, resolved on the server. null = no org yet. */
  orgName: string | null;
  /** The REAL signed-in human, for the Hard Rule 8 audit line preview. */
  signerName: string | null;
}) {
  const t = useTriText();
  // 2026-07-28 — opens EMPTY, not on the fictional temple's meeting. See
  // emptyMeetingNotesExtraction in lib/extraction.ts for why.
  const [extraction, setExtraction] = useState<MeetingNotesExtraction>(
    emptyMeetingNotesExtraction
  );
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  /** Only true if the person deliberately tapped "show me an example". */
  const [showSample, setShowSample] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // events-in-minutes bridge
  type EvRow = { title: string; dateIso: string; timeText: string; added: boolean };
  const [evRows, setEvRows] = useState<EvRow[] | null>(null);
  const [evBusy, setEvBusy] = useState(false);
  const [evError, setEvError] = useState<string | null>(null);

  // Restore saved work once on mount, then save on every change.
  //
  // The ref guard matters: React Strict Mode (on by default in dev) runs mount
  // effects TWICE. `consumeIntake` deletes the parcel on the first run, so the
  // second run fell through to `loadSavedMinutes()` and OVERWROTE the extraction
  // the home page had just handed over with older saved work.
  // (Found in review, 2026-07-28.)
  const didRestore = useRef(false);
  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;
    // Did the home page's "one door" just read a page of meeting notes for us?
    // If so it wins over anything saved earlier — the person literally just took
    // that photo. (2026-07-28: the home AskBox → /api/intake → here.)
    const handed = consumeIntake("meeting_notes");
    if (handed) {
      setExtraction(handed.extraction as MeetingNotesExtraction);
      setSourceLabel(handed.fileName);
      setPhotoDataUrl(null);
      setRestored(true);
      return;
    }
    const saved = loadSavedMinutes();
    if (saved) {
      setExtraction(saved.extraction);
      setSourceLabel(saved.sourceLabel);
      setPhotoDataUrl(saved.photoDataUrl);
    }
    setRestored(true);
  }, []);
  const [storageNote, setStorageNote] = useState<SaveOutcome | null>(null);
  useEffect(() => {
    if (!restored) return;
    // AUDIT FIX: do NOT persist the fictional sample seed.
    // Previously this effect ran on the very first render after mount, so
    // merely OPENING /minutes wrote sampleMeetingExtraction into localStorage —
    // and /filings then read that key and presented the fictional temple's AGM
    // as a filing-ready eROSES paste-pack with per-field Copy buttons and a
    // green "minutes processed ✓" tick. Nothing is saved until the user has
    // actually photographed something (sourceLabel !== null).
    if (sourceLabel === null) return;
    const outcome = saveMinutes({ extraction, sourceLabel, photoDataUrl });
    if (outcome === "photo-dropped" && photoDataUrl !== null) {
      // Clear it from state too, otherwise the failing write repeats forever.
      setPhotoDataUrl(null);
    }
    setStorageNote(outcome === "ok" ? null : outcome);
  }, [extraction, sourceLabel, photoDataUrl, restored]);

  async function findEventsInMinutes() {
    setEvError(null);
    setEvBusy(true);
    setEvRows(null);
    try {
      const text = [
        `Tarikh mesyuarat / meeting date: ${extraction.meeting_date.value || "?"}`,
        ...extraction.resolutions.map((r) => `- ${r.text.value}`),
      ].join("\n");
      const res = await fetch("/api/extract-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? joinUserError(USER_ERRORS.aiUnavailable));
      setEvRows(
        (body.events as EventExtraction[]).map((e) => ({
          title: e.title.value,
          dateIso: e.date.value,
          timeText: e.time.value,
          added: false,
        }))
      );
    } catch (e) {
      setEvError(e instanceof Error ? e.message : String(e));
    } finally {
      setEvBusy(false);
    }
  }

  function confirmEvent(idx: number) {
    if (!evRows) return;
    const r = evRows[idx];
    if (!r.dateIso) return;
    saveEvents(
      sortedByDate([
        ...loadEvents(),
        { id: `${Date.now()}-m${idx}`, title: r.title || "Acara", dateIso: r.dateIso, timeText: r.timeText },
      ])
    );
    setEvRows(evRows.map((x, i) => (i === idx ? { ...x, added: true } : x)));
  }

  async function onPhotoPicked(file: File | null) {
    if (!file) return;
    setAiError(null);
    setAiBusy(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/extract-minutes", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? joinUserError(USER_ERRORS.aiUnavailable));
      setExtraction(body.extraction as MeetingNotesExtraction);
      setSourceLabel(file.name);
      setPhotoDataUrl(await compressPhoto(file));
      setEvRows(null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }

  /** Clean, empty page: no example, no half-read photo, nothing saved. */
  function backToEmpty() {
    setExtraction(emptyMeetingNotesExtraction);
    setSourceLabel(null);
    setShowSample(false);
    setPhotoDataUrl(null);
    setEvRows(null);
    setAiError(null);
    setStorageNote(null);
    try {
      localStorage.removeItem(MINUTES_STORE_KEY);
    } catch {
      // Storage unavailable: state is already reset, nothing more to do.
    }
  }

  /** The worked example, on request only — for a first look or a demo. */
  function openSample() {
    setExtraction(sampleMeetingExtraction);
    setShowSample(true);
    setSourceLabel(null);
    setPhotoDataUrl(null);
    setEvRows(null);
    setAiError(null);
  }

  // Generic updater for one field inside the extraction tree.
  function updateField(
    apply: (e: MeetingNotesExtraction) => MeetingNotesExtraction
  ) {
    setExtraction((prev) => apply(structuredClone(prev)));
  }

  const confirm = (f: TextLikeField) => {
    f.confidence = "confirmed";
  };
  const edit = (f: TextLikeField, value: string) => {
    f.value = value;
    // A human typed/verified it — human is the source of truth now.
    f.confidence = value === "" ? "missing" : "confirmed";
    if (value !== "" && f.source_ref === null) {
      f.source_ref = {
        location: t("diisi oleh anda", "由您填写", "entered by you"),
        snippet: value,
      };
    }
  };
  /**
   * "This fact was never written down." Marks the field REVIEWED while leaving
   * its value empty, so the rendered document simply omits the line instead of
   * containing a value the human had to invent to unblock the Save button.
   * Hard Rule 1 forbids the AI inventing; it must not force the human to either.
   */
  const markAbsent = (f: TextLikeField) => {
    f.value = "";
    f.confidence = "confirmed";
    // Hard Rule 1 requires every non-missing field to carry a source_ref, and
    // there genuinely IS a provenance here: a human inspected the notes and
    // asserted the fact is not in them. That is recorded, not invented.
    f.source_ref = {
      location: t(
        "disemak oleh anda",
        "由您核对",
        "reviewed by you",
      ),
      snippet: t(
        "tiada dalam nota",
        "笔记里没写",
        "not written down in the notes",
      ),
    };
  };

  const outstanding = useMemo(() => {
    const fields: { confidence: string }[] = [
      extraction.meeting_type,
      extraction.meeting_date,
      extraction.meeting_venue,
      ...extraction.attendees.map((a) => a.name),
      ...extraction.resolutions.map((r) => r.text),
      // AUDIT FIX: amount_cents was missing from this list, so a ringgit figure
      // the AI could not read did NOT block saving — and minutes-draft.ts then
      // printed that unverified amount into a document carrying the Hard Rule 8
      // audit line. Money is the one thing that must never slip through.
      ...extraction.figures.flatMap((f) => [f.description, f.amount_cents]),
      ...extraction.office_bearers.flatMap((b) => [b.position, b.person_name]),
    ];
    // Anything not explicitly confirmed still counts as outstanding —
    // "missing" (red) fields must block saving just like "check" (amber)
    // ones, otherwise the Hard Rule 8 audit line would be attached to
    // minutes that still have holes in them. The "not in the notes" button
    // is the honest way to clear a red field without inventing a value.
    return fields.filter((f) => f.confidence !== "confirmed").length;
  }, [extraction]);

  const allReviewed = outstanding === 0;

  /**
   * Outstanding / total per GROUP.
   *
   * 2026-07-28, user: "太多太乱… 我也不懂要如何下手". Section 1 was a flat list of
   * ~20 expanded field rows — the worst wall of text in the app. Grouping it lets
   * each group say "3 of 5 still need your check" and lets only the first
   * unfinished group open itself, so the page opens on ONE thing to do.
   */
  const groups = useMemo(() => {
    const count = (fields: { confidence: string }[]) => ({
      outstanding: fields.filter((f) => f.confidence !== "confirmed").length,
      total: fields.length,
    });
    return {
      meeting: count([
        extraction.meeting_type,
        extraction.meeting_date,
        extraction.meeting_venue,
      ]),
      attendees: count(extraction.attendees.map((a) => a.name)),
      resolutions: count(extraction.resolutions.map((r) => r.text)),
      figures: count(
        extraction.figures.flatMap((f) => [f.description, f.amount_cents]),
      ),
      bearers: count(
        extraction.office_bearers.flatMap((b) => [b.position, b.person_name]),
      ),
    };
  }, [extraction]);

  /** Which group opens itself: the first that still needs the person. */
  const firstUnfinished = (
    ["meeting", "attendees", "resolutions", "figures", "bearers"] as const
  ).find((k) => groups[k].outstanding > 0);
  const todayIso = dayIsoMalaysia(new Date().toISOString())!;

  // THREE states this page can be in, and they are not the same thing:
  //   isReal      — a photo has been read; this is the person's own meeting.
  //   isSample    — they asked to see the worked example (opt-in, never default).
  //   nothingYet  — fresh page: no photo, no example. The normal first visit.
  // Everything downstream (locks, the save button, the audit line) keys off
  // isReal, so an empty or an example meeting can never be saved as real.
  const isReal = sourceLabel !== null;
  const isSample = !isReal && showSample;
  const nothingYet = !isReal && !showSample;
  // The example keeps the fictional temple's name so nobody mistakes it for
  // their own; a real photograph is rendered on the REAL organisation's
  // letterhead with the REAL signer, matching exactly what the server will save.
  const documentOrgName = isSample ? SAMPLE_ORG_NAME : orgName ?? "";
  const documentSigner = signerName ?? "";

  const minutesDraft = useMemo(
    () =>
      renderMinutesDraftBm(extraction, {
        orgName: documentOrgName,
        confirmedBy:
          allReviewed && isReal && documentSigner !== ""
            ? { name: documentSigner, dateIso: todayIso }
            : undefined,
      }),
    [extraction, allReviewed, todayIso, documentOrgName, documentSigner, isReal]
  );

  const pastePack = useMemo(() => buildPastePack(extraction), [extraction]);

  // --- Step 4: one-tap copy for each eROSES value ---------------------------
  // 2026-08-07 (user: "为什么不做可以直接 click copy，不需要 user highlight 再 copy")
  // /filings already had this button (filings-view.tsx) while step 4 here — the
  // screen a secretary actually finishes a meeting on — made them drag-select
  // the text by hand. Same paste pack, same helper, so the two screens now
  // behave the same way.
  const [copiedEroses, setCopiedEroses] = useState<string | null>(null);

  async function copyErosesValue(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedEroses(field);
      setTimeout(() => setCopiedEroses(null), 1500);
    } catch {
      // clipboard blocked (insecure origin / permission) — the value is still
      // on screen and selectable, so this degrades instead of breaking.
    }
  }

  // --- Step 3: let the model actually WRITE the document --------------------
  // 2026-08-19 (user: "感觉像是 AI 做工，又没完全做好 … 只放 pointform 丢给我",
  // "说做马来文版也没有"). Both complaints had one cause: step 3 called no model
  // at all. It printed the confirmed strings, in whatever language they were
  // written in, under hardcoded BM headings — see the note in
  // /src/app/api/draft-minutes/route.ts. The template stays as the free live
  // preview; this button is what turns it into a document.
  //
  // Deliberately a button and not automatic: this spends a credit, and
  // "choosing a file silently charged you" is already on the UX defect list.
  //
  // Any edit above invalidates a document written from the old facts, so the
  // result is TAGGED with the extraction it came from and read back as valid
  // only while that is still the current one. Derived, not reset in an effect:
  // an effect would render the stale document once before clearing it, and
  // "the document on screen briefly disagrees with the fields" is the exact
  // failure this guard exists to prevent.
  // Bahasa Malaysia by default because that is what eROSES needs; the other
  // two exist because a committee also has to read its own minutes
  // (2026-08-19, user: "不止给 eROSES，平时也可以使用").
  const [docLang, setDocLang] = useState<MinutesLang>("bm");
  const [draftResult, setDraftResult] = useState<{
    for: MeetingNotesExtraction;
    lang: MinutesLang;
    markdown: string;
  } | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftFailure, setDraftFailure] = useState<{
    for: MeetingNotesExtraction;
    message: string;
  } | null>(null);

  // Switching language makes the existing document the wrong document, in the
  // same way that editing a field does.
  const aiDraft =
    draftResult && draftResult.for === extraction && draftResult.lang === docLang
      ? draftResult.markdown
      : null;
  const draftError =
    draftFailure && draftFailure.for === extraction ? draftFailure.message : null;

  async function writeWithAi() {
    const writtenFor = extraction;
    const writtenIn = docLang;
    setDraftBusy(true);
    setDraftFailure(null);
    try {
      const res = await fetch("/api/draft-minutes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ extraction, language: docLang }),
      });
      const data = (await res.json().catch(() => null)) as
        | { markdown?: string; error?: string }
        | null;
      if (!res.ok || !data?.markdown) {
        setDraftFailure({
          for: writtenFor,
          message: data?.error ?? joinUserError(USER_ERRORS.aiUnavailable),
        });
        return;
      }
      setDraftResult({ for: writtenFor, lang: writtenIn, markdown: data.markdown });
      // The person asked for a fresh version; keeping their edits on top of it
      // would silently mix two documents.
      setManualEdit(null);
    } catch {
      setDraftFailure({
        for: writtenFor,
        message: joinUserError(USER_ERRORS.aiUnavailable),
      });
    } finally {
      setDraftBusy(false);
    }
  }

  // The document is the person's to correct. A model that is right most of the
  // time is only useful if the last 5% can be fixed by hand in ten seconds —
  // otherwise the whole draft gets retyped somewhere else, which is what this
  // product exists to stop. Tagged like the others: an edit made against one
  // set of confirmed facts does not survive a change to those facts.
  const [manualEdit, setManualEdit] = useState<{
    for: MeetingNotesExtraction;
    text: string;
  } | null>(null);
  const edited =
    manualEdit && manualEdit.for === extraction ? manualEdit.text : null;

  /** What step 3 shows and saves: the person's version, else the written
   *  document, else the free preview. */
  const shownDocument = edited ?? aiDraft ?? minutesDraft;

  // --- Phase 7: save the confirmed minutes to the org's history -------------
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<"ok" | string | null>(null);

  async function saveToHistory() {
    setSaveBusy(true);
    setSaveResult(null);
    try {
      // The server re-renders the document from this extraction using the org
      // and signer from the session (Hard Rule 8); we deliberately do not send
      // a rendered document or a confirmer name.
      const result = await saveConfirmedMinutes({
        extraction,
        aiDraftMd: edited ?? aiDraft ?? undefined,
        language: docLang,
      });
      setSaveResult(result.ok ? "ok" : result.error ?? "error");
    } catch {
      setSaveResult(
        "Tidak berjaya disimpan — cuba lagi / 没有保存成功 —— 请再试一次 / Could not save — try again",
      );
    } finally {
      setSaveBusy(false);
    }
  }

  return (
    // StepFlow lets the sticky rail and the "next step" buttons open and scroll
    // to a card, so nobody has to hunt down the page for their turn.
    <StepFlow>
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10 text-base">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-amber-400/15 dark:ring-white/10">
            📝
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Minit Mesyuarat" zh="会议记录" en="Meeting Minutes" />
            </span>
          </h1>
          {/* No badge on a fresh page: there is nothing to label, and "Sample
              data" on an empty screen only raises a question. The example, if
              the person asks for it, still says so. */}
          {sourceLabel ? (
            <Badge variant="secondary">📷 {sourceLabel}</Badge>
          ) : isSample ? (
            <Badge variant="secondary">
              <Tri bm="Contoh" zh="示范" en="Example" />
            </Badge>
          ) : null}
        </div>
        <p className="text-base text-muted-foreground">
          {documentOrgName ||
            t(
              "Pilih pertubuhan dahulu",
              "请先选择机构",
              "Choose an organisation first",
            )}
          {sourceLabel ? ` · ${sourceLabel}` : ""}
          {isSample ? ` · ${SAMPLE_UPLOAD_LABEL}` : ""}
        </p>
        {/* Shown ONLY to someone who asked for the example — and it now has a
            way out, instead of just telling them they are in the wrong place. */}
        {isSample && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:bg-amber-400/10">
            <p className="min-w-56 flex-1 text-base font-medium text-amber-900 dark:text-amber-100">
              <Tri
                bm="Ini contoh sahaja — bukan data anda."
                zh="这是示范内容，不是您的资料。"
                en="This is the worked example — not your data."
              />
            </p>
            <Button variant="outline" onClick={backToEmpty}>
              <Tri bm="Tutup contoh" zh="关掉示范" en="Close the example" />
            </Button>
          </div>
        )}
        {storageNote === "photo-dropped" && (
          <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
            <Tri
              bm="Telefon ini penuh, jadi gambar asal tidak dapat disimpan. Medan anda selamat. Simpan minit ini ke Sejarah sekarang."
              zh="这台手机的储存空间满了，原始照片没能留下。您填的内容还在。请现在就把会议记录保存到「历史」。"
              en="This phone's storage is full, so the original photo could not be kept. Your fields are safe. Save these minutes to History now."
            />
          </p>
        )}
        {storageNote === "failed" && (
          <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
            <Tri
              bm="Kerja ini TIDAK dapat disimpan pada peranti ini. Jangan tutup halaman — semak semua medan dan tekan “Simpan ke Sejarah” sekarang."
              zh="这些内容无法暂存在这台设备上。请先不要关掉页面 —— 核对好所有栏位，马上按「保存到历史」。"
              en="This work could NOT be kept on this device. Do not close the page — check the fields and tap “Save to History” now."
            />
          </p>
        )}
      </div>

      {/* Where am I? One glance — and tap a chip to go straight there. */}
      <StepProgress
        steps={[
          {
            labelBm: "Gambar",
            labelZh: "拍照",
            labelEn: "Photo",
            status: isReal ? "done" : "needs-you",
            targetId: "step-photo",
          },
          {
            labelBm: "Semak",
            labelZh: "核对",
            labelEn: "Check",
            status: nothingYet
              ? "locked"
              : isSample
                ? "example"
                : allReviewed
                  ? "done"
                  : "needs-you",
            count: isReal ? outstanding : undefined,
            targetId: "step-check",
          },
          {
            labelBm: "Simpan",
            labelZh: "保存",
            labelEn: "Save",
            status:
              saveResult === "ok"
                ? "done"
                : allReviewed && isReal
                  ? "needs-you"
                  : isSample
                    ? "example"
                    : "locked",
            targetId: "step-document",
          },
          {
            labelBm: "Tampal ke eROSES",
            labelZh: "贴进 eROSES",
            labelEn: "Paste to eROSES",
            status:
              allReviewed && isReal
                ? "needs-you"
                : isSample
                  ? "example"
                  : "locked",
            targetId: "step-eroses",
          },
        ]}
      />

      {/* The one sentence answering "what do I do now?" */}
      <NextAction tone={isReal && allReviewed ? "done" : "action"}>
        {!isReal ? (
          <Tri
            bm="Mula di langkah 1: ambil gambar nota mesyuarat tulisan tangan anda. Minit akan membacanya dan mengisi semuanya di bawah."
            zh="从第 1 步开始：拍下您手写的会议笔记。Minit 会读出来，把下面的内容都填好。"
            en="Start at step 1: take a photo of your handwritten meeting notes. Minit reads it and fills in everything below."
          />
        ) : !allReviewed ? (
          <Tri
            bm={`Langkah 2: ada ${outstanding} perkara yang Minit mahu anda semak. Buka langkah 2 di bawah.`}
            zh={`第 2 步：有 ${outstanding} 项 Minit 希望您核对一下。请展开下面的第 2 步。`}
            en={`Step 2: ${outstanding} item(s) need your check. Open step 2 below.`}
          />
        ) : saveResult === "ok" ? (
          <Tri
            bm="Siap — minit ini sudah tersimpan dalam sejarah pertubuhan anda."
            zh="完成 —— 这份会议记录已经存进您机构的历史里了。"
            en="Done — these minutes are saved in your organisation's history."
          />
        ) : (
          <Tri
            bm="Semua sudah disemak. Langkah 3: simpan minit ini ke Sejarah."
            zh="全部核对好了。第 3 步：把会议记录保存到「历史」。"
            en="Everything is checked. Step 3: save these minutes to History."
          />
        )}
      </NextAction>

      {/* 1 — the photo */}
      <StepCard
        id="step-photo"
        step={1}
        titleBm="Ambil gambar nota mesyuarat"
        titleZh="拍下手写的会议笔记"
        titleEn="Photo of your meeting notes"
        summary={
          sourceLabel ? (
            <>📄 {sourceLabel}</>
          ) : (
            <Tri
              bm="Satu gambar, satu halaman. Minit membaca tulisan tangan Bahasa Malaysia, Cina dan Inggeris."
              zh="一张照片拍一页。Minit 能读马来文、中文和英文的手写字。"
              en="One photo per page. Minit reads handwriting in Malay, Chinese and English."
            />
          )
        }
        status={isReal ? "done" : "needs-you"}
        defaultOpen={!isReal}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-3 text-base font-semibold text-white ${
                aiBusy
                  ? "cursor-wait bg-muted-foreground"
                  : "v2-pill bg-gradient-to-r from-[#5b4bd6] to-[#6f5ef2] shadow-[0_10px_26px_-10px_rgba(124,108,245,0.8)]"
              }`}
            >
              {aiBusy ? (
                <>
                  ⏳ <Tri bm="AI sedang membaca…" zh="AI 读取中…" en="AI is reading…" />
                </>
              ) : (
                <>
                  📷 <Tri bm="Pilih / ambil gambar" zh="选择照片" en="Choose / take a photo" />
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={aiBusy}
                onChange={(e) => {
                  onPhotoPicked(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
            {sourceLabel && !aiBusy && (
              <Button
                variant="outline"
                onClick={() => {
                  // This DISCARDS the user's uploaded extraction. It used to be
                  // a quiet ghost button with no confirmation, while the
                  // harmless actions did confirm. (2026-07-28 audit.)
                  const ok = window.confirm(
                    t(
                      "Buang kerja ini dan mula semula? Medan yang anda semak akan hilang dan tidak boleh dikembalikan.",
                      "要丢掉这份记录、重新开始吗？您核对过的栏位会消失，无法复原。",
                      "Discard this work and start again? The fields you reviewed will be lost and cannot be recovered.",
                    ),
                  );
                  if (!ok) return;
                  backToEmpty();
                }}
              >
                <Tri
                  bm="Buang & mula semula"
                  zh="丢掉，重新开始"
                  en="Discard & start again"
                />
              </Button>
            )}
          </div>
          {aiError && (
            <div className="rounded-md border border-red-300 bg-red-50 p-4 text-base text-red-900">
              {aiError}
            </div>
          )}
          {photoDataUrl && (
            <details className="group rounded-lg border bg-background">
              <summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-medium hover:bg-accent">
                🖼️ <Tri bm="Lihat gambar asal" zh="查看原始照片" en="View the original photo" />
                <span className="ml-auto text-muted-foreground transition-transform group-open:rotate-90">›</span>
              </summary>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoDataUrl}
                alt={t("Gambar asal", "原始照片", "Original photo")}
                className="max-h-[70vh] w-full rounded-b-lg object-contain"
              />
            </details>
          )}
          <p className="text-base text-muted-foreground">
            ⚠{" "}
            <Tri
              bm="Guna nota contoh dahulu — jangan muat naik nama atau nombor IC orang sebenar sampai kami bertukar ke pelan berbayar. Ini melindungi privasi mereka."
              zh="目前请先用示范笔记 —— 在我们换成付费方案之前，先不要上传真实的姓名或身份证号码，以保护他们的隐私。"
              en="Use example notes for now — do not upload real names or IC numbers until we move to a paid plan. This protects their privacy."
            />
          </p>
          {/* Photo already read: the only thing left here is to move on. */}
          {isReal && !allReviewed && (
            <StepNextButton
              targetId="step-check"
              labelBm="Pergi ke langkah 2: semak"
              labelZh="去第 2 步：核对内容"
              labelEn="Go to step 2: check it"
            />
          )}

          {/* Opt-in example. Deliberately quiet and LAST: someone holding their
              own notes should reach for the camera, not this. It exists so a
              first-timer (or a demo) can see what a finished page looks like. */}
          {nothingYet && (
            <button
              type="button"
              onClick={openSample}
              className="self-start text-base text-muted-foreground underline underline-offset-4"
            >
              <Tri
                bm="Belum ada nota? Lihat contoh yang sudah siap"
                zh="还没有笔记？看一个做好的示范"
                en="No notes yet? See a worked example"
              />
            </button>
          )}
        </div>
      </StepCard>

      {/* 2 — review what Minit read, in five groups instead of one long list */}
      <StepCard
        id="step-check"
        step={2}
        titleBm="Semak apa yang Minit baca"
        titleZh="核对 Minit 读到的内容"
        titleEn="Check what Minit read"
        summary={
          <Tri
            bm="Untuk setiap perkara: “Betul” kalau Minit baca dengan tepat, “Ubah” kalau salah, atau “Tiada dalam nota” kalau memang tidak ditulis."
            zh="每一项请按：读对了按「没错」，读错了按「修改」，笔记里本来就没写就按「笔记里没写」。"
            en="For each item: “Correct” if Minit read it right, “Edit” if not, or “Not in the notes” if it was never written down."
          />
        }
        status={nothingYet ? "locked" : allReviewed ? "done" : "needs-you"}
        count={outstanding}
        lockedReason={
          <Tri
            bm="Ambil gambar nota mesyuarat di langkah 1 dahulu — Minit hanya boleh menyemak perkara yang ia sudah baca."
            zh="请先在第 1 步拍下会议笔记 —— Minit 只能核对它已经读到的内容。"
            en="Take a photo of the notes in step 1 first — Minit can only check what it has read."
          />
        }
        defaultOpen={isReal && !allReviewed}
      >
        <div className="flex flex-col gap-3">
        <StepGroup
          titleBm="Maklumat mesyuarat"
          titleZh="会议基本资料"
          titleEn="Meeting details"
          outstanding={groups.meeting.outstanding}
          total={groups.meeting.total}
          defaultOpen={firstUnfinished === "meeting"}
        >
          {/* The three boxes J filled in by hand on 2026-08-20. The type is a
              list and the date is a date picker because a box that cannot
              produce an illegal value is the only real fix; the labels say
              "MEETING date" and "MEETING venue" because "Date"/"Venue" next to
              an upload card is ambiguous — a whiteboard often carries the
              EVENT's date, not the meeting's. */}
          <FieldRow
            labelBm="Jenis mesyuarat"
            labelZh="会议类型"
            labelEn="Meeting type"
            field={extraction.meeting_type as unknown as TextLikeField}
            display={
              extraction.meeting_type.value === ""
                ? undefined
                : t(
                    meetingTypeLabel(extraction.meeting_type.value, "bm", extraction.meeting_type_label),
                    meetingTypeLabel(extraction.meeting_type.value, "zh", extraction.meeting_type_label),
                    meetingTypeLabel(extraction.meeting_type.value, "en", extraction.meeting_type_label),
                  )
            }
            editor={{
              kind: "choice",
              choices: MEETING_TYPES.map((v) => ({
                value: v,
                label: t(
                  MEETING_TYPE_LABEL[v].bm,
                  MEETING_TYPE_LABEL[v].zh,
                  MEETING_TYPE_LABEL[v].en,
                ),
              })),
            }}
            onConfirm={() =>
              updateField((e) => {
                confirm(e.meeting_type as unknown as TextLikeField);
                return e;
              })
            }
            onEdit={(v) =>
              updateField((e) => {
                edit(e.meeting_type as unknown as TextLikeField, v);
                // The society's own name belongs to "other" and nothing else.
                // Leaving it behind after switching to a real type would print
                // it on a document whose type no longer matches it.
                if (v !== "other") e.meeting_type_label = undefined;
                return e;
              })
            }
            onMarkAbsent={() =>
              updateField((e) => {
                markAbsent(e.meeting_type as unknown as TextLikeField);
                e.meeting_type_label = undefined;
                return e;
              })
            }
          />

          {extraction.meeting_type.value === "other" && (
            <div className="flex flex-col gap-1.5 border-b py-4">
              <span className="min-w-44 text-base font-semibold">
                <Tri
                  bm="Nama mesyuarat anda sendiri"
                  zh="你们自己的会议名称"
                  en="Your own name for this meeting"
                />
              </span>
              <input
                value={extraction.meeting_type_label ?? ""}
                maxLength={120}
                onChange={(ev) => {
                  const v = ev.target.value;
                  updateField((e) => {
                    e.meeting_type_label = v;
                    return e;
                  });
                }}
                placeholder={t(
                  "contohnya: Mesyuarat Ranting Muda",
                  "例如：青年组周会",
                  "for example: Youth Section weekly meeting",
                )}
                className="h-12 w-full max-w-md rounded-lg border border-input bg-white px-3 text-base dark:bg-transparent"
                aria-label="Your own name for this meeting"
              />
              <p className="text-base text-muted-foreground">
                <Tri
                  bm="Nama ini untuk dokumen pertubuhan anda sahaja. Ia tidak dihantar ke eROSES."
                  zh="这个名称只用在你们自己的文件上，不会送去 eROSES。"
                  en="This name is only for your own documents. It is never sent to eROSES."
                />
              </p>
            </div>
          )}

          <FieldRow
            labelBm="Tarikh mesyuarat"
            labelZh="会议日期"
            labelEn="Meeting date"
            field={extraction.meeting_date}
            editor={{ kind: "date" }}
            display={
              isIsoDate(extraction.meeting_date.value)
                ? t(
                    formatDateLong(extraction.meeting_date.value, "bm"),
                    formatDateLong(extraction.meeting_date.value, "zh"),
                    formatDateLong(extraction.meeting_date.value, "en"),
                  )
                : undefined
            }
            onConfirm={() =>
              updateField((e) => {
                confirm(e.meeting_date);
                return e;
              })
            }
            onEdit={(v) =>
              updateField((e) => {
                edit(e.meeting_date, v);
                return e;
              })
            }
            onMarkAbsent={() =>
              updateField((e) => {
                markAbsent(e.meeting_date);
                return e;
              })
            }
          />
          <FieldRow
            labelBm="Tempat mesyuarat"
            labelZh="会议地点"
            labelEn="Meeting venue"
            field={extraction.meeting_venue}
            onConfirm={() =>
              updateField((e) => {
                confirm(e.meeting_venue);
                return e;
              })
            }
            onEdit={(v) =>
              updateField((e) => {
                edit(e.meeting_venue, v);
                return e;
              })
            }
            onMarkAbsent={() =>
              updateField((e) => {
                markAbsent(e.meeting_venue);
                return e;
              })
            }
          />

        </StepGroup>

        <StepGroup
          titleBm="Siapa yang hadir"
          titleZh="谁出席了"
          titleEn="Who attended"
          outstanding={groups.attendees.outstanding}
          total={groups.attendees.total}
          defaultOpen={firstUnfinished === "attendees"}
        >
          {extraction.attendees.map((a, i) => (
            <FieldRow
              key={`att-${i}`}
              labelBm={`Hadir ${i + 1}`}
              labelZh={`出席者 ${i + 1}`}
              labelEn={`Attendee ${i + 1}`}
              field={a.name}
              onConfirm={() =>
                updateField((e) => {
                  confirm(e.attendees[i].name);
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  edit(e.attendees[i].name, v);
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  markAbsent(e.attendees[i].name);
                  return e;
                })
              }
            />
          ))}

        </StepGroup>

        <StepGroup
          titleBm="Apa yang diputuskan"
          titleZh="做了什么决定"
          titleEn="What was decided"
          outstanding={groups.resolutions.outstanding}
          total={groups.resolutions.total}
          defaultOpen={firstUnfinished === "resolutions"}
        >
          {extraction.resolutions.map((r, i) => (
            <FieldRow
              key={`res-${i}`}
              labelBm={`Keputusan ${i + 1}`}
              labelZh={`决议 ${i + 1}`}
              labelEn={`Resolution ${i + 1}`}
              field={r.text}
              onConfirm={() =>
                updateField((e) => {
                  confirm(e.resolutions[i].text);
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  edit(e.resolutions[i].text, v);
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  markAbsent(e.resolutions[i].text);
                  return e;
                })
              }
            />
          ))}

        </StepGroup>

        <StepGroup
          titleBm="Angka wang dalam nota"
          titleZh="笔记里的金额"
          titleEn="Money amounts in the notes"
          outstanding={groups.figures.outstanding}
          total={groups.figures.total}
          defaultOpen={firstUnfinished === "figures"}
        >
          {extraction.figures.map((f, i) => (
            <div key={`fig-${i}`}>
            <FieldRow
              labelBm={`Angka ${i + 1} — perkara`}
              labelZh={`数字 ${i + 1} — 项目`}
              labelEn={`Figure ${i + 1} — what it is`}
              field={f.description}
              display={f.description.value}
              onConfirm={() =>
                updateField((e) => {
                  confirm(e.figures[i].description);
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  edit(e.figures[i].description, v);
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  markAbsent(e.figures[i].description);
                  return e;
                })
              }
            />
            {/* The AMOUNT is now reviewable in its own right.
                Before this, only the description could be confirmed, while
                `amount_cents` was silently excluded from the "everything
                reviewed?" count — so an unread ringgit figure could be printed
                into a document carrying the Hard Rule 8 audit line, and the
                user had no control to confirm or correct it. Hard Rule 2 still
                holds: the string is parsed to integer cents by deterministic
                TypeScript, never by the model. */}
            <FieldRow
              labelBm={`Angka ${i + 1} — jumlah (RM)`}
              labelZh={`数字 ${i + 1} — 金额（RM）`}
              labelEn={`Figure ${i + 1} — amount (RM)`}
              field={{
                value:
                  f.amount_cents.value === null
                    ? ""
                    : (f.amount_cents.value / 100).toFixed(2),
                confidence: f.amount_cents.confidence,
                source_ref: f.amount_cents.source_ref,
              }}
              display={
                f.amount_cents.value === null
                  ? ""
                  : formatRm(f.amount_cents.value)
              }
              onConfirm={() =>
                updateField((e) => {
                  e.figures[i].amount_cents.confidence = "confirmed";
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  const cents = parseRmToCents(v);
                  if (cents === null) return e; // keep the old value on nonsense
                  e.figures[i].amount_cents.value = cents;
                  e.figures[i].amount_cents.confidence = "confirmed";
                  e.figures[i].amount_cents.source_ref = {
                    location: t("diisi oleh anda", "由您填写", "entered by you"),
                    snippet: v,
                  };
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  // No amount was written down: keep it null (never 0, which
                  // would read as "the meeting recorded RM0.00") and mark it
                  // reviewed so the document simply omits the line.
                  e.figures[i].amount_cents.value = null;
                  e.figures[i].amount_cents.confidence = "confirmed";
                  e.figures[i].amount_cents.source_ref = {
                    location: t("disemak oleh anda", "由您核对", "reviewed by you"),
                    snippet: t(
                      "tiada dalam nota",
                      "笔记里没写",
                      "not written down in the notes",
                    ),
                  };
                  return e;
                })
              }
            />
            </div>
          ))}

        </StepGroup>

        <StepGroup
          titleBm="Pemegang jawatan"
          titleZh="职位与人名"
          titleEn="Who holds which position"
          outstanding={groups.bearers.outstanding}
          total={groups.bearers.total}
          defaultOpen={firstUnfinished === "bearers"}
        >
          {extraction.office_bearers.map((b, i) => (
            <div key={`ob-${i}`}>
            {/* The POSITION now has its own row.
                Before this it was the only field counted by `outstanding` with no
                control anywhere in the UI — this row bound `field={b.person_name}`
                and merely READ `b.position.value` for its label. So a real photo
                where the job title was illegible left `position.confidence:
                "missing"`, `allReviewed` false forever, and "Save to History"
                permanently disabled with no way out. (2026-07-28 audit.) */}
            <FieldRow
              labelBm={`Jawatan ${i + 1}`}
              labelZh={`职位 ${i + 1}`}
              labelEn={`Position ${i + 1}`}
              field={b.position}
              onConfirm={() =>
                updateField((e) => {
                  confirm(e.office_bearers[i].position);
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  edit(e.office_bearers[i].position, v);
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  markAbsent(e.office_bearers[i].position);
                  return e;
                })
              }
            />
            <FieldRow
              labelBm={
                b.position.value
                  ? `${b.position.value} — siapa`
                  : `Siapa (jawatan ${i + 1})`
              }
              labelZh={
                b.position.value ? `${b.position.value} — 是谁` : `谁（职位 ${i + 1}）`
              }
              // Was `"name"`, which with all three languages on rendered as
              // "Pengerusi · Pengerusi · name". (2026-07-28 audit.)
              labelEn={
                b.position.value
                  ? `${b.position.value} — who`
                  : `Who (position ${i + 1})`
              }
              field={b.person_name}
              onConfirm={() =>
                updateField((e) => {
                  confirm(e.office_bearers[i].person_name);
                  return e;
                })
              }
              onEdit={(v) =>
                updateField((e) => {
                  edit(e.office_bearers[i].person_name, v);
                  return e;
                })
              }
              onMarkAbsent={() =>
                updateField((e) => {
                  markAbsent(e.office_bearers[i].person_name);
                  return e;
                })
              }
            />
            </div>
          ))}
        </StepGroup>
        {/* End of the review: say what happens next instead of leaving the
            person at the bottom of a long card with nothing to aim at. */}
        {allReviewed ? (
          <StepNextButton
            targetId="step-document"
            labelBm="Pergi ke langkah 3: minit siap"
            labelZh="去第 3 步：看做好的记录"
            labelEn="Go to step 3: the finished minutes"
          />
        ) : (
          <p className="text-base font-medium text-amber-900 dark:text-amber-100">
            <Tri
              bm={`Masih ada ${outstanding} perkara di atas. Selepas semuanya disemak, Minit akan membuka langkah 3 untuk anda.`}
              zh={`上面还有 ${outstanding} 项没核对。全部核对好之后，Minit 会自动帮您打开第 3 步。`}
              en={`${outstanding} item(s) above still need you. Once they are all checked, Minit opens step 3 for you.`}
            />
          </p>
        )}
        </div>
      </StepCard>

      {/* 3 — the finished document + save */}
      <StepCard
        id="step-document"
        step={3}
        titleBm="Minit siap (Bahasa Malaysia)"
        titleZh="做好的会议记录（马来文）"
        titleEn="The finished minutes (in Malay)"
        summary={
          <Tri
            bm="Minit menulis dokumen rasmi dalam Bahasa Malaysia daripada perkara yang anda sahkan di atas. Baca sekali, kemudian simpan."
            zh="Minit 会用您上面确认的内容，写成马来文的正式文件。看一遍，然后保存。"
            en="Minit writes the official Malay document from what you confirmed above. Read it once, then save."
          />
        }
        status={
          saveResult === "ok"
            ? "done"
            : isSample
              ? "example"
              : allReviewed && isReal
                ? "needs-you"
                : "locked"
        }
        lockedReason={
          nothingYet ? (
            <Tri
              bm="Ambil gambar nota mesyuarat di langkah 1 dahulu. Minit tidak menulis dokumen rasmi daripada halaman yang kosong."
              zh="请先在第 1 步拍下会议笔记。空白的内容，Minit 不会拿去写正式文件。"
              en="Take a photo of the notes in step 1 first. Minit does not write an official document from an empty page."
            />
          ) : (
            <Tri
              bm={`Buka langkah 2 dahulu — masih ada ${outstanding} perkara untuk disemak. Minit tidak akan menulis dokumen rasmi daripada maklumat yang belum anda sahkan.`}
              zh={`请先展开第 2 步 —— 还有 ${outstanding} 项要核对。您还没确认的内容，Minit 不会拿去写正式文件。`}
              en={`Open step 2 first — ${outstanding} item(s) still need checking. Minit will not write an official document from anything you have not confirmed.`}
            />
          )
        }
        defaultOpen={isReal && allReviewed && saveResult !== "ok"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-muted-foreground">
            {aiDraft ? (
              <Tri
                bm="Minit telah menyusun perkara yang anda sahkan menjadi dokumen rasmi dalam Bahasa Malaysia. Sila baca sekali sebelum simpan."
                zh="Minit 已经把您确认的内容整理成马来文的正式文件。保存前请看一遍。"
                en="Minit has organised what you confirmed into the formal Malay document. Please read it once before saving."
              />
            ) : allReviewed ? (
              <Tri
                bm="Ini paparan ringkas — perkara anda mengikut susunan asal nota. Tekan butang di bawah dan Minit akan menyusunnya menjadi dokumen rasmi Bahasa Malaysia."
                zh="这只是快速预览 —— 内容还是照笔记原本的顺序排。按下面的按钮，Minit 会把它整理成正式的马来文文件。"
                en="This is the quick preview — your items in the order they were written. Tap the button below and Minit will organise them into the formal Malay document."
              />
            ) : (
              <Tri
                bm="Paparan ini dikemas kini secara langsung semasa anda mengesahkan di atas."
                zh="您在上面每确认一项，这个预览就会跟着更新。"
                en="This preview updates as you confirm things above."
              />
            )}
          </p>
          {isReal && allReviewed && (
            <div className="flex flex-col gap-3">
              <fieldset className="flex flex-wrap items-center gap-2">
                <legend className="mb-1 text-base font-medium">
                  <Tri
                    bm="Dokumen ini dalam bahasa apa?"
                    zh="这份文件要用什么语言？"
                    en="What language should this document be in?"
                  />
                </legend>
                {MINUTES_LANGUAGES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setDocLang(code)}
                    aria-pressed={docLang === code}
                    className={
                      "rounded-xl border-2 px-4 py-2 text-base transition " +
                      (docLang === code
                        ? "border-[#7c6cf5] bg-[#7c6cf5]/10 font-semibold"
                        : "border-input hover:bg-black/5 dark:hover:bg-white/5")
                    }
                  >
                    {LANGUAGE_CHOICE[code]}
                  </button>
                ))}
              </fieldset>
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Bahasa Malaysia ialah versi untuk eROSES. Versi lain adalah untuk kegunaan pertubuhan anda sendiri — ambil gambar sekali, buat mana-mana versi yang anda perlukan."
                  zh="要交去 eROSES 的是马来文版。另外两个是给你们社团自己看的 —— 拍一次照，要哪个版本就做哪个。"
                  en="Bahasa Malaysia is the version for eROSES. The others are for your own organisation — photograph once, produce whichever version you need."
                />
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  variant={aiDraft ? "outline" : "default"}
                  onClick={writeWithAi}
                  disabled={draftBusy}
                >
                  {draftBusy ? (
                    <Tri
                      bm="Minit sedang menulis…"
                      zh="Minit 正在写…"
                      en="Minit is writing…"
                    />
                  ) : aiDraft ? (
                    <Tri bm="Tulis semula" zh="重写一次" en="Write it again" />
                  ) : (
                    <Tri
                      bm="✍️ Minta Minit tulis dokumen rasmi"
                      zh="✍️ 让 Minit 写成正式记录"
                      en="✍️ Have Minit write the official document"
                    />
                  )}
                </Button>
                <span className="text-sm text-muted-foreground">
                  <Tri
                    bm="Guna 1 daripada kuota AI anda."
                    zh="会用掉 1 次 AI 额度。"
                    en="Uses 1 of your AI allowance."
                  />
                </span>
              </div>
              {draftError && (
                <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
                  {draftError}
                  {"\n"}
                  <Tri
                    bm="Paparan ringkas di bawah masih boleh disimpan — kuota anda tidak ditolak."
                    zh="下面那份快速预览还是可以保存 —— 额度没有被扣。"
                    en="The plain preview below can still be saved — your allowance was not charged."
                  />
                </p>
              )}
            </div>
          )}
          {isReal && allReviewed ? (
            <div className="flex flex-col gap-2">
              <label
                htmlFor="minutes-document"
                className="text-base font-medium"
              >
                <Tri
                  bm="Anda boleh betulkan terus di sini — ini dokumen anda."
                  zh="您可以直接在这里修改 —— 这是您的文件。"
                  en="You can correct it directly here — this is your document."
                />
              </label>
              <textarea
                id="minutes-document"
                value={shownDocument}
                onChange={(e) =>
                  setManualEdit({ for: extraction, text: e.target.value })
                }
                spellCheck={false}
                rows={22}
                className="w-full rounded-xl border-2 border-input bg-white/80 p-4 text-base leading-relaxed dark:bg-white/5"
              />
              <p className="text-sm text-muted-foreground">
                <Tri
                  bm="Baris tajuk dan baris audit sentiasa ditulis semula oleh Minit semasa menyimpan, jadi nama pertubuhan dan nama pengesah tidak boleh salah."
                  zh="抬头那一行和最下面的审计行，保存时 Minit 一定会重写一次 —— 机构名和确认人不会写错。"
                  en="The letterhead and the audit line are always rewritten by Minit when you save, so the organisation and the confirming name cannot be wrong."
                />
              </p>
              {edited !== null && (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setManualEdit(null)}
                  >
                    ↩︎{" "}
                    <Tri
                      bm="Buang suntingan saya"
                      zh="放弃我的修改"
                      en="Discard my edits"
                    />
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <pre className="rounded-xl border-2 border-input bg-white/80 p-4 text-base whitespace-pre-wrap dark:bg-white/5">
              {shownDocument}
            </pre>
          )}
          <div className="flex flex-col gap-3">
            {isSample && (
              <p className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                <Tri
                  bm="Ini contoh — tidak boleh disimpan ke sejarah pertubuhan anda. Ambil gambar nota anda dahulu."
                  zh="这是示范内容，不能保存到您机构的历史。请先拍下您自己的笔记。"
                  en="This is the example — it cannot be saved into your organisation's history. Take a photo of your own notes first."
                />
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={saveToHistory}
                // Neither the example nor an empty page may enter a real
                // organisation's audit trail — hence isReal, not !isSample.
                disabled={!allReviewed || saveBusy || !isReal}
              >
                {saveBusy ? (
                  <Tri bm="Menyimpan…" zh="保存中…" en="Saving…" />
                ) : (
                  <Tri bm="Simpan ke Sejarah" zh="保存到历史" en="Save to History" />
                )}
              </Button>
              <Link
                href="/minutes/history"
                className="text-base underline underline-offset-4"
              >
                <Tri bm="Sejarah minit" zh="历史记录" en="Minutes history" /> →
              </Link>
            </div>
          </div>
          {saveResult === "ok" && (
            <>
              <p className="rounded-xl border-2 border-green-400 bg-green-50 p-3 text-base font-medium text-green-900 dark:bg-green-400/10 dark:text-green-100">
                ✓{" "}
                <Tri
                  bm="Minit disimpan ke sejarah pertubuhan."
                  zh="会议记录已经保存到机构的历史里了。"
                  en="The minutes are saved in the organisation's history."
                />
              </p>
              <StepNextButton
                targetId="step-eroses"
                labelBm="Pergi ke langkah 4: nilai eROSES"
                labelZh="去第 4 步：eROSES 要贴的内容"
                labelEn="Go to step 4: the eROSES values"
              />
            </>
          )}
          {saveResult && saveResult !== "ok" && (
            <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium whitespace-pre-line text-red-900 dark:bg-red-400/10 dark:text-red-100">
              {saveResult}
            </p>
          )}
        </div>
      </StepCard>

      {/* 4 — the values to paste into the ROS portal */}
      <StepCard
        id="step-eroses"
        step={4}
        titleBm="Nilai untuk ditampal ke eROSES"
        titleZh="要贴进 eROSES 的内容"
        titleEn="Values to paste into eROSES"
        summary={
          <Tri
            bm="eROSES ialah laman web Jabatan Pendaftaran Pertubuhan (ROS) tempat penyata tahunan difailkan. Salin nilai di sini satu-satu ke dalam borang di laman itu."
            zh="eROSES 是社团注册局（ROS）用来提交年度报告的官方网站。把这里的内容一项一项复制、贴进那个网站的表格。"
            en="eROSES is the Registry of Societies' website where the annual return is filed. Copy each value here into the matching box on that website."
          />
        }
        status={
          isSample ? "example" : allReviewed && isReal ? "needs-you" : "locked"
        }
        lockedReason={
          nothingYet ? (
            <Tri
              bm="Ambil gambar nota mesyuarat di langkah 1 dahulu."
              zh="请先在第 1 步拍下会议笔记。"
              en="Take a photo of the notes in step 1 first."
            />
          ) : (
            <Tri
              bm="Buka langkah 2 dahulu — Minit hanya memberi nilai untuk ditampal selepas anda mengesahkan apa yang ia baca."
              zh="请先展开第 2 步 —— 只有在您确认了 Minit 读到的内容之后，它才会给出可以贴上去的值。"
              en="Open step 2 first — Minit only hands you values to paste after you have confirmed what it read."
            />
          )
        }
      >
        <div>
          <p className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-base font-medium text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
            ⚠{" "}
            <Tri
              bm="Semak nama medan dengan portal sebenar sebelum menghantar. Nama medan di laman ROS boleh berubah."
              zh="送出前请先跟正式网站上的栏位名称核对一次。ROS 网站上的栏位名称有可能改动。"
              en="Check the field names against the live portal before you submit — the names on the ROS site can change."
            />
          </p>
          <div className="grid gap-3">
            {pastePack.map((row) => (
              <div key={row.erosesField} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{row.erosesField}</div>
                    <div className="text-sm text-muted-foreground">
                      {row.erosesFieldEn}
                    </div>
                  </div>
                  <ConfidenceBadge level={row.confidence} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-blue-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-muted-foreground">
                        <Tri bm="Nilai untuk ditampal" zh="要粘贴的值" en="Value to paste" />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={row.value === "—"}
                        onClick={() => copyErosesValue(row.erosesField, row.value)}
                      >
                        {copiedEroses === row.erosesField ? (
                          <>
                            ✓ <Tri bm="Disalin" zh="已复制" en="Copied" />
                          </>
                        ) : (
                          <Tri bm="Salin" zh="复制" en="Copy" />
                        )}
                      </Button>
                    </div>
                    <div className="mt-1 whitespace-normal">{row.value}</div>
                    {row.note && (
                      <div className="mt-1 text-sm text-muted-foreground">
                        {row.note}
                      </div>
                    )}
                  </div>
                  <div className="rounded-md bg-amber-50 p-3">
                    <div className="text-sm font-medium text-muted-foreground">
                      <Tri bm="Sumber (dari nota)" zh="来源（取自记录）" en="Source (from the notes)" />
                    </div>
                    <div className="mt-1 whitespace-normal font-mono text-sm text-muted-foreground">
                      {row.source || "—"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </StepCard>

      {/* OPTIONAL EXTRA — moved BELOW step 4 (2026-07-28). It used to sit
          between steps 2 and 3, breaking the 1-2-3-4 rhythm with something
          nobody has to do. It never opens itself. */}
      <StepCard
        id="step-events"
        titleBm="Acara dalam minit ini"
        titleZh="这份记录里的活动"
        titleEn="Events mentioned in these minutes"
        summary={
          <Tri
            bm="Kalau mesyuarat menyebut tarikh akan datang, Minit boleh masukkannya ke kalendar untuk anda. Pilihan sahaja."
            zh="如果会议里提到将来的日期，Minit 可以帮您加进日历。这一步可以不做。"
            en="If the meeting mentioned a future date, Minit can put it in your calendar. Optional."
          />
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={findEventsInMinutes} disabled={evBusy} variant="outline" size="lg">
              {evBusy ? (
                <Tri bm="⏳ AI sedang mencari…" zh="⏳ AI 寻找中…" en="⏳ AI is looking…" />
              ) : (
                <Tri bm="Cari acara dalam minit" zh="找出记录里的活动" en="Find events in these minutes" />
              )}
            </Button>
            {evRows?.some((r) => r.added) && (
              <a href="/calendar" className="font-medium text-sky-800 underline underline-offset-4">
                <Tri bm="Buka kalendar →" zh="打开日历 →" en="Open the calendar →" />
              </a>
            )}
          </div>
          {evError && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-900">{evError}</div>
          )}
          {evRows && evRows.length === 0 && (
            <p className="text-muted-foreground">
              <Tri
                bm="Tiada acara bertarikh dalam keputusan mesyuarat ini."
                zh="这份记录的决议里没有带日期的活动。"
                en="No dated events in these resolutions."
              />
            </p>
          )}
          {evRows?.map((r, i) => (
            <div
              key={i}
              className={`flex flex-wrap items-center gap-3 rounded-lg border bg-background p-3 ${
                // Was opacity-60 on the whole row including its text.
                r.added ? "border-green-300 bg-green-50" : ""
              }`}
            >
              <span className="text-xl">🎉</span>
              <div className="min-w-40 flex-1">
                <div className="font-medium">{r.title || <em>—</em>}</div>
                <div className="text-sm text-muted-foreground">
                  {r.dateIso || <Tri bm="tiada tarikh" zh="没有日期" en="no date" />}
                  {r.timeText && ` · ${r.timeText}`}
                </div>
              </div>
              <Button
                variant={r.added ? "ghost" : "default"}
                disabled={r.added || !r.dateIso}
                onClick={() => confirmEvent(i)}
              >
                {r.added ? (
                  <Tri bm="✓ Dalam kalendar" zh="✓ 已进日历" en="✓ In the calendar" />
                ) : (
                  <Tri bm="+ Masuk kalendar" zh="+ 加进日历" en="+ Add to calendar" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </StepCard>
    </div>
    </StepFlow>
  );
}
