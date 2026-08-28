import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildMinutesPdf, minutesPdfLines } from "@/lib/minutes-pdf";

// "What the document should print" is tested on the pure line reader;
// the PDF bytes themselves are only checked to load with pages (STATE §6:
// PDF content streams are compressed — never string-assert on the bytes).

describe("minutesPdfLines", () => {
  it("reads our composer's whole vocabulary: #, ##, ---, body, blank", () => {
    const md = [
      "# MINIT MESYUARAT — Persatuan Contoh",
      "Bil.: ____ / 2026",
      "",
      "## 1. Pembahagian Tugas",
      "1.1 Tindakan: Pengacara ialah A.",
      "",
      "---",
      "Disediakan oleh MinitAI, disahkan oleh J pada 2026-08-28",
    ].join("\n");
    expect(minutesPdfLines(md)).toEqual([
      { kind: "h1", text: "MINIT MESYUARAT — Persatuan Contoh" },
      { kind: "body", text: "Bil.: ____ / 2026" },
      { kind: "blank" },
      { kind: "h2", text: "1. Pembahagian Tugas" },
      { kind: "body", text: "1.1 Tindakan: Pengacara ialah A." },
      { kind: "blank" },
      { kind: "rule" },
      { kind: "body", text: "Disediakan oleh MinitAI, disahkan oleh J pada 2026-08-28" },
    ]);
  });

  it("survives CRLF and drops trailing blank paper", () => {
    expect(minutesPdfLines("# T\r\n\r\nbody\r\n\r\n\r\n")).toEqual([
      { kind: "h1", text: "T" },
      { kind: "blank" },
      { kind: "body", text: "body" },
    ]);
  });

  it("treats a lone --- as a rule but -- as body", () => {
    expect(minutesPdfLines("---")).toEqual([{ kind: "rule" }]);
    expect(minutesPdfLines("--")).toEqual([{ kind: "body", text: "--" }]);
  });
});

describe("buildMinutesPdf", () => {
  it("produces a loadable PDF from a mixed-language document", async () => {
    const md = [
      "# MINIT MESYUARAT — 崇德文教研習會",
      "No. Pendaftaran (PPM/ROS): PPM-006-09-15021989",
      "",
      "## KEHADIRAN",
      "1. 陈某某 — Setiausaha",
      "",
      "## 1. Atur Cara",
      "1.1 Perbincangan: Kelas ibu bapa merangkumi sesi pengenalan 崇德 selama 15 minit.",
      "",
      "---",
      "Disediakan oleh MinitAI, disahkan oleh J pada 2026-08-28",
    ].join("\n");
    const bytes = await buildMinutesPdf({ finalMd: md, title: "会议记录 7月" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("paginates a long document instead of running off the page", async () => {
    const many = Array.from({ length: 120 }, (_, i) => `${i + 1}. Perkara nombor ${i + 1} yang agak panjang untuk diuji.`);
    const bytes = await buildMinutesPdf({
      finalMd: `# MINIT MESYUARAT — Persatuan Ujian\n\n${many.join("\n")}`,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
