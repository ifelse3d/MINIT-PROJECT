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
import { emptyLedgerExtraction, type LedgerExtraction } from "@/lib/extraction";
import { mergeLedgerExtractions, mergedSourceLabel } from "@/lib/extraction-merge";
import {
  allocateReceiptNos,
  eligibleForReceipt,
  holdsCash,
  isRegisterDonationArray,
  type RegisterDonation,
} from "@/lib/receipts";
import {
  batchAlreadySettledElsewhere,
  cancelRemittanceBatch,
  collectorBalances,
  confirmRemittanceBatch,
  createRemittanceBatchFromIds,
  mergeBatches,
  mergeDonations,
  reconcileCustodyWithBatches,
  totalUnremittedCents,
  updatePendingBatch,
  type RemittanceBatch,
} from "@/lib/custody";
import { usePersistentState, type PersistMeta } from "@/lib/use-persistent-state";
import { useScopedKey } from "@/lib/storage-scope";
import { todayIsoMalaysia } from "@/lib/history";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { consumeIntake } from "@/lib/intake-handoff";
import { issueAndSaveReceipts } from "./actions";
import {
  deleteRegisterRows,
  loadRegisterDonations,
  saveRegisterRows,
} from "./register-actions";
import { loadRemittanceBatches, saveRemittanceBatch } from "./custody-actions";

// ---------------------------------------------------------------------------
// THE MONEY REGISTER — one store, shared by every page under /money.
//
// WHY THIS EXISTS (2026-08-23, user: "重新排版過整個界面，不要所有功能都在一頁，
// 很難看"). /money was a 1734-line page holding eight jobs: read the ledger,
// the register, issue receipts, type a collection in by hand, add one gift by
// hand, hand cash to HQ, HQ confirms, month-end tax file. Somebody who came to
// issue ONE receipt scrolled past the month-end tax pack to get there. It is
// now four pages.
//
// The obvious way to split it — give each page its own usePersistentState on
// the same "minit:money:donations:v1" key — is WRONG, and quietly so. Each
// usePersistentState call keeps its own React state; two components mounted at
// once read the key at mount and then never hear about each other's writes, so
// the second one's write-back effect overwrites the first one's edits with a
// stale copy and the money silently reverts.
//
// So the register is owned ONCE, here, mounted by src/app/money/layout.tsx.
// Next's App Router keeps a layout mounted while you move between the routes
// inside it, which also means a half-checked ledger photo survives a trip to
// /money/receipts and back.
//
// What is NOT here: anything belonging to one screen only — which download is
// in flight, whether donor names are unmasked, which row is being edited.
// Those stay local, so a page can be read without reading this file.
// ---------------------------------------------------------------------------

/** What issuing receipts told us, for the message shown afterwards.
 *  ("reconcile" retired 2026-08-25: issue_receipts() is one DB transaction,
 *  so a partial write can no longer happen.) */
export type IssueNotice =
  | "saved"
  | "local"
  | "error"
  | "readonly"
  | "needs_prefix"
  | "sample"
  /** D-1: an in-kind row needs migration 25 in the database first. */
  | "db_behind"
  /** D44: the free plan's 20 lifetime receipts are used up. The exact
   *  trilingual sentence rides in issueFenceMessage. */
  | "fence";

