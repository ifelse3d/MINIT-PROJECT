import { describe, expect, it } from "vitest";
import {
  lintMinitMd,
  meetingTitleLine,
  ownEnumeratorOf,
  renderMinitMd,
  stripOwnEnumerator,
  type MinitDocModel,
} from "@/lib/minit-format";

// The standard Malaysian society minit format — work order 68 §2 (G0).
// Every assertion here is a defect J counted on his real printed sample
// (described in the work order in layout language; the fixture below is
// FICTIONAL — real sample content never enters the repo, A3 privacy rule).

describe("enumerator handling (the double-numbering fix, §1-1)", () => {
  it("recognises a line's own enumerator in its wild forms", () => {
    expect(ownEnumeratorOf("1. Ucapan Pengerusi")).toBe("1");
    expect(ownEnumeratorOf("1.Ucapan Pengerusi")).toBe("1"); // tight, as printed
    expect(ownEnumeratorOf("3) bincang hal lain")).toBe("3");
    expect(ownEnumeratorOf("4、讨论事项")).toBe("4");
  });

  it("does NOT mistake dates, times or counts for enumerators", () => {
    expect(ownEnumeratorOf("12 Ogos 2026 perarakan")).toBeNull();
    expect(ownEnumeratorOf("10.30 PM bersurai")).toBeNull();
    expect(ownEnumeratorOf("33 orang hadir")).toBeNull();
    expect(ownEnumeratorOf("2.1 diganti Lee Moy")).toBeNull(); // own_no's job, not stripping's
  });

  it("strips only the enumerator, keeping the content exactly", () => {
    expect(stripOwnEnumerator("1.Ucapan Pengerusi")).toBe("Ucapan Pengerusi");
    expect(stripOwnEnumerator("2. 宏道 10位")).toBe("宏道 10位");
    expect(stripOwnEnumerator("perkara tanpa nombor")).toBe("perkara tanpa nombor");
  });
});

describe("meetingTitleLine", () => {
  it("builds the formal title line from the localised type label and year", () => {
    expect(meetingTitleLine("bm", "Mesyuarat Agung Tahunan (AGM)", "2026")).toBe(
      "MESYUARAT AGUNG TAHUNAN 2026",
    );
    expect(meetingTitleLine("zh", "常年大会（AGM）", "2026")).toBe("2026 年常年大会");
    expect(meetingTitleLine("en", "Annual General Meeting (AGM)", "2026")).toBe(
      "ANNUAL GENERAL MEETING 2026",
    );
  });

  it("prints nothing when the type is unknown — the format never invents", () => {
    expect(meetingTitleLine("bm", "", "2026")).toBe("");
  });

  it("works without a year", () => {
    expect(meetingTitleLine("bm", "Mesyuarat Jawatankuasa")).toBe(
      "MESYUARAT JAWATANKUASA",
    );
  });
});

