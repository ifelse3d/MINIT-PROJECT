import { describe, expect, it } from "vitest";
import { dropLedgerRow, looksLikeBalanceRow, looksLikeSummaryPage } from "./ledger-hints";
import type { LedgerExtraction } from "./extraction";

// 135 (J 9/9) — the AGM notes' KEWANGAN block photographed into Record
// income. Fictional figures (A3); the purposes are the real handwritten ones.

type Row = LedgerExtraction["rows"][number];
const field = (value: string, confidence: "confirmed" | "check" | "missing" = "confirmed") => ({
  value,
  confidence,
  source_ref: confidence === "missing" ? null : { location: "photo 1", snippet: value },
});
const amount = (cents: number | null) => ({
  value: cents,
  confidence: (cents === null ? "missing" : "confirmed") as "confirmed" | "missing",
  source_ref: cents === null ? null : { location: "photo 1", snippet: String(cents) },
});
const row = (donor: string, purpose: string, cents: number): Row => ({
  donor_name: donor === "" ? field("", "missing") : field(donor),
  donor_phone: field("", "missing"),
  amount_cents: amount(cents),
  purpose: field(purpose),
  donated_at: field("", "missing"),
});

describe("135 — looksLikeBalanceRow: a balance is a state, not money received", () => {
  it("上年结存 / 银行 / Baki bank / balance b/f are balances", () => {
    for (const p of ["上年结存", "银行", "Baki dalam bank", "Balance b/f", "Bank balance", "餘額"]) {
      expect(looksLikeBalanceRow(p), p).toBe(true);
    }
  });
  it("会费 / 乐捐 / 晚宴 / 礼堂 / derma bulanan are not", () => {
    for (const p of ["会费", "乐捐", "晚宴", "礼堂", "derma bulanan", "香油钱", "tabung bumbung"]) {
      expect(looksLikeBalanceRow(p), p).toBe(false);
    }
  });
});

describe("135 — looksLikeSummaryPage: not one donor on the page", () => {
  it("J's page: seven amounts, no donors → a summary", () => {
    const rows = [
      row("", "上年结存", 768000),
      row("", "会费", 120000),
      row("", "乐捐", 80000),
      row("", "晚宴", 1160000),
      row("", "礼堂", 100000),
      row("", "晚晚餐宴", 915000),
      row("", "银行", 1159000),
    ];
    expect(looksLikeSummaryPage(rows)).toBe(true);
  });
  it("a ledger with even one named donor is a ledger (with gaps), not a summary", () => {
    expect(looksLikeSummaryPage([row("", "香油钱", 5000), row("陈亚九", "香油钱", 10000)])).toBe(false);
  });
  it("an empty read is not a summary", () => {
    expect(looksLikeSummaryPage([])).toBe(false);
  });
});

describe("135 — dropLedgerRow keeps the per-row answers on the same rows", () => {
  const rows = ["a", "b", "c", "d"];
  it("removing the middle row shifts the answers above it down by one", () => {
    const out = dropLedgerRow(rows, new Set([0, 2, 3]), { 1: "transfer", 3: "transfer" }, 1);
    expect(out.rows).toEqual(["a", "c", "d"]);
    expect([...out.added].sort()).toEqual([0, 1, 2]);
    expect(out.payments).toEqual({ 2: "transfer" });
  });
  it("removing the last row drops only its own answers", () => {
    const out = dropLedgerRow(rows, new Set([3]), { 0: "cash", 3: "transfer" }, 3);
    expect(out.rows).toEqual(["a", "b", "c"]);
    expect(out.added.size).toBe(0);
    expect(out.payments).toEqual({ 0: "cash" });
  });
  it("an index that is not there changes nothing", () => {
    const out = dropLedgerRow(rows, new Set([1]), { 1: "transfer" }, 9);
    expect(out.rows).toEqual(rows);
    expect([...out.added]).toEqual([1]);
    expect(out.payments).toEqual({ 1: "transfer" });
  });
});