export type RegisterStore = {
  // --- identity, resolved on the server (never client-chosen) --------------
  orgName: string | null;
  taxStatus: "none" | "s44_6";
  signerName: string | null;
  /** The name printed on receipts, WhatsApp messages and the e-Invois pack. */
  documentOrgName: string;
  /** Who is recorded as holding the cash when the ledger page does not say. */
  registerCollector: string;

  // --- the register itself (persisted) -------------------------------------
  /** The RECONCILED view (D32): raw rows with custody status lifted to agree
   *  with the hand-over batches. Writes go through setDonations (raw). */
  donations: RegisterDonation[];
  setDonations: Dispatch<SetStateAction<RegisterDonation[]>>;
  donationStore: PersistMeta;
  batches: RemittanceBatch[];
  /**
   * D32: true when a recorded row could not reach the organisation's records
   * (no org chosen, migration 29 not applied, offline) — it exists on this
   * device only, and the money pages say so instead of swallowing it.
   */
  registerLocalOnly: boolean;

  // --- the ledger photo under review (a draft, so not persisted) -----------
  ledger: LedgerExtraction;
  ledgerSourceLabel: string | null;
  isRealLedger: boolean;
  isSampleLedger: boolean;
  noLedgerYet: boolean;
  aiBusy: boolean;
  aiError: string | null;
  addedRows: Set<number>;
  /** D19: the reviewer's cash/transfer answer per ledger row (by row index).
   *  Absent = cash — the AI never decides how money arrived. Owned here so a
   *  trip to another /money page cannot silently reset a "transfer" answer. */
  ledgerPayments: Record<number, "cash" | "transfer">;
  setLedgerPayment: (rowIndex: number, method: "cash" | "transfer") => void;
  /** D19 (B-5③): the pages already read this review, as thumbnails —
   *  name + data URL, in upload order. A draft, so never persisted. */
  ledgerPages: { name: string; dataUrl: string }[];
  onLedgerPicked: (
    file: File | null,
    /** 0-1: "fresh" = the person said this photo starts a NEW ledger page. */
    mode?: "auto" | "fresh",
    /** D-2: pre-fill EMPTY purposes with the income type the person chose. */
    opts?: { fillPurpose?: string },
  ) => Promise<boolean>;
  showLedgerSample: (extraction: LedgerExtraction) => void;
  ledgerBackToEmpty: () => void;
  mutateLedger: (fn: (l: LedgerExtraction) => void) => void;
  addConfirmedRowsToRegister: () => void;

  // --- derived counts the headers and status badges read -------------------
  ledgerRowsToCheck: number;
  rowsReadyToAdd: number;
  unreceipted: number;
  receiptsIssued: boolean;
  cashInHandCents: number;
  collectorsWithCashInHand: string[];
  hasPendingBatch: boolean;
  balances: ReturnType<typeof collectorBalances>;
  availableMonths: string[];

  // --- THIS ROUND (J's launch feedback #3, 2026-08-27 evening) --------------
  // 「那一輪就是那一輪的東西」: rows recorded in the current sitting, so the
  // flow can show "what you just did" and issue receipts for EXACTLY those —
  // never the whole mixed register. Persisted per user+org, cleared by
  // finishRound(). Ids are pruned against the register, so a deleted row can
  // never haunt the round.
  roundIds: string[];
  /** The register rows of the current round, in the order they were added. */
  roundDonations: RegisterDonation[];
  /** Close the round: the next recorded row starts a fresh one. */
  finishRound: () => void;

  // --- actions -------------------------------------------------------------
  saveDonation: (updated: RegisterDonation) => void;
  /**
   * Take a row back out of the register.
   *
   * J's UX list, root cause A: there was no way to remove a line anywhere in
   * Minit. A donation typed twice, or read off a smudge that was never a
   * donation, could only be edited — never deleted — so the register carried it
   * into the receipts and the month-end tax file.
   *
   * 🔴 A row that already has a RECEIPT NUMBER cannot be deleted, here or
   * anywhere. That number is issued, sequential and gap-free; deleting the row
   * behind it would put a hole in the series, which is the one thing the
   * numbering exists to make impossible. Void it in the receipt history
   * instead. This function refuses silently rather than trusting the UI to have
   * hidden the button.
   */
  deleteDonation: (id: string) => void;
  /**
   * §1-4 (work order 32): clear EVERY unreceipted draft row in one tap —
   * "yesterday's test rows are still here" was J's launch-day confusion.
   * Rows with a receipt number are untouchable, here as everywhere: the
   * number series is gap-free and the row behind a number never disappears.
   */
  clearUnreceiptedDrafts: () => void;
  addManualDonation: (d: RegisterDonation) => void;
  addManualDonations: (rows: RegisterDonation[]) => void;
  /** `ids` narrows the issue to those rows (#3: "this round only", or a
   *  hand-picked selection on the receipts page). Absent = every
   *  unreceipted row, the original behaviour. */
  issueReceipts: (opts?: {
    acceptDefaultPrefix?: boolean;
    ids?: string[];
  }) => Promise<void>;
  issueBusy: boolean;
  issueNotice: IssueNotice | null;
  setIssueNotice: Dispatch<SetStateAction<IssueNotice | null>>;
  /** D44: the server's ready-made sentence for issueNotice === "fence". */
  issueFenceMessage: string | null;
  /**
   * 拍板 0-6 (work order 32): record a hand-over of HAND-PICKED rows. The
   * dialog supplies the date (default today, editable — people record later
   * than they hand over), who carried the cash, and an optional note.
   */
  handOverSelected: (
    donationIds: string[],
    opts: { dateIso: string; collector: string; note?: string },
  ) => void;
  /** 拍板 0-6: edit a PENDING batch's hand-over date / note. */
  updateBatch: (batchId: string, patch: { handedOverAtIso?: string; note?: string | null }) => void;
  /** 拍板 0-6: void a mis-recorded PENDING batch — rows return to collected,
   *  the batch stays on file as 'cancelled'. Settled = locked forever. */
  cancelBatch: (batchId: string) => void;
  /** B-3: HQ ticks off ONE hand-over ("he brought it → confirm"). No id =
   *  confirm every pending batch (the old bulk behaviour). */
  hqConfirm: (batchId?: string) => void;
  deleteEverything: () => void;
  /**
   * True when a hand-over could not be written to the organisation's records,
   * so it exists on this device only.
   *
   * Said out loud on /money/custody rather than swallowed. A hand-over is one
   * person's claim that they gave money to another person; it is worth what the
   * record BOTH of them can see. A treasurer who believes HQ can see it, when
   * HQ cannot, is the failure this flag exists to prevent.
   */
  custodyLocalOnly: boolean;

  /**
   * The one error line for the whole /money section, rendered by the shared
   * chrome in layout.tsx. A failed receipt download on /money/receipts and a
   * failed hand-over on /money/custody are the same kind of news to the person
   * reading, and they shared one box before the split.
   */
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
};

const RegisterContext = createContext<RegisterStore | null>(null);

export function useRegister(): RegisterStore {
  const store = useContext(RegisterContext);
  if (!store) {
    throw new Error("useRegister() outside <RegisterProvider> — is this page under /money?");
  }
  return store;
}

