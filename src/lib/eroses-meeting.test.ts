import { describe, expect, it } from "vitest";
import { emptyMeetingNotesExtraction } from "@/lib/extraction";
import {
  buildMeetingFormPack,
  erosesMeetingKind,
  isoToErosesDate,
} from "@/lib/eroses-meeting";

describe("isoToErosesDate", () => {
  it("flips ISO into the portal's DD-MM-YYYY", () => {
    expect(isoToErosesDate("2026-07-26")).toBe("26-07-2026");
  });
  it("passes anything unparseable through untouched", () => {
    expect(isoToErosesDate("July 26")).toBe("July 26");
  });
});

describe("erosesMeetingKind", () => {
  it("maps the three types the portal's dropdown knows", () => {
    expect(erosesMeetingKind("agm")).toBe("Mesyuarat Agung");
    expect(erosesMeetingKind("egm")).toBe("Mesyuarat Agung Luar Biasa / Khas");
    expect(erosesMeetingKind("committee")).toBe("Mesyuarat AJK");
  });
  it("refuses to force the rest into a government dropdown", () => {
    expect(erosesMeetingKind("event")).toBeNull();
    expect(erosesMeetingKind("planning")).toBeNull();
    expect(erosesMeetingKind("other")).toBeNull();
    expect(erosesMeetingKind("")).toBeNull();
  });
});

describe("buildMeetingFormPack", () => {
  function extractionWith(over: { venue?: string; attendees?: string[] }) {
    const e = structuredClone(emptyMeetingNotesExtraction);
    if (over.venue) {
      e.meeting_venue = {
        value: over.venue,
        confidence: "confirmed",
        source_ref: { location: "t", snippet: over.venue },
      };
    }
    for (const name of over.attendees ?? []) {
      e.attendees.push({
        name: {
          value: name,
          confidence: "confirmed",
          source_ref: { location: "t", snippet: name },
        },
      });
    }
    return e;
  }

  it("fills the portal's boxes from the stored facts, in the portal's order", () => {
    const rows = buildMeetingFormPack({
      meetingType: "agm",
      title: "AGM 2026",
      meetingDateIso: "2026-05-20",
      extraction: extractionWith({ venue: "Dewan Orang Ramai", attendees: ["A", "B", "C"] }),
    });
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(byField["Jenis Mesyuarat"].value).toBe("Mesyuarat Agung");
    expect(byField["Tujuan Mesyuarat"].value).toBe("AGM 2026");
    expect(byField["Tarikh Mesyuarat"].value).toBe("20-05-2026");
    expect(byField["Tempat Mesyuarat"].value).toBe("Dewan Orang Ramai");
    expect(byField["Jumlah Kehadiran Ahli Mesyuarat"].value).toBe("3");
    // The two boxes only the person can answer are not copyable.
    expect(byField["Kaedah Mesyuarat"].copyable).toBe(false);
    expect(byField["Masa"].copyable).toBe(false);
  });

  it("attendance is counted by code and only from named rows", () => {
    const e = extractionWith({ attendees: ["A", "  ", "B"] });
    const rows = buildMeetingFormPack({
      meetingType: "committee",
      meetingDateIso: null,
      extraction: e,
    });
    const count = rows.find((r) => r.field === "Jumlah Kehadiran Ahli Mesyuarat");
    expect(count?.value).toBe("2");
  });

  it("degrades honestly for an old row with no stored extraction", () => {
    const rows = buildMeetingFormPack({
      meetingType: "event",
      meetingTypeLabel: null,
      title: null,
      meetingDateIso: "2026-07-26",
      extraction: null,
    });
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(byField["Jenis Mesyuarat"].value).toBe("—");
    expect(byField["Jenis Mesyuarat"].note).not.toBeNull();
    // Tujuan falls back to the BM type label — the portal reads BM.
    expect(byField["Tujuan Mesyuarat"].value).toBe("Mesyuarat Program / Aktiviti");
    expect(byField["Tarikh Mesyuarat"].value).toBe("26-07-2026");
    expect(byField["Tempat Mesyuarat"].value).toBe("—");
    expect(byField["Jumlah Kehadiran Ahli Mesyuarat"].value).toBe("—");
  });
});
