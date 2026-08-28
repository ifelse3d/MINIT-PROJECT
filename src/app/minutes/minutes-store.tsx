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
import { uploadErrorMessage } from "@/lib/shrink-photo";
import { prepareUploadForSend } from "@/lib/upload-relay-client";
import {
  emptyMeetingNotesExtraction,
  type EventExtraction,
  type MeetingNotesExtraction,
} from "@/lib/extraction";
import { loadEvents, saveEvents, sortedByDate, type SimpleEvent } from "@/lib/local-events";
import { saveEvent } from "@/app/calendar/actions";
import { renderMinutesDraftBm } from "@/lib/minutes-draft";
import { cleanMinutesTitle, suggestMinutesTitle } from "@/lib/minutes-title";
import { buildPastePack, type FilingRosterEntry } from "@/lib/paste-pack";
import { dayIsoMalaysia } from "@/lib/history";
import { type MinutesLang } from "@/lib/minutes-lang";
import { consumeIntake } from "@/lib/intake-handoff";
import { SAMPLE_ORG_NAME, sampleMeetingExtraction } from "@/lib/sample-data";
import {
  EMPTY_MEETING_FACTS,
  applyKnownMeetingFacts,
  type KnownMeetingFacts,
} from "@/lib/meeting-facts";
import {
  hasMeetingContent,
  mergeMeetingExtractions,
  mergedSourceLabel,
} from "@/lib/extraction-merge";
import { addRow, removeRow, rowHasContent, type RowList } from "@/lib/extraction-rows";
import { saveConfirmedMinutes } from "./actions";
import {
  dropDraft,
  listDrafts,
  loadDraft,
  saveDraft,
  type DraftListItem,
} from "./draft-actions";
import {
  minutesStoreKey,
  compressPhoto,
  loadSavedMinutes,
  saveMinutes,
  type PhotoPage,
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
  /** The LAST page's photo (legacy consumers). Prefer photoPages. */
  photoDataUrl: string | null;
  /** I-2: every merged page's photo, in reading order. */
  photoPages: PhotoPage[];
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

  /**
   * Read a page. `facts` is whatever the person told Minit BEFORE it looked —
   * the meeting type, the date, the venue — and those override whatever the
   * model reads. See lib/meeting-facts.ts for why the date in particular
   * cannot be left to the model.
   */
  onPhotoPicked: (
    file: File | null,
    facts?: KnownMeetingFacts,
    /** 0-1: "fresh" = the person said this photo starts a NEW meeting. */
    mode?: "auto" | "fresh",
  ) => Promise<void>;
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
  /** I-3: a photo has been merged onto typed content — the missing-field
   *  copy must stop blaming the photo alone. */
  mixedInput: boolean;
  /**
   * A human has stated that these notes do not record who attended.
   *
   * 🔴 WHY THIS HAD TO EXIST (产品缺口盘点 §3 item 3). An empty attendee list
   * counted as REVIEWED — "Who attended ✓ All checked (0)" — because
   * `outstanding` counts unconfirmed FIELDS and no attendees means no fields.
   * So a set of minutes recording nobody sailed through, and the number flows
   * into eROSES as "Bilangan Ahli Hadir". Zero attendees at a meeting that
   * happened is either a notes problem or a filing problem; either way it is
   * not something to pass silently.
   *
   * It is a statement by a person, not a default, which is why it is stored
   * rather than inferred: "the notes do not say" is a fact about the notes, and
   * Hard Rule 1 says a human may assert it but nothing may assume it.
   */
  noAttendeesRecorded: boolean;
  setNoAttendeesRecorded: (value: boolean) => void;
  /** True while nobody has said whether the notes record attendance at all. */
  attendanceUnsettled: boolean;
  /** D30: no attendee with a name yet — the confirmed save stays locked. */
  attendanceMissing: boolean;
  openSample: () => void;
  backToEmpty: () => void;

  // --- editing one field inside the extraction tree ------------------------
  updateField: (apply: (e: MeetingNotesExtraction) => MeetingNotesExtraction) => void;
  confirmField: (f: TextLikeField) => void;
  editField: (f: TextLikeField, value: string) => void;
  markAbsent: (f: TextLikeField) => void;
  /** J's UX list, root cause A: a line the AI never proposed. */
  addExtractionRow: (list: RowList) => void;
  /**
   * Add attendees by name, already confirmed.
   *
   * Used by the committee-list picker (roster-picker.tsx). A name ticked off
   * the society's own committee list is a human ASSERTION that the person was
   * there — so it arrives `confirmed`, and the source_ref says exactly that,
   * which is what Hard Rule 1 requires of a non-missing field. It is not the
   * AI having read anything, and the record must not suggest it was.
   *
   * Names already present are skipped: ticking somebody twice is a slip, not
   * an instruction to record them twice.
   */
  addNamedAttendees: (names: string[]) => void;
  removeExtractionRow: (list: RowList, index: number) => void;
  /** True when deleting that row would lose something typed. */
  rowHasContent: (list: RowList, index: number) => boolean;

  // --- how much is left to check ------------------------------------------
  outstanding: number;
  allReviewed: boolean;
  /** Amber ("check") fields — value present, AI unsure. One tap can clear them. */
  checkOutstanding: number;
  /** Red ("missing") fields — no value; a human must fill or mark absent. */
  missingOutstanding: number;
  /**
   * R-4 (2026-08-25): "全部沒問題" — confirm every remaining AMBER field in one
   * tap. The person has read the document preview and vouches for what the AI
   * read. Deliberately never touches a RED field: confirming an empty value
   * would invent facts by omission (Hard Rule 1) — those need a human's typing
   * or an explicit "not in the notes".
   */
  confirmAllChecks: () => void;
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
  /** J 28/8 item 3: the document's NAME. `docTitle` is what the person typed
   *  (may be ""); `suggestedTitle` is the deterministic pre-fill (type+date);
   *  the save stores whichever of the two is non-empty. */
  docTitle: string;
  setDocTitle: (title: string) => void;
  suggestedTitle: string;
  aiDraft: string | null;
  draftError: string | null;
  draftBusy: boolean;
  writeWithAi: () => Promise<void>;
  edited: string | null;
  setEdited: (text: string | null) => void;
  saveBusy: boolean;
  saveResult: "ok" | string | null;
  /**
   * S0-3 UI half (2026-08-25, found by scripts/e2e-minutes.mjs): THIS exact
   * document has already been stored. The save button locks on it, so a
   * double press cannot store twice even while migration 20260828000000
   * (the DB unique constraint) is not applied. Any edit produces a new
   * extraction object and unlocks the button — an edited document is a new
   * save, which is correct.
   */
  alreadySaved: boolean;
  /** The stored row's id from THIS sitting's save — where the finished
   *  document now lives (/minutes/history/<id>). */
  savedDocId: number | null;
  /** Resolves {ok:true, id} when the document reached History — the caller
   *  then walks to the finished document's own page (J 28/8 evening items
   *  6+7: preview + print RIGHT THERE, not hunted for later). */
  saveToHistory: () => Promise<{ ok: boolean; id: number | null }>;

  // --- eROSES + calendar ---------------------------------------------------
  pastePack: ReturnType<typeof buildPastePack>;
  /** The committee roster (G-1) — also the name→IC-name table the document
   *  page uses to stand official names in for Chinese ones (J 28/8 item 1). */
  filingRoster: FilingRosterEntry[];
  evRows: EvRow[] | null;
  evBusy: boolean;
  evError: string | null;
  findEventsInMinutes: () => Promise<void>;
  confirmEvent: (idx: number) => void;

  // --- C-13 (work order 51): cloud drafts ---------------------------------
  /** This organisation's unfinished drafts in the cloud, newest first.
   *  null = not loaded yet; [] = none (or the DB is behind — fail-open). */
  cloudDrafts: DraftListItem[] | null;
  /** Which cloud draft the CURRENT workspace is (null = none yet). */
  currentDraftKey: string | null;
  /** A sentence when a draft operation could not deliver; null otherwise. */
  draftNote: string | null;
  /** 拍板 8's scenario: keep THIS unfinished meeting in the cloud and open a
   *  clean workspace for the one that is starting. false = could not stash
   *  (nothing was cleared; draftNote says why). */
  stashAndStartNew: () => Promise<boolean>;
  /** Load a cloud draft into the workspace (stashing current work first). */
  resumeDraft: (clientKey: string) => Promise<void>;
  /** Remove a listed draft (never the one currently open). */
  deleteCloudDraft: (clientKey: string) => void;
};