export function RegisterProvider({
  orgName,
  taxStatus,
  signerName,
  children,
}: {
  orgName: string | null;
  taxStatus: "none" | "s44_6";
  /**
   * The REAL signed-in person, from the session.
   *
   * 2026-07-28 (found in review): every row added to the register was stamped
   * `collector: SAMPLE_COLLECTOR` — a FICTIONAL person from the sample ledger.
   * That name then flowed into the per-collector cash balances and into the
   * `remittance_batches` custody records: an audit trail naming somebody who
   * does not exist. The person actually operating Minit is the honest default.
   */
  signerName: string | null;
  children: ReactNode;
}) {
  const t = useTriText();

  // AUDIT FIX (2026-07-28, P0): the register used to be SEEDED with five
  // fictional donors, a fictional collector and fictional custody balances, and
  // /money had no empty state at all. A brand-new treasurer opened the page,
  // saw money that does not exist, and the obvious next action ("Issue
  // receipts") would have burned real, gap-free, non-reusable receipt numbers
  // against invented people. The register starts EMPTY; the sample LEDGER on
  // the first page is still there to show how the flow works.
  // S0-4: keys are scoped per user+org, so a shared laptop cannot leak one
  // member's register to the next. The old global key is adopted once.
  const donationsKey = useScopedKey("money:donations:v1");
  const batchesKey = useScopedKey("money:batches:v1");
  const [donations, setDonations, donationStore] = usePersistentState<RegisterDonation[]>(
    donationsKey,
    [],
    isRegisterDonationArray,
    "minit:money:donations:v1",
  );
  // AUDIT FIX (2026-07-28, P0): batches lived in plain React state while the
  // donations they refer to were persisted. So after "Hand over to HQ" a page
  // refresh lost the batch but kept the donations as `pending_remittance`:
  // "Confirm money received" was then permanently disabled (no batch) and
  // "Hand over" was disabled too (nothing left in `collected`). The cash was
  // unreachable in the state machine forever while custody.ts kept reporting it
  // as outstanding.
  const [batches, setBatches] = usePersistentState<RemittanceBatch[]>(
    batchesKey,
    [],
    undefined,
    "minit:money:batches:v1",
  );
  // #3: the current round — ids of rows recorded this sitting. Persisted so
  // a page hop or a closed tab does not lose "what I just did".
  const roundKey = useScopedKey("money:round:v1");
  const [roundIdsRaw, setRoundIds] = usePersistentState<string[]>(
    roundKey,
    [],
    (parsed) => Array.isArray(parsed) && parsed.every((x) => typeof x === "string"),
  );

  const [ledger, setLedger] = useState<LedgerExtraction>(emptyLedgerExtraction);
  /** Only true if the person deliberately tapped "show me an example". */
  const [showSample, setShowSample] = useState(false);
  // null = nothing read yet; a string = the name of the real uploaded file the
  // current extraction came from.
  const [ledgerSourceLabel, setLedgerSourceLabel] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Ledger rows already pushed into the register (by row index), so the same
  // row cannot be added twice.
  const [addedRows, setAddedRows] = useState<Set<number>>(new Set());
  // D19: the reviewer's cash/transfer answer per row index. {} = all cash.
  const [ledgerPayments, setLedgerPayments] = useState<
    Record<number, "cash" | "transfer">
  >({});
  // B-5③: thumbnails of every page read into this review, upload order.
  const [ledgerPages, setLedgerPages] = useState<
    { name: string; dataUrl: string }[]
  >([]);

  const [error, setError] = useState<string | null>(null);
  const [custodyLocalOnly, setCustodyLocalOnly] = useState(false);
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueNotice, setIssueNotice] = useState<IssueNotice | null>(null);
  const [issueFenceMessage, setIssueFenceMessage] = useState<string | null>(null);

  // Same three states as /minutes, and for the same reason:
  //   isRealLedger    — a ledger photo has been read.
  //   isSampleLedger  — they asked for the worked example (opt-in).
  //   noLedgerYet     — fresh page. Nothing on screen belongs to anybody.
  const isRealLedger = ledgerSourceLabel !== null;
  const isSampleLedger = !isRealLedger && showSample;
  const noLedgerYet = !isRealLedger && !showSample;

  /**
   * The name that goes on every generated artefact: the receipt PDF, the
   * WhatsApp message to the donor, the month-end summary, the e-Invois pack.
   *
   * AUDIT FIX (2026-07-28): SAMPLE_ORG_NAME was hardcoded into all four, so a
   * real receipt for a real donor went out under a FICTIONAL temple's name.
   * There is no fictional fallback any more — if no organisation is chosen the
   * user is told to choose one, and nothing is generated.
   */
  const documentOrgName =
    orgName ?? t("(pilih pertubuhan)", "（请先选择机构）", "(choose an organisation)");
  /** Who is recorded as holding the cash, when the ledger page does not say. */
  const registerCollector =
    signerName ?? t("Belum dinyatakan", "还没写是谁", "Not recorded yet");

  /** Back to a clean page: no example rows, nothing half-read. */
  const ledgerBackToEmpty = useCallback(() => {
    setLedger(emptyLedgerExtraction);
    setLedgerSourceLabel(null);
    setShowSample(false);
    setAddedRows(new Set());
    setLedgerPayments({});
    setLedgerPages([]);
    setAiError(null);
  }, []);

  const setLedgerPayment = useCallback(
    (rowIndex: number, method: "cash" | "transfer") => {
      setLedgerPayments((prev) => ({ ...prev, [rowIndex]: method }));
    },
    [],
  );

  /** The opt-in worked example. The rows come from the page, so this file does
   *  not have to import the sample ledger just to hand it straight back. */
  const showLedgerSample = useCallback((extraction: LedgerExtraction) => {
    setLedger(extraction);
    setShowSample(true);
    setAddedRows(new Set());
    setLedgerPayments({});
    setLedgerPages([]);
    setAiError(null);
  }, []);

  // --- Editing the extracted ledger rows (fix what the AI read wrong) -------
  // A human edit becomes the source of truth: confidence → confirmed. Money is
  // parsed by deterministic TS (parseRmToCents), never the AI (Hard Rule 2).
  const mutateLedger = useCallback((fn: (l: LedgerExtraction) => void) => {
    setLedger((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  // --- THE AI INGESTION PATH: ledger photo/PDF → /api/extract-ledger --------
  // Mirrors the /minutes flow. G-2 (2026-08-25, J #10): a second page ADDS its
  // rows under the first page's — the un-added, half-confirmed rows of page 1
  // used to be wiped by the shutter. Only a fresh (or sample) review is
  // replaced wholesale. `addedRows` is index-based and existing rows keep
  // their positions, so the already-added marks stay honest through a merge.
  const onLedgerPicked = useCallback(async (
    file: File | null,
    // 0-1 (26 号报告 2-1): "fresh" is the person's answer to "a new ledger
    // page?" asked when everything on screen is already in the register — the
    // read then replaces the review wholesale (the recorded donations
    // themselves live in the register and are untouched). "auto" keeps the
    // G-2 page-by-page merge for a review still in progress.
    mode: "auto" | "fresh" = "auto",
    // D-2: a slip photographed from the manual-income form carries the income
    // type the person CHOSE (会员费/租金/…). Rows the model read no purpose
    // for get that type at confidence "check" — the person picked it, the
    // person still eyeballs it per row. The extract prompt is untouched.
    opts?: { fillPurpose?: string },
  ): Promise<boolean> => {
    if (!file) return false;
    setAiError(null);
    setAiBusy(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/extract-ledger", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? joinUserError(USER_ERRORS.aiUnavailable));
      const readRaw = body.extraction as LedgerExtraction;
      const fill = opts?.fillPurpose?.trim();
      const read = fill
        ? {
            ...readRaw,
            rows: readRaw.rows.map((r) =>
              r.purpose.value.trim() === ""
                ? {
                    ...r,
                    purpose: {
                      value: fill,
                      confidence: "check" as const,
                      source_ref: {
                        location: t("dipilih oleh anda", "由您选择", "chosen by you"),
                        snippet: fill,
                      },
                    },
                  }
                : r,
            ),
          }
        : readRaw;
      const continuing =
        mode !== "fresh" && ledgerSourceLabel !== null && ledger.rows.length > 0;
      // 0-3 (26 号报告 2-3): the person can keep ticking rows during the
      // 5–20 s the model spends reading. Merging onto the snapshot captured at
      // the shutter silently reverted every one of those confirmations, so the
      // merge is a FUNCTIONAL update onto whatever the ledger is NOW.
      // (`continuing` still reads the shutter-time snapshot: whether this
      // photo is "another page" was decided when it was taken, and ticking
      // rows cannot change that answer.)
      setLedger((current) =>
        continuing ? mergeLedgerExtractions(current, read) : read,
      );
      setLedgerSourceLabel((prev) =>
        continuing ? mergedSourceLabel(prev, file.name) : file.name,
      );
      if (!continuing) {
        setAddedRows(new Set());
        setLedgerPayments({});
      }
      // B-5③: keep a thumbnail of every page in this review, so a multi-page
      // upload can be looked back at. Images only — a PDF gets a name tile.
      const dataUrl = file.type.startsWith("image/")
        ? await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => resolve("");
            reader.readAsDataURL(file);
          })
        : "";
      setLedgerPages((prev) =>
        continuing ? [...prev, { name: file.name, dataUrl }] : [{ name: file.name, dataUrl }],
      );
      return true;
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setAiBusy(false);
    }
  }, [ledger, ledgerSourceLabel, t]);

  // The organisation's hand-over history, merged in once on mount so a SECOND
  // device (HQ's computer, the branch's shared laptop) sees what the first one
  // recorded. Union by id; on a collision the non-pending copy wins (D32) —
  // a batch is forward-only, and "the DB still says pending" must not undo a
  // confirm this device already recorded (or vice versa).
  useEffect(() => {
    let cancelled = false;
    void loadRemittanceBatches().then((remote) => {
      if (cancelled || remote.length === 0) return;
      setBatches((local) => mergeBatches(local, remote));
    });
    return () => {
      cancelled = true;
    };
    // setBatches is stable (usePersistentState); this must run exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F-4 (2026-08-25): the REGISTER hydrates from the database too, so signing
  // in on another computer shows the organisation's money instead of an empty
  // page ("换装置钱不见了" — on the UX list since 8/20). Union by id; remote
  // fields win on a collision, but custody status only moves FORWARD (D32) —
  // the old "DB wins outright" rule is what resurrected settled money as
  // handable every load (#17, the double-hand-over bug). localStorage is the
  // offline draft, not the record.
  useEffect(() => {
    let cancelled = false;
    void loadRegisterDonations().then((remote) => {
      if (cancelled || remote.length === 0) return;
      setDonations((local) => mergeDonations(local, remote));
    });
    return () => {
      cancelled = true;
    };
    // setDonations is stable (usePersistentState); run exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- D32: the register the pages SEE is reconciled against the batches ----
  // The batches are the hand-over record, so any row a pending/settled batch
  // claims is shown at least that far along — even when the database row
  // still says `collected` (the #17 leftovers). Derived, never set in an
  // effect; writes keep going to the raw persisted state.
  const donationsView = useMemo(
    () => reconcileCustodyWithBatches(donations, batches),
    [donations, batches],
  );

  // D32: every recorded row is pushed to the organisation's records the
  // moment it is recorded. Fire-and-forget like the batches — the row is
  // recorded on this device either way, and the flag puts "this has not
  // reached the organisation's records" on screen instead of swallowing it.
  // Rows that already carry a receipt number are in the database by
  // definition (the issue path wrote them) — only unreceipted rows sync here.
  const [registerLocalOnly, setRegisterLocalOnly] = useState(false);
  const syncRowsToDb = useCallback((rows: RegisterDonation[]) => {
    const unreceipted = rows.filter((r) => r.receiptNo === null);
    if (unreceipted.length === 0) return;
    void saveRegisterRows(unreceipted).then((r) => setRegisterLocalOnly(!r.ok));
  }, []);

  // Did the home page's "one door" just read a ledger page for us? Consume it
  // once on mount, before anything else touches the ledger review.
  // (2026-07-28: home AskBox → /api/intake → here.)
  useEffect(() => {
    const handed = consumeIntake("ledger_page");
    if (!handed) return;
    setLedger(handed.extraction as LedgerExtraction);
    setLedgerSourceLabel(handed.fileName);
    setAddedRows(new Set());
    setLedgerPayments({});
    setLedgerPages([]);
  }, []);

  // Confirmed ledger rows → register (explicit human action; deterministic
  // TS mapping — receipt eligibility rules live in receipts.ts).
  const addConfirmedRowsToRegister = useCallback(() => {
    // Stage 0-1: the worked example is read-only. Its rows never reach the
    // register, so they can never reach the receipt series. The button is
    // hidden while the sample is shown; this guard is for every other path.
    if (isSampleLedger) return;
    const eligible = ledger.rows
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => eligibleForReceipt(r) && !addedRows.has(i));
    if (eligible.length === 0) return;
    const stamp = Date.now();
    const newRows: RegisterDonation[] = eligible.map(({ r, i }) => ({
      id: `ledger-${stamp}-${i}`,
      donorName: r.donor_name.value,
      donorPhone: r.donor_phone.value === "" ? null : r.donor_phone.value,
      amountCents: r.amount_cents.value ?? 0,
      purpose: r.purpose.value,
      donatedAtIso: r.donated_at.value,
      // A ledger page does not record WHO collected the cash, so the honest
      // answer is the person operating Minit right now — never the fictional
      // sample collector this used to stamp on every real row.
      collector: registerCollector,
      receiptNo: null,
      custodyStatus: "collected" as const,
      // D19: the reviewer's answer, default cash. The AI never decides how
      // the money arrived.
      paymentMethod: ledgerPayments[i] ?? ("cash" as const),
      // §1-11: when the row was recorded (the moment the human confirmed
      // it into the register, not when the AI read it).
      createdAtIso: new Date(stamp).toISOString(),
    }));
    // #3: everything added this tap joins the current round.
    setRoundIds((prev) => [...prev, ...newRows.map((d) => d.id)]);
    setDonations((prev) => [...prev, ...newRows]);
    // D32: recorded = in the organisation's records, not one browser.
    syncRowsToDb(newRows);
    setAddedRows((prev) => {
      const next = new Set(prev);
      eligible.forEach(({ i }) => next.add(i));
      return next;
    });
  }, [isSampleLedger, ledger, addedRows, registerCollector, ledgerPayments, setDonations, setRoundIds, syncRowsToDb]);

  // --- Editing a register row BEFORE its receipt is issued ------------------
  const saveDonation = useCallback(
    (updated: RegisterDonation) => {
      setDonations((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      // D32: the edit reaches the organisation's records too (unreceipted
      // rows only — a receipted row's identity is locked everywhere).
      if (updated.receiptNo === null) syncRowsToDb([updated]);
    },
    [setDonations, syncRowsToDb],
  );

  const deleteDonation = useCallback(
    (id: string) => {
      // A row inside a hand-over batch is part of a money record — only a
      // still-`collected`, unreceipted row can be taken back out. (The same
      // guard the receipt series has always had, extended to custody. D32.)
      setDonations((prev) =>
        prev.filter(
          (d) =>
            !(
              d.id === id &&
              d.receiptNo === null &&
              d.custodyStatus === "collected"
            ),
        ),
      );
      void deleteRegisterRows([id]);
    },
    [setDonations],
  );

  // §1-4: clear every unreceipted draft row in one tap — the button that
  // calls this confirms first. D32: rows now reach the database at record
  // time, so the clear reaches it too; rows already in a hand-over batch
  // (pending/settled) are money records and stay.
  const clearUnreceiptedDrafts = useCallback(() => {
    const cleared = donations.filter(
      (d) => d.receiptNo === null && d.custodyStatus === "collected",
    );
    if (cleared.length > 0) void deleteRegisterRows(cleared.map((d) => d.id));
    setDonations((prev) =>
      prev.filter((d) => !(d.receiptNo === null && d.custodyStatus === "collected")),
    );
  }, [donations, setDonations]);

  // Manual income entry (the eROSES-test exception) appends a confirmed row.
  const addManualDonation = useCallback(
    (d: RegisterDonation) => {
      setRoundIds((prev) => [...prev, d.id]);
      setDonations((prev) => [...prev, d]);
      syncRowsToDb([d]);
    },
    [setDonations, setRoundIds, syncRowsToDb],
  );

  /** A whole typed collection at once (see ./type-donations.tsx). One state
   *  update, not one per row: forty setState calls in a loop would re-render
   *  the register forty times and, worse, each would read a stale `prev`. */
  const addManualDonations = useCallback(
    (rows: RegisterDonation[]) => {
      setRoundIds((prev) => [...prev, ...rows.map((r) => r.id)]);
      setDonations((prev) => [...prev, ...rows]);
      syncRowsToDb(rows);
    },
    [setDonations, setRoundIds, syncRowsToDb],
  );

  /** #3: close the round. The register keeps every row — only the "this
   *  sitting" marker is cleared, so the next recorded row starts round 2. */
  const finishRound = useCallback(() => {
    setRoundIds([]);
  }, [setRoundIds]);

  // --- Issue receipts (deterministic, gap-free) ----------------------------
  // Phase 7: numbers come from the DATABASE series for the active org, so they
  // stay sequential across devices and sessions, and every receipt is saved to
  // history. Without an active org (pure demo), numbering falls back to the
  // local series — clearly flagged as not saved.
  const issueReceipts = useCallback(async (opts?: {
    acceptDefaultPrefix?: boolean;
    ids?: string[];
  }) => {
    const wanted = opts?.ids ? new Set(opts.ids) : null;
    // Off the reconciled view (D32): the custody status that rides along to
    // the database is the one the batches agree with.
    const need = donationsView.filter(
      (d) => d.receiptNo === null && (wanted === null || wanted.has(d.id)),
    );
    if (need.length === 0) return;
    setIssueBusy(true);
    setIssueNotice(null);
    try {
      const result = await issueAndSaveReceipts(
        need.map((d) => ({
          clientId: d.id,
          donorName: d.donorName,
          donorPhone: d.donorPhone,
          amountCents: d.amountCents,
          purpose: d.purpose,
          donatedAtIso: d.donatedAtIso,
          custodyStatus: d.custodyStatus,
          source: d.source,
          collectorName: d.collector,
          // D-1: goods rows travel as goods rows.
          kind: d.kind,
          itemDesc: d.itemDesc ?? null,
          estValueCents: d.estValueCents ?? null,
          // D19: how the money arrived rides along to the database.
          paymentMethod: d.paymentMethod,
          transferProofPath: d.transferProofPath ?? null,
          // §1-11: the record time travels with the row.
          createdAtIso: d.createdAtIso,
        })),
        opts,
      );
      if (result.saved) {
        setDonations((prev) =>
          prev.map((d) =>
            result.receiptNos[d.id] ? { ...d, receiptNo: result.receiptNos[d.id] } : d,
          ),
        );
        setIssueNotice("saved");
        return;
      }
      if (result.reason === "no_org") {
        setDonations((prev) => {
          const existing = prev.map((d) => d.receiptNo).filter((n): n is string => n !== null);
          const pending = prev.filter(
            (d) => d.receiptNo === null && (wanted === null || wanted.has(d.id)),
          );
          const nos = allocateReceiptNos(existing, pending.length, {
            prefix: "MIN",
            // Malaysia time, not the browser's clock: a phone set to another
            // timezone must not start a different year's series.
            year: Number(todayIsoMalaysia().slice(0, 4)),
          });
          let i = 0;
          return prev.map((d) =>
            d.receiptNo === null && (wanted === null || wanted.has(d.id))
              ? { ...d, receiptNo: nos[i++] }
              : d,
          );
        });
        setIssueNotice("local");
        return;
      }
      if (result.reason === "readonly") {
        // An auditor account used to get the alarming "we could not confirm
        // whether receipts were issued" message. (2026-07-28 audit.)
        setIssueNotice("readonly");
        return;
      }
      if (result.reason === "needs_prefix") {
        // The org still has the shared default prefix and no receipts yet —
        // send the person to Settings to pick their own letters first.
        setIssueNotice("needs_prefix");
        return;
      }
      if (result.reason === "sample") {
        // Stage 0-1: sample rows (added before the sample became read-only,
        // or hand-crafted) may not burn real receipt numbers. Nothing was
        // written; the person is told to remove the sample rows first.
        setIssueNotice("sample");
        return;
      }
      if (result.reason === "db_behind") {
        // D-1: the batch holds an in-kind donation and the database predates
        // migration 25 — issuing would print a wrong (RM0 cash) receipt.
        // Nothing was written; the rows wait safely in the register.
        setIssueNotice("db_behind");
        return;
      }
      if (result.reason === "fence") {
        // D44: the free plan's lifetime receipts are used up. Nothing was
        // written; the rows wait safely. The server's sentence names the
        // limit and the upgrade path.
        setIssueFenceMessage(result.message);
        setIssueNotice("fence");
        return;
      }
      setIssueNotice("error");
    } catch {
      setIssueNotice("error");
    } finally {
      setIssueBusy(false);
    }
  }, [donationsView, setDonations]);

  // --- Custody: collector → HQ --------------------------------------------
  // Driven by the live donation counts (not a single stuck batch ref), so the
  // hand-over → confirm cycle can repeat and works for EVERY collector who is
  // actually holding receipted cash — not just the sample collector.
  //
  // WHY THE REFS EXIST — the double-tap money bug.
  //
  // React does not update `donations` / `batches` until the next render. Two
  // fast taps on "Hand over to HQ" therefore both read the SAME old list, each
  // create a batch over the SAME receipts, and both get appended — so HQ sees
  // twice the cash that was actually handed over. The refs hold the newest
  // value the instant it is computed, so the second tap sees the first tap's
  // result and correctly finds nothing left to hand over.
  //
  // The effects below keep the refs honest when state is changed anywhere else
  // in this store (editing a row, adding manual income, issuing receipts) — and
  // now also when it is changed from a DIFFERENT PAGE, which is the whole point
  // of the register living up here rather than in each screen.
  // The refs mirror the RECONCILED view (D32): custody actions must assert
  // against the truth the person is looking at, not the raw device copy a
  // stale database row may sit inside.
  const donationsRef = useRef(donationsView);
  const batchesRef = useRef(batches);
  useEffect(() => {
    donationsRef.current = donationsView;
  });
  useEffect(() => {
    batchesRef.current = batches;
  });

  /** Writes state AND the ref, so back-to-back taps never work off stale data. */
  const commitCustody = useCallback(
    (nextDonations: RegisterDonation[], nextBatches: RemittanceBatch[]) => {
      donationsRef.current = nextDonations;
      batchesRef.current = nextBatches;
      setDonations(nextDonations);
      setBatches(nextBatches);
    },
    [setDonations, setBatches],
  );

  // 拍板 0-6: the hand-over is a HAND-PICKED batch from the dialog — the old
  // one-tap "batch everything every collector holds" is gone (it was the
  // "一鍵全交" J rejected). Same refs discipline as before.
  const handOverSelected = useCallback(
    (donationIds: string[], opts: { dateIso: string; collector: string; note?: string }) => {
      setError(null);
      try {
        const result = createRemittanceBatchFromIds(donationsRef.current, {
          id: `batch-${Date.now()}`,
          collector: opts.collector,
          donationIds,
          handedOverAtIso: opts.dateIso,
          recordedAtIso: new Date().toISOString(),
          note: opts.note?.trim() ? opts.note.trim() : null,
        });
        commitCustody(result.donations, [...batchesRef.current, result.batch]);
        // Fire-and-forget: the hand-over has already happened in the room, and
        // refusing to record it locally because the network is down would be
        // recording it nowhere.
        void saveRemittanceBatch(result.batch).then((r) =>
          setCustodyLocalOnly(!r.ok),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [commitCustody],
  );

  const updateBatch = useCallback(
    (batchId: string, patch: { handedOverAtIso?: string; note?: string | null }) => {
      setError(null);
      try {
        let edited: RemittanceBatch | null = null;
        const updated = batchesRef.current.map((b) => {
          if (b.id !== batchId) return b;
          edited = updatePendingBatch(b, patch);
          return edited;
        });
        if (!edited) return;
        commitCustody(donationsRef.current, updated);
        void saveRemittanceBatch(edited).then((r) => setCustodyLocalOnly(!r.ok));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [commitCustody],
  );

  const cancelBatch = useCallback(
    (batchId: string) => {
      setError(null);
      try {
        const target = batchesRef.current.find((b) => b.id === batchId);
        if (!target) return;
        const result = cancelRemittanceBatch(target, donationsRef.current);
        commitCustody(
          result.donations,
          batchesRef.current.map((b) => (b.id === batchId ? result.batch : b)),
        );
        void saveRemittanceBatch(result.batch).then((r) => setCustodyLocalOnly(!r.ok));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [commitCustody],
  );

  const hqConfirm = useCallback((batchId?: string) => {
    setError(null);
    try {
      let current = donationsRef.current;
      let changed = false;
      // B-3: the confirmer on the audit trail is the REAL signed-in person.
      // "HQ Admin (Demo)" was a leftover from the demo era and must never
      // appear in a real organisation's records again.
      const confirmedBy =
        signerName ?? t("(tidak dinyatakan)", "（未记录）", "(not recorded)");
      // D32: a pending batch whose money is ALREADY settled under another
      // batch is a duplicate record (the #17 leftovers). Confirming it would
      // claim the money arrived twice — tell the person to cancel it instead.
      const isDuplicate = (b: RemittanceBatch) =>
        batchAlreadySettledElsewhere(b, current);
      if (batchId !== undefined) {
        const target = batchesRef.current.find((b) => b.id === batchId);
        if (target && isDuplicate(target)) {
          setError(
            t(
              "Wang ini sudah disahkan di bawah serahan lain. Rekod ini berulang — tekan 'Ubah' kemudian 'Batalkan serahan ini'.",
              "这笔钱已经在另一笔交接下确认过了。这一笔是重复记录 —— 请按「修改」再「取消这条交接」。",
              "This money was already confirmed under another hand-over. This record is a duplicate — tap 'Edit' and then 'Cancel this hand-over'.",
            ),
          );
          return;
        }
      }
      const updated = batchesRef.current.map((b) => {
        // 拍板 0-6: a cancelled batch is a voided record — nothing to confirm.
        if (b.status !== "pending") return b;
        // B-3: ticking ONE hand-over off confirms only that hand-over.
        if (batchId !== undefined && b.id !== batchId) return b;
        // Bulk confirm: leave duplicates pending rather than crash the rest.
        if (isDuplicate(b)) return b;
        const result = confirmRemittanceBatch(b, current, {
          confirmedBy,
          // §1-11: the confirm moment is its own timestamp.
          confirmedAtIso: new Date().toISOString(),
        });
        current = result.donations;
        changed = true;
        return result.batch;
      });
      // A second tap finds every batch already settled — do nothing rather
      // than re-writing identical state.
      if (!changed) return;
      commitCustody(current, updated);
      // Upsert on the same client_id, so this REWRITES each batch rather than
      // adding a second one: "HQ confirmed it" is a change to the hand-over,
      // not a new hand-over.
      void Promise.all(updated.map((b) => saveRemittanceBatch(b))).then((results) =>
        setCustodyLocalOnly(results.some((r) => !r.ok)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [commitCustody, signerName, t]);

  /**
   * Wipes the register on this device. Confirmation is the caller's job.
   *
   * 🔴 DELIBERATELY DOES NOT DELETE THE ORGANISATION'S RECORDS, and the button
   * says so in those words ("every donation record on this device"). Receipts
   * already issued live in `receipts` and hand-overs in `remittance_batches`;
   * both are an audit trail, and a trail that any one device can erase is not
   * one. So a reset here clears the working copy, and on the next load the
   * organisation's hand-over history merges back in — which is correct, not a
   * bug to fix by adding a remote delete.
   */
  const deleteEverything = useCallback(() => {
    donationStore.reset();
    donationsRef.current = [];
    batchesRef.current = [];
    setBatches([]);
    setRoundIds([]);
    ledgerBackToEmpty();
  }, [donationStore, setBatches, setRoundIds, ledgerBackToEmpty]);

  // --- derived (all off the RECONCILED view, D32) ---------------------------
  // #3: the round, resolved against the live register — a deleted row simply
  // stops appearing, and order follows the order of recording.
  const roundDonations = useMemo(() => {
    const byId = new Map(donationsView.map((d) => [d.id, d]));
    return roundIdsRaw
      .map((id) => byId.get(id))
      .filter((d): d is RegisterDonation => d !== undefined);
  }, [donationsView, roundIdsRaw]);
  const roundIds = useMemo(
    () => roundDonations.map((d) => d.id),
    [roundDonations],
  );
  const ledgerRowsToCheck = ledger.rows.filter((r) => !eligibleForReceipt(r)).length;
  const rowsReadyToAdd = ledger.rows.filter(
    (r, i) => eligibleForReceipt(r) && !addedRows.has(i),
  ).length;
  const unreceipted = donationsView.filter((d) => d.receiptNo === null).length;
  // An EMPTY register has no receipts, so `every` returning true on [] would
  // claim "all receipts issued" and unlock the e-Invois section on nothing.
  const receiptsIssued =
    donationsView.length > 0 && donationsView.every((d) => d.receiptNo !== null);
  const cashInHandCents = totalUnremittedCents(donationsView);
  const collectorsWithCashInHand = useMemo(
    () =>
      Array.from(
        new Set(
          donationsView
            // Same holdsCash rule as handOver: goods and transfers are not
            // cash in a hand.
            .filter(
              (d) =>
                d.custodyStatus === "collected" &&
                d.receiptNo !== null &&
                holdsCash(d),
            )
            .map((d) => d.collector),
        ),
      ),
    [donationsView],
  );
  const hasPendingBatch = batches.some((b) => b.status === "pending");
  const balances = useMemo(() => collectorBalances(donationsView), [donationsView]);
  // Months are derived from the donation dates, so the e-Invois picker only
  // ever offers months that actually have records.
  const availableMonths = useMemo(() => {
    const set = new Set(donationsView.map((d) => d.donatedAtIso.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [donationsView]);

  return (
    <RegisterContext.Provider
      value={{
        orgName,
        taxStatus,
        signerName,
        documentOrgName,
        registerCollector,
        donations: donationsView,
        setDonations,
        donationStore,
        batches,
        registerLocalOnly,
        ledger,
        ledgerSourceLabel,
        isRealLedger,
        isSampleLedger,
        noLedgerYet,
        aiBusy,
        aiError,
        addedRows,
        ledgerPayments,
        setLedgerPayment,
        ledgerPages,
        onLedgerPicked,
        showLedgerSample,
        ledgerBackToEmpty,
        mutateLedger,
        addConfirmedRowsToRegister,
        ledgerRowsToCheck,
        rowsReadyToAdd,
        unreceipted,
        receiptsIssued,
        cashInHandCents,
        collectorsWithCashInHand,
        hasPendingBatch,
        balances,
        availableMonths,
        roundIds,
        roundDonations,
        finishRound,
        saveDonation,
        deleteDonation,
        clearUnreceiptedDrafts,
        addManualDonation,
        addManualDonations,
        issueReceipts,
        issueBusy,
        issueNotice,
        setIssueNotice,
        issueFenceMessage,
        handOverSelected,
        updateBatch,
        cancelBatch,
        hqConfirm,
        deleteEverything,
        custodyLocalOnly,
        error,
        setError,
      }}
    >
      {children}
    </RegisterContext.Provider>
  );
}
