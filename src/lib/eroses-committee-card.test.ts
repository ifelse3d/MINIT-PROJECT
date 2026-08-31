import { describe, expect, it } from "vitest";
import {
  MALAYSIAN_STATES,
  missingErosesCommitteeFields,
} from "@/lib/eroses-committee";

// ---------------------------------------------------------------------------
// §11 (work order 104), J: 「委員卡按了才擋」. The suggestion card now decides
// whether "Confirm and add" is live with the SAME function the server refuses
// with — these pin that the two cannot drift apart, which is the only way the
// button stays honest.
// ---------------------------------------------------------------------------

/** What the card computes for its own disabled state. */
const cardGaps = (over: {
  personName?: string;
  nameOfficial?: string;
  state?: string;
  termStart?: string | null;
}) =>
  missingErosesCommitteeFields({
    person_name: over.personName ?? "陈小明",
    name_official: over.nameOfficial ?? "",
    state: over.state ?? "",
    term_start: over.termStart ?? "",
  });

describe("§11 — the confirm button and the server agree", () => {
  it("a card with nothing typed is not ready — IC name and state are the gaps", () => {
    expect(cardGaps({})).toEqual(["nameOfficial", "state", "termStart"]);
  });

  it("a card whose minit gave a date only waits for the two typed boxes", () => {
    expect(cardGaps({ termStart: "2026-08-30" })).toEqual([
      "nameOfficial",
      "state",
    ]);
  });

  it("filled in, the card is ready — the button goes live", () => {
    expect(
      cardGaps({
        nameOfficial: "TAN SIEW MING",
        state: "Selangor",
        termStart: "2026-08-30",
      }),
    ).toEqual([]);
  });

  it("whitespace is not an answer", () => {
    expect(
      cardGaps({ nameOfficial: "   ", state: "  ", termStart: "2026-08-30" }),
    ).toEqual(["nameOfficial", "state"]);
  });

  it("the state list is the one list, and it is complete", () => {
    // 13 states + 3 federal territories.
    expect(MALAYSIAN_STATES).toHaveLength(16);
    expect(MALAYSIAN_STATES).toContain("Pulau Pinang");
    expect(MALAYSIAN_STATES).toContain("WP Labuan");
  });
});
