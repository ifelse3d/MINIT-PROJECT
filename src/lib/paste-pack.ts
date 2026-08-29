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

/**
 * G-1 (work order 27): one committee member as the ROSTER records them.
 * `nameOfficial` is the IC name (name_official) — the legal fact eROSES
 * wants; it is typed by a human against the IC, never AI-generated
 * (STATE §6: a transliterated name in a government form is a false filing).
 */
export type FilingRosterEntry = {
  name: string;
  position: string;
  nameOfficial: string | null;
  /** G2 (拍板 7 後半): the roster's own honorific/title column (migration
   *  32) — optional so every existing caller and fixture stays valid. */
  honorific?: string | null;
};

/** Trilingual single-string note, same shape the map's own notes use. */
const ROSTER_EMPTY_NOTE =
  "Senarai AJK belum ada dalam sistem — tambah ahli di halaman Ahli (atau import Excel), barulah ruangan ini ada nilai untuk ditampal. / " +
  "理事名单还没进系统 —— 去「成员」页添加（或导入 Excel），这一格才有东西可贴。 / " +
  "The committee roster is not in the system yet — add members on the Members page (or import the Excel), and this field fills itself.";

function rosterIncompleteNote(count: number): string {
  return (
    `${count} ahli jawatankuasa belum ada nama rasmi (seperti dalam IC) — lengkapkan di halaman Ahli, kemudian ruangan ini terbuka. Pemfailan disekat, bukan penambahan ahli. / ` +
    `有 ${count} 位理事还没填正式姓名（IC 上的写法）—— 去「成员」页补上，这一格就能用。挡的是申报，不挡加人。 / ` +
    `${count} committee member(s) have no official (IC) name yet — complete them on the Members page and this field unlocks. Filing is blocked, adding people is not.`
  );
}

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

export function buildPastePack(
  e: MeetingNotesExtraction,
  /**
   * G-1 (work order 27, 8/19 拍板 executed at last): the committee list the
   * Annual Return files comes from `committee_roster` — the society's actual
   * standing committee with IC names — NEVER from what the AI read off one
   * meeting's page (which mixes event helpers into a legal filing and has no
   * concept of an official name). No roster, or a roster with missing IC
   * names, BLOCKS that one field and says where to fix it.
   */
  roster: FilingRosterEntry[] = [],
): PastePackRow[] {
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
        // G-1: the ROSTER is the source — see the parameter note above.
        if (roster.length === 0) {
          return row(
            entry,
            { value: "—", confidence: "missing", source: "" },
            ROSTER_EMPTY_NOTE,
          );
        }
        const missingOfficial = roster.filter(
          (m) => (m.nameOfficial ?? "").trim() === "",
        );
        if (missingOfficial.length > 0) {
          // Blocked AT THE FILING, not at adding members (8/19 拍板): the
          // field stays empty and says exactly what unlocks it.
          return row(
            entry,
            { value: "—", confidence: "missing", source: "" },
            rosterIncompleteNote(missingOfficial.length),
          );
        }
        return row(entry, {
          value: roster
            .map((m) => `${m.position}: ${(m.nameOfficial as string).trim()}`)
            .join("; "),
          // Typed by a human against the IC — the human is the source.
          confidence: "confirmed",
          source: "committee_roster (Senarai AJK)",
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
