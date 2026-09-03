import { describe, expect, it } from "vitest";
import { emptyMeetingNotesExtraction, type MeetingNotesExtraction } from "@/lib/extraction";
import {
  composeMinutesMd,
  composeStructuredMinutesMd,
  minutesPlanSchema,
  minutesStructure,
  structuredPhraseNeeds,
} from "@/lib/minutes-compose";
import { lintMinitMd } from "@/lib/minit-format";
import { DRAFT_WATERMARK, renderMinutesDraftBm } from "@/lib/minutes-draft";
import { minutesPdfLines } from "@/lib/minutes-pdf";

// G2 (work order 68 §4): the structured compose path — a printed formal minit
// becomes the SAME formal minit, deterministically. All content fictional.

const ref = (snippet: string) => ({ location: "page 1", snippet });
const confirmed = (value: string) => ({
  value,
  confidence: "confirmed" as const,
  source_ref: ref(value.slice(0, 30)),
});

const structuredExtraction = (): MeetingNotesExtraction => ({
  ...emptyMeetingNotesExtraction,
  meeting_type: { value: "agm", confidence: "confirmed", source_ref: ref("MESYUARAT AGUNG") },
  meeting_date: confirmed("2026-05-20"),
  meeting_time: confirmed("8.30 PM – 10.30 PM"),
  meeting_venue: confirmed("Dewan Contoh, Kangar"),
  attendance_count: confirmed("AJK yang hadir : 21 orang"),
  adjournment: confirmed("Mesyuarat ditangguhkan pada 10.30 PM"),
  prepared_by: { position: confirmed("Setiausaha"), person_name: confirmed("SITI CONTOH") },
  endorsed_by: { position: confirmed("Pengerusi"), person_name: confirmed("AHMAD CONTOH") },
  resolutions: [
    {
      text: confirmed(
        "Pengerusi mengalu-alukan semua ahli yang hadir dan mengucapkan ribuan terima kasih atas kerjasama semua pihak.",
      ),
      kind: "info",
      section_no: "1",
      section_title: "Ucapan Pengerusi",
    },
    {
      text: confirmed(
        "Setiausaha membentangkan minit mesyuarat yang lalu dan minit tersebut disahkan sebulat suara.",
      ),
      kind: "decision",
      section_no: "2",
      section_title: "Membentang minit mesyuarat yang lalu",
    },
    {
      text: confirmed("Puan Aminah menggantikan Puan Rosnah sebagai AJK."),
      kind: "decision",
      section_no: "2",
      section_title: "Membentang minit mesyuarat yang lalu",
      own_no: "2.1",
    },
    {
      text: confirmed("Tiada perkara lain dibangkitkan."),
      kind: "info",
      section_no: "3",
      section_title: "Hal-hal lain",
    },
  ],
});

const opts = { orgName: "PERSATUAN CONTOH", confirmedBy: "siti", dateIso: "2026-08-29" };

describe("minutesStructure", () => {
  it("returns the document's own sections, in order, with original numbers", () => {
    const s = minutesStructure(structuredExtraction())!;
    expect(s.map((x) => x.no)).toEqual(["1", "2", "3"]);
    expect(s[1].indices).toEqual([1, 2]);
  });

  it("returns null for an unstructured extraction — the model arranges those", () => {
    expect(minutesStructure(emptyMeetingNotesExtraction)).toBeNull();
  });
});

describe("structuredPhraseNeeds", () => {
  it("a BM printed document becoming the BM filing copy needs NO phrasing (zero vendor calls)", () => {
    expect(structuredPhraseNeeds(structuredExtraction(), "bm")).toEqual([]);
  });

  it("Chinese content in a BM document needs phrasing; the zh copy needs the Latin items", () => {
    const e = structuredExtraction();
    e.resolutions[3] = {
      ...e.resolutions[3],
      text: confirmed("会议记录由秘书宣读并通过。"),
    };
    expect(structuredPhraseNeeds(e, "bm")).toEqual([3]);
    expect(structuredPhraseNeeds(e, "zh")).toEqual([0, 1, 2]);
  });

  it("an English reading copy phrases everything (BM and EN share a script)", () => {
    expect(structuredPhraseNeeds(structuredExtraction(), "en")).toEqual([0, 1, 2, 3]);
  });
});

