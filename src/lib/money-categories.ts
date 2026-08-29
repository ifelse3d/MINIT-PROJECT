// ---------------------------------------------------------------------------
// MONEY CATEGORIES — the single source (D1, work order 56, 2026-08-29).
//
// One list for income types and one for expense types, each entry carrying
// the eROSES Penyata Kewangan FIELD it lands in (see eroses-penyata.ts for
// the field taxonomy, transcribed field-by-field from J's own eROSES account
// on 2026-08-29). The lists used to live inside two different components
// (manual-income.tsx and expenses-view.tsx); they moved here BEFORE the UI
// merge so the classifier, the entry grid and the expenses form all read the
// same truth (CLAUDE.md rule 13: pure logic goes to src/lib before the UI
// divides).
//
// ⚠ `value` is what gets STORED (donations.purpose prefix / expenses
// .category) — changing a value orphans every old row that used it. Add new
// entries; never rename existing values.
// ---------------------------------------------------------------------------

import type { PenyataFieldId } from "./eroses-penyata";

export type MoneyCategory = {
  /** Stored value (BM). Never rename — old rows carry it. */
  value: string;
  bm: string;
  zh: string;
  en: string;
  /** Which eROSES Penyata Kewangan field this category's ringgit lands in. */
  eroses: PenyataFieldId;
};

/** Income categories cover more than donations: fees, rental, grants, etc.
 *  (Moved verbatim from manual-income.tsx; eROSES fields added.) */
export const INCOME_CATEGORIES: MoneyCategory[] = [
  { value: "Derma", bm: "Derma", zh: "捐款", en: "Donation", eroses: "1.1.derma" },
  { value: "Yuran ahli", bm: "Yuran ahli", zh: "会员费", en: "Membership fee", eroses: "1.1.yuran_ahli" },
  // eROSES files rental income under 1.3 Pendapatan Pelaburan → Pendapatan
  // sewa — the society is renting an asset out, however odd "investment"
  // sounds for a temple hall.
  { value: "Sewa dewan", bm: "Sewa dewan", zh: "礼堂租金", en: "Hall rental", eroses: "1.3.sewa" },
  { value: "Pendapatan acara", bm: "Pendapatan acara", zh: "活动收入", en: "Event income", eroses: "1.2.lain" },
  // Which KIND of grant (kerajaan/swasta/individu) is not asked at entry —
  // the honest cell is 1.4's "other grants" until somebody needs the split.
  { value: "Geran", bm: "Geran", zh: "拨款", en: "Grant", eroses: "1.4.lain" },
  { value: "Faedah bank", bm: "Faedah bank", zh: "银行利息", en: "Bank interest", eroses: "1.3.faedah" },
  { value: "Lain-lain", bm: "Lain-lain", zh: "其他", en: "Other", eroses: "x.lain_pendapatan" },
];

/** Expense categories. (Moved verbatim from expenses-view.tsx; eROSES fields
 *  added, plus "Kebajikan & khairat" — the welfare/bereavement spending every
 *  temple and clan association actually has, which eROSES files under 2.1 and
 *  the old list had no home for.) */
export const EXPENSE_CATEGORIES: MoneyCategory[] = [
  { value: "Perbelanjaan acara", bm: "Perbelanjaan acara", zh: "活动开支", en: "Event spending", eroses: "2.2.aktiviti" },
  { value: "Utiliti", bm: "Utiliti (air/elektrik)", zh: "水电杂费", en: "Utilities", eroses: "2.3.utiliti" },
  // eROSES puts maintenance under 2.3 Kos Pentadbiran (Penyelenggaraan).
  { value: "Penyelenggaraan", bm: "Penyelenggaraan", zh: "维修保养", en: "Maintenance", eroses: "2.3.penyelenggaraan" },
  { value: "Alat tulis", bm: "Alat tulis & pejabat", zh: "文具与办公", en: "Stationery & office", eroses: "2.3.office" },
  { value: "Sewa", bm: "Sewa", zh: "租金", en: "Rent", eroses: "2.3.sewa" },
  { value: "Pengangkutan", bm: "Pengangkutan", zh: "交通", en: "Transport", eroses: "2.3.pengangkutan" },
  { value: "Kebajikan & khairat", bm: "Kebajikan & khairat", zh: "慈惠与帛金", en: "Welfare & bereavement", eroses: "2.1.kebajikan" },
  { value: "Lain-lain", bm: "Lain-lain", zh: "其他", en: "Other", eroses: "2.4.lain" },
];

/**
 * Which income category a stored `purpose` names, or null when it names none.
 *
 * The register's convention (from the old single-row form, kept by the merged
 * grid): purpose is either the category value alone ("Geran"), the category
 * with a note ("Geran — banjir 2026"), or free text. Free text still matches
 * when it STARTS with a category word ("Derma am" → Derma) — longest value
 * first, so a future "Derma khas" category would beat plain "Derma".
 */
export function incomeCategoryFromPurpose(purpose: string): MoneyCategory | null {
  const p = purpose.trim().toLowerCase();
  if (p === "") return null;
  const byLength = [...INCOME_CATEGORIES].sort(
    (a, b) => b.value.length - a.value.length,
  );
  for (const c of byLength) {
    if (p.startsWith(c.value.toLowerCase())) return c;
  }
  return null;
}

/** Same idea for an expense row's stored category ("Lain-lain: detail"). */
export function expenseCategoryFromStored(stored: string | null): MoneyCategory | null {
  if (stored === null || stored.trim() === "") return null;
  const s = stored.trim().toLowerCase();
  const byLength = [...EXPENSE_CATEGORIES].sort(
    (a, b) => b.value.length - a.value.length,
  );
  for (const c of byLength) {
    if (s.startsWith(c.value.toLowerCase())) return c;
  }
  return null;
}
