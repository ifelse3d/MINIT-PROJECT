import { describe, expect, it } from "vitest";
import { mapReceiptsToClientIds } from "./receipt-mapping";

// CLAUDE.md Hard Rule: all deterministic money logic must be unit-tested.
// The bug this replaces was invisible precisely because the happy path (rows
// coming back in insert order) always passed. So the important test here is the
// SHUFFLED one.

const donations = [
  { donationId: "d-1", clientId: "row-a" },
  { donationId: "d-2", clientId: "row-b" },
  { donationId: "d-3", clientId: "row-c" },
];

describe("mapReceiptsToClientIds", () => {
  it("maps correctly when the database returns rows in insert order", () => {
    const out = mapReceiptsToClientIds(donations, [
      { donationId: "d-1", receiptNo: "MIN-2026-0001" },
      { donationId: "d-2", receiptNo: "MIN-2026-0002" },
      { donationId: "d-3", receiptNo: "MIN-2026-0003" },
    ]);
    expect(out).toEqual({
      ok: true,
      byClientId: {
        "row-a": "MIN-2026-0001",
        "row-b": "MIN-2026-0002",
        "row-c": "MIN-2026-0003",
      },
    });
  });

  it("maps correctly when the database returns rows OUT OF ORDER (the real bug)", () => {
    // Deliberately shuffled. Position-based mapping would have given row-a the
    // number MIN-2026-0003 — a legal receipt with the wrong donor's name.
    const out = mapReceiptsToClientIds(donations, [
      { donationId: "d-3", receiptNo: "MIN-2026-0003" },
      { donationId: "d-1", receiptNo: "MIN-2026-0001" },
      { donationId: "d-2", receiptNo: "MIN-2026-0002" },
    ]);
    expect(out).toEqual({
      ok: true,
      byClientId: {
        "row-a": "MIN-2026-0001",
        "row-b": "MIN-2026-0002",
        "row-c": "MIN-2026-0003",
      },
    });
  });

  it("refuses when a receipt points at an unknown donation", () => {
    const out = mapReceiptsToClientIds(donations, [
      { donationId: "d-1", receiptNo: "MIN-2026-0001" },
      { donationId: "d-2", receiptNo: "MIN-2026-0002" },
      { donationId: "d-99", receiptNo: "MIN-2026-0003" },
    ]);
    expect(out).toEqual({ ok: false, reason: "unmatched_receipt" });
  });

  it("refuses when a donation has no receipt", () => {
    const out = mapReceiptsToClientIds(donations, [
      { donationId: "d-1", receiptNo: "MIN-2026-0001" },
      { donationId: "d-2", receiptNo: "MIN-2026-0002" },
    ]);
    expect(out).toEqual({ ok: false, reason: "missing_receipt" });
  });

  it("refuses when two receipts point at the SAME donation", () => {
    // Would otherwise silently overwrite and drop a receipt number, leaving the
    // treasurer with fewer numbers than rows and no explanation.
    const out = mapReceiptsToClientIds(donations, [
      { donationId: "d-1", receiptNo: "MIN-2026-0001" },
      { donationId: "d-1", receiptNo: "MIN-2026-0002" },
      { donationId: "d-3", receiptNo: "MIN-2026-0003" },
    ]);
    expect(out).toEqual({ ok: false, reason: "unmatched_receipt" });
  });

  it("refuses on any count mismatch", () => {
    expect(
      mapReceiptsToClientIds(donations, [
        { donationId: "d-1", receiptNo: "MIN-2026-0001" },
        { donationId: "d-2", receiptNo: "MIN-2026-0002" },
        { donationId: "d-3", receiptNo: "MIN-2026-0003" },
        { donationId: "d-4", receiptNo: "MIN-2026-0004" },
      ]),
    ).toEqual({ ok: false, reason: "unmatched_receipt" });
  });

  it("handles the empty case", () => {
    expect(mapReceiptsToClientIds([], [])).toEqual({ ok: true, byClientId: {} });
  });
});
