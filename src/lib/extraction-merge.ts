import type { LedgerExtraction, MeetingNotesExtraction } from "@/lib/extraction";

// ---------------------------------------------------------------------------
// G-2 (2026-08-25, J #10): MIXED INPUT — a photo taken AFTER typing (or after
// an earlier photo) ADDS to what is there; it never wipes it.
//
// Before this, `onPhotoPicked` replaced the whole extraction. Someone who
// typed half the meeting in and then remembered the whiteboard photo lost
// every row they had typed — the exact opposite of the constitution flow,
// which has added page by page since Phase 5. Same for the ledger: page 2 of
// the donation book obliterated the un-added rows of page 1.
//
// THE RULES, and why each one:
//   * A scalar the human already settled stays settled. `confirmed` means a
//     person either verified the value or asserted the fact is absent — the
//     human is the source of truth (Hard Rule 1), and a model reading page 2
//     does not outrank them. An UNSETTLED scalar takes the new reading when
//     the new reading actually has one.
//   * List rows are APPENDED, never re-read: the rows already on screen may
//     carry confirmations and hand edits. Attendees are de-duplicated by name
//     (same rule as the committee-list picker — ticking somebody twice is a
//     slip, not an instruction to record them twice). Resolutions, figures,
//     office bearers and ledger rows are appended as-is: two similar
//     resolutions can genuinely both exist, money duplicates are caught by
//     findDuplicateDonations in the review table, and a wrong row can be
//     deleted by hand — silently dropping a right one cannot be undone.
// ---------------------------------------------------------------------------

type Scalar = {
  value: string;
  confidence: "confirmed" | "check" | "missing";
  source_ref: { location: string; snippet: string } | null;
};

/** The settled/unsettled rule above, for one field. */
function mergeScalar<T extends Scalar>(existing: T, incoming: T): T {
  if (existing.confidence === "confirmed") return existing;
  if (incoming.confidence !== "missing" && incoming.value !== "") return incoming;
  // Neither side knows better than the other; keep what the person was
  // already looking at (it may be a "check" value they were about to fix).
  return existing.confidence !== "missing" ? existing : incoming;
}

/** True when there is anything worth protecting from a wholesale replace. */
export function hasMeetingContent(e: MeetingNotesExtraction): boolean {
  return (
    e.meeting_type.value !== "" ||
    e.meeting_date.value !== "" ||
    e.meeting_venue.value !== "" ||
    e.meeting_type.confidence === "confirmed" ||
    e.meeting_date.confidence === "confirmed" ||
    e.meeting_venue.confidence === "confirmed" ||
    e.attendees.length > 0 ||
    e.resolutions.length > 0 ||
    e.figures.length > 0 ||
    e.office_bearers.length > 0
  );
}

export function mergeMeetingExtractions(
  existing: MeetingNotesExtraction,
  incoming: MeetingNotesExtraction,
): MeetingNotesExtraction {
  const have = new Set(
    existing.attendees.map((a) => a.name.value.trim().toLowerCase()),
  );
  const newAttendees = incoming.attendees.filter((a) => {
    const key = a.name.value.trim().toLowerCase();
    if (key === "" || !have.has(key)) {
      if (key !== "") have.add(key);
      return true;
    }
    return false;
  });

  return {
    meeting_type: mergeScalar(existing.meeting_type, incoming.meeting_type),
    // The society's own name for an "other" meeting is typed by a person and
    // never read from a page — the existing one always survives.
    meeting_type_label:
      (existing.meeting_type_label ?? "").trim() !== ""
        ? existing.meeting_type_label
        : incoming.meeting_type_label,
    meeting_date: mergeScalar(existing.meeting_date, incoming.meeting_date),
    meeting_venue: mergeScalar(existing.meeting_venue, incoming.meeting_venue),
    attendees: [...existing.attendees, ...newAttendees],
    resolutions: [...existing.resolutions, ...incoming.resolutions],
    figures: [...existing.figures, ...incoming.figures],
    office_bearers: [...existing.office_bearers, ...incoming.office_bearers],
  };
}

export function mergeLedgerExtractions(
  existing: LedgerExtraction,
  incoming: LedgerExtraction,
): LedgerExtraction {
  return {
    page_title: mergeScalar(existing.page_title, incoming.page_title),
    rows: [...existing.rows, ...incoming.rows],
  };
}

/** "page1.jpg ＋ page2.jpg" — what the source badge shows after a merge. */
export function mergedSourceLabel(
  existing: string | null,
  fileName: string,
): string {
  if (!existing) return fileName;
  // I-4③ (26 号报告 §3-6): once the badge has collapsed to "N × 📄", the file
  // names are gone — splitting it on " ＋ " counts ONE thing and the total
  // shrank on every following page (6 pages showed as 4). Parse the count
  // back out instead.
  const collapsed = /^(\d+) × 📄$/.exec(existing);
  if (collapsed) return `${Number(collapsed[1]) + 1} × 📄`;
  const combined = `${existing} ＋ ${fileName}`;
  // A badge, not an audit trail: after a few pages, say how many instead.
  if (combined.length <= 80) return combined;
  const pages = existing.split(" ＋ ").length + 1;
  return `${pages} × 📄`;
}
