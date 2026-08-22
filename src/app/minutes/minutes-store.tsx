"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useTriText } from "@/components/language-provider";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import {
  emptyMeetingNotesExtraction,
  type EventExtraction,
  type MeetingNotesExtraction,
} from "@/lib/extraction";
import { loadEvents, saveEvents, sortedByDate, type SimpleEvent } from "@/lib/local-events";
import { saveEvent } from "@/app/calendar/actions";
import { renderMinutesDraftBm } from "@/lib/minutes-draft";
import { buildPastePack } from "@/lib/paste-pack";
import { dayIsoMalaysia } from "@/lib/history";
import { type MinutesLang } from "@/lib/minutes-lang";
import { consumeIntake } from "@/lib/intake-handoff";
import { SAMPLE_ORG_NAME, sampleMeetingExtraction } from "@/lib/sample-data";
import { addRow, removeRow, rowHasContent, type RowList } from "@/lib/extraction-rows";
import { saveConfirmedMinutes } from "./actions";
import {
  MINUTES_STORE_KEY,
  compressPhoto,
  loadSavedMinutes,
  saveMinutes,
  type SaveOutcome,
} from "./minutes-storage";

// ---------------------------------------------------------------------------
// THE MINUTES WORKBENCH — one store, shared by every page under /minutes.
//
// Same reason as src/app/money/register-store.tsx (read that one first): on
// 2026-08-23 /minutes stopped being a single 2039-line page and became
//
//   /minutes             photo of the notes, then check what Minit read
//   /minutes/attendance  who attended — the hundred-name list, on its own
//   /minutes/document    the finished document, saving it, the eROSES values
//   /minutes/history     already existed; now it has a menu entry
//
// One extraction is being worked on at a time and every page edits it, so it is
// owned once, here, by the layout. Next keeps a layout mounted across the routes
// inside it, so moving between the four does not reload or lose anything — and,
// importantly, does not re-run the restore effect that reads localStorage.
//
// The localStorage format is UNCHANGED (see minutes-storage.ts): work saved by
// the old single-page build reads back into the new one.
// ---------------------------------------------------------------------------

/** Any field the review UI can confirm, edit, or mark as "not in the notes". */
export type TextLikeField = {
  value: string;
  confidence: "confirmed" | "check" | "missing";
  source_ref: { location: string; snippet: string } | null;
};

/** One future date found in the minutes, on its way to the calendar. */
export type EvRow = { title: string; dateIso: string; timeText: string; added: boolean };

type GroupCount = { outstanding: number; total: number };