// A FICTIONAL structured AGM in the standard format — the same SHAPE as the
// real sample (letterhead, TARIKH/MASA/TEMPAT, headcount, agenda table,
// per-agenda prose, penangguhan, signatures), fictional content throughout.
const structuredModel = (): MinitDocModel => ({
  lang: "bm",
  orgName: "PERSATUAN CONTOH SEJAHTERA",
  meetingTitleLine: "MESYUARAT AGUNG TAHUNAN 2026",
  bilYear: "2026",
  meetingTypeText: "Mesyuarat Agung Tahunan (AGM)",
  tarikh: "2026-05-20",
  masa: "8.30 PM – 10.30 PM",
  tempat: "Dewan Serbaguna, Taman Contoh",
  attendanceCountText: "AJK yang hadir : 21 orang",
  agendaTable: [
    { no: "1", title: "Ucapan Pengerusi" },
    { no: "2", title: "1.Membentang minit mesyuarat yang lalu" }, // own enum survives in source
    { no: "3", title: "Hal-hal lain" },
  ],
  sections: [
    {
      no: "1",
      title: "Ucapan Pengerusi",
      items: [
        {
          text: "Pengerusi mengalu-alukan semua ahli yang hadir dan mengucapkan terima kasih atas kerjasama semua pihak.",
        },
      ],
    },
    {
      no: "2",
      title: "Membentang minit mesyuarat yang lalu",
      items: [
        {
          text: "Setiausaha membentangkan minit mesyuarat yang lalu dan minit tersebut disahkan sebulat suara.",
          kind: "keputusan",
        },
        { text: "Cik Aminah menggantikan Encik Rosli.", ownNo: "2.1" },
      ],
    },
    {
      no: "3",
      title: "Hal-hal lain",
      items: [{ text: "Tiada perkara lain dibangkitkan." }],
    },
  ],
  adjournment: "Mesyuarat ditangguhkan pada 10.30 PM.",
  preparedBy: { name: "SITI CONTOH", role: "Setiausaha" },
  endorsedBy: { name: "AHMAD CONTOH", role: "Pengerusi" },
  audit: { confirmedBy: "siti", dateIso: "2026-08-29" },
});

describe("renderMinitMd — the structured (printed formal) form", () => {
  const md = renderMinitMd(structuredModel());

  it("keeps the machine letterhead and adds the formal title line", () => {
    expect(md).toContain("# MINIT MESYUARAT — PERSATUAN CONTOH SEJAHTERA");
    expect(md).toContain("**MESYUARAT AGUNG TAHUNAN 2026**");
  });

  it("prints the full TARIKH / MASA / TEMPAT block with the headcount", () => {
    expect(md).toContain("Tarikh: 2026-05-20");
    expect(md).toContain("Masa: 8.30 PM – 10.30 PM");
    expect(md).toContain("Tempat: Dewan Serbaguna, Taman Contoh");
    expect(md).toContain("AJK yang hadir : 21 orang");
  });

  it("prints the Agenda summary table with original numbers, single layer", () => {
    expect(md).toContain("## Agenda");
    expect(md).toContain("1. Ucapan Pengerusi");
    // The source row carried its own "1." — it must not double up.
    expect(md).toContain("2. Membentang minit mesyuarat yang lalu");
    expect(md).not.toMatch(/2\.\s*1\.Membentang/);
  });

  it("gives each agenda its own section, original numbering, prose paragraphs", () => {
    expect(md).toContain("## Agenda 1: Ucapan Pengerusi");
    expect(md).toContain("## Agenda 2: Membentang minit mesyuarat yang lalu");
    expect(md).toContain(
      "Pengerusi mengalu-alukan semua ahli yang hadir dan mengucapkan terima kasih atas kerjasama semua pihak.",
    );
    // Paragraphs are prose — NOT renumbered into "1.1", "2.1" list items.
    expect(md).not.toContain("1.1 Pengerusi mengalu-alukan");
  });

  it("keeps a sub-numbered line's OWN number, adding no second layer", () => {
    expect(md).toContain("2.1 Cik Aminah menggantikan Encik Rosli.");
  });

  it("prints the verbatim adjournment inside PENUTUP", () => {
    expect(md).toContain("## PENUTUP");
    expect(md).toContain("Mesyuarat ditangguhkan pada 10.30 PM.");
  });

  it("prints the signature block with names AND roles", () => {
    expect(md).toContain("Disediakan oleh,");
    expect(md).toContain("( SITI CONTOH )");
    expect(md).toContain("SETIAUSAHA");
    expect(md).toContain("Disahkan oleh,");
    expect(md).toContain("( AHMAD CONTOH )");
    expect(md).toContain("PENGERUSI");
  });

  it("passes its own lint — the ruler agrees with the renderer", () => {
    expect(
      lintMinitMd(md, {
        lang: "bm",
        masa: true,
        agendaTable: true,
        attendanceCount: true,
        mustContain: ["disahkan sebulat suara"],
      }),
    ).toEqual([]);
  });
});

