import { describe, expect, it } from "vitest";
import { emptyMeetingNotesExtraction, type MeetingNotesExtraction } from "./extraction";
import { sourceLanguageOf } from "./minutes-source-lang";
import { renderMinutesDraftBm, DRAFT_WATERMARK_ZH } from "./minutes-draft";

// 134 (J 9/9, live site) — the free preview reads in the PAGE'S language.
// Fictional names (A3).

const confirmed = (value: string) => ({
  value,
  confidence: "confirmed" as const,
  source_ref: { location: "photo 1", snippet: value },
});

const chinesePage = (): MeetingNotesExtraction => ({
  ...emptyMeetingNotesExtraction,
  meeting_type: { ...confirmed("agm"), value: "agm" as const },
  meeting_date: confirmed("2026-03-15"),
  meeting_venue: confirmed("会议室"),
  attendance_count: confirmed("理事12人,缺席2人(张伟杰,王丽华),会员40人"),
  apologies: [{ name: confirmed("张伟杰") }, { name: confirmed("王丽华") }],
  resolutions: [
    { text: confirmed("主席致词:主席感谢大家去年帮忙.10点开始会议.") },
    { text: confirmed("上届会议记录(16/3/2025),没有人更改通过") },
  ],
  figures: [{ description: confirmed("去年结存"), amount_cents: { ...confirmed("768000"), value: 768000 } }],
  adjournment: confirmed("散会 12.30pm"),
});

const malayPage = (): MeetingNotesExtraction => ({
  ...emptyMeetingNotesExtraction,
  meeting_venue: confirmed("Dewan Contoh"),
  attendees: [{ name: confirmed("陈秀玲") }, { name: confirmed("林志强") }],
  resolutions: [{ text: confirmed("Mesyuarat diadakan pada pukul 10 pagi dan ditangguhkan.") }],
});

describe("134 — sourceLanguageOf counts the page's prose, not its names", () => {
  it("a Chinese page is zh", () => {
    expect(sourceLanguageOf(chinesePage())).toBe("zh");
  });
  it("a Malay page with Chinese NAMES is still bm", () => {
    expect(sourceLanguageOf(malayPage())).toBe("bm");
  });
  it("an empty page is bm (the preview's historical default)", () => {
    expect(sourceLanguageOf(emptyMeetingNotesExtraction)).toBe("bm");
  });
});

describe("🔴 134 — the free preview of a Chinese page reads in Chinese, in the same layout", () => {
  it("headings, watermark and labels follow the page's language; nothing is translated", () => {
    const md = renderMinutesDraftBm(chinesePage(), { orgName: "PERSATUAN CONTOH", lang: "zh", sourceCopy: true });
    expect(md).toContain(`[${DRAFT_WATERMARK_ZH}]`);
    expect(md).toContain("# 会议记录 — PERSATUAN CONTOH");
    expect(md).toContain("地点: 会议室");
    expect(md).toContain("出席: 理事12人,缺席2人(张伟杰,王丽华),会员40人");
    expect(md).toContain("## 缺席");
    expect(md).not.toContain("请假");
    expect(md).toContain("## 款项");
    expect(md).not.toContain("Kehadiran");
    expect(md).not.toContain("KEWANGAN");
    expect(md).not.toContain("TIDAK HADIR");
    // A preview in the page's own language is not a translation.
    expect(md).not.toContain("翻译本");
  });

  it("the same page previews in BM as before when asked to (the default)", () => {
    const md = renderMinutesDraftBm(chinesePage(), { orgName: "PERSATUAN CONTOH" });
    expect(md).toContain("# MINIT MESYUARAT — PERSATUAN CONTOH");
    expect(md).toContain("Tempat: Bilik Mesyuarat");
    expect(md).toContain("tidak hadir: 2 orang");
    expect(md).toContain("## TIDAK HADIR");
    expect(md).not.toContain("DENGAN MAAF");
  });
});

// 135 (J 9/9): 「用英文的會議報告也是 OK 的對不」 — yes, and its preview
// now reads in English too, by the same character/word counting.
describe("135 — English pages preview in English", () => {
  const englishPage = (): MeetingNotesExtraction => ({
    ...emptyMeetingNotesExtraction,
    meeting_venue: confirmed("Community hall"),
    attendees: [{ name: confirmed("陈秀玲") }],
    resolutions: [
      { text: confirmed("The chairman thanked all members for their help last year.") },
      { text: confirmed("The minutes of the last meeting were confirmed without amendment.") },
    ],
    figures: [{ description: confirmed("Charity dinner takings"), amount_cents: { ...confirmed("315000"), value: 315000 } }],
  });
  it("an English page is en; a Malay page stays bm", () => {
    expect(sourceLanguageOf(englishPage())).toBe("en");
    expect(sourceLanguageOf(malayPage())).toBe("bm");
  });
  it("the English preview carries English headings and no BM glossary", () => {
    const md = renderMinutesDraftBm(englishPage(), { orgName: "PERSATUAN CONTOH", lang: "en", sourceCopy: true });
    expect(md).toContain("# MINUTES OF MEETING — PERSATUAN CONTOH");
    expect(md).toContain("Venue: Community hall");
    expect(md).toContain("## ATTENDANCE");
    expect(md).toContain("## AMOUNTS");
    expect(md).not.toContain("Translation — not for filing");
    expect(md).not.toContain("KEHADIRAN");
  });
});
