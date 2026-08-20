import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  assertIsoDate,
  buildAgmNoticeBm,
  buildAttendanceRows,
  buildBankResolutionExtractBm,
  buildProxyFormBm,
  defaultAgmAgendaBm,
  DRAFT_WATERMARK_BM,
  findSignatoryResolutions,
  formatDateBm,
  latestNoticeDateIso,
  orgSettingWarningBm,
} from "@/lib/agm-pack";
import { sampleAgmPackParams, sampleConfirmedMinutes } from "@/lib/sample-roster";

describe("date math", () => {
  it("adds and subtracts days across month and year boundaries", () => {
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles leap years", () => {
    expect(addDaysIso("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("latest notice date = meeting date minus the notice period", () => {
    expect(latestNoticeDateIso("2026-08-30", 14)).toBe("2026-08-16");
    expect(latestNoticeDateIso("2026-08-30", 0)).toBe("2026-08-30");
  });

  it("rejects invalid dates and periods", () => {
    expect(() => assertIsoDate("2026-02-30")).toThrow(RangeError);
    expect(() => assertIsoDate("30/08/2026")).toThrow(RangeError);
    expect(() => latestNoticeDateIso("2026-08-30", -1)).toThrow(RangeError);
    expect(() => addDaysIso("2026-08-30", 1.5)).toThrow(RangeError);
  });

  it("formats dates in BM", () => {
    expect(formatDateBm("2026-08-30")).toBe("30 Ogos 2026");
    expect(formatDateBm("2026-02-01")).toBe("1 Februari 2026");
  });
});

describe("buildAgmNoticeBm", () => {
  it("carries the DRAF watermark until confirmed", () => {
    const draft = buildAgmNoticeBm(sampleAgmPackParams);
    expect(draft).toContain(DRAFT_WATERMARK_BM);
    const confirmed = buildAgmNoticeBm({
      ...sampleAgmPackParams,
      confirmed: { by: "Lim Bee Hoon", onIso: "2026-07-10" },
    });
    expect(confirmed).not.toContain(DRAFT_WATERMARK_BM);
    expect(confirmed).toContain("confirmed by Lim Bee Hoon on 2026-07-10");
  });

  it("shows the org-setting warning only for org_setting source", () => {
    const orgSetting = buildAgmNoticeBm(sampleAgmPackParams);
    expect(orgSetting).toContain(orgSettingWarningBm(14));
    const fromConstitution = buildAgmNoticeBm({
      ...sampleAgmPackParams,
      noticePeriodSource: "constitution",
      constitutionClauseRef: "Fasal 10.2",
    });
    expect(fromConstitution).not.toContain("AMARAN");
    expect(fromConstitution).toContain("Fasal 10.2");
  });

  it("computes and prints the latest notice date", () => {
    expect(buildAgmNoticeBm(sampleAgmPackParams)).toContain("16 Ogos 2026");
  });

  it("uses the standard agenda by default and a custom agenda verbatim", () => {
    const std = buildAgmNoticeBm(sampleAgmPackParams);
    for (const item of defaultAgmAgendaBm(2026)) expect(std).toContain(item);
    const custom = buildAgmNoticeBm({
      ...sampleAgmPackParams,
      agendaItems: ["Item khas satu", "Item khas dua"],
    });
    expect(custom).toContain("1. Item khas satu");
    expect(custom).not.toContain("Ucapan aluan Pengerusi");
  });
});

describe("buildAttendanceRows", () => {
  it("puts the roster first, then numbered blank rows", () => {
    const rows = buildAttendanceRows(sampleAgmPackParams.roster, 20);
    expect(rows).toHaveLength(sampleAgmPackParams.roster.length + 20);
    expect(rows[0]).toEqual({ no: 1, name: "Tan Ah Kow (陈亚九)", position: "Pengerusi" });
    expect(rows[rows.length - 1].name).toBe("");
    expect(rows[rows.length - 1].no).toBe(rows.length);
  });

  it("rejects a negative blank-row count", () => {
    expect(() => buildAttendanceRows([], -1)).toThrow(RangeError);
  });
});

describe("buildProxyFormBm", () => {
  it("contains meeting facts, blanks for the member, and the watermark", () => {
    const proxy = buildProxyFormBm(sampleAgmPackParams);
    expect(proxy).toContain("BORANG PROKSI");
    expect(proxy).toContain("30 Ogos 2026");
    expect(proxy).toContain("__________");
    expect(proxy).toContain(DRAFT_WATERMARK_BM);
  });
});

describe("bank-resolution extract", () => {
  it("filters signatory-related resolutions by keyword", () => {
    const hits = findSignatoryResolutions(sampleConfirmedMinutes.resolutions);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("penandatangan akaun bank");
  });

  it("refuses when the minutes are still a draft", () => {
    const res = buildBankResolutionExtractBm({ ...sampleConfirmedMinutes, status: "draft" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("belum disahkan");
  });

  it("refuses when no signatory resolution exists — never invents", () => {
    const res = buildBankResolutionExtractBm({
      ...sampleConfirmedMinutes,
      resolutions: ["Meluluskan perbelanjaan RM500 untuk jamuan."],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("Tiada resolusi");
  });

  it("extracts only the matching resolution, verbatim, with certification", () => {
    const res = buildBankResolutionExtractBm(sampleConfirmedMinutes);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.text).toContain("PETIKAN MINIT MESYUARAT");
      expect(res.text).toContain("penandatangan akaun bank");
      expect(res.text).not.toContain("baik pulih bumbung"); // unrelated resolution stays out
      expect(res.text).toContain("Certified a true extract");
      expect(res.text).toContain("confirmed by Lim Bee Hoon (Setiausaha) on 2026-06-20");
    }
  });
});
