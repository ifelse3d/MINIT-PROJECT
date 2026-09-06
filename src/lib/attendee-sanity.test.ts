import { describe, expect, it } from "vitest";
import { plausibleAttendeeName } from "./attendee-sanity";
import { parseMeetingNotesExtraction, emptyMeetingNotesExtraction } from "./extraction";
import { composeMinutesMd, minutesPlanSchema } from "./minutes-compose";
import { renderMinutesDraftBm } from "./minutes-draft";

// ---------------------------------------------------------------------------
// 118 §5 — 該抄的要抄到，不該編的不准編. Fictional names throughout (A3).
// ---------------------------------------------------------------------------

const field = (value: string, confidence: "confirmed" | "check" | "missing" = "confirmed") => ({
  value,
  confidence,
  source_ref: confidence === "missing" ? null : { location: "photo 1, line 6", snippet: value },
});

describe("§5-2 attendees are not invented", () => {
  it("🔴 the scrap J's paper produced — '1. as' — is not a person", () => {
    expect(plausibleAttendeeName("1. as")).toBe(false);
    expect(plausibleAttendeeName("as")).toBe(false);
    expect(plausibleAttendeeName("")).toBe(false);
    expect(plausibleAttendeeName("12")).toBe(false);
    expect(plausibleAttendeeName("—")).toBe(false);
    expect(plausibleAttendeeName("dan")).toBe(false);
  });

  it("real names of every shape pass — short Chinese ones included", () => {
    for (const n of ["Tan Kim Loo", "Ng Ah Kow", "张伟杰", "王", "Ali", "Ooi Bee Huang (青年组)", "2. Chan Mei"]) {
      expect(plausibleAttendeeName(n), n).toBe(true);
    }
  });

  it("🔴 parse erases the scrap, so a page with no attendance list has NO attendees — and no 'Jumlah hadir: 1 orang'", () => {
    const raw = {
      ...emptyMeetingNotesExtraction,
      attendees: [{ name: field("1. as", "check") }],
      resolutions: [{ text: field("(1) 召开会议 8/7/26 发信") }],
    };
    const parsed = parseMeetingNotesExtraction(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.attendees).toEqual([]);
    const md = renderMinutesDraftBm(parsed.data, { orgName: "PERSATUAN CONTOH" });
    expect(md).not.toContain("Jumlah hadir");
    expect(md).not.toContain("1. as");
  });

  it("parse keeps a human's rows and a real list untouched", () => {
    const raw = {
      ...emptyMeetingNotesExtraction,
      attendees: [
        { name: field("Tan Kim Loo") },
        { name: field("王", "check") },
        { name: field("", "missing") },
      ],
    };
    const parsed = parseMeetingNotesExtraction(raw);
    expect(parsed.success && parsed.data.attendees.map((a) => a.name.value)).toEqual(["Tan Kim Loo", "王", ""]);
  });
});

describe("§5-1 the particulars beside an appointment reach the document", () => {
  const extraction = {
    ...emptyMeetingNotesExtraction,
    resolutions: [{ text: field("(4) lanti AJK seorg. Tan Kim Loo") }],
    office_bearers: [
      {
        position: field("AJK"),
        person_name: field("Tan Kim Loo"),
        ic_no: field("800101-07-1234"),
        address: field("8, Lrg 3 Tmn Aman"),
      },
      { position: field("Setiausaha"), person_name: field("Chan Mei") },
    ],
  };
  const opts = { orgName: "PERSATUAN CONTOH", confirmedBy: "Chan Mei", dateIso: "2026-09-07" };
  const plan = minutesPlanSchema.parse({
    sections: [{ heading: "Perkara", items: [{ source: 0, text: "Melantik Ajk seorang iaitu Tan Kim Loo." }] }],
    unresolved: [],
  });

  it("🔴 the IC and address print under PEMEGANG JAWATAN, digit for digit", () => {
    const md = composeMinutesMd(plan, extraction, opts);
    expect(md).toContain("- AJK: Tan Kim Loo (No. K/P: 800101-07-1234; Alamat: 8, Lrg 3 Tmn Aman)");
    // A bearer without particulars prints exactly as before.
    expect(md).toContain("- Setiausaha: Chan Mei\n");
  });

  it("the free preview says the same thing as the formal document", () => {
    const md = renderMinutesDraftBm(extraction, { orgName: "PERSATUAN CONTOH" });
    expect(md).toContain("- AJK: Tan Kim Loo (No. K/P: 800101-07-1234; Alamat: 8, Lrg 3 Tmn Aman)");
  });

  it("the reading copies carry their own labels, and a missing particular prints nothing", () => {
    const zh = composeMinutesMd(plan, extraction, { ...opts, lang: "zh" });
    expect(zh).toContain("身份证号: 800101-07-1234");
    const blank = {
      ...extraction,
      office_bearers: [{ position: field("AJK"), person_name: field("Tan Kim Loo"), ic_no: field("", "missing") }],
    };
    expect(composeMinutesMd(plan, blank, opts)).toContain("- AJK: Tan Kim Loo\n");
  });
});