export type MinutesStore = {
  // --- identity, resolved on the server ------------------------------------
  orgName: string | null;
  signerName: string | null;
  /** The name on the rendered document. The example keeps the fictional temple. */
  documentOrgName: string;
  documentSigner: string;

  // --- the extraction being worked on --------------------------------------
  extraction: MeetingNotesExtraction;
  sourceLabel: string | null;
  photoDataUrl: string | null;
  storageNote: SaveOutcome | null;
  aiBusy: boolean;
  aiError: string | null;
  /** True once the restore-from-localStorage pass has run. */
  restored: boolean;

  // Three states, and they are NOT the same thing:
  //   isReal      — a photo has been read; this is the person's own meeting.
  //   isSample    — they asked for the worked example (opt-in, never default).
  //   nothingYet  — fresh page. The normal first visit.
  // Everything downstream (locks, saving, the audit line) keys off isReal, so an
  // empty or example meeting can never be saved as real.
  isReal: boolean;
  isSample: boolean;
  nothingYet: boolean;

  onPhotoPicked: (file: File | null) => Promise<void>;
  /**
   * Start a set of minutes with no photo at all.
   *
   * J's UX list, N1 (2026-08-07): Minit only accepted photos and some PDFs.
   * Typing is the cheapest input there is — no model, no credit, no upload —
   * and it is what somebody reaches for when the notes are already on a laptop,
   * when the photo will not read, or when the meeting had four people in a
   * kopitiam and nobody wrote anything down.
   */
  startTyping: () => void;
  /** True when this set of minutes was typed rather than photographed. */
  typedByHand: boolean;
  openSample: () => void;
  backToEmpty: () => void;

  // --- editing one field inside the extraction tree ------------------------
  updateField: (apply: (e: MeetingNotesExtraction) => MeetingNotesExtraction) => void;
  confirmField: (f: TextLikeField) => void;
  editField: (f: TextLikeField, value: string) => void;
  markAbsent: (f: TextLikeField) => void;
  /** J's UX list, root cause A: a line the AI never proposed. */
  addExtractionRow: (list: RowList) => void;
  removeExtractionRow: (list: RowList, index: number) => void;
  /** True when deleting that row would lose something typed. */
  rowHasContent: (list: RowList, index: number) => boolean;

  // --- how much is left to check ------------------------------------------
  outstanding: number;
  allReviewed: boolean;
  groups: {
    meeting: GroupCount;
    attendees: GroupCount;
    resolutions: GroupCount;
    figures: GroupCount;
    bearers: GroupCount;
  };
  /** Everything except the attendees, which now live on their own page. */
  outstandingHereOutsideAttendance: number;
  firstUnfinished: "meeting" | "attendees" | "resolutions" | "figures" | "bearers" | undefined;
  /**
   * The first unfinished group ON THE /minutes PAGE — attendees excluded.
   *
   * 🔴 Not a tidier version of `firstUnfinished`, a bug fix. Since the
   * 2026-08-23 split the attendees live on their own page, so if they were the
   * first thing needing attention, `firstUnfinished` pointed at a group that is
   * not rendered here — and NOTHING on /minutes opened itself. The page came up
   * with every section collapsed and no sign of where to start, which is
   * precisely the "我也不懂要如何下手" the grouping was built to fix.
   */
  firstUnfinishedHere: "meeting" | "resolutions" | "figures" | "bearers" | undefined;
  todayIso: string;

  // --- the document --------------------------------------------------------
  /** The free, deterministic preview rendered from the confirmed fields. */
  minutesDraft: string;
  /** What step 3 shows and saves: the person's version, else the written
   *  document, else the free preview. */
  shownDocument: string;
  docLang: MinutesLang;
  setDocLang: Dispatch<SetStateAction<MinutesLang>>;
  aiDraft: string | null;
  draftError: string | null;
  draftBusy: boolean;
  writeWithAi: () => Promise<void>;
  edited: string | null;
  setEdited: (text: string | null) => void;
  saveBusy: boolean;
  saveResult: "ok" | string | null;
  saveToHistory: () => Promise<void>;

  // --- eROSES + calendar ---------------------------------------------------
  pastePack: ReturnType<typeof buildPastePack>;
  evRows: EvRow[] | null;
  evBusy: boolean;
  evError: string | null;
  findEventsInMinutes: () => Promise<void>;
  confirmEvent: (idx: number) => void;
};

const MinutesContext = createContext<MinutesStore | null>(null);

export function useMinutes(): MinutesStore {
  const store = useContext(MinutesContext);
  if (!store) {
    throw new Error("useMinutes() outside <MinutesProvider> — is this page under /minutes?");
  }
  return store;
}

