"use client";

import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tri, useTriText } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { ExtractionTable } from "@/components/extraction-table";
import {
  emptyLedgerExtraction,
  type LedgerExtraction,
} from "@/lib/extraction";
import {
  SAMPLE_COLLECTOR,
  SAMPLE_LEDGER_LABEL,
  sampleLedgerExtraction,
} from "@/lib/sample-ledger";
import {
  allocateReceiptNos,
  buildWaMeLink,
  eligibleForReceipt,
  findDuplicateDonations,
  parseRmToCents,
  receiptWhatsAppMessageBm,
  taxDeductibilityLineBm,
  type RegisterDonation,
} from "@/lib/receipts";
import {
  collectorBalances,
  confirmRemittanceBatch,
  createRemittanceBatch,
  totalUnremittedCents,
  type RemittanceBatch,
} from "@/lib/custody";
import { buildMonthEndPack, consolidatedDeadlineIso, monthEndSummary } from "@/lib/einvois";
import { formatRm } from "@/lib/minutes-draft";
import { maskName } from "@/lib/mask";
import { usePersistentState } from "@/lib/use-persistent-state";
import {
  NextAction,
  StepCard,
  StepProgress,
} from "@/components/step-card";
import { consumeIntake } from "@/lib/intake-handoff";
import { dayIsoMalaysia } from "@/lib/history";
import { ManualIncomeForm } from "./manual-income";
import { TypeDonations } from "./type-donations";
import { issueAndSaveReceipts } from "./actions";
import Link from "next/link";

/** Today's date in Malaysia (UTC+8), never UTC — avoids the pre-8am off-by-one. */
function todayIsoMalaysia(): string {
  return dayIsoMalaysia(new Date().toISOString())!;
}

// ---------------------------------------------------------------------------
// The MONEY screen (Phases 2–3 foundation). Ledger rows and pre-receipt
// register rows are hand-editable in a compact spreadsheet-style table.
// Driven by sample data until the API key is connected; the numbering,
// custody and e-Invois logic are the real, unit-tested functions. The eROSES
// test: the human only confirms/corrects what the AI proposed.
// ---------------------------------------------------------------------------

const CUSTODY_LABEL: Record<
  RegisterDonation["custodyStatus"],
  { bm: string; zh: string; en: string }
> = {
  collected: { bm: "Dalam tangan pemungut", zh: "在收款人手上", en: "With collector" },
  pending_remittance: { bm: "Menunggu pengesahan HQ", zh: "等待总会确认", en: "Awaiting HQ" },
  settled: { bm: "Selesai", zh: "已完成", en: "Settled" },
};

const CUSTODY_STYLE: Record<RegisterDonation["custodyStatus"], string> = {
  collected: "border-amber-300 bg-amber-100 text-amber-900",
  pending_remittance: "border-blue-300 bg-blue-100 text-blue-900",
  settled: "border-green-300 bg-green-100 text-green-800",
};

/** Fetches a generated file from an API route and triggers the browser download. */
async function downloadFromApi(url: string, body: unknown, fallbackName: string): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error ?? joinUserError(USER_ERRORS.downloadFailed));
  }
  const blob = await res.blob();
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  // Revoking immediately races the download in Firefox/Safari.
  const href = a.href;
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
  return res;
}

/** Inline editor for a register row, shown only BEFORE a receipt is issued.
 *  Amount is parsed by deterministic TS (parseRmToCents) — never the AI. */