describe("renderMinitMd — the list (whiteboard / free notes) form", () => {
  const md = renderMinitMd({
    lang: "bm",
    orgName: "PERSATUAN CONTOH",
    sections: [
      {
        no: "",
        title: "Sasaran kumpulan",
        items: [
          { text: "1. 宏道 10位" }, // own enum in the text — must not double
          { text: "同吉 5位", kind: "keputusan" },
        ],
      },
    ],
    preparedBy: { name: "siti" },
    audit: { confirmedBy: "siti", dateIso: "2026-08-29" },
  });

  it("numbers devised sections by position and items one layer deep", () => {
    expect(md).toContain("## 1. Sasaran kumpulan");
    expect(md).toContain("1.1 宏道 10位");
    expect(md).not.toContain("1.1 1. 宏道");
    expect(md).toContain("1.2 Keputusan: 同吉 5位");
  });

  it("uses the blank chair slot when nobody recorded the endorser", () => {
    expect(md).toContain("( Pengerusi )");
  });
});

describe("renderMinitMd — zh reading copy carries the same layout", () => {
  const model = { ...structuredModel(), lang: "zh" as const };
  const md = renderMinitMd(model);

  it("uses the zh labels for the whole frame", () => {
    expect(md).toContain("# 会议记录 — PERSATUAN CONTOH SEJAHTERA");
    expect(md).toContain("时间: 8.30 PM – 10.30 PM");
    expect(md).toContain("## 议程");
    expect(md).toContain("## 议程 1：Ucapan Pengerusi");
    expect(md).toContain("翻译本");
  });
});

describe("lintMinitMd — the ruler catches the diseases from §1", () => {
  const frame = (body: string) =>
    [
      "# MINIT MESYUARAT — PERSATUAN CONTOH",
      "",
      body,
      "",
      "## PENUTUP",
      "",
      "Mesyuarat ditangguhkan.",
      "",
      "Disediakan oleh,",
      "",
      "Disahkan oleh,",
    ].join("\n");

  it("flags double numbering — the exact defect J circled", () => {
    const findings = lintMinitMd(frame("1. 1.Ucapan Pengerusi"), { lang: "bm" });
    expect(findings.map((f) => f.code)).toContain("double_numbering");
  });

  it("does not flag a date-led or time-led line", () => {
    const ok = lintMinitMd(frame("1. 12 Ogos 2026 perarakan\n2. 10.30 PM bersurai"), {
      lang: "bm",
    });
    expect(ok.map((f) => f.code)).not.toContain("double_numbering");
  });

  it("flags a missing signature block and missing closing", () => {
    const bare = "# MINIT MESYUARAT — X\n\n1. perkara";
    const codes = lintMinitMd(bare, { lang: "bm" }).map((f) => f.code);
    expect(codes).toContain("signature_block_missing");
    expect(codes).toContain("closing_missing");
  });

  it("flags MASA / agenda table / headcount only when the source had them", () => {
    const md = frame("perkara");
    const strict = lintMinitMd(md, {
      lang: "bm",
      masa: true,
      agendaTable: true,
      attendanceCount: true,
    }).map((f) => f.code);
    expect(strict).toContain("masa_missing");
    expect(strict).toContain("agenda_table_missing");
    expect(strict).toContain("attendance_count_missing");
    const lax = lintMinitMd(md, { lang: "bm" }).map((f) => f.code);
    expect(lax).not.toContain("masa_missing");
  });

  it("flags lost prose via mustContain probes — the §1-2 disease", () => {
    const findings = lintMinitMd(frame("perkara lain"), {
      lang: "bm",
      mustContain: ["Cadangan disokong sebulat suara"],
    });
    expect(findings.map((f) => f.code)).toContain("content_lost");
  });
});
