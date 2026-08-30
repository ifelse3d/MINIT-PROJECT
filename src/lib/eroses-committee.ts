// ---------------------------------------------------------------------------
// WHAT eROSES REQUIRES OF A COMMITTEE ROW — one list, three consumers
// (⑦, work order 89; J ruled 8/30 night: 「都要」— the FORM blocks and the
// FILING blocks; D48).
//
// The portal's Maklumat AJK step (matched against the real screens in H2,
// work order 69) shows each office bearer's position, name as on IC, e-mail
// and state, and demands the appointment date. Of those, the ones a filing
// cannot go out without are pinned here:
//   * the name itself (a seeded position row with no name is not a person),
//   * the name AS PRINTED ON THE IC (the only name the portal can match),
//   * the state (Negeri),
//   * the appointment date (Tarikh perlantikan).
// E-mail is shown by the portal but not treated as a hard gap here — the
// row is filed without it.
//
// WHO ENFORCES WHAT (D48):
//   * the add/edit FORM (members actions) refuses to save a row with a gap;
//   * the members TABLE paints gapped rows amber, names the gaps in the row,
//     and the banner jumps to the first one;
//   * the eROSES penyata flow's AJK step refuses the copy-pack while any
//     row still has a gap, and offers the fill right there.
// History rows and rows born from a roster photo / import keep their gaps
// (old data must not explode) — they are FLAGGED, never deleted.
//
// 🔴 The standing warning stays glued to every IC-name input: copy it from
// the identity card, NEVER transliterate (the 68-session precedent — an
// invented romanisation on a government form is a false filing).
// ---------------------------------------------------------------------------

export type ErosesCommitteeField =
  | "personName"
  | "nameOfficial"
  | "state"
  | "termStart";

export const EROSES_COMMITTEE_FIELD_LABELS: Record<
  ErosesCommitteeField,
  { bm: string; zh: string; en: string }
> = {
  personName: { bm: "Nama", zh: "姓名", en: "Name" },
  nameOfficial: {
    bm: "Nama dalam IC",
    zh: "身份证上的名字",
    en: "Name on IC",
  },
  state: { bm: "Negeri", zh: "州属", en: "State" },
  termStart: {
    bm: "Tarikh perlantikan",
    zh: "任命日期",
    en: "Appointment date",
  },
};

/** A committee row, however it was loaded — snake_case (DB) shape. */
export type ErosesCommitteeRowLike = {
  person_name?: string | null;
  name_official?: string | null;
  state?: string | null;
  term_start?: string | null;
};

const blank = (v: string | null | undefined) => (v ?? "").trim() === "";

/**
 * Which eROSES-required fields this row still lacks, in display order.
 * Pass `checkable` to limit the check to the columns the database actually
 * returned — a DB behind migration 37 has no `state` column, and a gap that
 * cannot be read must not block anybody (D8 fail-open).
 */
export function missingErosesCommitteeFields(
  row: ErosesCommitteeRowLike,
  checkable: readonly ErosesCommitteeField[] = [
    "personName",
    "nameOfficial",
    "state",
    "termStart",
  ],
): ErosesCommitteeField[] {
  const gaps: ErosesCommitteeField[] = [];
  const has = (f: ErosesCommitteeField) => checkable.includes(f);
  if (has("personName") && blank(row.person_name)) gaps.push("personName");
  if (has("nameOfficial") && blank(row.name_official)) gaps.push("nameOfficial");
  if (has("state") && blank(row.state)) gaps.push("state");
  if (has("termStart") && blank(row.term_start)) gaps.push("termStart");
  return gaps;
}

/** The gap names, joined for one language — "Nama dalam IC, Negeri". */
export function erosesGapList(
  gaps: readonly ErosesCommitteeField[],
  lang: "bm" | "zh" | "en",
): string {
  const sep = lang === "zh" ? "、" : ", ";
  return gaps.map((g) => EROSES_COMMITTEE_FIELD_LABELS[g][lang]).join(sep);
}

/**
 * The form's refusal, in the three-line joinUserError shape, naming exactly
 * which boxes are still empty (D48 — the human sentence the work order asks
 * for, not a bare "invalid").
 */
export function erosesCommitteeRefusal(
  gaps: readonly ErosesCommitteeField[],
): string {
  return [
    `Baris AJK ini masuk ke eROSES, jadi ruangan ini WAJIB diisi dahulu: ${erosesGapList(gaps, "bm")}. Nama IC disalin daripada kad pengenalan — jangan terjemah sendiri.`,
    `这一行会进 eROSES 的理事名单，所以这些格要先填好才能保存：${erosesGapList(gaps, "zh")}。身份证名字请照 IC 抄，不要自己音译。`,
    `This committee row goes into eROSES, so these boxes must be filled first: ${erosesGapList(gaps, "en")}. Copy the IC name from the identity card — never transliterate it yourself.`,
  ].join("\n");
}