describe("composeStructuredMinutesMd", () => {
  const md = composeStructuredMinutesMd(structuredExtraction(), opts);

  it("produces the full standard format and passes the ruler", () => {
    expect(
      lintMinitMd(md, {
        lang: "bm",
        masa: true,
        agendaTable: true,
        attendanceCount: true,
        mustContain: [
          "disahkan sebulat suara",
          "menggantikan Puan Rosnah",
          "Mesyuarat ditangguhkan pada 10.30 PM",
        ],
      }),
    ).toEqual([]);
  });

  it("rebuilds the agenda table from the sections and keeps original numbering", () => {
    expect(md).toContain("## Agenda");
    expect(md).toContain("1. Ucapan Pengerusi");
    expect(md).toContain("## Agenda 2: Membentang minit mesyuarat yang lalu");
    expect(md).toContain("2.1 Puan Aminah menggantikan Puan Rosnah sebagai AJK.");
  });

  it("passes paragraphs through VERBATIM — no kind prefixes stamped on prose", () => {
    expect(md).toContain(
      "Pengerusi mengalu-alukan semua ahli yang hadir dan mengucapkan ribuan terima kasih atas kerjasama semua pihak.",
    );
    expect(md).not.toContain("Keputusan: Setiausaha membentangkan");
  });

  it("prints the signature block with the DOCUMENT's own names and roles", () => {
    expect(md).toContain("( SITI CONTOH )");
    expect(md).toContain("SETIAUSAHA");
    expect(md).toContain("( AHMAD CONTOH )");
    expect(md).toContain("PENGERUSI");
    // The audit line still names the session's confirmer (Hard Rule 8).
    expect(md).toContain("disahkan oleh siti");
  });

  it("splices in the model's phrasing where a language conversion was needed", () => {
    const e = structuredExtraction();
    e.resolutions[3] = { ...e.resolutions[3], text: confirmed("没有其他事项。") };
    const phrased = new Map([[3, "Tiada perkara lain dibangkitkan."]]);
    const out = composeStructuredMinutesMd(e, opts, phrased);
    expect(out).toContain("Tiada perkara lain dibangkitkan.");
    expect(out).not.toContain("没有其他事项");
  });
});

describe("zh output drops the mechanical kind prefixes (§1-5)", () => {
  it("unstructured zh document prints no 讨论/议决/行动 prefixes", () => {
    const plan = minutesPlanSchema.parse({
      sections: [
        {
          heading: "分工",
          items: [{ source: 0, kind: "tindakan", text: "游行队伍由家骐带领。" }],
        },
      ],
      unresolved: [],
    });
    const e = {
      ...emptyMeetingNotesExtraction,
      resolutions: [{ text: confirmed("带头：家骐") }],
    };
    const zh = composeMinutesMd(plan, e, { ...opts, lang: "zh" });
    expect(zh).toContain("游行队伍由家骐带领。");
    expect(zh).not.toContain("行动:");
    expect(zh).not.toContain("行动：");
    // BM keeps the genre's own labels.
    const bm = composeMinutesMd(plan, e, opts);
    expect(bm).toContain("Tindakan: ");
  });
});

describe("the preview is the same document (§4 same-source rule)", () => {
  it("a structured extraction previews through the standard format, watermarked", () => {
    const preview = renderMinutesDraftBm(structuredExtraction(), {
      orgName: "PERSATUAN CONTOH",
    });
    expect(preview).toContain(DRAFT_WATERMARK);
    expect(preview).toContain("## Agenda 2: Membentang minit mesyuarat yang lalu");
    expect(preview).toContain("Masa: 8.30 PM – 10.30 PM");
    // No audit line before confirmation — it would claim a confirmation
    // that has not happened.
    expect(preview).not.toContain("disahkan oleh");
  });

  it("the confirmed preview matches the deterministic final document", () => {
    const confirmedPreview = renderMinutesDraftBm(structuredExtraction(), {
      orgName: "PERSATUAN CONTOH",
      confirmedBy: { name: "siti", dateIso: "2026-08-29" },
    });
    expect(confirmedPreview).toBe(composeStructuredMinutesMd(structuredExtraction(), opts));
  });
});

describe("checkLatinNames — Latin names must survive a Chinese document", () => {
  it("catches a Latin name melted into Chinese (the 吕兆生 incident)", async () => {
    const { checkLatinNames, latinNameRuns } = await import("@/lib/minutes-compose");
    const src = "Setiausaha En.Loo Sio San membentangkan minit mesyuarat Agung yang lalu.";
    expect(latinNameRuns(src)).toContain("Loo Sio San");
    const bad = checkLatinNames(
      [{ source: 0, text: "秘书吕兆生先生提呈上一届会员大会会议记录。" }],
      [src],
    );
    expect(bad.ok).toBe(false);
    expect(bad.altered).toEqual([0]);
    const good = checkLatinNames(
      [{ source: 0, text: "秘书 Loo Sio San 先生提呈上一届会员大会会议记录。" }],
      [src],
    );
    expect(good.ok).toBe(true);
  });

  it("does not protect genre words that legitimately translate", async () => {
    const { latinNameRuns } = await import("@/lib/minutes-compose");
    expect(latinNameRuns("Mesyuarat Agung Tahunan diadakan pada Mei 2026.")).toEqual([]);
  });

  it("protects capitalised name runs even without an honorific", async () => {
    const { latinNameRuns } = await import("@/lib/minutes-compose");
    expect(latinNameRuns("Ooi Bee Huang ganti Chan Mei")).toEqual(
      expect.arrayContaining(["Ooi Bee Huang", "Chan Mei"]),
    );
  });
});

describe("the PDF reads the meeting-title line", () => {
  it("turns a full-line **bold** into a strong line, no literal asterisks", () => {
    const lines = minutesPdfLines("# X\n**MESYUARAT AGUNG TAHUNAN 2026**\nbody");
    expect(lines).toContainEqual({ kind: "strong", text: "MESYUARAT AGUNG TAHUNAN 2026" });
    expect(lines.some((l) => "text" in l && l.text.includes("**"))).toBe(false);
  });
});