export function MinutesProvider({
  orgName,
  signerName,
  children,
}: {
  /** The REAL active organisation, resolved on the server. null = no org yet. */
  orgName: string | null;
  /** The REAL signed-in human, for the Hard Rule 8 audit line preview. */
  signerName: string | null;
  children: ReactNode;
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
  const [storageNote, setStorageNote] = useState<SaveOutcome | null>(null);
  const [typedByHand, setTypedByHand] = useState(false);

  // events-in-minutes bridge
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
  //
  // Since the split this effect lives in the LAYOUT, so it runs once for the
  // whole section rather than once per page — moving from /minutes to
  // /minutes/attendance no longer re-reads localStorage at all.
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
      setTypedByHand(saved.typed === true);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    // AUDIT FIX: do NOT persist the fictional sample seed.
    // Previously this effect ran on the very first render after mount, so
    // merely OPENING /minutes wrote sampleMeetingExtraction into localStorage —
    // and /filings then read that key and presented the fictional temple's AGM
    // as a filing-ready eROSES paste-pack with per-field Copy buttons and a
    // green "minutes processed ✓" tick. Nothing is saved until the user has
    // actually photographed something (sourceLabel !== null).
    // "Nothing to save yet" is now two conditions, not one: no photo AND not
    // typed. Without the second, everything a person typed vanished on refresh.
    if (sourceLabel === null && !typedByHand) return;
    const outcome = saveMinutes({ extraction, sourceLabel, photoDataUrl, typed: typedByHand });
    if (outcome === "photo-dropped" && photoDataUrl !== null) {
      // Clear it from state too, otherwise the failing write repeats forever.
      setPhotoDataUrl(null);
    }
    setStorageNote(outcome === "ok" ? null : outcome);
  }, [extraction, sourceLabel, photoDataUrl, typedByHand, restored]);

  const findEventsInMinutes = useCallback(async () => {
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
  }, [extraction]);

  const confirmEvent = useCallback(
    (idx: number) => {
      if (!evRows) return;
      const r = evRows[idx];
      if (!r.dateIso) return;
      const event: SimpleEvent = {
        id: `${Date.now()}-m${idx}`,
        title: r.title || "Acara",
        dateIso: r.dateIso,
        timeText: r.timeText,
      };
      saveEvents(sortedByDate([...loadEvents(), event]));
      // 2026-08-23: also into the organisation's records, so a date agreed at a
      // meeting reaches the whole committee's calendar and not just the
      // secretary's browser. Fire-and-forget for the same reason as /calendar:
      // it is already on this device, and a failed sync must not undo a
      // confirmation the person just made.
      void saveEvent(event);
      setEvRows(evRows.map((x, i) => (i === idx ? { ...x, added: true } : x)));
    },
    [evRows],
  );

  const onPhotoPicked = useCallback(async (file: File | null) => {
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
      setTypedByHand(false);
      setEvRows(null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }, []);

  /**
   * Nothing to photograph — start from a blank sheet and type.
   *
   * The extraction stays EMPTY and every field stays `missing`: typing does not
   * make a fact true, the person filling each row in does, and that goes
   * through the same edit path that stamps "entered by you" (Hard Rule 1). So a
   * typed set of minutes is held to exactly the same standard as a
   * photographed one — it just skips the model.
   */
  const startTyping = useCallback(() => {
    setExtraction(emptyMeetingNotesExtraction);
    setSourceLabel(null);
    setPhotoDataUrl(null);
    setShowSample(false);
    setEvRows(null);
    setAiError(null);
    setTypedByHand(true);
  }, []);

  /** Clean, empty page: no example, no half-read photo, nothing saved. */
  const backToEmpty = useCallback(() => {
    setExtraction(emptyMeetingNotesExtraction);
    setSourceLabel(null);
    setTypedByHand(false);
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
  }, []);

  /** The worked example, on request only — for a first look or a demo. */
  const openSample = useCallback(() => {
    setExtraction(sampleMeetingExtraction);
    setShowSample(true);
    setSourceLabel(null);
    setTypedByHand(false);
    setPhotoDataUrl(null);
    setEvRows(null);
    setAiError(null);
  }, []);

  // Generic updater for one field inside the extraction tree.
  const updateField = useCallback(
    (apply: (e: MeetingNotesExtraction) => MeetingNotesExtraction) => {
      setExtraction((prev) => apply(structuredClone(prev)));
    },
    [],
  );

  const confirmField = useCallback((f: TextLikeField) => {
    f.confidence = "confirmed";
  }, []);

  const editField = useCallback(
    (f: TextLikeField, value: string) => {
      f.value = value;
      // A human typed/verified it — human is the source of truth now.
      f.confidence = value === "" ? "missing" : "confirmed";
      if (value !== "" && f.source_ref === null) {
        f.source_ref = {
          location: t("diisi oleh anda", "由您填写", "entered by you"),
          snippet: value,
        };
      }
    },
    [t],
  );

  /**
   * "This fact was never written down." Marks the field REVIEWED while leaving
   * its value empty, so the rendered document simply omits the line instead of
   * containing a value the human had to invent to unblock the Save button.
   * Hard Rule 1 forbids the AI inventing; it must not force the human to either.
   */
  const markAbsent = useCallback(
    (f: TextLikeField) => {
      f.value = "";
      f.confidence = "confirmed";
      // Hard Rule 1 requires every non-missing field to carry a source_ref, and
      // there genuinely IS a provenance here: a human inspected the notes and
      // asserted the fact is not in them. That is recorded, not invented.
      f.source_ref = {
        location: t("disemak oleh anda", "由您核对", "reviewed by you"),
        // The provenance has to be TRUE, not just reassuring: for typed minutes
        // there are no notes for the fact to be absent from, so recording
        // "not written down in the notes" would be inventing a source — the
        // exact thing Hard Rule 1 exists to stop.
        snippet: typedByHand
          ? t("tiada / tidak berkenaan", "没有这一项", "none / not applicable")
          : t("tiada dalam nota", "笔记里没写", "not written down in the notes"),
      };
    },
    [t, typedByHand],
  );

  // --- adding and removing rows by hand ------------------------------------
  // The pure part lives in lib/extraction-rows.ts (18 tests). Here it only has
  // to go through updateField, which structuredClones — see the warning at the
  // top of that file about the shallow copy.
  const addExtractionRow = useCallback(
    (list: RowList) => updateField((e) => addRow(e, list)),
    [updateField],
  );
  const removeExtractionRow = useCallback(
    (list: RowList, index: number) => updateField((e) => removeRow(e, list, index)),
    [updateField],
  );
  const rowHasContentHere = useCallback(
    (list: RowList, index: number) => rowHasContent(extraction, list, index),
    [extraction],
  );

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
   * 2026-07-28, user: "太多太乱… 我也不懂要如何下手". This was a flat list of ~20
   * expanded field rows — the worst wall of text in the app. Grouping it lets
   * each group say "3 of 5 still need your check". Since the 2026-08-23 split
   * the same counts also feed the tab rail, and "who attended" is a page of its
   * own rather than one more group in the pile.
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

  const outstandingHereOutsideAttendance =
    groups.meeting.outstanding +
    groups.resolutions.outstanding +
    groups.figures.outstanding +
    groups.bearers.outstanding;

  /** Which group opens itself: the first that still needs the person. */
  const firstUnfinished = (
    ["meeting", "attendees", "resolutions", "figures", "bearers"] as const
  ).find((k) => groups[k].outstanding > 0);
  const firstUnfinishedHere = (
    ["meeting", "resolutions", "figures", "bearers"] as const
  ).find((k) => groups[k].outstanding > 0);
  const todayIso = dayIsoMalaysia(new Date().toISOString()) as string;

  // "This is the person's own meeting" — from a photo OR typed by hand. Before
  // 2026-08-23 it meant "a photo was read", which is why typing was impossible.
  const isReal = sourceLabel !== null || typedByHand;
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

  // --- Letting the model actually WRITE the document ------------------------
  // 2026-08-19 (user: "感觉像是 AI 做工，又没完全做好 … 只放 pointform 丢给我",
  // "说做马来文版也没有"). Both complaints had one cause: this step called no
  // model at all. It printed the confirmed strings, in whatever language they
  // were written in, under hardcoded BM headings. The template stays as the free
  // live preview; the button is what turns it into a document.
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
  const [manualEdit, setManualEdit] = useState<{
    for: MeetingNotesExtraction;
    text: string;
  } | null>(null);

  // Switching language makes the existing document the wrong document, in the
  // same way that editing a field does.
  const aiDraft =
    draftResult && draftResult.for === extraction && draftResult.lang === docLang
      ? draftResult.markdown
      : null;
  const draftError =
    draftFailure && draftFailure.for === extraction ? draftFailure.message : null;
  const edited = manualEdit && manualEdit.for === extraction ? manualEdit.text : null;
  const shownDocument = edited ?? aiDraft ?? minutesDraft;

  const writeWithAi = useCallback(async () => {
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
  }, [extraction, docLang]);

  /**
   * The document is the person's to correct. A model that is right most of the
   * time is only useful if the last 5% can be fixed by hand in ten seconds —
   * otherwise the whole draft gets retyped somewhere else, which is what this
   * product exists to stop. Tagged like the others: an edit made against one set
   * of confirmed facts does not survive a change to those facts.
   */
  const setEdited = useCallback(
    (text: string | null) => {
      setManualEdit(text === null ? null : { for: extraction, text });
    },
    [extraction],
  );

  // --- Phase 7: save the confirmed minutes to the org's history -------------
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<"ok" | string | null>(null);

  const saveToHistory = useCallback(async () => {
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
  }, [extraction, edited, aiDraft, docLang]);

  return (
    <MinutesContext.Provider
      value={{
        orgName,
        signerName,
        documentOrgName,
        documentSigner,
        extraction,
        sourceLabel,
        photoDataUrl,
        storageNote,
        aiBusy,
        aiError,
        restored,
        isReal,
        isSample,
        nothingYet,
        onPhotoPicked,
        startTyping,
        typedByHand,
        openSample,
        backToEmpty,
        updateField,
        confirmField,
        editField,
        markAbsent,
        addExtractionRow,
        removeExtractionRow,
        rowHasContent: rowHasContentHere,
        outstanding,
        allReviewed,
        groups,
        outstandingHereOutsideAttendance,
        firstUnfinished,
        firstUnfinishedHere,
        todayIso,
        minutesDraft,
        shownDocument,
        docLang,
        setDocLang,
        aiDraft,
        draftError,
        draftBusy,
        writeWithAi,
        edited,
        setEdited,
        saveBusy,
        saveResult,
        saveToHistory,
        pastePack,
        evRows,
        evBusy,
        evError,
        findEventsInMinutes,
        confirmEvent,
      }}
    >
      {children}
    </MinutesContext.Provider>
  );
}
