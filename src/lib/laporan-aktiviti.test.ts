import { describe, expect, it } from "vitest";

import { buildLaporanText, parseLaporanDraft } from "@/lib/laporan-aktiviti";
import { draftActivityReportPrompt } from "@/prompts/draft-activity-report";
import { INJECTION_RULE } from "@/prompts/untrusted";

// D2-3 (work order 56): the AI words, TypeScript assembles, the person signs.

describe("parseLaporanDraft", () => {
  it("accepts the documented shape", () => {
    const r = parseLaporanDraft({
      pengenalan: "Sepanjang tempoh ini, pertubuhan menjalankan 2 aktiviti.",
      aktiviti: [
        { tarikh: "2026-03-01", nama: "Gotong-royong", penerangan: "Diadakan di dewan." },
        { tarikh: "", nama: "Kelas komputer", penerangan: "" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("refuses junk and empty names", () => {
    expect(parseLaporanDraft(null).success).toBe(false);
    expect(
      parseLaporanDraft({ pengenalan: "x", aktiviti: [{ tarikh: "", nama: "", penerangan: "" }] })
        .success,
    ).toBe(false);
  });
});

describe("buildLaporanText", () => {
  const base = {
    orgName: "Persatuan Contoh",
    orgRegistrationNo: "PPM-005-10-01012020",
    periodLabel: "2026-01-01 hingga 2026-12-31",
    pengenalan: "Sepanjang tahun ini pertubuhan menjalankan dua aktiviti.",
    aktiviti: [
      { tarikh: "2026-03-01", nama: "Gotong-royong", penerangan: "Di dewan orang ramai." },
      { tarikh: "", nama: "Kelas komputer", penerangan: "" },
    ],
    confirmedOnIso: "2026-08-29",
  };

  it("letterhead first, titles in caps, activities numbered", () => {
    const text = buildLaporanText({ ...base, confirmedBy: "Tan Mei Ling" });
    const lines = text.split("\n");
    expect(lines[0]).toBe("Persatuan Contoh");
    expect(lines[1]).toContain("PPM-005");
    expect(text).toContain("LAPORAN AKTIVITI PERTUBUHAN");
    expect(text).toContain("SENARAI AKTIVITI");
    expect(text).toContain("1. [2026-03-01] Gotong-royong");
    // No date = no empty brackets.
    expect(text).toContain("2. Kelas komputer");
    expect(text).not.toContain("[] Kelas");
  });

  it("confirmed carries the audit line with the confirmer's name (Hard Rule 8)", () => {
    const text = buildLaporanText({ ...base, confirmedBy: "Tan Mei Ling" });
    expect(text).toContain("disahkan oleh Tan Mei Ling pada 2026-08-29");
    expect(text).not.toContain("DRAF");
  });

  it("unconfirmed says DRAF on its face", () => {
    const text = buildLaporanText({ ...base, confirmedBy: null });
    expect(text).toContain("DRAF");
    expect(text).not.toContain("disahkan oleh");
  });
});

describe("draftActivityReportPrompt", () => {
  const prompt = draftActivityReportPrompt({
    orgName: "Persatuan Contoh",
    periodLabel: "2026",
    activities: [
      { dateIso: "2026-03-01", title: "Gotong-royong", kind: "activity", venue: "Dewan", note: null },
    ],
  });

  it("forbids invention and carries the injection rule", () => {
    expect(prompt).toContain("Never invent");
    expect(prompt).toContain(INJECTION_RULE);
  });

  it("frames the records as DATA and includes them", () => {
    expect(prompt).toContain("DATA");
    expect(prompt).toContain("Gotong-royong");
    expect(prompt).toContain("tempat=Dewan");
  });
});
