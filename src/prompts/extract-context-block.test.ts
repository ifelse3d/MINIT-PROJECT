import { describe, expect, it } from "vitest";
import { extractLedgerPrompt } from "./extract-ledger";
import { extractConstitutionPrompt } from "./extract-constitution";
import { DATA_NOT_INSTRUCTIONS, untrustedBlock } from "./untrusted";

// A-2 (2026-08-25): the home box sends typed text alongside the photo, and it
// reaches ALL THREE extractors (meeting notes already had this — F-2). Same
// two invariants as extract-meeting-notes.test.ts:
//   1. With NO typed text the prompt is byte-identical to what the eval
//      measured — the accuracy number must keep describing the running system.
//   2. WITH typed text, it arrives labelled as DATA (untrusted.ts), because
//      user text in a prompt is an injection surface.

describe("extractLedgerPrompt contextBlock", () => {
  const base = { orgName: "Persatuan Test", todayIso: "2026-08-25" };

  it("is byte-identical without typed text (the eval's prompt)", () => {
    expect(extractLedgerPrompt(base)).toBe(
      extractLedgerPrompt({ ...base, contextBlock: "" }),
    );
  });

  it("carries typed text as labelled data", () => {
    const block = `\n\n${untrustedBlock("NOTES THE PERSON TYPED", "ruangan kedua ialah tarikh")}`;
    const prompt = extractLedgerPrompt({ ...base, contextBlock: block });
    expect(prompt).toContain("ruangan kedua ialah tarikh");
    expect(prompt).toContain(DATA_NOT_INSTRUCTIONS);
  });
});

describe("extractConstitutionPrompt contextBlock", () => {
  const base = { orgName: "Persatuan Test" };

  it("is byte-identical without typed text (the eval's prompt)", () => {
    expect(extractConstitutionPrompt(base)).toBe(
      extractConstitutionPrompt({ ...base, contextBlock: "" }),
    );
  });

  it("carries typed text as labelled data", () => {
    const block = `\n\n${untrustedBlock("NOTES THE PERSON TYPED", "fasal 12 ada pindaan tulisan tangan")}`;
    const prompt = extractConstitutionPrompt({ ...base, contextBlock: block });
    expect(prompt).toContain("fasal 12 ada pindaan tulisan tangan");
    expect(prompt).toContain(DATA_NOT_INSTRUCTIONS);
  });
});