function DonationEditor({
  donation,
  onSave,
  onCancel,
}: {
  donation: RegisterDonation;
  onSave: (updated: RegisterDonation) => void;
  onCancel: () => void;
}) {
  const t = useTriText();
  const [name, setName] = useState(donation.donorName);
  const [rm, setRm] = useState((donation.amountCents / 100).toFixed(2));
  const [dateIso, setDateIso] = useState(donation.donatedAtIso);
  const [purpose, setPurpose] = useState(donation.purpose);
  const [phone, setPhone] = useState(donation.donorPhone ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const cents = parseRmToCents(rm);
    if (cents === null) {
      setError(t("Jumlah tak sah — contoh: 50 atau 12.50", "金额无效 — 例如 50 或 12.50", "Invalid amount — e.g. 50 or 12.50"));
      return;
    }
    if (name.trim() === "") {
      setError(t("Nama penderma diperlukan", "需要捐款人姓名", "Donor name is required"));
      return;
    }
    onSave({
      ...donation,
      donorName: name.trim(),
      amountCents: cents,
      donatedAtIso: dateIso,
      purpose: purpose.trim(),
      donorPhone: phone.trim() === "" ? null : phone.trim(),
    });
  }

  const inputClass = "w-full rounded-md border px-2 py-1 text-sm";
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <label className="text-sm font-medium text-muted-foreground">
        <Tri bm="Nama penderma" zh="捐款人姓名" en="Donor name" />
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-muted-foreground">
        <Tri bm="Jumlah (RM)" zh="金额 (RM)" en="Amount (RM)" />
        <input className={inputClass} inputMode="decimal" placeholder="RM 0.00" value={rm} onChange={(e) => setRm(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-muted-foreground">
        <Tri bm="Tarikh" zh="日期" en="Date" />
        <input className={inputClass} type="date" value={dateIso} onChange={(e) => setDateIso(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-muted-foreground">
        <Tri bm="Tujuan" zh="用途" en="Purpose" />
        <input className={inputClass} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </label>
      <label className="text-sm font-medium text-muted-foreground">
        <Tri bm="Telefon (untuk WhatsApp)" zh="电话（用于 WhatsApp）" en="Phone (for WhatsApp)" />
        <input className={inputClass} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save}>
          <Tri bm="Simpan" zh="保存" en="Save" />
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <Tri bm="Batal" zh="取消" en="Cancel" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Shape guard for the register blob in localStorage (see usePersistentState).
 * Deliberately checks the fields the money code actually dereferences: an older
 * or foreign blob used to be accepted as-is and then produced NaN totals.
 */
function isRegisterDonationArray(parsed: unknown): boolean {
  if (!Array.isArray(parsed)) return false;
  return parsed.every((d) => {
    if (typeof d !== "object" || d === null) return false;
    const r = d as Record<string, unknown>;
    return (
      typeof r.id === "string" &&
      typeof r.donorName === "string" &&
      typeof r.amountCents === "number" &&
      Number.isFinite(r.amountCents) &&
      typeof r.donatedAtIso === "string" &&
      (r.custodyStatus === "collected" ||
        r.custodyStatus === "pending_remittance" ||
        r.custodyStatus === "settled")
    );
  });
}

export function MoneyReview({
  orgName,
  taxStatus,
  signerName,
}: {
  orgName: string | null;
  /** From the organisation record, resolved on the server. Never client-chosen. */
  taxStatus: "none" | "s44_6";
  /**
   * The REAL signed-in person, from the session.
   *
   * 2026-07-28 (found in review): every row added to the register was stamped
   * `collector: SAMPLE_COLLECTOR` — "Lim Bee Hoon (Pemungut / Collector)", a
   * FICTIONAL person from the sample ledger. That name then flowed into the
   * per-collector cash balances and into the `remittance_batches` custody
   * records: an audit trail naming somebody who does not exist. The person
   * actually operating Minit is the honest default.
   */
  signerName: string | null;
}) {
  // Records now persist in the browser (survives refresh). This is the demo
  // store; it swaps to Supabase later without changing this component.
  // AUDIT FIX (2026-07-28, P0): the register used to be SEEDED with five
  // fictional donors, a fictional collector and fictional custody balances, and
  // /money had no empty state at all. A brand-new treasurer opened the page,
  // saw money that does not exist, and the obvious next action ("Issue
  // receipts") would have burned real, gap-free, non-reusable receipt numbers
  // against invented people. The register now starts EMPTY; the sample LEDGER in
  // step 1 is still there to show how the flow works.
  const [donations, setDonations, donationStore] = usePersistentState<RegisterDonation[]>(
    "minit:money:donations:v1",
    [],
    isRegisterDonationArray,
  );
  // 2026-07-28 — opens EMPTY. The fictional donation book is now opt-in; see
  // emptyLedgerExtraction in lib/extraction.ts.
  const [ledger, setLedger] = useState<LedgerExtraction>(emptyLedgerExtraction);
  /** Only true if the person deliberately tapped "show me an example". */
  const [showSample, setShowSample] = useState(false);
  // null = still showing the labelled demo extraction; a string = the name of
  // the real uploaded file the current extraction came from.
  const [ledgerSourceLabel, setLedgerSourceLabel] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Ledger rows already pushed into the register (by row index), so the same
  // row cannot be added twice.
  const [addedRows, setAddedRows] = useState<Set<number>>(new Set());
  // All hand-over batches (one per collector, repeatable).
  //
  // AUDIT FIX (2026-07-28, P0): these lived in plain React state while the
  // donations they refer to were persisted. So after "Hand over to HQ" a page
  // refresh lost the batch but kept the donations as `pending_remittance`:
  // "Confirm money received" was then permanently disabled (no batch) and
  // "Hand over" was disabled too (nothing left in `collected`). The cash was
  // unreachable in the state machine forever while custody.ts kept reporting it
  // as outstanding. They are now persisted alongside the donations.
  const [batches, setBatches] = usePersistentState<RemittanceBatch[]>(
    "minit:money:batches:v1",
    [],
  );
  const [downloadError, setDownloadError] = useState<string | null>(null);
  /**
   * Which download is in flight.
   *
   * AUDIT FIX (2026-07-28): every file download had NO busy state and no button
   * disabling. Server-side PDF/xlsx generation plus a network round-trip means
   * seconds of nothing happening after the tap, which reliably makes our users
   * tap again — and for the e-Invois pack, which fetches N files in sequence,
   * repeat taps started overlapping loops.
   */
  const [downloadBusy, setDownloadBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // PDPA (Hard Rule 5): donor names are MASKED by default in list views.
  // The toggle reveals them only for the current visit — never persisted.
  const [showNames, setShowNames] = useState(false);
  const [issueBusy, setIssueBusy] = useState(false);
  /** True while the irreversible "issue receipts" confirmation is showing. */
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [issueNotice, setIssueNotice] = useState<
    "saved" | "local" | "error" | "readonly" | "reconcile" | null
  >(null);
  const t = useTriText();

  /**
   * The name that goes on generated artefacts. Sample data keeps the fictional
   * temple so nobody mistakes it for their own; once the treasurer has
   * photographed a real ledger or issued a real receipt, everything carries the
   * REAL organisation name.
   *
   * AUDIT FIX (2026-07-28): SAMPLE_ORG_NAME was hardcoded into the receipt
   * WhatsApp message, the month-end summary and the e-Invois pack, so a real
   * receipt was messaged to a real donor under a fictional temple's name.
   */
  // Same three states as /minutes, and for the same reason:
  //   isRealLedger    — a ledger photo has been read.
  //   isSampleLedger  — they asked for the worked example (opt-in).
  //   noLedgerYet     — fresh page. Nothing on screen belongs to anybody.
  const isRealLedger = ledgerSourceLabel !== null;
  const isSampleLedger = !isRealLedger && showSample;
  const noLedgerYet = !isRealLedger && !showSample;

  /** Back to a clean page: no example rows, nothing half-read. */
  function ledgerBackToEmpty() {
    setLedger(emptyLedgerExtraction);
    setLedgerSourceLabel(null);
    setShowSample(false);
    setAddedRows(new Set());
    setAiError(null);
  }
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

  // --- Editing the extracted ledger rows (fix what the AI read wrong) -------
  // A human edit becomes the source of truth: confidence → confirmed. Money is
  // parsed by deterministic TS (parseRmToCents), never the AI (Hard Rule 2).
  function mutateLedger(fn: (l: LedgerExtraction) => void) {
    setLedger((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }
  const userSource = () => ({
    location: t("diisi oleh pengguna", "由用户填写", "entered by user"),
    snippet: t("disahkan oleh pengguna", "用户已确认", "confirmed by user"),
  });
  function confirmTextField(f: { confidence: "confirmed" | "check" | "missing" }) {
    f.confidence = "confirmed";
  }
  function editTextField(
    f: { value: string; confidence: "confirmed" | "check" | "missing"; source_ref: { location: string; snippet: string } | null },
    v: string
  ): void {
    f.value = v;
    f.confidence = v === "" ? "missing" : "confirmed";
    f.source_ref = v === "" ? null : f.source_ref ?? userSource();
  }

  // --- THE AI INGESTION PATH: ledger photo/PDF → /api/extract-ledger --------
  // Mirrors the /minutes flow. The extracted rows REPLACE the current ledger
  // review; the human then confirms/edits field by field before anything can
  // reach the register.
  async function onLedgerPicked(file: File | null) {
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
  }

  // Confirmed ledger rows → register (explicit human action; deterministic
  // TS mapping — receipt eligibility rules live in receipts.ts).
  function addConfirmedRowsToRegister() {
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
  }

  // --- Editing a register row BEFORE its receipt is issued ------------------
  function saveDonation(updated: RegisterDonation) {
    setDonations((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    setEditingId(null);
  }

  async function downloadReceiptPdf(d: RegisterDonation) {
    if (!d.receiptNo) return;
    if (downloadBusy) return;
    setDownloadError(null);
    setDownloadBusy(`receipt:${d.id}`);
    try {
      await downloadFromApi(
        "/api/receipt-pdf",
        {
          // orgName, taxStatus and confirmedBy are deliberately NOT sent:
          // the server reads them from the signed-in user's organisation so a
          // receipt can never claim the wrong org or a false tax status.
          receiptNo: d.receiptNo,
          donorName: d.donorName,
          amountCents: d.amountCents,
          dateIso: d.donatedAtIso,
          purpose: d.purpose,
          collector: d.collector,
          confirmedOnIso: todayIsoMalaysia(),
        },
        `resit-${d.receiptNo}.pdf`
      );
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadBusy(null);
    }
  }

  async function downloadEInvoisPack() {
    if (downloadBusy) return;
    setDownloadError(null);
    setDownloadBusy("einvois");
    try {
      // First request tells us how many ≤100-doc files the month needs.
      const first = await downloadFromApi(
        "/api/einvois-xlsx",
        // orgName comes from the server session, not from here.
        { donations, month: einvoisMonth, fileIndex: 0 },
        `einvois-${einvoisMonth}.xlsx`
      );
      const count = Number(first.headers.get("X-Einvois-File-Count") ?? "1");
      for (let i = 1; i < count; i++) {
        await downloadFromApi(
          "/api/einvois-xlsx",
          { donations, month: einvoisMonth, fileIndex: i },
          `einvois-${einvoisMonth}-${i + 1}.xlsx`
        );
      }
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadBusy(null);
    }
  }

  // An EMPTY register has no receipts, so `every` returning true on [] would
  // claim "all receipts issued" and unlock the e-Invois section on nothing.
  const receiptsIssued =
    donations.length > 0 && donations.every((d) => d.receiptNo !== null);

  /**
   * Step status for the four cards. 2026-07-28: this page was one long scroll
   * with four numbered sections, a manual-entry form, a custody panel and a tax
   * file all open at once. Each step now knows whether it is done, needs the
   * person, or cannot be done yet — and only one opens itself.
   */
  const ledgerRowsToCheck = ledger.rows.filter((r) => !eligibleForReceipt(r)).length;
  const rowsReadyToAdd = ledger.rows.filter(
    (r, i) => eligibleForReceipt(r) && !addedRows.has(i),
  ).length;
  const unreceipted = donations.filter((d) => d.receiptNo === null).length;
  const cashInHandCents = totalUnremittedCents(donations);

  // Manual income entry (the eROSES-test exception) appends a confirmed row.
  function addManualDonation(d: RegisterDonation) {
    setDonations((prev) => [...prev, d]);
  }

  /** A whole typed collection at once (see ./type-donations.tsx). One state
   *  update, not one per row: forty setState calls in a loop would re-render
   *  the register forty times and, worse, each would read a stale `prev`. */
  function addManualDonations(rows: RegisterDonation[]) {
    setDonations((prev) => [...prev, ...rows]);
  }

  // --- 1 · Ledger review data (extraction contract) ---
  const ledgerRows = ledger.rows;
  const duplicateGroups = useMemo(
    () =>
      findDuplicateDonations(
        // Rows whose amount the AI hasn't read yet get a UNIQUE negative value
        // so two blank rows are never falsely flagged as duplicates.
        ledgerRows.map((r, i) => ({
          donorName: r.donor_name.value,
          donatedAtIso: r.donated_at.value,
          amountCents: r.amount_cents.value ?? -(i + 1),
        }))
      ),
    [ledgerRows]
  );

  // --- 2 · Issue receipts (deterministic, gap-free) ---
  // Phase 7: numbers come from the DATABASE series for the active org, so
  // they stay sequential across devices and sessions, and every receipt is
  // saved to history. Without an active org (pure demo), numbering falls
  // back to the local series — clearly flagged as not saved.
  async function issueReceipts() {
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
  }

  // --- 3 · Custody actions ---
  // Driven by the live donation counts (not a single stuck batch ref), so the
  // hand-over → confirm cycle can repeat and works for EVERY collector who is
  // actually holding receipted cash — not just the sample collector.
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

  // WHY THESE REFS EXIST — the double-tap money bug.
  //
  // React does not update `donations` / `batches` until the next render. Two
  // fast taps on "Hand over to HQ" therefore both read the SAME old list, each
  // create a batch over the SAME receipts, and both get appended — so HQ sees
  // twice the cash that was actually handed over. The refs hold the newest
  // value the instant it is computed, so the second tap sees the first tap's
  // result and correctly finds nothing left to hand over.
  //
  // The effects below keep the refs honest when state is changed anywhere else
  // on this page (editing a row, adding manual income, issuing receipts).
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

  const donationsRef = useRef(donations);
  const batchesRef = useRef(batches);
  useEffect(() => {
    donationsRef.current = donations;
  });
  useEffect(() => {
    batchesRef.current = batches;
  });
  /** Writes state AND the ref, so back-to-back taps never work off stale data. */
  function commitCustody(
    nextDonations: RegisterDonation[],
    nextBatches: RemittanceBatch[],
  ) {
    donationsRef.current = nextDonations;
    batchesRef.current = nextBatches;
    setDonations(nextDonations);
    setBatches(nextBatches);
  }

  function handOver() {
    setDownloadError(null);
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
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e));
    }
  }

  function hqConfirm() {
    setDownloadError(null);
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
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : String(e));
    }
  }

  const balances = useMemo(() => collectorBalances(donations), [donations]);

  // --- 4 · e-Invois month-end (per selected month) ---------------------------
  // Months are derived from the donation dates, so the picker only ever offers
  // months that actually have records. buildMonthEndPack throws if a month
  // still has unreceipted donations — we catch it and show a friendly hint
  // instead of hiding the whole section.
  const availableMonths = useMemo(() => {
    const set = new Set(donations.map((d) => d.donatedAtIso.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [donations]);

  const [einvoisMonth, setEinvoisMonth] = useState<string>(() => todayIsoMalaysia().slice(0, 7));
  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(einvoisMonth)) {
      setEinvoisMonth(availableMonths[0]);
    }
  }, [availableMonths, einvoisMonth]);

  const einvois = useMemo(() => {
    try {
      const pack = buildMonthEndPack(donations, {
        month: einvoisMonth,
        orgName: documentOrgName,
      });
      return { pack, error: null as string | null };
    } catch (e) {
      return { pack: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [donations, einvoisMonth, documentOrgName]);
  const einvoisPack = einvois.pack;
  /**
   * "There is genuinely a tax file to download."
   *
   * buildMonthEndPack does NOT throw for a month with no donations — it returns a
   * pack with `files: []`. Treating a truthy pack as "ready" made a brand-new
   * install show step 4 as "needs you" with an enabled button reading
   * "Download the tax file (0 files)", which 400s. (Found in review, 2026-07-28.)
   */
  const einvoisReady = Boolean(einvoisPack && einvoisPack.files.length > 0);

  /** Who is recorded as holding the cash, when the ledger page does not say. */
  const registerCollector =
    signerName ?? t("Belum dinyatakan", "还没写是谁", "Not recorded yet");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10 text-base">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100/80 text-3xl ring-1 ring-white/60 backdrop-blur dark:bg-emerald-400/15 dark:ring-white/10">
            🧾
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            <span className="v2-gradient-text">
              <Tri bm="Wang & Resit" zh="财务与收据" en="Money & Receipts" />
            </span>
          </h1>
          {/* Only when the person asked for the example. A fresh page has
              nothing on it to label. */}
          {isSampleLedger && donations.length === 0 && (
            <Badge variant="secondary">
              <Tri bm="Contoh" zh="示范" en="Example" />
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => {
              if (
                window.confirm(
                  // AUDIT FIX: the old wording ("reset to sample data") made
                  // this sound harmless, but it wipes the REAL register — every
                  // donation on this device, including rows that already carry
                  // an issued, gap-free receipt number.
                  t(
                    "PADAM semua rekod derma pada peranti ini dan mula semula?\n\nIni termasuk derma sebenar yang sudah ada nombor resit. Tidak boleh dibatalkan.",
                    "要删除这台设备上所有捐款记录、重新开始吗？\n\n这会连已经开了收据号码的真实捐款一起删掉，无法复原。",
                    "DELETE every donation record on this device and start again?\n\nThis includes real donations that already have issued receipt numbers. It cannot be undone.",
                  ),
                )
              ) {
                donationStore.reset();
                setBatches([]);
                ledgerBackToEmpty();
              }
            }}
          >
            ↺{" "}
            <Tri
              bm="Padam semua & mula semula"
              zh="全部删除，重新开始"
              en="Delete everything & start again"
            />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {documentOrgName}
          {ledgerSourceLabel ? ` · ${ledgerSourceLabel}` : ""}
          {isSampleLedger ? ` · ${SAMPLE_LEDGER_LABEL}` : ""}
        </p>
      </div>

      {downloadError && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-base text-red-900">
          {downloadError}
        </div>
      )}

      {/* Where am I? */}
      <StepProgress
        steps={[
          {
            labelBm: "Baca lejar",
            labelZh: "读账页",
            labelEn: "Read the ledger",
            status: isRealLedger ? "done" : "needs-you",
          },
          {
            labelBm: "Jana resit",
            labelZh: "开收据",
            labelEn: "Issue receipts",
            status:
              donations.length === 0
                ? "locked"
                : receiptsIssued
                  ? "done"
                  : "needs-you",
          },
          {
            labelBm: "Serah wang",
            labelZh: "交现金",
            labelEn: "Hand over cash",
            status:
              !receiptsIssued
                ? "locked"
                : cashInHandCents > 0
                  ? "needs-you"
                  : "done",
          },
          {
            labelBm: "Fail cukai",
            labelZh: "税务文件",
            labelEn: "Tax file",
            status: einvoisReady ? "needs-you" : "locked",
          },
        ]}
      />

      <NextAction tone={receiptsIssued && cashInHandCents === 0 ? "done" : "action"}>
        {!isRealLedger && donations.length === 0 ? (
          <Tri
            bm="Mula di langkah 1: ambil gambar halaman lejar derma anda. Minit akan membaca setiap baris."
            zh="从第 1 步开始：拍下您的捐款账页。Minit 会把每一行读出来。"
            en="Start at step 1: take a photo of your donation ledger page. Minit reads every line."
          />
        ) : ledgerRowsToCheck > 0 ? (
          <Tri
            bm={`Langkah 1: ${ledgerRowsToCheck} baris perlu anda sahkan sebelum boleh dapat resit.`}
            zh={`第 1 步：有 ${ledgerRowsToCheck} 行要您确认，确认后才能开收据。`}
            en={`Step 1: ${ledgerRowsToCheck} row(s) need your confirmation before they can get a receipt.`}
          />
        ) : rowsReadyToAdd > 0 ? (
          <Tri
            bm={`Langkah 1: ${rowsReadyToAdd} baris sudah sedia — masukkan ke daftar derma.`}
            zh={`第 1 步：有 ${rowsReadyToAdd} 行准备好了 —— 把它们加进捐款登记簿。`}
            en={`Step 1: ${rowsReadyToAdd} row(s) are ready — add them to the register.`}
          />
        ) : unreceipted > 0 ? (
          <Tri
            bm={`Langkah 2: ${unreceipted} derma belum ada resit. Jana resit sekarang.`}
            zh={`第 2 步：有 ${unreceipted} 笔捐款还没有收据。现在开收据。`}
            en={`Step 2: ${unreceipted} donation(s) have no receipt yet. Issue receipts now.`}
          />
        ) : cashInHandCents > 0 ? (
          <Tri
            bm={`Langkah 3: ${formatRm(cashInHandCents)} tunai masih belum sampai ke HQ.`}
            zh={`第 3 步：还有 ${formatRm(cashInHandCents)} 现金没交到总会。`}
            en={`Step 3: ${formatRm(cashInHandCents)} in cash has not reached HQ yet.`}
          />
        ) : (
          <Tri
            bm="Semua resit sudah dijana dan wang sudah sampai ke HQ. Hujung bulan, muat turun fail cukai di langkah 4."
            zh="收据都开好了，钱也交到总会了。到月底，在第 4 步下载税务文件。"
            en="Every receipt is issued and the cash has reached HQ. At month end, download the tax file in step 4."
          />
        )}
      </NextAction>

      {/* 1 — read the ledger page */}
      <StepCard
        step={1}
        titleBm="Ambil gambar halaman lejar & semak"
        titleZh="拍下账页并核对"
        titleEn="Photo of the ledger page, then check it"
        summary={
          ledgerSourceLabel ? (
            <>📄 {ledgerSourceLabel}</>
          ) : (
            <Tri
              bm="Minit membaca setiap baris. Baris yang kabur perlu anda sahkan sebelum boleh dapat resit."
              zh="Minit 会把每一行读出来。写得模糊的行要您确认之后才能开收据。"
              en="Minit reads every line. Smudged lines need your confirmation before they can get a receipt."
            />
          )
        }
        status={
          noLedgerYet
            ? "needs-you"
            : isSampleLedger
              ? "example"
              : ledgerRowsToCheck > 0
                ? "needs-you"
                : "done"
        }
        count={ledgerRowsToCheck}
        defaultOpen={!isRealLedger || ledgerRowsToCheck > 0 || rowsReadyToAdd > 0}
      >
        <div className="flex flex-col gap-4">
          {/* Upload / camera input — the AI ingestion path (same UX as /minutes) */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-4">
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 ${
                // pointer-events-none + opacity-60 meant nothing responded AND the
              // explanation of why was unreadable. The label itself says
              // "AI is reading…", so keep it at full strength.
              aiBusy ? "pointer-events-none" : ""
              }`}
            >
              {aiBusy ? (
                <>
                  ⏳ <Tri bm="AI sedang membaca…" zh="AI 读取中…" en="AI is reading…" />
                </>
              ) : (
                <>
                  📷 <Tri bm="Pilih / ambil gambar lejar" zh="选择/拍摄账页照片" en="Choose / take a ledger photo" />
                </>
              )}
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                disabled={aiBusy}
                onChange={(e) => {
                  onLedgerPicked(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="text-sm text-muted-foreground">
              {ledgerSourceLabel ? (
                <>📄 {ledgerSourceLabel}</>
              ) : isSampleLedger ? (
                <Tri
                  bm="Contoh dipaparkan di bawah"
                  zh="下面显示的是示范内容"
                  en="The example is shown below"
                />
              ) : (
                <Tri
                  bm="Satu gambar, satu halaman lejar"
                  zh="一张照片拍一页账页"
                  en="One photo per ledger page"
                />
              )}
            </span>
          </div>

          {/* Opt-in example, quiet and separate from the camera button. */}
          {noLedgerYet && !aiBusy && (
            <button
              type="button"
              onClick={() => {
                setLedger(sampleLedgerExtraction);
                setShowSample(true);
                setAddedRows(new Set());
                setAiError(null);
              }}
              className="self-start text-base text-muted-foreground underline underline-offset-4"
            >
              <Tri
                bm="Belum ada lejar di tangan? Lihat contoh"
                zh="手上还没有账页？看一个示范"
                en="Ledger not to hand? See an example"
              />
            </button>
          )}
          {aiError && (
            <div className="rounded-md border border-red-300 bg-red-50 p-4 text-base text-red-900">
              {aiError}
            </div>
          )}
          {isSampleLedger && (
            /* Shown only to someone who asked for the example. A small grey
               badge was too quiet for what this has to say: adding these
               invented rows to the register and issuing receipts would burn real,
               permanent, gap-free receipt numbers. (2026-07-28 audit.) */
            <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:bg-amber-400/10">
              <p className="min-w-56 flex-1 text-base font-medium text-amber-900 dark:text-amber-100">
              <Tri
                bm="Baris di bawah ialah CONTOH — bukan derma sebenar. Ia ada supaya anda boleh lihat cara kerjanya. Kalau anda tambah baris contoh ini ke daftar dan jana resit, nombor resit sebenar akan terpakai dan tidak boleh dikitar semula. Ambil gambar lejar anda sendiri dahulu."
                zh="下面这些是示范用的记录，不是真实捐款，只是让您先看看流程。如果把示范记录加进登记簿并开收据，会用掉真实的收据号码，而且号码不能回收。请先拍下您自己的账页。"
                en="The rows below are an EXAMPLE, not real donations — they are here so you can see how this works. If you add them to the register and issue receipts, real receipt numbers will be used up and cannot be recycled. Take a photo of your own ledger page first."
              />
              </p>
              <Button variant="outline" onClick={ledgerBackToEmpty}>
                <Tri bm="Tutup contoh" zh="关掉示范" en="Close the example" />
              </Button>
            </div>
          )}
          {duplicateGroups.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
              ⚠ <Tri bm="Kemungkinan CATATAN BERGANDA" zh="可能是重复记录" en="Possible duplicate entry" />:{" "}
              {duplicateGroups
                .map((g) => g.map((i) => `${t("baris", "第", "row")} ${i + 1}`).join(" & "))
                .join("; ")}{" "}
              — <Tri
                bm="penderma, tarikh dan jumlah yang sama"
                zh="捐款人、日期和金额相同"
                en="same donor, date and amount"
              />.
            </div>
          )}
          {/* Compact spreadsheet-style table — one ledger row per table row */}
          <ExtractionTable
            headers={[
              { bm: "Penderma", zh: "捐款人", en: "Donor" },
              { bm: "Jumlah", zh: "金额", en: "Amount" },
              { bm: "Tarikh", zh: "日期", en: "Date" },
              { bm: "Tujuan", zh: "用途", en: "Purpose" },
            ]}
            rows={ledgerRows.map((r, i) => {
              const worst = [r.donor_name, r.amount_cents, r.donated_at]
                .map((f) => f.confidence)
                .reduce(
                  (acc, c) =>
                    acc === "missing" || c === "missing"
                      ? "missing"
                      : acc === "check" || c === "check"
                        ? "check"
                        : "confirmed",
                  "confirmed" as "confirmed" | "check" | "missing"
                );
              const textCell = (
                field: "donor_name" | "donated_at" | "purpose",
                kind: "text" | "date"
              ) => ({
                display: r[field].value,
                editText: r[field].value,
                confidence: r[field].confidence,
                sourceRef: r[field].source_ref,
                kind,
                onConfirm: () => mutateLedger((l) => confirmTextField(l.rows[i][field])),
                onSave: (v: string) => {
                  mutateLedger((l) => editTextField(l.rows[i][field], v));
                  return null;
                },
              });
              return {
                status: worst,
                warning: !eligibleForReceipt(r) ? (
                  <Tri
                    bm="Belum layak resit — sahkan dahulu"
                    zh="暂不能开收据 —— 请先确认"
                    en="Not ready for a receipt — confirm it first"
                  />
                ) : undefined,
                cells: [
                  textCell("donor_name", "text"),
                  {
                    display: r.amount_cents.value !== null ? formatRm(r.amount_cents.value) : "",
                    editText:
                      r.amount_cents.value !== null
                        ? (r.amount_cents.value / 100).toFixed(2)
                        : "",
                    confidence: r.amount_cents.confidence,
                    sourceRef: r.amount_cents.source_ref,
                    kind: "amount" as const,
                    onConfirm: () =>
                      mutateLedger((l) => confirmTextField(l.rows[i].amount_cents)),
                    onSave: (v: string) => {
                      const cents = parseRmToCents(v);
                      if (cents === null) {
                        return t(
                          "Jumlah tak sah — contoh: 50 atau 12.50",
                          "金额无效 — 例如 50 或 12.50",
                          "Invalid amount — e.g. 50 or 12.50"
                        );
                      }
                      mutateLedger((l) => {
                        const f = l.rows[i].amount_cents;
                        f.value = cents;
                        f.confidence = "confirmed";
                        f.source_ref = f.source_ref ?? userSource();
                      });
                      return null;
                    },
                  },
                  textCell("donated_at", "date"),
                  textCell("purpose", "text"),
                ],
              };
            })}
          />
          {/* Rows only reach the register after explicit human confirmation */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={addConfirmedRowsToRegister}
              disabled={
                ledger.rows.filter((r, i) => eligibleForReceipt(r) && !addedRows.has(i)).length === 0
              }
              size="lg"
              className="text-base"
            >
              ➕{" "}
              <Tri
                bm="Masukkan baris disahkan ke daftar"
                zh="把已确认的行加入登记"
                en="Add confirmed rows to register"
              />{" "}
              ({rowsReadyToAdd})
            </Button>
          </div>
        </div>
      </StepCard>

      {/* 2 — the register + issuing receipts */}
      <StepCard
        step={2}
        titleBm="Daftar derma & jana resit"
        titleZh="捐款登记与开收据"
        titleEn="The register, and issuing receipts"
        summary={
          donations.length === 0 ? (
            <Tri
              bm="Kosong buat masa ini. Baris yang anda sahkan di langkah 1 akan masuk ke sini."
              zh="现在还是空的。您在第 1 步确认的行会进到这里。"
              en="Empty for now. The rows you confirm in step 1 land here."
            />
          ) : (
            <Tri
              bm={`${donations.length} derma dalam daftar. Nombor resit dijana oleh kod, berurutan dan tidak boleh diulang.`}
              zh={`登记簿里有 ${donations.length} 笔捐款。收据号码由程序按顺序生成，不会重复。`}
              en={`${donations.length} donation(s) in the register. Receipt numbers are generated by code, in order, never reused.`}
            />
          )
        }
        status={
          donations.length === 0
            ? "locked"
            : receiptsIssued
              ? "done"
              : "needs-you"
        }
        count={unreceipted}
        lockedReason={
          <Tri
            bm="Belum ada derma dalam daftar. Buka langkah 1 dan ambil gambar halaman lejar anda dahulu."
            zh="登记簿里还没有捐款。请先展开第 1 步，拍下您的账页。"
            en="There are no donations in the register yet. Open step 1 and take a photo of your ledger page first."
          />
        }
        defaultOpen={donations.length > 0 && !receiptsIssued && ledgerRowsToCheck === 0 && rowsReadyToAdd === 0}
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-muted-foreground">
            <Tri
              bm="Nombor berurutan dijana oleh kod, bukan AI."
              zh="编号由程序生成，不是 AI。"
              en="Numbers generated by code, not the AI."
            />
          </p>
          {/* 2026-08-18: this used to be glued onto the end of the sentence
              above with a space. In Chinese that produced one run-on line whose
              second half was about a completely different subject AND in a
              language the reader had not chosen — it read like a mistake.
              The sentence itself is NOT translated on purpose: it is the exact
              legal wording printed on the receipt PDF (CLAUDE.md Hard Rule 3),
              and screen and paper must match word for word. So it now stands on
              its own, labelled as what it is, with the meaning said plainly
              underneath in the reader's language. */}
          <div className="rounded-2xl border-2 border-[color:var(--v2-border)] bg-white/60 p-3 dark:bg-white/5">
            <p className="text-sm font-medium text-muted-foreground">
              <Tri
                bm="Ayat ini dicetak pada setiap resit, tepat seperti di bawah:"
                zh="下面这一句会原样印在每一张收据上："
                en="This sentence is printed on every receipt, exactly as below:"
              />
            </p>
            {/* The org's REAL tax status, resolved on the server, so this line
                always matches what the generated PDF will say. */}
            <p className="mt-1 text-base font-medium">
              {taxDeductibilityLineBm(taxStatus)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {taxStatus === "s44_6" ? (
                <Tri
                  bm="Maksudnya: penderma boleh menuntut pelepasan cukai dengan resit ini."
                  zh="意思是：捐款人可以用这张收据申报扣税。"
                  en="What it means: the donor can claim a tax deduction with this receipt."
                />
              ) : (
                <Tri
                  bm="Maksudnya: penderma TIDAK boleh menuntut pelepasan cukai dengan resit ini."
                  zh="意思是：捐款人不能用这张收据申报扣税。"
                  en="What it means: the donor cannot claim a tax deduction with this receipt."
                />
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Issuing receipts is IRREVERSIBLE: it locks every amount and
                burns a block of sequential numbers that can never be reused.
                So the button asks once before it fires. */}
            {!receiptsIssued && !confirmIssue && (
              <Button
                onClick={() => setConfirmIssue(true)}
                size="lg"
                className="text-base"
                disabled={issueBusy}
              >
                <Tri bm="Jana resit berurutan" zh="生成正式收据" en="Issue receipts" />
              </Button>
            )}
            {!receiptsIssued && confirmIssue && (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm text-amber-900">
                  <Tri
                    bm="Nombor resit tidak boleh dibatalkan atau diubah selepas ini, dan jumlah wang akan dikunci. Teruskan?"
                    zh="收据编号一经生成即无法取消或修改，金额也将锁定。确定继续吗？"
                    en="Receipt numbers cannot be cancelled or changed afterwards, and the amounts are locked. Continue?"
                  />
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="lg"
                    className="text-base"
                    disabled={issueBusy}
                    onClick={() => {
                      setConfirmIssue(false);
                      void issueReceipts();
                    }}
                  >
                    {issueBusy ? (
                      <Tri bm="Menjana…" zh="生成中…" en="Issuing…" />
                    ) : (
                      <Tri bm="Ya, jana resit" zh="是，生成收据" en="Yes, issue receipts" />
                    )}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="text-base"
                    disabled={issueBusy}
                    onClick={() => setConfirmIssue(false)}
                  >
                    <Tri bm="Batal" zh="取消" en="Cancel" />
                  </Button>
                </div>
              </div>
            )}
            <Link href="/money/history" className="text-sm underline underline-offset-4">
              <Tri bm="Sejarah resit" zh="收据历史" en="Receipt history" /> →
            </Link>
            {/* PDPA: names masked by default; reveal is a deliberate tap */}
            <Button variant="outline" size="sm" onClick={() => setShowNames((v) => !v)}>
              {showNames ? (
                <Tri bm="🙈 Sorok nama" zh="隐藏姓名" en="Hide names" />
              ) : (
                <Tri bm="👁 Tunjuk nama" zh="显示姓名" en="Show names" />
              )}
            </Button>
            {!showNames && (
              <span className="text-sm text-muted-foreground">
                <Tri
                  bm="Nama penderma disorok untuk melindungi privasi mereka"
                  zh="为保护捐款人隐私，姓名已隐藏"
                  en="Donor names are hidden to protect their privacy"
                />
              </span>
            )}
          </div>
          {issueNotice === "saved" && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              <Tri
                bm="Resit disimpan ke sejarah pertubuhan"
                zh="收据已保存到组织历史"
                en="Receipts saved to the organisation's history"
              />
            </p>
          )}
          {issueNotice === "local" && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Tri
                bm="Mod demo: nombor dijana setempat sahaja — TIDAK disimpan. Pilih pertubuhan di halaman Pertubuhan untuk menyimpan."
                zh="演示模式：编号仅在本机生成——未保存。请在组织页面选择组织以保存。"
                en="Demo mode: numbers issued locally only — NOT saved. Choose an organisation on the Organisations page to save."
              />
            </p>
          )}
          {issueNotice === "readonly" && (
            <p className="rounded-xl border-2 border-slate-300 bg-slate-50 p-3 text-base font-medium text-slate-800 dark:bg-white/10 dark:text-slate-100">
              <Tri
                bm="Akaun anda ialah akaun juruaudit — boleh melihat sahaja, tidak boleh menjana resit. Minta pentadbir pertubuhan untuk melakukannya."
                zh="您的账号是审计账号，只能查看，不能开收据。请让机构管理员来处理。"
                en="Your account is an auditor account — view only, it cannot issue receipts. Ask an organisation administrator to do it."
              />
            </p>
          )}
          {issueNotice === "reconcile" && (
            <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-semibold text-red-900 dark:bg-red-400/10 dark:text-red-100">
              <Tri
                bm="BERHENTI. Sebahagian rekod mungkin sudah masuk ke pangkalan data dan Minit tidak dapat membersihkannya. JANGAN tekan lagi. Buka “Sejarah resit” dan lihat apa yang sudah ada di sana dahulu."
                zh="请停一下。有部分记录可能已经写进资料库，而 Minit 没能清理干净。请不要重复点击。先打开「收据历史」，看看那边已经有了什么。"
                en="STOP. Some records may already be in the database and Minit could not clean them up. Do NOT tap again. Open “Receipt history” and see what is already there first."
              />
            </p>
          )}
          {issueNotice === "error" && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              <Tri
                bm="Tidak pasti sama ada resit telah dijana. JANGAN tekan lagi — semak “Sejarah resit” dahulu."
                zh="无法确定收据是否已生成。请勿重复点击——请先查看“收据历史”。"
                en="We could not confirm whether the receipts were issued. Do NOT tap again — check “Receipt history” first."
              />
            </p>
          )}
          {donationStore.corrupt && (
            <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
              <Tri
                bm="Rekod yang tersimpan pada peranti ini tidak dapat dibaca, jadi daftar ini dimulakan kosong. Jangan jana resit sebelum menyemak “Sejarah resit” — resit yang sudah dijana tersimpan dengan selamat di sana."
                zh="这台设备上暂存的记录读不出来，所以登记簿从空的开始。开收据之前请先看「收据历史」—— 已经开出的收据都安全地存在那边。"
                en="The records saved on this device could not be read, so the register started empty. Before issuing any receipts, check “Receipt history” — receipts already issued are safely stored there."
              />
            </p>
          )}
          {donationStore.quotaFull && (
            <p className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
              <Tri
                bm="Peranti ini penuh, jadi daftar ini TIDAK dapat disimpan. Jangan tutup halaman: jana resit sekarang supaya rekod masuk ke pangkalan data."
                zh="这台设备的储存空间满了，登记簿没能存下来。请先不要关掉页面：现在就开收据，记录才会进到资料库。"
                en="This device is full, so the register could NOT be saved. Do not close the page: issue the receipts now so the records reach the database."
              />
            </p>
          )}
          {donations.length === 0 && (
            /* /money had NO empty state at all — it was permanently in demo
               mode with five fictional donors. (2026-07-28 audit.) */
            <div className="rounded-xl border-2 border-dashed p-5 text-base">
              <p className="font-semibold">
                <Tri
                  bm="Daftar derma masih kosong."
                  zh="捐款登记簿还是空的。"
                  en="The donation register is empty."
                />
              </p>
              <p className="mt-1 text-muted-foreground">
                <Tri
                  bm="Ambil gambar halaman lejar anda di langkah 1 di atas. AI akan membaca setiap baris, anda sahkan, dan baris yang disahkan masuk ke sini."
                  zh="请在上面第 1 步拍下您的账页照片。AI 会逐行读出来，您确认之后，确认过的记录就会进到这里。"
                  en="Take a photo of your ledger page in step 1 above. Minit reads each line, you check it, and the checked lines land here."
                />
              </p>
            </div>
          )}
          {/* One card per donation — no sideways scroll */}
          <div className="grid gap-3 sm:grid-cols-2">
            {donations.map((d) => {
              const waLink = d.receiptNo
                ? buildWaMeLink(
                    d.donorPhone,
                    receiptWhatsAppMessageBm({
                      orgName: documentOrgName,
                      receiptNo: d.receiptNo,
                      donorName: d.donorName,
                      amountCents: d.amountCents,
                      dateIso: d.donatedAtIso,
                      purpose: d.purpose,
                      taxStatus,
                    })
                  )
                : null;
              return (
                <div key={d.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {showNames ? d.donorName : maskName(d.donorName)}
                        {d.source === "manual" && (
                          <Badge
                            variant="outline"
                            className="ml-2 border-slate-300 bg-slate-100 text-slate-700"
                          >
                            <Tri bm="manual" zh="手动" en="manual" />
                          </Badge>
                        )}
                      </p>
                      <p className="font-mono text-sm text-muted-foreground">
                        {d.receiptNo ?? t("belum ada resit", "还没有收据", "no receipt yet")}
                      </p>
                    </div>
                    <span className="font-semibold tabular-nums">{formatRm(d.amountCents)}</span>
                  </div>
                  <div className="mt-2">
                    <Badge variant="outline" className={CUSTODY_STYLE[d.custodyStatus]}>
                      <Tri {...CUSTODY_LABEL[d.custodyStatus]} />
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!d.receiptNo && editingId !== d.id && (
                      <Button variant="outline" onClick={() => setEditingId(d.id)}>
                        ✏️ <Tri bm="Ubah butiran" zh="修改资料" en="Edit details" />
                      </Button>
                    )}
                    {d.receiptNo && (
                      <Button
                        variant="outline"
                        onClick={() => downloadReceiptPdf(d)}
                        disabled={downloadBusy !== null}
                      >
                        {downloadBusy === `receipt:${d.id}` ? (
                          <Tri bm="Menyiapkan…" zh="正在准备…" en="Preparing…" />
                        ) : (
                          <>
                            <Download className="h-5 w-5" strokeWidth={2} />
                            <Tri bm="Muat turun resit" zh="下载收据" en="Download receipt" />
                          </>
                        )}
                      </Button>
                    )}
                    {waLink ? (
                      <Button variant="outline" asChild>
                        <a href={waLink} target="_blank" rel="noopener noreferrer">
                          📱 <Tri bm="Hantar WhatsApp" zh="用 WhatsApp 发送" en="Send on WhatsApp" />
                        </a>
                      </Button>
                    ) : (
                      d.receiptNo && (
                        <span className="self-center text-base text-muted-foreground">
                          {t(
                            "Tiada nombor telefon — tekan “Ubah butiran” untuk menambahnya, kemudian hantar melalui WhatsApp.",
                            "没有电话号码 —— 按「修改资料」补上，就可以用 WhatsApp 发送。",
                            "No phone number — tap “Edit details” to add one, then you can send it on WhatsApp.",
                          )}
                        </span>
                      )
                    )}
                  </div>
                  {editingId === d.id && (
                    <DonationEditor
                      donation={d}
                      onSave={saveDonation}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                  {d.receiptNo && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      🔒{" "}
                      <Tri
                        bm="Dikunci untuk audit"
                        zh="已锁定以供审计"
                        en="Locked for the audit trail"
                      />
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Manual entry lives INSIDE the register step now, not as a fifth
              top-level card competing with the photo flow. It is the fallback for
              a donation that was never written on paper. */}
          {/* Two shapes of "there was no paper", because they are genuinely
              different jobs: ONE gift with a category and a note (rental, a
              grant, cash handed over) — and a COLLECTION, forty people at
              RM10 each, where the only thing that varies row to row is a name
              and an amount. J, 2026-08-22: 賬單如果捐錢人多的話會到很多. */}
          <TypeDonations
            onAddMany={addManualDonations}
            defaultCollector={registerCollector}
          />
          <ManualIncomeForm onAdd={addManualDonation} defaultCollector={registerCollector} />
        </div>
      </StepCard>

      {/* 3 — cash from the collector to HQ */}
      <StepCard
        step={3}
        titleBm="Serahan wang tunai kepada HQ"
        titleZh="把现金交给总会"
        titleEn="Handing the cash over to HQ"
        summary={
          cashInHandCents > 0 ? (
            <Tri
              bm={`${formatRm(cashInHandCents)} masih belum sampai ke HQ.`}
              zh={`还有 ${formatRm(cashInHandCents)} 没交到总会。`}
              en={`${formatRm(cashInHandCents)} has not reached HQ yet.`}
            />
          ) : (
            <Tri
              bm="Mengesan tunai daripada pemungut sampai ke HQ, supaya tiada wang hilang di tengah jalan."
              zh="追踪现金从收款人手上交到总会的过程，避免中间不见钱。"
              en="Tracks cash from the collector to HQ, so no money goes missing in between."
            />
          )
        }
        status={
          !receiptsIssued
            ? "locked"
            : cashInHandCents > 0
              ? "needs-you"
              : "done"
        }
        lockedReason={
          <Tri
            bm="Jana resit di langkah 2 dahulu — wang hanya boleh diserahkan selepas setiap derma ada nombor resit, kalau tidak tiada apa-apa untuk diikat pada serahan itu."
            zh="请先在第 2 步开收据 —— 只有每笔捐款都有收据号码之后才能交接，否则交出去的钱没有凭据可以对。"
            en="Issue the receipts in step 2 first — cash can only be handed over once every donation has a receipt number, otherwise there is nothing to tie the hand-over to."
          />
        }
        defaultOpen={receiptsIssued && cashInHandCents > 0}
      >
        <div className="flex flex-col gap-5">
          {/* The three custody states, as a compact status strip */}
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:gap-3">
            <span className="rounded-md bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">
              1 · <Tri bm="Wang di tangan pemungut" zh="钱在收款人手上" en="Cash with collector" />
            </span>
            <span className="hidden text-muted-foreground sm:inline">→</span>
            <span className="rounded-md bg-blue-100 px-3 py-1 text-sm font-medium text-blue-900">
              2 · <Tri bm="Diserah, tunggu HQ" zh="已交出，等待总会" en="Handed over, waiting for HQ" />
            </span>
            <span className="hidden text-muted-foreground sm:inline">→</span>
            <span className="rounded-md bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
              3 · <Tri bm="Disahkan HQ" zh="总会已确认" en="Confirmed by HQ" />
            </span>
          </div>

          {/* Two clearly-labelled actions */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <p className="text-sm font-medium text-muted-foreground">
                <Tri bm="Langkah 1 · Pemungut" zh="第一步 · 收款人" en="Step 1 · Collector" />
              </p>
              <Button
                onClick={handOver}
                disabled={collectorsWithCashInHand.length === 0}
                size="lg"
                className="text-base"
              >
                <Tri bm="Serah wang ke HQ" zh="交钱给总会" en="Hand over to HQ" />
              </Button>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border p-4">
              <p className="text-sm font-medium text-muted-foreground">
                <Tri bm="Langkah 2 · HQ" zh="第二步 · 总会" en="Step 2 · HQ" />
              </p>
              <Button
                onClick={hqConfirm}
                disabled={!hasPendingBatch}
                size="lg"
                variant="outline"
                className="text-base"
              >
                <Tri bm="Sahkan wang diterima" zh="确认收到钱" en="Confirm money received" />
              </Button>
            </div>
          </div>
          {batches.map((batch) => (
            <div
              key={batch.id}
              className={`rounded-lg border p-4 text-base ${
                batch.status === "settled"
                  ? "border-green-300 bg-green-50"
                  : "border-blue-300 bg-blue-50"
              }`}
            >
              <div className="font-medium">
                {batch.status === "settled" ? "✅ " : "⏳ "}
                {batch.status === "settled"
                  ? t("HQ sudah sahkan wang ini", "总会已确认这笔钱", "HQ has confirmed this money")
                  : t("Menunggu HQ sahkan", "等待总会确认", "Waiting for HQ to confirm")}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {batch.collector} · {batch.handedOverAtIso} ·{" "}
                {t("jumlah", "金额", "total")} {formatRm(batch.totalCents)} ·{" "}
                {t("resit", "收据", "receipts")} {batch.receiptNos.join(", ")}
                {batch.confirmedByHq
                  ? ` · ${t("disahkan oleh", "确认人", "confirmed by")} ${batch.confirmedByHq}`
                  : ""}
              </div>
            </div>
          ))}

          {/* Per-collector cards instead of a wide table — no sideways scroll */}
          <div className="grid gap-3 sm:grid-cols-2">
            {balances.map((b) => (
              <div key={b.collector} className="rounded-lg border p-4">
                <p className="font-medium">{b.collector}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-amber-50 p-2">
                    <div className="text-sm text-muted-foreground">
                      <Tri bm="Di tangan" zh="手上" en="In hand" />
                    </div>
                    <div className="font-semibold tabular-nums">{formatRm(b.collectedCents)}</div>
                  </div>
                  <div className="rounded-md bg-blue-50 p-2">
                    <div className="text-sm text-muted-foreground">
                      <Tri bm="Tunggu HQ" zh="等待总会" en="Waiting HQ" />
                    </div>
                    <div className="font-semibold tabular-nums">{formatRm(b.pendingCents)}</div>
                  </div>
                  <div className="rounded-md bg-green-50 p-2">
                    <div className="text-sm text-muted-foreground">
                      <Tri bm="Selesai" zh="已完成" en="Done" />
                    </div>
                    <div className="font-semibold tabular-nums">{formatRm(b.settledCents)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="rounded-md bg-muted/40 p-3 text-base">
            <Tri
              bm="Jumlah wang tunai yang masih belum sampai ke HQ"
              zh="仍未交到总会的现金总额"
              en="Total cash not yet reached HQ"
            />
            :{" "}
            <span className="font-semibold text-foreground">
              {formatRm(totalUnremittedCents(donations))}
            </span>
          </p>
        </div>
      </StepCard>

      {/* 4 — the month-end tax file */}
      <StepCard
        step={4}
        titleBm="Fail cukai hujung bulan (e-Invois)"
        titleZh="月底税务文件（电子发票 e-Invois）"
        titleEn="Month-end tax file (e-Invois)"
        summary={
          <Tri
            bm="Sekali sebulan sahaja. Minit gabungkan semua resit bulan itu jadi SATU fail Excel untuk anda muat naik ke laman LHDN."
            zh="一个月只需要做一次。Minit 把当月所有收据合并成一个 Excel 文件，让您上传到税务局的网站。"
            en="Once a month only. Minit combines that month's receipts into ONE Excel file for you to upload to the tax office's site."
          />
        }
        // `einvois.error` counts as "needs you", NOT "locked": a locked StepCard
        // renders its lockedReason INSTEAD of its children, which would have hidden
        // the error message again — the exact bug the error block below was added
        // to fix. (Found in review, 2026-07-28.)
        status={einvoisReady || einvois.error ? "needs-you" : "locked"}
        lockedReason={
          <Tri
            bm="Belum ada resit untuk bulan ini. Jana resit di langkah 2 dahulu — fail cukai dibuat daripada resit, jadi tiada resit bermakna tiada apa-apa untuk difailkan."
            zh="这个月还没有收据。请先在第 2 步开收据 —— 税务文件是根据收据做的，没有收据就没有东西可以报。"
            en="No receipts for this month yet. Issue receipts in step 2 first — the tax file is built from receipts, so no receipts means nothing to file."
          />
        }
      >
        <div>
          <p className="mb-4 text-base text-muted-foreground">
            {/* "e-Invois", "LHDN", "consolidation", "batch upload" and ".xlsx"
                were all shown with no explanation anywhere. (2026-07-28 audit.) */}
            <Tri
              bm="Setiap bulan, semua resit bulan itu digabungkan menjadi SATU fail Excel (.xlsx). Anda muat turun fail itu di sini, kemudian log masuk ke laman MyInvois LHDN (Lembaga Hasil Dalam Negeri — jabatan cukai) dan muat naik fail itu di sana. Minit tidak menghantarnya untuk anda."
              zh="每个月，Minit 会把当月所有收据合并成一个 Excel 文件（.xlsx）。您在这里下载这个文件，然后登入税务局（LHDN）的 MyInvois 网站，把文件上传上去。Minit 不会替您送出。"
              en="Each month all that month's receipts are combined into ONE Excel file (.xlsx). You download it here, then sign in to the tax office's (LHDN) MyInvois website and upload the file there. Minit does not submit it for you."
            />
            <br />⚠{" "}
            <Tri
              bm="Semak templat dengan LHDN sebelum guna."
              zh="使用前请对照税务局的官方模板核对。"
              en="Check the template against LHDN's official one before use."
            />
          </p>
          <div className="flex flex-col gap-4">
          {/* Month picker — only offers months that actually have records. */}
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="einvois-month" className="text-sm font-medium text-muted-foreground">
              <Tri bm="Bulan" zh="月份" en="Month" />
            </label>
            <select
              id="einvois-month"
              value={einvoisMonth}
              onChange={(e) => setEinvoisMonth(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {(availableMonths.length > 0 ? availableMonths : [einvoisMonth]).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {einvoisPack && (
              <span className="text-sm text-muted-foreground">
                <Tri bm="Tarikh akhir hantar" zh="申报截止" en="Submit by" />:{" "}
                <span className="font-medium text-foreground">{consolidatedDeadlineIso(einvoisMonth)}</span>
              </span>
            )}
          </div>

          {einvoisReady && einvoisPack ? (
            <div className="flex flex-col gap-3">
              <pre className="rounded-md border bg-muted/40 p-4 text-base whitespace-pre-wrap">
                {monthEndSummary(einvoisPack, documentOrgName)}
              </pre>
              <Button
                onClick={downloadEInvoisPack}
                size="lg"
                className="self-start"
                disabled={downloadBusy !== null}
              >
                {downloadBusy === "einvois" ? (
                  <Tri
                    bm="Sedang menyiapkan fail…"
                    zh="正在准备文件…"
                    en="Preparing the file…"
                  />
                ) : (
                  <>
                    <Download className="h-5 w-5" strokeWidth={2} />
                    <Tri
                      bm="Muat turun fail cukai (.xlsx)"
                      zh="下载税务文件（.xlsx）"
                      en="Download the tax file (.xlsx)"
                    />{" "}
                    ({einvoisPack.files.length}{" "}
                    {t("fail", "个文件", `file${einvoisPack.files.length > 1 ? "s" : ""}`)})
                  </>
                )}
              </Button>
            </div>
          ) : einvois.error ? (
            /* AUDIT FIX: `einvois.error` was computed and then NEVER rendered,
               so a real failure collapsed the whole section into the innocuous
               "issue receipts first" message even when receipts existed. */
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-base font-medium text-red-900 dark:bg-red-400/10 dark:text-red-100">
              <Tri
                bm="Pek cukai bulan ini tidak dapat disiapkan. Semak jumlah dan nombor resit dalam bahagian 2 di atas, kemudian cuba lagi."
                zh="这个月的税务文件包做不出来。请先检查上面第 2 步的金额和收据号码，然后再试。"
                en="This month's tax pack could not be prepared. Check the amounts and receipt numbers in step 2 above, then try again."
              />
              <br />
              <span className="font-mono">{einvois.error}</span>
            </div>
          ) : (
            <p className="text-base text-muted-foreground">
              <Tri
                bm="Belum ada resit untuk bulan ini. Buat resit di langkah 2 di atas dahulu."
                zh="这个月还没有收据。请先在上面第 2 步开收据。"
                en="No receipts for this month yet. Issue receipts in step 2 above first."
              />
            </p>
          )}
          </div>
        </div>
      </StepCard>
    </div>
  );
}
