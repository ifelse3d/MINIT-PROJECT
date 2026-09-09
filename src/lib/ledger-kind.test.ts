import { describe, expect, it } from "vitest";
import {
  ledgerExtractionSchema,
  parseLedgerExtraction,
  type LedgerExtraction,
  type LedgerRowKind,
} from "@/lib/extraction";
import { kindAllowsReceipt, readingHasNoKinds, reindexAfterDrop, rowKindOf } from "@/lib/ledger-hints";
import { eligibleForReceipt } from "@/lib/receipts";
import { mergeLedgerExtractions } from "@/lib/extraction-merge";

// ---------------------------------------------------------------------------
// 136 — every ledger line carries a `kind` (income / expense / balance /
// total). The contract must keep reading yesterday's data (no kind), accept
// today's, throw a nonsense label away without losing the row, and NEVER
// promote an unlabelled line to income by itself.
// ---------------------------------------------------------------------------

const ref = (snippet: string) => ({ location: "photo 1, row 1", snippet });
const t = (v: string, c: "confirmed" | "check" | "missing" = "confirmed") =>
  c === "missing"
    ? { value: "", confidence: "missing" as const, source_ref: null }
    : { value: v, confidence: c, source_ref: ref(v) };
const amt = (v: number) => ({ value: v, confidence: "confirmed" as const, source_ref: ref(String(v)) });
const d = (v: string) => ({ value: v, confidence: "confirmed" as const, source_ref: ref(v) });

/** A row exactly as the app stored it before 136 — no `kind` at all. */
const oldRow = {
  donor_name: t("Tan Ah Kow"),
  donor_phone: t("", "missing"),
  amount_cents: amt(5000),
  purpose: t("derma am"),
  donated_at: d("2026-06-07"),
};

const kindOf = (value: LedgerRowKind, confidence: "confirmed" | "check" = "confirmed") => ({
  value,
  confidence,
  source_ref: ref(value),
});
/** The same shape with a value the enum does not know — what a wrong model answer looks like. */
const badKind = (value: string) => ({ value, confidence: "confirmed" as const, source_ref: ref(value) });

describe("136 — ledger row `kind` in the contract", () => {
  it("a reading saved before today (no kind) still parses, and gets no kind", () => {
    const p = parseLedgerExtraction({ page_title: t("Buku Derma"), rows: [oldRow] });
    expect(p.success).toBe(true);
    if (p.success) expect(p.data.rows[0].kind).toBeUndefined();
  });

  it("each of the four kinds parses and is kept", () => {
    for (const k of ["income", "expense", "balance", "total"] as const) {
      const p = parseLedgerExtraction({
        page_title: t("KEWANGAN"),
        rows: [{ ...oldRow, kind: kindOf(k) }],
      });
      expect(p.success).toBe(true);
      if (p.success) expect(p.data.rows[0].kind?.value).toBe(k);
    }
  });

  it("a nonsense label is dropped, the row itself survives", () => {
    const p = parseLedgerExtraction({
      page_title: t("KEWANGAN"),
      rows: [{ ...oldRow, kind: badKind("donation") }, { ...oldRow, kind: "income" }],
    });
    expect(p.success).toBe(true);
    if (p.success) {
      expect(p.data.rows).toHaveLength(2);
      expect(p.data.rows[0].kind).toBeUndefined();
      expect(p.data.rows[1].kind).toBeUndefined();
      expect(p.data.rows[0].amount_cents.value).toBe(5000);
    }
  });

  it("a `missing` kind reads the same as no kind — never defaulted to income", () => {
    const p = parseLedgerExtraction({
      page_title: t("KEWANGAN"),
      rows: [{ ...oldRow, kind: { value: "income", confidence: "missing", source_ref: null } }],
    });
    expect(p.success).toBe(true);
    if (p.success) expect(p.data.rows[0].kind).toBeUndefined();
  });

  it("a `check` kind is kept as check (a person decides)", () => {
    const p = parseLedgerExtraction({
      page_title: t("KEWANGAN"),
      rows: [{ ...oldRow, kind: kindOf("income", "check") }],
    });
    expect(p.success).toBe(true);
    if (p.success) expect(p.data.rows[0].kind?.confidence).toBe("check");
  });

  it("the raw schema also accepts a row without kind (localStorage round-trip)", () => {
    expect(ledgerExtractionSchema.safeParse({ page_title: t("x"), rows: [oldRow] }).success).toBe(true);
  });

  it("kind travels through the page merge untouched", () => {
    const a: LedgerExtraction = { page_title: t("p1"), rows: [{ ...oldRow, kind: kindOf("balance") }] };
    const b: LedgerExtraction = { page_title: t("p2"), rows: [{ ...oldRow, kind: kindOf("expense", "check") }] };
    const m = mergeLedgerExtractions(a, b);
    expect(m.rows.map((r) => r.kind?.value)).toEqual(["balance", "expense"]);
    expect(m.rows[1].kind?.confidence).toBe("check");
  });
});

