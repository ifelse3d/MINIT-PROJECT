import { describe, expect, it } from "vitest";
import { emptyMeetingNotesExtraction, type MeetingNotesExtraction } from "./extraction";
import { composeMinutesMd, composeStructuredMinutesMd } from "./minutes-compose";
import { lintMinitMd } from "./minit-format";
import { renderMinutesDraftBm } from "./minutes-draft";

// ---------------------------------------------------------------------------
// 125 §2-5 — the document carries the page's own headcount line AND the
// count a person confirmed, and the people on leave in their own list. The
// live document of 2026-09-07 lost the line altogether and said "1 orang".
// Fictional names (A3).
// ---------------------------------------------------------------------------

const LINE = "理事12人,请假2人(张伟杰,王丽华),会员40人";
const confirmed = (value: string) => ({
  value,
  confidence: "confirmed" as const,
  source_ref: { location: "photo 1", snippet: value },
});

const agm = (): MeetingNotesExtraction => ({
  ...emptyMeetingNotesExtraction,
  meeting_date: confirmed("2026-03-15"),
  meeting_venue: confirmed("Dewan Contoh"),
  attendance_count: confirmed(LINE),
  attendance_confirmed: 52,
  apologies: [{ name: confirmed("张伟杰") }, { name: confirmed("王丽华") }],
  resolutions: [{ text: confirmed("Mesyuarat diadakan.") }],
});

const opts = { orgName: "PERSATUAN CONTOH", confirmedBy: "Chan Mei", dateIso: "2026-09-07" };
const plan = { sections: [{ heading: "Perkara", items: [{ source: 0, text: "Mesyuarat diadakan." }] }], unresolved: [] };

describe("🔴 125 §2-5 — Jumlah hadir comes from the confirmed count", () => {
  it("the formal document: the line as written, 52 orang, the on-leave list", () => {
    const md = composeMinutesMd(plan, agm(), opts);
    expect(md).toContain(`Kehadiran: ${LINE}`);
    expect(md).toContain("Jumlah hadir: 52 orang");
    expect(md).not.toContain("Jumlah hadir: 1 orang");
    expect(md).toContain("## TIDAK HADIR (DENGAN MAAF)");
    expect(md).toContain("1. 张伟杰");
    expect(md).toContain("2. 王丽华");
    // The two on leave are NOT under KEHADIRAN.
    expect(md).not.toContain("## KEHADIRAN");
    expect(lintMinitMd(md, { lang: "bm", attendanceCount: true })).toEqual([]);
  });

  it("the free preview prints the same lines", () => {
    const md = renderMinutesDraftBm(agm(), { orgName: "PERSATUAN CONTOH" });
    expect(md).toContain(`Kehadiran: ${LINE}`);
    expect(md).toContain("Jumlah hadir: 52 orang");
    expect(md).toContain("## TIDAK HADIR (DENGAN MAAF)");
  });

  it("the structured document prints the line and the count too", () => {
    const e: MeetingNotesExtraction = {
      ...agm(),
      resolutions: [{ text: confirmed("Ucapan aluan."), section_no: "1", section_title: "Ucapan Pengerusi" }],
    };
    const md = composeStructuredMinutesMd(e, { ...opts, lang: "bm" });
    expect(md).toContain(`Kehadiran: ${LINE}`);
    expect(md).toContain("Jumlah hadir: 52 orang");
  });

  it("with a named list and no confirmed count, the list's length is the count (as before)", () => {
    const e: MeetingNotesExtraction = {
      ...agm(),
      attendance_confirmed: undefined,
      attendees: [{ name: confirmed("Tan Kim Loo") }, { name: confirmed("Chan Mei") }],
    };
    const md = composeMinutesMd(plan, e, opts);
    expect(md).toContain("## KEHADIRAN");
    expect(md).toContain("Jumlah hadir: 2 orang");
    // The page's line still prints — it was never allowed to vanish.
    expect(md).toContain(`Kehadiran: ${LINE}`);
  });

  it("with the line but nothing confirmed and no names, no count is invented", () => {
    const e: MeetingNotesExtraction = { ...agm(), attendance_confirmed: undefined, apologies: [] };
    const md = composeMinutesMd(plan, e, opts);
    expect(md).toContain(`Kehadiran: ${LINE}`);
    expect(md).not.toContain("Jumlah hadir");
  });

  it("the zh and en reading copies use their own labels", () => {
    expect(composeMinutesMd(plan, agm(), { ...opts, lang: "zh" })).toContain("出席人数：52 人");
    expect(composeMinutesMd(plan, agm(), { ...opts, lang: "zh" })).toContain("## 请假");
    expect(composeMinutesMd(plan, agm(), { ...opts, lang: "en" })).toContain("Total present: 52");
    expect(composeMinutesMd(plan, agm(), { ...opts, lang: "en" })).toContain("## APOLOGIES");
  });
});
