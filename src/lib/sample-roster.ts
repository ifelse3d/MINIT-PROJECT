import type { AgmPackParams, CommitteeMember, MinutesForExtract } from "@/lib/agm-pack";

// ---------------------------------------------------------------------------
// SAMPLE DATA for the Phase 4 foundation (no API key connected yet).
// Entirely FICTIONAL. Drives the /agm-pack screen so it is fully clickable
// and screenshot-ready. Replaced by the real committee_roster + org settings
// once Supabase is connected.
// ---------------------------------------------------------------------------

export const SAMPLE_ROSTER: CommitteeMember[] = [
  { position: "Pengerusi", personName: "Tan Ah Kow (陈亚九)" },
  { position: "Timbalan Pengerusi", personName: "S. Muniandy" },
  { position: "Setiausaha", personName: "Lim Bee Hoon (林美云)" },
  { position: "Bendahari", personName: "Wong Siew Mei (黄小梅)" },
  { position: "Ahli Jawatankuasa", personName: "Ahmad bin Salleh" },
  { position: "Ahli Jawatankuasa", personName: "Lee Chong Wei (李宗伟)" },
  { position: "Ahli Jawatankuasa", personName: "R. Kavitha" },
];

/** The demo shows the org-setting path — with its visible warning — because
 * no constitution has been ingested yet (that is Phase 5). */
export const sampleAgmPackParams: AgmPackParams = {
  orgName: "Persatuan Penganut Dewa Guan Di Selangor — Cawangan Klang",
  orgRegistrationNo: "PPM-000-00-00000000",
  orgAddress: "12, Jalan Meru Indah 5, 41050 Klang, Selangor",
  year: 2026,
  meetingDateIso: "2026-08-30",
  meetingTimeText: "10:00 pagi",
  venue: "Dewan utama tokong, Jalan Meru, Klang",
  noticePeriodDays: 14,
  noticePeriodSource: "org_setting",
  roster: SAMPLE_ROSTER,
  secretaryName: "Lim Bee Hoon (林美云)",
  confirmed: null,
};

/** A fictional CONFIRMED minutes doc containing one signatory resolution —
 * feeds the bank-resolution extract demo. */
export const sampleConfirmedMinutes: MinutesForExtract = {
  orgName: sampleAgmPackParams.orgName,
  orgRegistrationNo: sampleAgmPackParams.orgRegistrationNo,
  meetingType: "committee",
  meetingDateIso: "2026-06-14",
  status: "confirmed",
  confirmedBy: "Lim Bee Hoon (Setiausaha)",
  confirmedOnIso: "2026-06-20",
  resolutions: [
    "Meluluskan perbelanjaan RM3,500 untuk baik pulih bumbung dewan.",
    "Meluluskan penukaran penandatangan akaun bank persatuan: menambah " +
      "Bendahari baharu Wong Siew Mei dan menggugurkan En. Ooi Kim Seng, " +
      "berkuat kuasa serta-merta. Mana-mana dua daripada tiga penandatangan.",
    "Menetapkan tarikh Mesyuarat Agung Tahunan 2026 pada 30 Ogos 2026.",
  ],
  officeBearers: [
    { position: "Pengerusi", personName: "Tan Ah Kow" },
    { position: "Setiausaha", personName: "Lim Bee Hoon" },
    { position: "Bendahari", personName: "Wong Siew Mei" },
  ],
};
