import type { Confidence, MeetingNotesExtraction } from "@/lib/extraction";
import { EROSES_ANNUAL_RETURN_MAP } from "@/prompts/eroses-map";
import { formatRm } from "@/lib/minutes-draft";
import {
  isErosesFileable,
  meetingTypeLabel,
  NOT_FOR_ANNUAL_RETURN,
} from "@/lib/meeting-types";

// ---------------------------------------------------------------------------
// eROSES paste-pack builder — pipeline step 4. DETERMINISTIC code:
// it copies confirmed values and COUNTS things itself (Hard Rule 2);
// the AI never aggregates. One row per eROSES portal field, so the
// secretary can copy-paste each value into the right box.
// ---------------------------------------------------------------------------

export type PastePackRow = {
  erosesField: string;
  erosesFieldEn: string;
  /** Ready-to-paste value; "—" when the underlying data is missing. */
  value: string;
  /** Worst confidence among the fields this row draws from. */
  confidence: Confidence;
  /** Where the value came from (source snippets, joined). */
  source: string;
  note: string;
};

function worst(...levels: Confidence[]): Confidence {
  if (levels.includes("missing")) return "missing";
  if (levels.includes("check")) return "check";
  return "confirmed";
}

/**
 * Is this meeting the one the Annual Return asks about?
 *
 * The whole pack describes ONE meeting. If that meeting is not an AGM or an
 * EGM, then not just the type but the attendance count, the venue and the
 * financial summary are all answers to a question the form did not ask.
 */
export function isAnnualReturnMeeting(e: MeetingNotesExtraction): boolean {
  return isErosesFileable(e.meeting_type.value);
}

export function buildPastePack(e: MeetingNotesExtraction): PastePackRow[] {
  // 🔴 2026-08-20. Before today this function printed whatever was in the field
  // straight into "Jenis Mesyuarat" and marked the row Confirmed — so a
  // planning meeting arrived at the Registrar's form as if it were the general
  // meeting the Annual Return asks about. A wrong value in that box has a name:
  // false declaration. A pack with nothing in it is recoverable; a pack that
  // looks right and is wrong is not.
  if (!isAnnualReturnMeeting(e)) {
    const notice = `${NOT_FOR_ANNUAL_RETURN.bm}\n${NOT_FOR_ANNUAL_RETURN.zh}\n${NOT_FOR_ANNUAL_RETURN.en}`;
    return EROSES_ANNUAL_RETURN_MAP.map((entry) =>
      row(entry, { value: "—", confidence: "missing", source: "" }, notice),
    );
  }

  return EROSES_ANNUAL_RETURN_MAP.map((entry) => {
    switch (entry.extractionPath) {
      case "meeting_type": {
        const f = e.meeting_type;
        return row(entry, {
          // Bahasa Malaysia: this string is pasted into a BM government form.
          value: f.value === "" ? "—" : meetingTypeLabel(f.value, "bm"),
          confidence: f.confidence,
          source: f.source_ref?.snippet ?? "",
        });
      }
      case "meeting_date": {
        const f = e.meeting_date;
        return row(entry, {
          value: f.value === "" ? "—" : f.value,
          confidence: f.confidence,
          source: f.source_ref?.snippet ?? "",
        });
      }
      case "meeting_venue": {
        const f = e.meeting_venue;
        return row(entry, {
          value: f.value === "" ? "—" : f.value,
          confidence: f.confidence,
          source: f.source_ref?.snippet ?? "",
        });
      }
      case "attendees": {
        const present = e.attendees.filter(
          (a) => a.name.confidence !== "missing" && a.name.value !== ""
        );
        return row(entry, {
          // Deterministic COUNT by code, never by the AI (Hard Rule 2).
          value: present.length === 0 ? "—" : String(present.length),
          confidence:
            present.length === 0
              ? "missing"
              : worst(...present.map((a) => a.name.confidence)),
          source: present.map((a) => a.name.source_ref?.snippet ?? "").join("; "),
        });
      }
      case "office_bearers": {
        const filled = e.office_bearers.filter(
          (b) => b.person_name.confidence !== "missing" && b.person_name.value !== ""
        );
        const gaps = e.office_bearers.length - filled.length;
        return row(entry, {
          value:
            filled.length === 0
              ? "—"
              : filled.map((b) => `${b.position.value}: ${b.person_name.value}`).join("; ") +
                (gaps > 0 ? ` (${gaps} jawatan belum lengkap / incomplete)` : ""),
          confidence:
            filled.length === 0
              ? "missing"
              : gaps > 0
                ? "check"
                : worst(...filled.map((b) => worst(b.position.confidence, b.person_name.confidence))),
          source: filled.map((b) => b.person_name.source_ref?.snippet ?? "").join("; "),
        });
      }
      case "figures": {
        const known = e.figures.filter(
          (f) => f.amount_cents.confidence !== "missing" && f.amount_cents.value !== null
        );
        return row(entry, {
          value:
            known.length === 0
              ? "—"
              : known
                  .map((f) => `${f.description.value}: ${formatRm(f.amount_cents.value as number)}`)
                  .join("; "),
          confidence:
            known.length === 0
              ? "missing"
              : worst(...known.map((f) => worst(f.description.confidence, f.amount_cents.confidence))),
          source: known.map((f) => f.amount_cents.source_ref?.snippet ?? "").join("; "),
        });
      }
    }
  });
}

function row(
  entry: (typeof EROSES_ANNUAL_RETURN_MAP)[number],
  data: { value: string; confidence: Confidence; source: string },
  /** Replaces the map's guidance when the whole pack does not apply. Keeping
   *  the original note there would explain how to fill a box we are telling
   *  them not to fill. */
  noteOverride?: string
): PastePackRow {
  return {
    erosesField: entry.erosesField,
    erosesFieldEn: entry.erosesFieldEn,
    value: data.value,
    confidence: data.confidence,
    source: data.source,
    note: noteOverride ?? entry.note,
  };
}
