import { describe, expect, it } from "vitest";
import {
  AGENT_HARD_LOCKS,
  AGENT_CHANGE_TIERS,
  agentSoulBlock,
} from "./agent-soul";
import { chatPrompt } from "./chat";

// ---------------------------------------------------------------------------
// The LOCKED lines are J's 拍板 (work order 100 §0-3), written down so no
// later prompt edit can quietly soften one. Each pin below is one lock.
// If a pin fails, someone touched a locked line — that needs J's word, not a
// test edit.
// ---------------------------------------------------------------------------

describe("agent soul — the locked lines survive verbatim", () => {
  it("money is never computed by the model", () => {
    expect(AGENT_HARD_LOCKS).toContain(
      "Money is ALWAYS computed by the system, never by you.",
    );
  });
  it("receipt numbers can never be changed", () => {
    expect(AGENT_HARD_LOCKS).toContain("Receipt numbers can never be changed");
  });
  it("donor name/phone never enter the conversation", () => {
    expect(AGENT_HARD_LOCKS).toContain(
      "A donor's full name or phone number never enters this conversation.",
    );
  });
  it("never confirms or submits for a person", () => {
    expect(AGENT_HARD_LOCKS).toContain('You never press "confirm" for a person');
    expect(AGENT_HARD_LOCKS).toContain("never submit anything to eROSES");
  });
  it("no legal/tax/accounting advice", () => {
    expect(AGENT_HARD_LOCKS).toContain("No legal, tax or accounting advice, ever.");
  });
  it("every conversation has a cost ceiling", () => {
    expect(AGENT_HARD_LOCKS).toContain("Every conversation has a cost ceiling.");
  });
});

describe("agent soul — the two-tier change rule (§0-4)", () => {
  it("tier 1 changes directly, shows old → new, records who/when/old value", () => {
    expect(AGENT_CHANGE_TIERS).toContain("change it directly with your update tool");
    expect(AGENT_CHANGE_TIERS).toContain('"changed: old → new"');
    expect(AGENT_CHANGE_TIERS).toContain("undo button");
  });
  it("tier 2 prepares only; one tap by the person makes it real", () => {
    expect(AGENT_CHANGE_TIERS).toContain("takes effect only when the person taps confirm");
  });
  it("no audit trail ⇒ no change (fail-closed, the fence's direction)", () => {
    expect(AGENT_CHANGE_TIERS).toContain("do NOT make the change");
  });
});

describe("agent soul — assembly matches the surface's real abilities", () => {
  it("the change-tier rule (which names the update tool) only ships with tools", () => {
    expect(agentSoulBlock({ tools: true })).toContain("WHEN YOU CHANGE A RECORD");
    expect(agentSoulBlock({ tools: false })).not.toContain("WHEN YOU CHANGE A RECORD");
    expect(agentSoulBlock()).not.toContain("WHEN YOU CHANGE A RECORD");
  });
  it("the draft-edit freedom only ships on a surface that can edit drafts", () => {
    expect(agentSoulBlock({ draftEditing: true })).toContain("APPLY the person's requested edits");
    expect(agentSoulBlock()).not.toContain("APPLY the person's requested edits");
  });
  it("chat prompt carries the soul, and its tier rule follows the tools flag", () => {
    const withTools = chatPrompt({
      orgName: "Persatuan Ujian",
      todayIso: "2026-08-31",
      history: [],
      question: "soalan",
      tools: true,
    });
    const withoutTools = chatPrompt({
      orgName: "Persatuan Ujian",
      todayIso: "2026-08-31",
      history: [],
      question: "soalan",
      tools: false,
    });
    expect(withTools).toContain("WHO YOU ARE");
    expect(withTools).toContain("WHAT IS LOCKED");
    expect(withTools).toContain("WHEN YOU CHANGE A RECORD");
    expect(withoutTools).toContain("WHAT IS LOCKED");
    expect(withoutTools).not.toContain("WHEN YOU CHANGE A RECORD");
  });
});
