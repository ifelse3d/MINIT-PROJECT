// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// The component imports the transfer-proof server action, whose import chain
// ends in "server-only" — stub the action (and the marker) so the PURE
// exports under test can load. Established pattern in this folder's tests.
vi.mock("server-only", () => ({}));
vi.mock("./transfer-proof-actions", () => ({ uploadTransferProof: vi.fn() }));

import { isDraftArray, storedPurposeFor } from "./type-donations";

// ---------------------------------------------------------------------------
// D1-1 (work order 56, 拍板 8) — the merge must lose NOTHING that exists.
// ---------------------------------------------------------------------------

describe("draft migration (a grid typed before the merge survives it)", () => {
  const oldRow = {
    key: 3,
    name: "陈大明",
    phone: "",
    amount: "10",
    purpose: "Derma am",
    date: "2026-08-01",
    inKind: false,
    item: "",
    estValue: "",
    method: "cash",
    // no `category` — the pre-merge shape
  };

  it("accepts rows without the new category field", () => {
    expect(isDraftArray([oldRow])).toBe(true);
  });

  it("still rejects genuinely broken blobs", () => {
    expect(isDraftArray("nope")).toBe(false);
    expect(isDraftArray([{ key: "3" }])).toBe(false);
  });
});

describe("storedPurposeFor — byte-compatible with the old single-row form", () => {
  it("Derma rows keep their free wording (the grid's old behaviour)", () => {
    expect(storedPurposeFor("Derma", "Derma am", "Derma am")).toBe("Derma am");
    expect(storedPurposeFor("Derma", "", "Derma am")).toBe("Derma am");
  });

  it("a typed category stores as 'Type' / 'Type — note' (the form's old behaviour)", () => {
    expect(storedPurposeFor("Geran", "", "Derma am")).toBe("Geran");
    expect(storedPurposeFor("Geran", "banjir 2026", "Derma am")).toBe(
      "Geran — banjir 2026",
    );
    expect(storedPurposeFor("Yuran ahli", "2026", "Derma am")).toBe(
      "Yuran ahli — 2026",
    );
  });

  it("a missing category behaves as Derma (old drafts hydrate that way)", () => {
    expect(storedPurposeFor("", "tabung bumbung", "Derma am")).toBe("tabung bumbung");
  });
});
