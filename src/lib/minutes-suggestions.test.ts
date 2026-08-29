import { describe, expect, it } from "vitest";
import type { MeetingNotesExtraction } from "@/lib/extraction";
import {
  deriveSuggestions,
  findDateInText,
  findTimeInText,
  MAX_EVENT_SUGGESTIONS,
  MAX_MEMBER_SUGGESTIONS,
  normKey,
  type EventSuggestion,
  type MemberSuggestion,
} from "@/lib/minutes-suggestions";

// ---------------------------------------------------------------------------
// The promise under test (work order 64 §2): the cards that SHOULD appear do,
// and — more importantly — the ones that shouldn't, don't. 誤殺比漏掉更糟:
// every "no card" case here is a person who would otherwise have been nagged.
// ---------------------------------------------------------------------------

const ref = (snippet: string) => ({ location: "photo 1, line 3", snippet });

const field = (value: string, withRef = true) => ({
  value,
  confidence: value === "" ? ("missing" as const) : ("confirmed" as const),
  source_ref: value !== "" && withRef ? ref(value) : null,
});

function extraction(
  over: Partial<MeetingNotesExtraction> = {},
): MeetingNotesExtraction {
  return {
    meeting_type: { value: "committee", confidence: "confirmed", source_ref: ref("AJK") },
    meeting_date: field("2026-08-29"),
    meeting_venue: field("Dewan Besar"),
    attendees: [],
    resolutions: [],
    figures: [],
    office_bearers: [],
    ...over,
  };
}

const resolution = (text: string, withRef = true) => ({ text: field(text, withRef) });
const bearer = (position: string, personName: string, withRef = true) => ({
  position: field(position, withRef),
  person_name: field(personName, withRef),
});

const derive = (
  e: MeetingNotesExtraction,
  opts: {
    roster?: { personName: string; position: string }[] | null;
    events?: { title: string; dateIso: string }[];
    todayIso?: string;
  } = {},
) =>
  deriveSuggestions({
    extraction: e,
    roster: opts.roster === undefined ? [] : opts.roster,
    events: opts.events ?? [],
    todayIso: opts.todayIso ?? "2026-08-29",
  });

const members = (s: ReturnType<typeof derive>) =>
  s.filter((x): x is MemberSuggestion => x.type === "add_member");
const events = (s: ReturnType<typeof derive>) =>
  s.filter((x): x is EventSuggestion => x.type === "add_event");

// ---------------------------------------------------------------------------
// People — from structured office_bearers only.
// ---------------------------------------------------------------------------

