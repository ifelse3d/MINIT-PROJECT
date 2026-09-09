"use client";

// ---------------------------------------------------------------------------
// B-5④ (工作单 31): the ledger page asks "is this page income or spending?"
// BEFORE burning an AI action on it. When the answer is "spending", the photo
// the person already picked travels here — a module-level, in-memory hand-off
// — so /money/expenses can offer to read it without asking them to find the
// file again. Same pattern as intake-handoff, but for a File: a File cannot
// cross a full reload (and must not go into localStorage), so this survives
// exactly one client-side navigation, which is the only trip it makes.
//
// 🔴 Consuming it does NOT call the AI. The expenses page shows the file and
// a button that says its cost — reading is always an explicit, priced tap.
// ---------------------------------------------------------------------------

let handedFile: File | null = null;

export function handExpensePhoto(file: File): void {
  handedFile = file;
}

/** Take the photo (once). Returns null when nothing was handed over. */
export function consumeExpensePhoto(): File | null {
  const file = handedFile;
  handedFile = null;
  return file;
}

// ---------------------------------------------------------------------------
// 136 (J 9/9, decided in 135 §B): a ledger row the reader labelled EXPENSE
// ("礼堂 RM1,000", "晚宴开销 RM9,150") gets a one-tap "record as spending".
// The row's FIELDS — not a photo — travel to /money/expenses and pre-fill the
// form; the person still presses save (recordExpense) — nothing is written
// by the tap itself. Same one-shot sessionStorage courier as intake-handoff:
// written once, read once, stale after half an hour, shape-checked on read.
// No donor data rides along (an expense line has none) — PDPA Hard Rule 5.
// ---------------------------------------------------------------------------

const FIELDS_KEY = "minit.expense-fields.v1";
const FIELDS_MAX_AGE_MS = 30 * 60 * 1000;

export type ExpenseFieldsParcel = {
  /** Integer sen as the reader saw it; null when it was not legible. */
  amountCents: number | null;
  /** The row's purpose, verbatim ("礼堂", "晚宴开销"). */
  description: string;
  /** YYYY-MM-DD, or "" when the row had no date. */
  spentAtIso: string;
  /** A small preview of the page the row came from, when the review had one. */
  photoDataUrl?: string | null;
  /** Which page it came from, for the notice ("from 账页.jpg, row 5"). */
  sourceLabel: string;
  at: number;
};

export function handExpenseFields(parcel: Omit<ExpenseFieldsParcel, "at">): void {
  try {
    window.sessionStorage.setItem(FIELDS_KEY, JSON.stringify({ ...parcel, at: Date.now() }));
  } catch {
    // Storage unavailable (or the preview too big): the person lands on the
    // expenses page empty-handed and types it — recoverable. Try once more
    // without the picture so the numbers at least arrive.
    try {
      window.sessionStorage.setItem(
        FIELDS_KEY,
        JSON.stringify({ ...parcel, photoDataUrl: null, at: Date.now() }),
      );
    } catch {
      /* give up quietly */
    }
  }
}

function asFieldsParcel(v: unknown): ExpenseFieldsParcel | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.description !== "string" || typeof o.spentAtIso !== "string") return null;
  if (typeof o.sourceLabel !== "string" || typeof o.at !== "number") return null;
  if (o.amountCents !== null && !(typeof o.amountCents === "number" && Number.isInteger(o.amountCents))) {
    return null;
  }
  return {
    amountCents: o.amountCents as number | null,
    description: o.description,
    spentAtIso: o.spentAtIso,
    photoDataUrl: typeof o.photoDataUrl === "string" ? o.photoDataUrl : null,
    sourceLabel: o.sourceLabel,
    at: o.at,
  };
}

/** Read and DELETE the fields parcel; null when there is none or it is stale. */
export function consumeExpenseFields(): ExpenseFieldsParcel | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(FIELDS_KEY);
    if (raw != null) window.sessionStorage.removeItem(FIELDS_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  let parcel: ExpenseFieldsParcel | null = null;
  try {
    parcel = asFieldsParcel(JSON.parse(raw));
  } catch {
    parcel = null;
  }
  if (!parcel || Date.now() - parcel.at > FIELDS_MAX_AGE_MS) return null;
  return parcel;
}
