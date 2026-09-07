import { describe, expect, it } from "vitest";
import { applyBmGlossary } from "./bm-glossary";
import { emptyMeetingNotesExtraction, type MeetingNotesExtraction } from "./extraction";
import { composeMinutesMd, composeStructuredMinutesMd, sameLine } from "./minutes-compose";
import { renderMinutesDraftBm } from "./minutes-draft";

// ---------------------------------------------------------------------------
// 125 §5-3 / §5-4 — the closing line prints once; the fixed passages of a BM
// document get the glossary applied by code, names untouched. Fictional names
// (A3).
// ---------------------------------------------------------------------------

const confirmed = (value: string) => ({
  value,
  confidence: "confirmed" as const,
  source_ref: { location: "photo 1", snippet: value },
});
const opts = { orgName: "PERSATUAN CONTOH", confirmedBy: "Chan Mei", dateIso: "2026-09-07" };

describe("🔴 125 §5-3 — the closing line prints once", () => {
  it("sameLine ignores list furniture, case, spacing and punctuation", () => {
    expect(sameLine("散会 12.30pm", "3. 散会 12.30pm.")).toBe(true);
    expect(sameLine("Mesyuarat ditangguhkan pada 10.30 PM", "mesyuarat ditangguhkan pada 10.30 pm.")).toBe(true);
    expect(sameLine("散会 12.30pm", "散会 12.45pm")).toBe(false);
    expect(sameLine("", "")).toBe(false);
  });

  it("an unstructured page: the last resolution IS the adjournment → printed only under PENUTUP", () => {
    const texts = ["主席感谢大家", "动议 张伟杰, 附议 王丽华", "散会 12.30pm"];
    const e: MeetingNotesExtraction = {
      ...emptyMeetingNotesExtraction,
      resolutions: texts.map((t) => ({ text: confirmed(t) })),
      adjournment: confirmed("散会 12.30pm"),
    };
    const plan = {
      sections: [
        {
          heading: "Perkara",
          items: [
            { source: 0, text: "Pengerusi mengucapkan terima kasih." },
            { source: 1, text: "Usul dicadangkan oleh 张伟杰, disokong oleh 王丽华." },
            { source: 2, text: "Mesyuarat bersurai pada 12.30pm." },
          ],
        },
      ],
      unresolved: [],
    };
    const md = composeMinutesMd(plan, e, opts);
    expect(md.match(/12\.30pm/g)).toHaveLength(1);
    expect(md).not.toContain("Mesyuarat bersurai pada 12.30pm.");
    expect(md).toContain("## PENUTUP\n\nBersurai 12.30pm");
    // The other two items are untouched.
    expect(md).toContain("Usul dicadangkan oleh 张伟杰");
  });

  it("a structured page: the closing paragraph is not repeated as a section item", () => {
    const e: MeetingNotesExtraction = {
      ...emptyMeetingNotesExtraction,
      adjournment: confirmed("Mesyuarat ditangguhkan pada 10.30 PM"),
      resolutions: [
        { text: confirmed("Ucapan aluan."), section_no: "1", section_title: "Ucapan Pengerusi" },
        { text: confirmed("Mesyuarat ditangguhkan pada 10.30 PM."), section_no: "3", section_title: "Penutup" },
      ],
    };
    const md = composeStructuredMinutesMd(e, { ...opts, lang: "bm" });
    expect(md.match(/10\.30 PM/g)).toHaveLength(1);
    expect(md).not.toContain("## Agenda 3: Penutup");
  });

  it("a different last line is NOT dropped (誤殺比漏抓糟)", () => {
    const e: MeetingNotesExtraction = {
      ...emptyMeetingNotesExtraction,
      resolutions: [{ text: confirmed("下次会议 8/9") }],
      adjournment: confirmed("散会 12.30pm"),
    };
    const md = composeMinutesMd(
      { sections: [{ heading: "P", items: [{ source: 0, text: "Mesyuarat akan datang 8/9." }] }], unresolved: [] },
      e,
      opts,
    );
    expect(md).toContain("Mesyuarat akan datang 8/9.");
    expect(md).toContain("Bersurai 12.30pm");
  });
});

describe("🔴 125 §5-4 — the fixed passages get the glossary, names never", () => {
  it("applyBmGlossary swaps the table's terms and fences names", () => {
    expect(applyBmGlossary("会议室")).toBe("Bilik Mesyuarat");
    expect(applyBmGlossary("筹款: 晚宴")).toBe("kutipan derma: Jamuan malam");
    // 会 sits inside a (fictional) name that contains a term — fenced.
    expect(applyBmGlossary("主席: 陈会员", ["陈会员"])).toBe("Pengerusi: 陈会员");
    expect(applyBmGlossary("Dewan Contoh")).toBe("Dewan Contoh");
    // Digits in the text are not mistaken for a fence token.
    expect(applyBmGlossary("散会 12.30pm 0", ["王丽华"])).toBe("Bersurai 12.30pm 0");
  });

  it("the formal BM document: venue, figure labels, positions and the closing line come out in BM; 张伟杰 stays beside his position", () => {
    const e: MeetingNotesExtraction = {
      ...emptyMeetingNotesExtraction,
      meeting_venue: confirmed("会议室"),
      adjournment: confirmed("散会 12.30pm"),
      figures: [
        {
          description: confirmed("筹款"),
          amount_cents: { value: 915000, confidence: "confirmed", source_ref: { location: "p1", snippet: "9150" } },
        },
      ],
      office_bearers: [{ position: confirmed("主席"), person_name: confirmed("张伟杰") }],
      resolutions: [{ text: confirmed("Mesyuarat diadakan.") }],
    };
    const plan = { sections: [{ heading: "Perkara", items: [{ source: 0, text: "Mesyuarat diadakan." }] }], unresolved: [] };
    const md = composeMinutesMd(plan, e, opts);
    expect(md).toContain("Tempat: Bilik Mesyuarat");
    expect(md).toContain("- kutipan derma: RM9,150.00");
    expect(md).toContain("- Pengerusi: 张伟杰");
    expect(md).toContain("## PENUTUP\n\nBersurai 12.30pm");
    expect(md).not.toContain("会议室");
    expect(md).not.toContain("筹款");
    expect(md).not.toContain("散会");
    // A zh reading copy is untouched.
    const zh = composeMinutesMd(plan, e, { ...opts, lang: "zh" });
    expect(zh).toContain("地点: 会议室");
    expect(zh).toContain("- 主席: 张伟杰");
  });

  it("the free BM template does the same for venue, figures and positions", () => {
    const e: MeetingNotesExtraction = {
      ...emptyMeetingNotesExtraction,
      meeting_venue: confirmed("会议室"),
      figures: [
        {
          description: confirmed("筹款"),
          amount_cents: { value: 915000, confidence: "confirmed", source_ref: { location: "p1", snippet: "9150" } },
        },
      ],
      office_bearers: [{ position: confirmed("主席"), person_name: confirmed("张伟杰") }],
    };
    const md = renderMinutesDraftBm(e, { orgName: "PERSATUAN CONTOH" });
    expect(md).toContain("Tempat: Bilik Mesyuarat");
    expect(md).toContain("- kutipan derma: RM9,150.00");
    expect(md).toContain("- Pengerusi: 张伟杰");
  });
});