describe("member suggestions", () => {
  it("suggests a bearer who is not yet on the roster, term_start = meeting date", () => {
    const out = derive(extraction({ office_bearers: [bearer("Bendahari", "陈明发")] }));
    expect(out).toHaveLength(1);
    const m = members(out)[0];
    expect(m.personName).toBe("陈明发");
    expect(m.position).toBe("Bendahari");
    expect(m.termStartIso).toBe("2026-08-29");
    expect(m.source.snippet).toBe("陈明发");
    expect(m.key).toBe(`member:${normKey("陈明发")}|${normKey("Bendahari")}`);
  });

  it("does not suggest someone already on the roster — under ANY position, any casing", () => {
    const e = extraction({ office_bearers: [bearer("Pengerusi", "Tan Ah Kow")] });
    expect(
      derive(e, { roster: [{ personName: "  TAN  AH  KOW ", position: "AJK" }] }),
    ).toHaveLength(0);
  });

  it("换届: names the current holder of the same position in `replaces`", () => {
    const out = derive(extraction({ office_bearers: [bearer("Pengerusi", "Lim Mei Ling")] }), {
      roster: [{ personName: "Tan Ah Kow", position: "pengerusi" }],
    });
    expect(members(out)[0].replaces).toEqual(["Tan Ah Kow"]);
  });

  it("caps `replaces` at three names", () => {
    const roster = ["A", "B", "C", "D"].map((n) => ({ personName: n, position: "AJK" }));
    const out = derive(extraction({ office_bearers: [bearer("AJK", "New Person")] }), { roster });
    expect(members(out)[0].replaces).toHaveLength(3);
  });

  it("produces NO member cards when the roster could not be read (null)", () => {
    const e = extraction({
      office_bearers: [bearer("Bendahari", "陈明发")],
      resolutions: [resolution("Gotong-royong 5/10")],
    });
    const out = derive(e, { roster: null });
    expect(members(out)).toHaveLength(0);
    expect(events(out)).toHaveLength(1); // events do not depend on the roster
  });

  it("skips rows with an empty name or position and dedupes twins", () => {
    const e = extraction({
      office_bearers: [
        bearer("Setiausaha", ""),
        bearer("", "Siti"),
        bearer("AJK", "Rahman"),
        bearer("AJK", "rahman"), // same person, same position
      ],
    });
    expect(derive(e)).toHaveLength(1);
  });

  it("a person typed during review (no source_ref) still carries a citation", () => {
    const e = extraction({ office_bearers: [bearer("AJK", "Wong Li", false)] });
    const m = members(derive(e))[0];
    expect(m.source.snippet).toBe("AJK: Wong Li");
    expect(m.source.location).toContain("已确认");
  });

  it("stops at the cap", () => {
    const many = Array.from({ length: MAX_MEMBER_SUGGESTIONS + 5 }, (_, i) =>
      bearer("AJK", `Person ${i}`),
    );
    expect(members(derive(extraction({ office_bearers: many })))).toHaveLength(
      MAX_MEMBER_SUGGESTIONS,
    );
  });

  it("meeting date missing → termStartIso null, card still appears", () => {
    const e = extraction({
      meeting_date: field(""),
      office_bearers: [bearer("Bendahari", "陈明发")],
    });
    expect(members(derive(e))[0].termStartIso).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Events — resolutions with an EXPLICIT future date.
// ---------------------------------------------------------------------------

describe("event suggestions", () => {
  it("BM day-month: '12 Ogos' after an early-August meeting", () => {
    const e = extraction({
      meeting_date: field("2026-08-01"),
      resolutions: [resolution("Mesyuarat AJK akan datang 12 Ogos")],
    });
    const ev = events(derive(e))[0];
    expect(ev.dateIso).toBe("2026-08-12");
    expect(ev.title).toBe("Mesyuarat AJK akan datang");
    expect(ev.timeText).toBe("");
    expect(ev.source.snippet).toBe("Mesyuarat AJK akan datang 12 Ogos");
  });

  it("中文 date + time: '下次会议 9月12日 晚上8点'", () => {
    const e = extraction({ resolutions: [resolution("下次会议 9月12日 晚上8点")] });
    const ev = events(derive(e))[0];
    expect(ev.dateIso).toBe("2026-09-12");
    expect(ev.timeText).toBe("晚上8点");
    expect(ev.title).toBe("下次会议");
  });

  it("slash day-first: '5/10' is 5 October, not 10 May", () => {
    const e = extraction({ resolutions: [resolution("Gotong-royong kuil 5/10")] });
    expect(events(derive(e))[0].dateIso).toBe("2026-10-05");
  });

  it("explicit-year ISO date works even when the meeting is undated", () => {
    const e = extraction({
      meeting_date: field(""),
      resolutions: [resolution("AGM 2027-01-15 dewan besar")],
    });
    expect(events(derive(e))[0].dateIso).toBe("2027-01-15");
  });

  it("NO card: date without a year when the meeting is undated", () => {
    const e = extraction({
      meeting_date: field(""),
      resolutions: [resolution("Makan malam 12 Ogos")],
    });
    expect(events(derive(e))).toHaveLength(0);
  });

  it("NO card: a past reference is dropped, never bumped a year forward", () => {
    const e = extraction({ resolutions: [resolution("上次活动 3月2日 很成功")] });
    expect(events(derive(e))).toHaveLength(0);
  });

  it("NO card: an explicit past year", () => {
    const e = extraction({ resolutions: [resolution("aktiviti 2025-01-01 telah selesai")] });
    expect(events(derive(e))).toHaveLength(0);
  });

  it("NO card: the meeting's own date is not a future plan", () => {
    const e = extraction({ resolutions: [resolution("mesyuarat hari ini 29/8/2026")] });
    expect(events(derive(e))).toHaveLength(0);
  });

  it("NO card: already on the calendar (same day, same-ish title)", () => {
    const e = extraction({ resolutions: [resolution("Makan malam tahunan 12/9")] });
    expect(
      events(derive(e, { events: [{ title: "makan malam tahunan", dateIso: "2026-09-12" }] })),
    ).toHaveLength(0);
  });

  it("NO card: an impossible date (31/2) is rejected, not rolled forward", () => {
    const e = extraction({ resolutions: [resolution("aktiviti 31/2")] });
    expect(events(derive(e))).toHaveLength(0);
  });

  it("NO card: lowercase English 'may' is a word, not a month", () => {
    const e = extraction({
      resolutions: [resolution("AGM may 12 members attend if quorum met")],
    });
    expect(events(derive(e))).toHaveLength(0);
  });

  it("NO card: '每月12日' (monthly, no month number) is not a date", () => {
    const e = extraction({ resolutions: [resolution("每月12日交月捐")] });
    expect(events(derive(e))).toHaveLength(0);
  });

  it("dedupes two resolutions that describe the same event", () => {
    const e = extraction({
      resolutions: [resolution("Hari Keluarga 12/9"), resolution("Hari Keluarga 12/9")],
    });
    expect(events(derive(e))).toHaveLength(1);
  });

  it("stops at the cap and sorts by date", () => {
    const many = Array.from({ length: MAX_EVENT_SUGGESTIONS + 3 }, (_, i) =>
      resolution(`Aktiviti ${String.fromCharCode(65 + i)} ${20 - i}/12`),
    );
    const out = events(derive(extraction({ resolutions: many })));
    expect(out).toHaveLength(MAX_EVENT_SUGGESTIONS);
    const dates = out.map((e) => e.dateIso);
    expect(dates).toEqual([...dates].sort());
  });

  it("committee cards come before event cards", () => {
    const e = extraction({
      office_bearers: [bearer("Bendahari", "陈明发")],
      resolutions: [resolution("Hari Keluarga 12/9")],
    });
    const out = derive(e);
    expect(out[0].type).toBe("add_member");
    expect(out[1].type).toBe("add_event");
  });
});

// ---------------------------------------------------------------------------
// The parsers on their own.
// ---------------------------------------------------------------------------

describe("findDateInText", () => {
  it("reads '1hb Ogos 2026'", () => {
    expect(findDateInText("Majlis pada 1hb Ogos 2026")).toMatchObject({
      year: 2026,
      month: 8,
      day: 1,
    });
  });

  it("reads '12 Sept' as September, no year", () => {
    expect(findDateInText("makan malam 12 Sept")).toMatchObject({
      year: null,
      month: 9,
      day: 12,
    });
  });

  it("reads a two-digit slash year: 12/9/26", () => {
    expect(findDateInText("AGM 12/9/26")).toMatchObject({ year: 2026, month: 9, day: 12 });
  });

  it("reads '2026年9月12日'", () => {
    expect(findDateInText("大会 2026年9月12日 举行")).toMatchObject({
      year: 2026,
      month: 9,
      day: 12,
    });
  });

  it("takes the EARLIEST date in the text", () => {
    expect(findDateInText("daftar sebelum 3/10, aktiviti pada 12/10")).toMatchObject({
      month: 10,
      day: 3,
    });
  });

  it("does not read a month with no day, or a bare number", () => {
    expect(findDateInText("bulan Ogos nanti")).toBeNull();
    expect(findDateInText("seramai 25 orang")).toBeNull();
  });
});

describe("findTimeInText", () => {
  it("keeps the phrase as written", () => {
    expect(findTimeInText("makan malam 7.30pm dewan")).toBe("7.30pm");
    expect(findTimeInText("bermula pukul 8 malam")).toBe("pukul 8");
    expect(findTimeInText("perjumpaan 8pm")).toBe("8pm");
    expect(findTimeInText("聚会 下午3時半")).toBe("下午3時半");
  });

  it("does not read list numbering or venue words as times", () => {
    expect(findTimeInText("第3点决议通过")).toBe("");
    expect(findTimeInText("地点：大礼堂")).toBe("");
    expect(findTimeInText("tiada masa ditulis")).toBe("");
  });
});
