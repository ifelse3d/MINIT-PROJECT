import { describe, expect, it } from "vitest";
import { meetingNotesExtractionSchema } from "./extraction";
import { extractMeetingNotesPrompt } from "@/prompts/extract-meeting-notes";

// §1 (work order 116): the "this paper carries notes from MORE THAN ONE
// meeting" road is GONE. It fired on both of J's real papers and both times
// the "second meeting" was a date the meeting had DECIDED — 18/7/26 (an AGM
// to hold) and 17/10/2026 (a charity dinner approved). Each false fire cost a
// re-read and silently dropped a resolution. These tests keep it gone.
describe("no multi-meeting split", () => {
  it("the extraction schema has no other_meetings field", () => {
    const parsed = meetingNotesExtractionSchema.safeParse({
      meeting_type: { value: "Mesyuarat Agung Tahunan", confidence: "high", source_ref: null },
      meeting_date: { value: "2026-03-15", confidence: "high", source_ref: null },
      other_meetings: [{ date_text: { value: "17/10/2026", confidence: "high", source_ref: null } }],
    });
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("other_meetings");
    }
  });

  it("the prompt never asks the model to list other meetings", () => {
    const prompt = extractMeetingNotesPrompt({
      orgName: "PERSATUAN UJIAN",
      todayIso: "2026-08-31",
    });
    expect(prompt).not.toContain("other_meetings");
    expect(prompt).not.toContain("TWO MEETINGS ON ONE PAPER");
  });
});