describe("136 — rowKindOf: reader label first, balance words second, never income by default", () => {
  it("uses the reader's label when it has one", () => {
    expect(rowKindOf({ ...oldRow, kind: kindOf("expense") })).toEqual({
      kind: "expense",
      confidence: "confirmed",
      inferred: false,
    });
  });

  it("falls back to the 135 balance word-list when the reader said nothing", () => {
    expect(rowKindOf({ ...oldRow, purpose: t("上年结存") })).toEqual({
      kind: "balance",
      confidence: null,
      inferred: true,
    });
  });

  it("no label and no balance / expense / income word → unknown (null), not income", () => {
    expect(rowKindOf({ ...oldRow, purpose: t("晚宴") }).kind).toBeNull();
    expect(rowKindOf({ ...oldRow, purpose: t("", "missing") }).kind).toBeNull();
  });

  // J's page, read by the OLD prompt (no kind anywhere): the word-lists
  // stand in, always marked as a code guess.
  it("expense / income words stand in for a silent reader (code guess)", () => {
    const guess = (purpose: string) => rowKindOf({ ...oldRow, purpose: t(purpose) });
    expect(guess("礼堂")).toEqual({ kind: "expense", confidence: null, inferred: true });
    expect(guess("晚宴开销")).toEqual({ kind: "expense", confidence: null, inferred: true });
    expect(guess("Sewa dewan")).toEqual({ kind: "expense", confidence: null, inferred: true });
    expect(guess("会费")).toEqual({ kind: "income", confidence: null, inferred: true });
    expect(guess("乐捐")).toEqual({ kind: "income", confidence: null, inferred: true });
    expect(guess("Yuran ahli")).toEqual({ kind: "income", confidence: null, inferred: true });
    expect(guess("晚宴").kind).toBeNull(); // a dinner alone could be either — no guess
    expect(guess("Derma pembaikan bumbung dewan").kind).toBeNull(); // a donation FOR the hall — both words, no guess
  });

  it("the reader's label always beats the word-lists", () => {
    expect(rowKindOf({ ...oldRow, purpose: t("礼堂"), kind: kindOf("income") }).kind).toBe("income");
  });
});

describe("136 — readingHasNoKinds: a review read before today", () => {
  it("true when no row carries a label, false once any does", () => {
    expect(readingHasNoKinds([oldRow, oldRow])).toBe(true);
    expect(readingHasNoKinds([oldRow, { ...oldRow, kind: kindOf("income") }])).toBe(false);
    expect(readingHasNoKinds([])).toBe(false);
  });
});

describe("136 — only income reaches a receipt", () => {
  it("confirmed income: yes", () => {
    expect(kindAllowsReceipt({ ...oldRow, kind: kindOf("income") })).toBe(true);
    expect(eligibleForReceipt({ ...oldRow, kind: kindOf("income") })).toBe(true);
  });

  it("expense / balance / total: no, even with every other field confirmed", () => {
    for (const k of ["expense", "balance", "total"] as const) {
      expect(eligibleForReceipt({ ...oldRow, kind: kindOf(k) })).toBe(false);
    }
  });

  it("a `check` income label is not yet income", () => {
    expect(eligibleForReceipt({ ...oldRow, kind: kindOf("income", "check") })).toBe(false);
  });

  it("old data without a label: yes, unless the purpose reads as a balance or an expense", () => {
    expect(eligibleForReceipt(oldRow)).toBe(true);
    expect(eligibleForReceipt({ ...oldRow, purpose: t("银行") })).toBe(false);
    expect(eligibleForReceipt({ ...oldRow, purpose: t("礼堂") })).toBe(false);
    // a guessed income passes like an unlabelled row
    expect(eligibleForReceipt({ ...oldRow, purpose: t("会费") })).toBe(true);
  });
});

describe("136 — reindexAfterDrop keeps marks on the same rows", () => {
  it("shifts marks above the removed row down by one and drops the removed one", () => {
    expect([...reindexAfterDrop(new Set([0, 2, 3]), 2)]).toEqual([0, 2]);
    expect([...reindexAfterDrop(new Set([1]), 0)]).toEqual([0]);
  });
});
