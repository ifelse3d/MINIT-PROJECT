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
