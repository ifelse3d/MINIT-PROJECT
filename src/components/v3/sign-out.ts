"use client";

import { getSupabaseBrowser } from "@/db/supabase-browser";
import { clearMinitLocalData } from "@/lib/storage-scope-core";

/** Sign out and land on /login — used by the top bar and the /more page,
 *  always behind the SignOutConfirm dialog (B-1, work order 32).
 *  Moved out of org-chip.tsx so the dialog component can import it without
 *  a circular import. */
export async function signOutToLogin(): Promise<void> {
  // S0-4: a shared laptop must not hand this person's register, minutes and
  // constitution to whoever signs in next. Device preferences (text size,
  // theme, language) survive — they are the device's, not the account's.
  clearMinitLocalData();
  await getSupabaseBrowser().auth.signOut();
  window.location.assign("/login");
}
