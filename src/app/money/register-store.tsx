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
import {
  allocateReceiptNos,
  eligibleForReceipt,
  isRegisterDonationArray,
  type RegisterDonation,
} from "@/lib/receipts";
import {
  collectorBalances,
  confirmRemittanceBatch,
  createRemittanceBatch,
  totalUnremittedCents,
  type RemittanceBatch,
} from "@/lib/custody";
import { usePersistentState, type PersistMeta } from "@/lib/use-persistent-state";
import { todayIsoMalaysia } from "@/lib/history";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { consumeIntake } from "@/lib/intake-handoff";
import { issueAndSaveReceipts } from "./actions";
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

/** What issuing receipts told us, for the message shown afterwards. */
export type IssueNotice = "saved" | "local" | "error" | "readonly" | "reconcile";

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
  donations: RegisterDonation[];
  setDonations: Dispatch<SetStateAction<RegisterDonation[]>>;
  donationStore: PersistMeta;
  batches: RemittanceBatch[];

  // --- the ledger photo under review (a draft, so not persisted) -----------
  ledger: LedgerExtraction;
  ledgerSourceLabel: string | null;
  isRealLedger: boolean;
  isSampleLedger: boolean;
  noLedgerYet: boolean;
  aiBusy: boolean;
  aiError: string | null;
  addedRows: Set<number>;
  onLedgerPicked: (file: File | null) => Promise<void>;
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
  addManualDonation: (d: RegisterDonation) => void;
  addManualDonations: (rows: RegisterDonation[]) => void;
  issueReceipts: () => Promise<void>;
  issueBusy: boolean;
  issueNotice: IssueNotice | null;
  setIssueNotice: Dispatch<SetStateAction<IssueNotice | null>>;
  handOver: () => void;
  hqConfirm: () => void;
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
  const [donations, setDonations, donationStore] = usePersistentState<RegisterDonation[]>(
    "minit:money:donations:v1",
    [],
    isRegisterDonationArray,
  );
  // AUDIT FIX (2026-07-28, P0): batches lived in plain React state while the
  // donations they refer to were persisted. So after "Hand over to HQ" a page
  // refresh lost the batch but kept the donations as `pending_remittance`:
  // "Confirm money received" was then permanently disabled (no batch) and
  // "Hand over" was disabled too (nothing left in `collected`). The cash was
  // unreachable in the state machine forever while custody.ts kept reporting it
  // as outstanding.
  const [batches, setBatches] = usePersistentState<RemittanceBatch[]>(
    "minit:money:batches:v1",
    [],
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

  const [error, setError] = useState<string | null>(null);
  const [custodyLocalOnly, setCustodyLocalOnly] = useState(false);
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueNotice, setIssueNotice] = useState<IssueNotice | null>(null);

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
    setAiError(null);
  }, []);

  /** The opt-in worked example. The rows come from the page, so this file does
   *  not have to import the sample ledger just to hand it straight back. */
  const showLedgerSample = useCallback((extraction: LedgerExtraction) => {
    setLedger(extraction);
    setShowSample(true);
    setAddedRows(new Set());
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
  // Mirrors the /minutes flow. The extracted rows REPLACE the current ledger
  // review; the human then confirms/edits field by field before anything can
  // reach the register.
  const onLedgerPicked = useCallback(async (file: File | null) => {
    if (!file) return;
    setAiError(null);
    setAiBusy(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/extract-ledger", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? joinUserError(USER_ERRORS.aiUnavailable));
      setLedger(body.extraction as LedgerExtraction);
      setLedgerSourceLabel(file.name);
      setAddedRows(new Set());
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  }, []);

  // The organisation's hand-over history, merged in once on mount so a SECOND
  // device (HQ's computer, the branch's shared laptop) sees what the first one
  // recorded. Same union rule as the calendar: a batch the remote has and this
  // device does not is added; a batch only this device has is kept, because it
  // may simply not have synced yet.
  useEffect(() => {
    let cancelled = false;
    void loadRemittanceBatches().then((remote) => {
      if (cancelled || remote.length === 0) return;
      setBatches((local) => {
        const byId = new Map(local.map((b) => [b.id, b]));
        for (const b of remote) byId.set(b.id, b);
        return [...byId.values()];
      });
    });
    return () => {
      cancelled = true;
    };
    // setBatches is stable (usePersistentState); this must run exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  }, []);

  // Confirmed ledger rows → register (explicit human action; deterministic
  // TS mapping — receipt eligibility rules live in receipts.ts).
  const addConfirmedRowsToRegister = useCallback(() => {
    const eligible = ledger.rows
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => eligibleForReceipt(r) && !addedRows.has(i));
    if (eligible.length === 0) return;
    const stamp = Date.now();
    setDonations((prev) => [
      ...prev,
      ...eligible.map(({ r, i }) => ({
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
      })),
    ]);
    setAddedRows((prev) => {
      const next = new Set(prev);
      eligible.forEach(({ i }) => next.add(i));
      return next;
    });
  }, [ledger, addedRows, registerCollector, setDonations]);

  // --- Editing a register row BEFORE its receipt is issued ------------------
  const saveDonation = useCallback(
    (updated: RegisterDonation) => {
      setDonations((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    },
    [setDonations],
  );

  const deleteDonation = useCallback(
    (id: string) => {
      setDonations((prev) =>
        prev.filter((d) => !(d.id === id && d.receiptNo === null)),
      );
    },
    [setDonations],
  );

  // Manual income entry (the eROSES-test exception) appends a confirmed row.
  const addManualDonation = useCallback(
    (d: RegisterDonation) => setDonations((prev) => [...prev, d]),
    [setDonations],
  );

  /** A whole typed collection at once (see ./type-donations.tsx). One state
   *  update, not one per row: forty setState calls in a loop would re-render
   *  the register forty times and, worse, each would read a stale `prev`. */
  const addManualDonations = useCallback(
    (rows: RegisterDonation[]) => setDonations((prev) => [...prev, ...rows]),
    [setDonations],
  );

  // --- Issue receipts (deterministic, gap-free) ----------------------------
  // Phase 7: numbers come from the DATABASE series for the active org, so they
  // stay sequential across devices and sessions, and every receipt is saved to
  // history. Without an active org (pure demo), numbering falls back to the
  // local series — clearly flagged as not saved.
  const issueReceipts = useCallback(async () => {
    const need = donations.filter((d) => d.receiptNo === null);
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
        })),
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
          const pending = prev.filter((d) => d.receiptNo === null);
          const nos = allocateReceiptNos(existing, pending.length, {
            prefix: "MIN",
            // Malaysia time, not the browser's clock: a phone set to another
            // timezone must not start a different year's series.
            year: Number(todayIsoMalaysia().slice(0, 4)),
          });
          let i = 0;
          return prev.map((d) => (d.receiptNo === null ? { ...d, receiptNo: nos[i++] } : d));
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
      if (result.reason === "needs_reconciliation") {
        setIssueNotice("reconcile");
        return;
      }
      setIssueNotice("error");
    } catch {
      setIssueNotice("error");
    } finally {
      setIssueBusy(false);
    }
  }, [donations, setDonations]);

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
  const donationsRef = useRef(donations);
  const batchesRef = useRef(batches);
  useEffect(() => {
    donationsRef.current = donations;
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

  const handOver = useCallback(() => {
    setError(null);
    try {
      let current = donationsRef.current;
      // Recomputed from the ref, not from the memo, for the reason above.
      const collectors = Array.from(
        new Set(
          current
            .filter((d) => d.custodyStatus === "collected" && d.receiptNo !== null)
            .map((d) => d.collector),
        ),
      );
      const created: RemittanceBatch[] = [];
      for (const collector of collectors) {
        const result = createRemittanceBatch(current, {
          id: `batch-${Date.now()}-${created.length}`,
          collector,
          handedOverAtIso: todayIsoMalaysia(),
        });
        current = result.donations;
        created.push(result.batch);
      }
      if (created.length === 0) return;
      commitCustody(current, [...batchesRef.current, ...created]);
      // Fire-and-forget, one call per batch: the hand-over has already happened
      // in the room, and refusing to record it locally because the network is
      // down would be recording it nowhere.
      void Promise.all(created.map((b) => saveRemittanceBatch(b))).then((results) =>
        setCustodyLocalOnly(results.some((r) => !r.ok)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [commitCustody]);

  const hqConfirm = useCallback(() => {
    setError(null);
    try {
      let current = donationsRef.current;
      let changed = false;
      const updated = batchesRef.current.map((b) => {
        if (b.status === "settled") return b;
        const result = confirmRemittanceBatch(b, current, { confirmedBy: "HQ Admin (Demo)" });
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
  }, [commitCustody]);

  /** Wipes the register on this device. Confirmation is the caller's job. */
  const deleteEverything = useCallback(() => {
    donationStore.reset();
    donationsRef.current = [];
    batchesRef.current = [];
    setBatches([]);
    ledgerBackToEmpty();
  }, [donationStore, setBatches, ledgerBackToEmpty]);

  // --- derived -------------------------------------------------------------
  const ledgerRowsToCheck = ledger.rows.filter((r) => !eligibleForReceipt(r)).length;
  const rowsReadyToAdd = ledger.rows.filter(
    (r, i) => eligibleForReceipt(r) && !addedRows.has(i),
  ).length;
  const unreceipted = donations.filter((d) => d.receiptNo === null).length;
  // An EMPTY register has no receipts, so `every` returning true on [] would
  // claim "all receipts issued" and unlock the e-Invois section on nothing.
  const receiptsIssued = donations.length > 0 && donations.every((d) => d.receiptNo !== null);
  const cashInHandCents = totalUnremittedCents(donations);
  const collectorsWithCashInHand = useMemo(
    () =>
      Array.from(
        new Set(
          donations
            .filter((d) => d.custodyStatus === "collected" && d.receiptNo !== null)
            .map((d) => d.collector),
        ),
      ),
    [donations],
  );
  const hasPendingBatch = batches.some((b) => b.status === "pending");
  const balances = useMemo(() => collectorBalances(donations), [donations]);
  // Months are derived from the donation dates, so the e-Invois picker only
  // ever offers months that actually have records.
  const availableMonths = useMemo(() => {
    const set = new Set(donations.map((d) => d.donatedAtIso.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [donations]);

  return (
    <RegisterContext.Provider
      value={{
        orgName,
        taxStatus,
        signerName,
        documentOrgName,
        registerCollector,
        donations,
        setDonations,
        donationStore,
        batches,
        ledger,
        ledgerSourceLabel,
        isRealLedger,
        isSampleLedger,
        noLedgerYet,
        aiBusy,
        aiError,
        addedRows,
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
        saveDonation,
        deleteDonation,
        addManualDonation,
        addManualDonations,
        issueReceipts,
        issueBusy,
        issueNotice,
        setIssueNotice,
        handOver,
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
