import { describe, expect, it } from "vitest";
import { lintMinitMd, renderMinitMd, type MinitDocModel } from "./minit-format";

// 125 §7 — the lint's three holes from the 8/31 real run. Each: the bad
// document is caught, the good one is not (誤殺就不裝).

const bm = { lang: "bm" as const };

const good = (): MinitDocModel => ({
  lang: "bm",
  orgName: "PERSATUAN CONTOH",
  agendaTable: [
    { no: "1", title: "Ucapan Pengerusi" },
    { no: "2", title: "Kekosongan jawatan" },
  ],
  sections: [
    { no: "1", title: "Ucapan Pengerusi", items: [{ text: "Pengerusi mengalu-alukan semua." }] },
    { no: "2", title: "Kekosongan jawatan", items: [{ text: "Puan Aminah dilantik.", ownNo: "2.1" }] },
  ],
  preparedBy: { name: "SITI CONTOH", role: "Setiausaha" },
});

describe("125 §7 — agenda_heading_empty", () => {
  it("catches '## Agenda 2.1:' with no title (BM and zh forms)", () => {
    const md = "# MINIT MESYUARAT — X\n\n## Agenda 2.1:\n\nSesuatu.\n\n## PENUTUP\n\nDisediakan oleh,\nDisahkan oleh,";
    expect(lintMinitMd(md, bm).map((f) => f.code)).toContain("agenda_heading_empty");
    const zh = "# 会议记录 — X\n\n## 议程 2.1：\n\n事项。\n\n## 散会\n\n记录人：\n核准人：";
    expect(lintMinitMd(zh, { lang: "zh" }).map((f) => f.code)).toContain("agenda_heading_empty");
  });

  it("a titled heading is fine — the renderer's own output passes", () => {
    const codes = lintMinitMd(renderMinitMd(good()), { ...bm, agendaTable: true }).map((f) => f.code);
    expect(codes).not.toContain("agenda_heading_empty");
    expect(codes).not.toContain("agenda_repeated");
    expect(codes).not.toContain("duplicate_numbering");
  });
});

describe("125 §7 — duplicate_numbering", () => {
  it("catches '1 (1) text' — the page's number beside ours", () => {
    const md = "# X\n\n## Agenda 1: A\n\n1 (1) Perkara pertama.\n2.1 (2.1) Perkara kedua.\n\n## PENUTUP\n\nDisediakan oleh,\nDisahkan oleh,";
    const hits = lintMinitMd(md, bm).filter((f) => f.code === "duplicate_numbering");
    expect(hits).toHaveLength(2);
  });

  it("does not flag a bracket that is not a number, a date, or a plain own number", () => {
    const md = "# X\n\n## Agenda 1: A\n\n1 (a) Perkara.\n2.1 Perkara (RM 500) dibincangkan.\n15/3/2026 (Ahad) — mesyuarat.\n\n## PENUTUP\n\nDisediakan oleh,\nDisahkan oleh,";
    expect(lintMinitMd(md, bm).map((f) => f.code)).not.toContain("duplicate_numbering");
  });
});

describe("125 §7 — agenda_repeated", () => {
  it("catches the same agenda title heading two sections", () => {
    const md = "# X\n\n## Agenda 1: Ucapan Pengerusi\n\nA.\n\n## Agenda 2: Ucapan Pengerusi\n\nB.\n\n## PENUTUP\n\nDisediakan oleh,\nDisahkan oleh,";
    const hits = lintMinitMd(md, bm).filter((f) => f.code === "agenda_repeated");
    expect(hits).toHaveLength(1);
    expect(hits[0].detail).toContain("ucapan pengerusi");
  });

  it("the agenda summary table repeating a section's title is NOT a repeat (table rows are not headings)", () => {
    const codes = lintMinitMd(renderMinitMd(good()), { ...bm, agendaTable: true }).map((f) => f.code);
    expect(codes).not.toContain("agenda_repeated");
  });
});
