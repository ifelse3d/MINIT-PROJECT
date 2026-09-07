import { describe, expect, it } from "vitest";
import { signatoriesFromLines } from "./signatories";
import { emptyMeetingNotesExtraction, parseMeetingNotesExtraction } from "./extraction";

// 125 §3 — the chair and the recorder named in a page's header line reach the
// signature block. Fictional names (A3).

describe("🔴 125 §3 — signatoriesFromLines, the fixed inputs", () => {
  it("a Chinese header: 主席：甲　记录：乙", () => {
    const s = signatoriesFromLines(["主席：张伟杰　记录：王丽华"]);
    expect(s.chair).toEqual({ name: "张伟杰", role: "主席", line: "主席：张伟杰　记录：王丽华" });
    expect(s.secretary).toEqual({ name: "王丽华", role: "记录", line: "主席：张伟杰　记录：王丽华" });
  });

  it("a BM header on two lines, honorifics stripped", () => {
    const s = signatoriesFromLines(["Pengerusi: Encik Tan Kim Loo", "Setiausaha: Puan Chan Mei"]);
    expect(s.chair?.name).toBe("Tan Kim Loo");
    expect(s.chair?.role).toBe("Pengerusi");
    expect(s.secretary?.name).toBe("Chan Mei");
    expect(s.secretary?.role).toBe("Setiausaha");
  });

  it("an English header", () => {
    const s = signatoriesFromLines(["Chairman: Ooi Bee Huang", "Minuted by: Chan Mei"]);
    expect(s.chair?.name).toBe("Ooi Bee Huang");
    expect(s.secretary?.name).toBe("Chan Mei");
  });

  it("a role word in prose is NOT a header (no colon, no name)", () => {
    expect(signatoriesFromLines(["主席感谢大家去年帮忙", "主席致词", "Ucapan Pengerusi"])).toEqual({});
    expect(signatoriesFromLines(["主席：", "记录: "])).toEqual({});
  });

  it("the first match wins; later lines do not overwrite it", () => {
    const s = signatoriesFromLines(["主席：张伟杰", "主席：刘国华"]);
    expect(s.chair?.name).toBe("张伟杰");
  });
});

describe("🔴 125 §3 — parse fills the signature block from the header, never from the signed-in user", () => {
  const field = (value: string) => ({
    value,
    confidence: "confirmed" as const,
    source_ref: { location: "photo 1, line 2", snippet: value },
  });

  it("no signature block on the page → both signatories come from the header line, marked check", () => {
    const parsed = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      resolutions: [{ text: field("主席：张伟杰　记录：王丽华") }, { text: field("散会") }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.endorsed_by?.person_name.value).toBe("张伟杰");
    expect(parsed.data.endorsed_by?.person_name.confidence).toBe("check");
    expect(parsed.data.endorsed_by?.person_name.source_ref?.location).toBe("photo 1, line 2");
    expect(parsed.data.endorsed_by?.position.value).toBe("主席");
    expect(parsed.data.prepared_by?.person_name.value).toBe("王丽华");
    expect(parsed.data.prepared_by?.position.value).toBe("记录");
  });

  it("a signature block the reader found is never overwritten by the header", () => {
    const parsed = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      prepared_by: { position: field("SETIAUSAHA"), person_name: field("SITI CONTOH") },
      resolutions: [{ text: field("主席：张伟杰　记录：王丽华") }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.prepared_by?.person_name.value).toBe("SITI CONTOH");
    expect(parsed.data.endorsed_by?.person_name.value).toBe("张伟杰");
  });

  it("no header, no signature block → both stay absent (missing is missing)", () => {
    const parsed = parseMeetingNotesExtraction({
      ...emptyMeetingNotesExtraction,
      resolutions: [{ text: field("主席感谢大家") }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.prepared_by).toBeUndefined();
    expect(parsed.data.endorsed_by).toBeUndefined();
  });
});
