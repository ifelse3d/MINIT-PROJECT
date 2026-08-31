import type {
  ConstitutionExtraction,
  LedgerExtraction,
  MeetingNotesExtraction,
  TextField,
} from "@/lib/extraction";

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

/**
 * The same rule for the OPTIONAL header/closing scalars G1 added (MASA, the
 * verbatim headcount, the adjournment sentence). Absent on both sides stays
 * absent — parseMeetingNotesExtraction prunes what a page never had, and a
 * merge must not resurrect a field as an empty review row.
 *
 * 🔴 Regression this guards (found on 真件 A, work order 100 Stage 1): this
 * file predates G1, and its merge returned an object literal WITHOUT these
 * keys — so page 2 of any meeting silently deleted the MASA and "AJK yang
 * hadir : 33 orang" that page 1 had read. The fields were lost between two
 * correct readings.
 */
function mergeOptionalScalar<T extends Scalar>(
  existing: T | undefined,
  incoming: T | undefined,
): T | undefined {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return mergeScalar(existing, incoming);
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
    // G1's optional header/closing fields (真件 A regression — see
    // mergeOptionalScalar). The signature block prefers the page that HAS
    // one; when both do, the existing one may carry human confirmations.
    meeting_time: mergeOptionalScalar(existing.meeting_time, incoming.meeting_time),
    attendance_count: mergeOptionalScalar(
      existing.attendance_count,
      incoming.attendance_count,
    ),
    adjournment: mergeOptionalScalar(existing.adjournment, incoming.adjournment),
    prepared_by: existing.prepared_by ?? incoming.prepared_by,
    endorsed_by: existing.endorsed_by ?? incoming.endorsed_by,
    attendees: [...existing.attendees, ...newAttendees],
    resolutions: [...existing.resolutions, ...incoming.resolutions],
    figures: [...existing.figures, ...incoming.figures],
    // Optional on purpose: absent on both sides stays absent (the e-Invois
    // panel must not appear over a document that never had one).
    financial_resolutions:
      existing.financial_resolutions || incoming.financial_resolutions
        ? [
            ...(existing.financial_resolutions ?? []),
            ...(incoming.financial_resolutions ?? []),
          ]
        : undefined,
    // §4-② markers: another page may be where the second meeting shows.
    other_meetings:
      existing.other_meetings || incoming.other_meetings
        ? [...(existing.other_meetings ?? []), ...(incoming.other_meetings ?? [])]
        : undefined,
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

/** Hard Rule 1's "nothing here" — the stand-in for a side of the merge whose
 *  organisation block is absent entirely. */
const MISSING_FIELD: TextField = {
  value: "",
  confidence: "missing",
  source_ref: null,
};

/**
 * §2 (104): the society's own name/address/registration number, across the
 * pages of one constitution. Page 1 (or segment 1 of a long PDF) is where they
 * are printed, so a later page reads them `missing` — mergeScalar's rule keeps
 * the real reading and never lets a blank later page erase it. Absent on both
 * sides stays absent (a constitution read before §2 existed has no block).
 *
 * Exported because the constitution REVIEW page merges page by page too, on
 * the device, and a second copy of this rule there is a second place for it to
 * drift (CLAUDE.md rule 13: pure logic goes to src/lib BEFORE the UI divides).
 */
export function mergeConstitutionOrganisations(
  existing: ConstitutionExtraction["organisation"],
  incoming: ConstitutionExtraction["organisation"],
): ConstitutionExtraction["organisation"] {
  if (!existing && !incoming) return undefined;
  return {
    registered_name: mergeScalar(
      existing?.registered_name ?? MISSING_FIELD,
      incoming?.registered_name ?? MISSING_FIELD,
    ),
    registered_address: mergeScalar(
      existing?.registered_address ?? MISSING_FIELD,
      incoming?.registered_address ?? MISSING_FIELD,
    ),
    registration_no: mergeScalar(
      existing?.registration_no ?? MISSING_FIELD,
      incoming?.registration_no ?? MISSING_FIELD,
    ),
  };
}

/** A-5 (work order 51): several photographed pages of one constitution, sent
 *  together from the home door. Clauses append in page order; the title keeps
 *  the first real reading (page 1 carries it; later pages read "missing"). */
export function mergeConstitutionExtractions(
  existing: ConstitutionExtraction,
  incoming: ConstitutionExtraction,
): ConstitutionExtraction {
  return {
    document_title: mergeScalar(existing.document_title, incoming.document_title),
    organisation: mergeConstitutionOrganisations(
      existing.organisation,
      incoming.organisation,
    ),
    clauses: [...existing.clauses, ...incoming.clauses],
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