const MinutesContext = createContext<MinutesStore | null>(null);

/** C-13: a fresh draft identity, minted where the draft is born. */
function mintDraftKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** What a cloud draft's payload must look like before it may enter the
 *  workspace — it crossed a boundary, so it is not trusted (the intake-parcel
 *  rule). Loose on purpose: extra keys are ignored, absents default. */
type DraftPayload = {
  extraction: MeetingNotesExtraction;
  sourceLabel?: string | null;
  typed?: boolean;
  noAttendees?: boolean;
  title?: string;
  photoPages?: { name: string; storagePath: string | null }[];
};

function isDraftPayload(v: unknown): v is DraftPayload {
  if (typeof v !== "object" || v === null) return false;
  const e = (v as { extraction?: unknown }).extraction;
  if (typeof e !== "object" || e === null) return false;
  const x = e as Record<string, unknown>;
  return (
    Array.isArray(x.attendees) &&
    Array.isArray(x.resolutions) &&
    typeof x.meeting_date === "object" &&
    x.meeting_date !== null &&
    typeof x.meeting_type === "object" &&
    x.meeting_type !== null
  );
}

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
  filingRoster = [],
  children,
}: {
  /** The REAL active organisation, resolved on the server. null = no org yet. */
  orgName: string | null;
  /** The REAL signed-in human, for the Hard Rule 8 audit line preview. */
  signerName: string | null;
  /** G-1: the committee roster (with IC names) the paste-pack files from. */
  filingRoster?: FilingRosterEntry[];
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
  // I-2: EVERY merged page's photo (the last one doubles as the legacy
  // single-photo slot in storage). Replaced wholesale on a fresh photo,
  // appended to on a page-merge.
  const [photoPages, setPhotoPages] = useState<PhotoPage[]>([]);
  const photoDataUrl = photoPages.length > 0 ? photoPages[photoPages.length - 1].dataUrl : null;
  const [restored, setRestored] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [storageNote, setStorageNote] = useState<SaveOutcome | null>(null);
  // C-13: cloud drafts. The key identifies THIS workspace's row; the timer
  // debounces autosaves; droppedFor stops the saved-to-History cleanup from
  // firing once per render.
  const [cloudDrafts, setCloudDrafts] = useState<DraftListItem[] | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const draftKeyRef = useRef<string | null>(null);
  // The ref is the SYNCHRONOUS truth (effects write blobs with it in the same
  // pass); this state is its render-safe mirror for the UI. Effects update it
  // through setTimeout(0) — the repo's sanctioned shape.
  const [draftKeyForUi, setDraftKeyForUi] = useState<string | null>(null);
  const cloudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const droppedForRef = useRef<string | null>(null);
  const [typedByHand, setTypedByHand] = useState(false);
  const [noAttendeesRecorded, setNoAttendeesRecorded] = useState(false);
  // J 28/8 item 3: the person's own name for the document. Plain state (not
  // tagged to the extraction object): correcting a field must not throw away
  // a name they already typed. Reset wherever the WORKSPACE resets.
  const [docTitle, setDocTitle] = useState("");
  /**
   * I-3 (26 号报告 §3-4): TRUE once a photo has been merged ONTO typed
   * content. In that state an empty field is a field neither the typing nor
   * the photo supplied — so the copy must stop claiming "the AI could not
   * read N items" (they were never in the photo) and the absent-source must
   * say the neutral truth ("neither the photo nor the notes have this").
   */
  const [mixedInput, setMixedInput] = useState(false);

  // --- Phase 7 save-to-history state. Declared HERE (not next to
  // saveToHistory below) because the restore effect and onPhotoPicked need the
  // setters: 0-1 (26 号报告 2-1) made "this workspace was already saved" a fact
  // that must survive a reload and gate the next photo.
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<"ok" | string | null>(null);
  // WHICH extraction object was stored — object identity, so any edit (which
  // clones the extraction) unlocks saving again. See `alreadySaved` on the
  // store type for why this exists (found by scripts/e2e-minutes.mjs).
  const [savedFor, setSavedFor] = useState<MeetingNotesExtraction | null>(null);
  const [savedDocId, setSavedDocId] = useState<number | null>(null);
  const alreadySaved = saveResult === "ok" && savedFor === extraction;

  // S0-3 (2026-08-25): one idempotency key per DOCUMENT, not per attempt. A
  // double tap or a timed-out retry re-sends the SAME key, and the server
  // refuses to store the same document twice. A new extraction is a new
  // document, so the key resets with it.
  const saveClientIdRef = useRef<string | null>(null);
  useEffect(() => {
    saveClientIdRef.current = null;
  }, [extraction]);

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
      // 28/8 evening (last round's own "one door" gap): the home page now
      // hands over WHERE the original landed (and a small preview when it
      // could make one), so a meeting that started at the front door links
      // its photos into History exactly like one photographed here.
      // A-5: a multi-photo send lists every page in `pages` — show them all.
      setPhotoPages(
        handed.pages && handed.pages.length > 0
          ? handed.pages.map((p) => ({
              name: p.fileName,
              dataUrl: p.photoDataUrl ?? "",
              storagePath: p.storagePath,
            }))
          : handed.storagePath || handed.photoDataUrl
            ? [
                {
                  name: handed.fileName,
                  dataUrl: handed.photoDataUrl ?? "",
                  storagePath: handed.storagePath ?? null,
                },
              ]
            : [],
      );
      setRestored(true);
      return;
    }
    const saved = loadSavedMinutes();
    // J 28/8 evening item 1 (the bug he reported TWICE): a workspace whose
    // meeting is ALREADY IN HISTORY does not come back. "新的会议记录" now
    // means what it says — the saved document lives on its own History page
    // (print, photos, edit all there); restoring it here only ever made the
    // next visit open on last month's meeting.
    if (saved?.savedToHistory) {
      try {
        localStorage.removeItem(minutesStoreKey());
      } catch {
        // Storage unavailable — nothing restored either way.
      }
      setRestored(true);
      return;
    }
    if (saved) {
      setExtraction(saved.extraction);
      setSourceLabel(saved.sourceLabel);
      // I-2: pages when the blob has them; a legacy single photo reads as
      // one page.
      setPhotoPages(
        saved.photoPages ??
          (saved.photoDataUrl
            ? [{ name: saved.sourceLabel ?? "photo", dataUrl: saved.photoDataUrl }]
            : []),
      );
      setTypedByHand(saved.typed === true);
      setNoAttendeesRecorded(saved.noAttendees === true);
      if (typeof saved.title === "string") setDocTitle(saved.title);
      // C-13: keep writing into the same cloud draft this device was on.
      if (typeof saved.draftKey === "string" && saved.draftKey !== "") {
        draftKeyRef.current = saved.draftKey;
        const k = saved.draftKey;
        setTimeout(() => setDraftKeyForUi(k), 0);
      }
      // (0-1's "restore the saved mark" branch is gone on purpose — a
      // saved-to-History blob is purged above and never restored at all.)
    }
    setRestored(true);
  }, []);

  // C-13: what unfinished drafts does the CLOUD hold for this org? Loaded
  // once per visit; [] covers "none" and "DB behind migration 33" alike
  // (fail-open) — the picker then simply does not render.
  useEffect(() => {
    if (!restored) return;
    let cancelled = false;
    void listDrafts().then((rows) => {
      if (!cancelled) setCloudDrafts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [restored]);

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
    // C-13: content exists, so this workspace IS a draft — give it its
    // identity before anything is written under it.
    if (!draftKeyRef.current) {
      draftKeyRef.current = mintDraftKey();
      const k = draftKeyRef.current;
      setTimeout(() => setDraftKeyForUi(k), 0);
    }
    const outcome = saveMinutes({
      extraction,
      sourceLabel,
      // Legacy slot carries the last page for older readers of the blob.
      photoDataUrl,
      photoPages,
      typed: typedByHand,
      noAttendees: noAttendeesRecorded,
      title: docTitle,
      savedToHistory: alreadySaved,
      draftKey: draftKeyRef.current,
    });
    if (outcome === "photo-dropped" && photoPages.length > 0) {
      // Clear them from state too, otherwise the failing write repeats forever.
      setPhotoPages([]);
    }
    setStorageNote(outcome === "ok" ? null : outcome);

    // C-13: the CLOUD copy. Saved-to-History means the draft became a
    // document — its row is deleted (D36), once. Unsaved content autosaves,
    // debounced so typing never races the network; fire-and-forget, and a
    // db-behind answer simply means "localStorage only, like before".
    if (alreadySaved) {
      const key = draftKeyRef.current;
      if (key && droppedForRef.current !== key) {
        droppedForRef.current = key;
        void dropDraft(key);
      }
      return;
    }
    if (showSample) return;
    const clientKey = draftKeyRef.current;
    const payload = {
      extraction,
      sourceLabel,
      typed: typedByHand,
      noAttendees: noAttendeesRecorded,
      title: docTitle,
      // Paths only — previews stay on the device (and in the uploads bucket).
      photoPages: photoPages.map((p) => ({
        name: p.name,
        storagePath: p.storagePath ?? null,
      })),
    };
    // BM for the derived label (docLang is declared further down — and a
    // draft's label must not change with the viewer's language anyway).
    const title =
      cleanMinutesTitle(docTitle) || suggestMinutesTitle(extraction, "bm") || sourceLabel;
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    cloudTimerRef.current = setTimeout(() => {
      void saveDraft({ clientKey, title, payload });
    }, 2500);
  }, [extraction, sourceLabel, photoDataUrl, photoPages, typedByHand, noAttendeesRecorded, docTitle, restored, alreadySaved, showSample]);

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

  const onPhotoPicked = useCallback(async (
    file: File | null,
    facts: KnownMeetingFacts = EMPTY_MEETING_FACTS,
    // 0-1 (26 号报告 2-1): "fresh" is the person's answer to "start a new
    // meeting?" asked when the workspace still shows a SAVED meeting — the
    // read then replaces the workspace wholesale instead of merging last
    // month's confirmed fields over this month's page. "auto" keeps the G-2
    // behaviour: an unsaved workspace with content means "another page".
    mode: "auto" | "fresh" = "auto",
  ) => {
    if (!file) return;
    setAiError(null);
    setAiBusy(true);
    try {
      // 48 + A-4: shrink photos in the browser; relay a big PDF via Storage;
      // refuse honestly what neither road can carry. One helper, every door.
      const prepared = await prepareUploadForSend(file);
      if (prepared.send === "refuse") throw new Error(prepared.error);
      const form = new FormData();
      if (prepared.send === "file") form.append("photo", prepared.file);
      else form.append("storagePath", prepared.storagePath);
      // F-2: the supplement box travels WITH the photo, so the model reads
      // with the person's own knowledge (abbreviations, names, which date is
      // which). Sent only when something was typed.
      if (facts.notes.trim() !== "") form.append("context", facts.notes.trim());
      const res = await fetch("/api/extract-minutes", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(uploadErrorMessage(res.status, body?.error));
      // AFTER the reading, not before: the response replaces the whole object,
      // so anything seeded beforehand would be silently thrown away. Doing it
      // here also makes the precedence explicit — on these three facts the
      // person is the source, not a reviewer.
      const read = applyKnownMeetingFacts(
        body.extraction as MeetingNotesExtraction,
        facts,
        {
          location: t("diisi oleh anda", "由您填写", "entered by you"),
          snippet: t(
            "sebelum MinitAI membaca halaman ini",
            "在 MinitAI 读这一页之前",
            "before MinitAI read this page",
          ),
        },
      );
      // G-2 (2026-08-25, J #10): a photo taken while THIS meeting already has
      // content — typed rows, or an earlier page — ADDS to it, page by page,
      // like the constitution flow. Only a fresh/sample page is replaced
      // wholesale. See lib/extraction-merge.ts for the rules and why.
      // (isReal is declared further down; spelled out here from its inputs so
      // the deps array below never touches it before initialisation.)
      const continuing =
        mode !== "fresh" &&
        (sourceLabel !== null || typedByHand) &&
        hasMeetingContent(extraction);
      // A fresh start also drops the old meeting's save mark — the workspace
      // now holds a NEW document that has not been saved anywhere.
      if (mode === "fresh") {
        setSaveResult(null);
        setSavedFor(null);
        setSavedDocId(null);
        // A new meeting must not inherit the previous meeting's name.
        setDocTitle("");
      }
      // 0-3 (26 号报告 2-3): the person can keep confirming fields during the
      // 5–20 s the model spends reading. Merging onto the snapshot captured at
      // the shutter silently reverted every one of those confirmations, so the
      // merge is a FUNCTIONAL update onto whatever the extraction is NOW.
      // (`continuing` still reads the shutter-time snapshot: whether this
      // photo is "another page of the same meeting" was decided when it was
      // taken, and confirming fields cannot change that answer.)
      setExtraction((current) =>
        continuing ? mergeMeetingExtractions(current, read) : read,
      );
      setSourceLabel((prev) =>
        continuing ? mergedSourceLabel(prev, file.name) : file.name,
      );
      // I-2: keep EVERY page's photo — a merge appends, a fresh photo
      // replaces. Functional update, same reason as the extraction merge.
      const pageDataUrl = await compressPhoto(file);
      // Migration 30: where the ORIGINAL landed in the uploads bucket, so the
      // eventual save can link the document to its source photos.
      const storagePath =
        typeof (body as { storagePath?: unknown }).storagePath === "string"
          ? ((body as { storagePath: string }).storagePath)
          : null;
      setPhotoPages((prev) => {
        const page = pageDataUrl
          ? [{ name: file.name, dataUrl: pageDataUrl, storagePath }]
          : [];
        return continuing ? [...prev, ...page] : page;
      });
      // I-3: a photo landing on TYPED content makes this a mixed document —
      // remembered so the missing-field copy stops blaming the photo.
      setMixedInput(continuing && typedByHand ? true : continuing ? mixedInput : false);
      setTypedByHand(false);
      // A new photo is a new meeting — but a page ADDED to this meeting is
      // not: what somebody said about ITS attendance still stands, unless the
      // new page just produced attendees (then "none recorded" is untrue).
      // Merged attendees are existing ∪ read, and the flag being set implies
      // the existing list was empty — so "still none recorded" ⟺ the flag
      // held AND this page read none.
      setNoAttendeesRecorded(
        (prev) => (continuing ? prev && read.attendees.length === 0 : false),
      );
      setEvRows(null);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
    // `continuing` reads these at shutter time (that decision belongs to the
    // moment the photo was taken); the merge itself is a functional update, so
    // it can never be stale no matter what happens while the model reads.
  }, [t, extraction, sourceLabel, typedByHand, mixedInput]);

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
    setPhotoPages([]);
    setShowSample(false);
    setEvRows(null);
    setAiError(null);
    setTypedByHand(true);
    setNoAttendeesRecorded(false);
    setMixedInput(false);
    setDocTitle("");
    // 0-1: a blank sheet is a NEW document — the previous meeting's save mark
    // must not travel onto it.
    setSaveResult(null);
    setSavedFor(null);
    setSavedDocId(null);
  }, []);

  /** Clean, empty page: no example, no half-read photo, nothing saved. */
  const backToEmpty = useCallback(() => {
    // C-13: discarding the workspace discards its cloud draft too (a draft
    // already turned into a saved document was dropped by the autosave
    // effect; dropping again is a no-op). The NEXT content mints a new key.
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    if (draftKeyRef.current) void dropDraft(draftKeyRef.current);
    draftKeyRef.current = null;
    setDraftKeyForUi(null);
    void listDrafts().then(setCloudDrafts);
    setDraftNote(null);
    setExtraction(emptyMeetingNotesExtraction);
    setSourceLabel(null);
    setTypedByHand(false);
    setNoAttendeesRecorded(false);
    setMixedInput(false);
    setShowSample(false);
    setPhotoPages([]);
    setEvRows(null);
    setAiError(null);
    setStorageNote(null);
    setDocTitle("");
    // 0-1: an empty page has been saved nowhere — without this, the "✓ Saved"
    // state of the meeting just cleared away leaked onto the blank workspace.
    setSaveResult(null);
    setSavedFor(null);
    setSavedDocId(null);
    try {
      localStorage.removeItem(minutesStoreKey());
    } catch {
      // Storage unavailable: state is already reset, nothing more to do.
    }
  }, []);

  // --- C-13 (work order 51, 拍板 8): several drafts, in the cloud -----------

  /** The current workspace, as a cloud payload (paths, no image data). */
  const draftPayloadNow = useCallback(
    () => ({
      extraction,
      sourceLabel,
      typed: typedByHand,
      noAttendees: noAttendeesRecorded,
      title: docTitle,
      photoPages: photoPages.map((p) => ({
        name: p.name,
        storagePath: p.storagePath ?? null,
      })),
    }),
    [extraction, sourceLabel, typedByHand, noAttendeesRecorded, docTitle, photoPages],
  );

  const draftCannotReachCloud = t(
    "Draf ini tidak dapat disimpan ke awan buat masa ini (kemas kini pangkalan data 33 belum dijalankan, atau talian terputus). Kerja anda masih selamat pada peranti ini — tiada apa-apa dibuang.",
    "这份草稿暂时存不上云端（数据库更新 33 还没贴，或网络问题）。您的东西还安全地在这台设备上 —— 什么都没有丢。",
    "This draft could not reach the cloud just now (database update 33 not applied yet, or the connection dropped). Your work is still safe on this device — nothing was thrown away.",
    "\n",
  );

  /** Stash the unfinished meeting in the cloud NOW and open a clean page. */
  const stashAndStartNew = useCallback(async (): Promise<boolean> => {
    const key = draftKeyRef.current ?? mintDraftKey();
    draftKeyRef.current = key;
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    const title =
      cleanMinutesTitle(docTitle) || suggestMinutesTitle(extraction, "bm") || sourceLabel;
    const res = await saveDraft({ clientKey: key, title, payload: draftPayloadNow() });
    if (!res.ok) {
      // NOTHING is cleared on failure — clearing would be exactly the loss
      // this feature exists to prevent.
      setDraftNote(draftCannotReachCloud);
      return false;
    }
    setDraftNote(null);
    // A clean page for the meeting that is starting; the stashed draft stays.
    draftKeyRef.current = null;
    setDraftKeyForUi(null);
    setExtraction(emptyMeetingNotesExtraction);
    setSourceLabel(null);
    setTypedByHand(false);
    setNoAttendeesRecorded(false);
    setMixedInput(false);
    setShowSample(false);
    setPhotoPages([]);
    setEvRows(null);
    setAiError(null);
    setStorageNote(null);
    setDocTitle("");
    setSaveResult(null);
    setSavedFor(null);
    setSavedDocId(null);
    try {
      localStorage.removeItem(minutesStoreKey());
    } catch {
      // Storage unavailable: state is already reset.
    }
    void listDrafts().then(setCloudDrafts);
    return true;
  }, [docTitle, extraction, sourceLabel, draftPayloadNow, draftCannotReachCloud]);

  /** Open a cloud draft — stashing whatever unfinished work is on screen
   *  first, so switching can never eat a meeting. */
  const resumeDraft = useCallback(
    async (clientKey: string) => {
      const hasUnsaved =
        (sourceLabel !== null || typedByHand) &&
        !alreadySaved &&
        hasMeetingContent(extraction);
      if (hasUnsaved) {
        const key = draftKeyRef.current ?? mintDraftKey();
        draftKeyRef.current = key;
        if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
        const title =
          cleanMinutesTitle(docTitle) || suggestMinutesTitle(extraction, "bm") || sourceLabel;
        const stashed = await saveDraft({ clientKey: key, title, payload: draftPayloadNow() });
        if (!stashed.ok) {
          setDraftNote(draftCannotReachCloud);
          return;
        }
      }
      const payload = await loadDraft(clientKey);
      if (!isDraftPayload(payload)) {
        setDraftNote(
          t(
            "Draf itu tidak dapat dibuka. Cuba sekali lagi.",
            "那份草稿打不开。请再试一次。",
            "That draft could not be opened. Please try again.",
            "\n",
          ),
        );
        return;
      }
      setDraftNote(null);
      draftKeyRef.current = clientKey;
      setDraftKeyForUi(clientKey);
      droppedForRef.current = null;
      setExtraction(payload.extraction);
      setSourceLabel(payload.sourceLabel ?? null);
      setTypedByHand(payload.typed === true);
      setNoAttendeesRecorded(payload.noAttendees === true);
      setDocTitle(typeof payload.title === "string" ? payload.title : "");
      // Previews live on the device that took them; on another device the
      // pages keep their names and storage paths, shown as file tiles.
      setPhotoPages(
        (payload.photoPages ?? []).flatMap((p) =>
          typeof p?.name === "string"
            ? [{ name: p.name, dataUrl: "", storagePath: p.storagePath ?? null }]
            : [],
        ),
      );
      setMixedInput(false);
      setShowSample(false);
      setEvRows(null);
      setAiError(null);
      setStorageNote(null);
      setSaveResult(null);
      setSavedFor(null);
      setSavedDocId(null);
      void listDrafts().then(setCloudDrafts);
    },
    [
      sourceLabel,
      typedByHand,
      alreadySaved,
      extraction,
      docTitle,
      draftPayloadNow,
      draftCannotReachCloud,
      t,
    ],
  );

  /** Remove a listed draft. The picker never offers this for the open one. */
  const deleteCloudDraft = useCallback((clientKey: string) => {
    void dropDraft(clientKey).then(() => listDrafts().then(setCloudDrafts));
  }, []);

  /** The worked example, on request only — for a first look or a demo. */
  const openSample = useCallback(() => {
    setExtraction(sampleMeetingExtraction);
    setShowSample(true);
    setSourceLabel(null);
    setTypedByHand(false);
    setNoAttendeesRecorded(false);
    setMixedInput(false);
    setDocTitle("");
    setPhotoPages([]);
    setEvRows(null);
    setAiError(null);
    // 0-1: the example was never saved; leaking the real meeting's "✓ Saved"
    // onto it would be the sample-vs-real confusion all over again.
    setSaveResult(null);
    setSavedFor(null);
    setSavedDocId(null);
  }, []);

  // Generic updater for one field inside the extraction tree.
  const updateField = useCallback(
    (apply: (e: MeetingNotesExtraction) => MeetingNotesExtraction) => {
      // Stage 0-1: the worked example is read-only — its fields cannot be
      // confirmed or edited (isSample is derived below; this is the same
      // condition, spelled out because the callback is created earlier).
      if (showSample && sourceLabel === null && !typedByHand) return;
      setExtraction((prev) => apply(structuredClone(prev)));
    },
    [showSample, sourceLabel, typedByHand],
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
          : mixedInput
            ? // I-3: a mixed document has BOTH sources; claiming "not in the
              // notes" for a field that was never the notes' to carry would
              // be inventing provenance. The neutral truth instead.
              t(
                "tiada dalam gambar mahupun taipan",
                "照片与笔记都没有",
                "in neither the photo nor the typing",
              )
            : t("tiada dalam nota", "笔记里没写", "not written down in the notes"),
      };
    },
    [t, typedByHand, mixedInput],
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
  const addNamedAttendees = useCallback(
    (names: string[]) => {
      const clean = names.map((n) => n.trim()).filter((n) => n !== "");
      if (clean.length === 0) return;
      updateField((e) => {
        const have = new Set(e.attendees.map((a) => a.name.value.trim().toLowerCase()));
        for (const name of clean) {
          if (have.has(name.toLowerCase())) continue;
          have.add(name.toLowerCase());
          e.attendees.push({
            name: {
              value: name,
              confidence: "confirmed",
              source_ref: {
                location: t("ditanda oleh anda", "由您勾选", "ticked by you"),
                snippet: t(
                  "daripada senarai AJK",
                  "从职位名单里选的",
                  "from the committee list",
                ),
              },
            },
          });
        }
        return e;
      });
    },
    [updateField, t],
  );

  const rowHasContentHere = useCallback(
    (list: RowList, index: number) => rowHasContent(extraction, list, index),
    [extraction],
  );

  /** Every reviewable leaf, for the one-tap confirm and the amber/red counts. */
  const leafFields = useCallback((e: MeetingNotesExtraction) => {
    return [
      e.meeting_type,
      e.meeting_date,
      e.meeting_venue,
      ...e.attendees.map((a) => a.name),
      ...e.resolutions.map((r) => r.text),
      ...e.figures.flatMap((f) => [f.description, f.amount_cents]),
      ...e.office_bearers.flatMap((b) => [b.position, b.person_name]),
    ] as { confidence: string }[];
  }, []);

  // R-4: one tap says "everything amber is fine". Red fields are untouched —
  // see the note on the type above.
  const confirmAllChecks = useCallback(() => {
    updateField((e) => {
      for (const f of leafFields(e)) {
        if (f.confidence === "check") f.confidence = "confirmed";
      }
      return e;
    });
  }, [updateField, leafFields]);

  const { checkOutstanding, missingOutstanding } = useMemo(() => {
    const fields = leafFields(extraction);
    return {
      checkOutstanding: fields.filter((f) => f.confidence === "check").length,
      missingOutstanding: fields.filter((f) => f.confidence === "missing").length,
    };
  }, [extraction, leafFields]);

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

  /**
   * An empty attendee list is ONE outstanding thing, not zero.
   *
   * Counting fields is right for every other group and wrong for this one: no
   * attendees means no fields to be unconfirmed, so "0 people" scored the same
   * as "everybody checked". The one thing left to do is for a person to say
   * which it is — they were not written down, or they have not been entered
   * yet. Ticking "the notes do not record who attended" settles it.
   */
  // Read straight off the extraction rather than off `groups`, which is
  // computed further down — and which would make this a forward reference for
  // the sake of reusing one `.length`.
  const attendanceUnsettled = extraction.attendees.length === 0 && !noAttendeesRecorded;
  const allReviewed = outstanding === 0 && !attendanceUnsettled;
  /**
   * D30 (2026-08-28, J review 27-evening #33): the eROSES annual return needs
   * "Bilangan Ahli Hadir", so a report with NOBODY recorded as attending must
   * not become a confirmed document. "The notes do not record attendance" is
   * now only a DEFERRAL ("will insert later") — it unblocks the review, never
   * the save. This flag is what the save gate reads (and the server action
   * re-checks it; the client is not the authority).
   */
  const attendanceMissing = !extraction.attendees.some(
    (a) => a.name.value.trim() !== "",
  );

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

  const pastePack = useMemo(
    () => buildPastePack(extraction, filingRoster),
    [extraction, filingRoster],
  );

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

  // J 28/8 item 3: the Google-Docs-style pre-fill — regenerated live from the
  // confirmed facts, in the document's language. Free (no AI involved).
  const suggestedTitle = useMemo(
    () => suggestMinutesTitle(extraction, docLang),
    [extraction, docLang],
  );

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
  // (State lives further up, next to the other workspace state — the restore
  // effect and onPhotoPicked read it for 0-1.)
  const saveToHistory = useCallback(async () => {
    setSaveBusy(true);
    setSaveResult(null);
    try {
      if (!saveClientIdRef.current) {
        saveClientIdRef.current =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `save-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
      // The server re-renders the document from this extraction using the org
      // and signer from the session (Hard Rule 8); we deliberately do not send
      // a rendered document or a confirmer name.
      // The name that gets stored: the person's own, else the suggestion —
      // never an empty string (older rows fall back to type+date anyway).
      const titleToStore = cleanMinutesTitle(docTitle) || suggestedTitle;
      const result = await saveConfirmedMinutes({
        extraction,
        aiDraftMd: edited ?? aiDraft ?? undefined,
        language: docLang,
        clientId: saveClientIdRef.current,
        title: titleToStore || undefined,
        // Migration 30: which uploads-bucket files this document was read
        // from. Typed meetings and failed uploads simply send none.
        photoPaths: photoPages
          .map((p) => p.storagePath)
          .filter((p): p is string => typeof p === "string" && p !== ""),
      });
      setSaveResult(result.ok ? "ok" : result.error ?? "error");
      if (result.ok) {
        setSavedFor(extraction);
        setSavedDocId(result.id ?? null);
      }
      return { ok: result.ok === true, id: result.ok ? result.id ?? null : null };
    } catch {
      setSaveResult(
        "Tidak berjaya disimpan — cuba lagi / 没有保存成功 —— 请再试一次 / Could not save — try again",
      );
      return { ok: false, id: null };
    } finally {
      setSaveBusy(false);
    }
  }, [extraction, edited, aiDraft, docLang, docTitle, suggestedTitle, photoPages]);

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
        photoPages,
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
        mixedInput,
        noAttendeesRecorded,
        setNoAttendeesRecorded,
        attendanceUnsettled,
        attendanceMissing,
        openSample,
        backToEmpty,
        updateField,
        confirmField,
        editField,
        markAbsent,
        addExtractionRow,
        addNamedAttendees,
        removeExtractionRow,
        rowHasContent: rowHasContentHere,
        outstanding,
        allReviewed,
        checkOutstanding,
        missingOutstanding,
        confirmAllChecks,
        groups,
        outstandingHereOutsideAttendance,
        firstUnfinished,
        firstUnfinishedHere,
        todayIso,
        minutesDraft,
        shownDocument,
        docLang,
        setDocLang,
        docTitle,
        setDocTitle,
        suggestedTitle,
        aiDraft,
        draftError,
        draftBusy,
        writeWithAi,
        edited,
        setEdited,
        saveBusy,
        saveResult,
        alreadySaved,
        savedDocId,
        saveToHistory,
        pastePack,
        filingRoster,
        evRows,
        evBusy,
        evError,
        findEventsInMinutes,
        confirmEvent,
        cloudDrafts,
        currentDraftKey: draftKeyForUi,
        draftNote,
        stashAndStartNew,
        resumeDraft,
        deleteCloudDraft,
      }}
    >
      {children}
    </MinutesContext.Provider>
  );
}
