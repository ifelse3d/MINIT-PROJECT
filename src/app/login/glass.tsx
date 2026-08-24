// ---------------------------------------------------------------------------
// The sign-in screen's visual language, shared by /login and /reset-password.
//
// Stage R (2026-08-25): the dark full-bleed photo + liquid-glass surface is
// gone — it ghosted on phones, failed contrast, and read as a template. Both
// screens are now a single centred card on the app's own clean background,
// in whichever ONE language the visitor picked. Two screens the user
// experiences as one thing must not be two definitions of it, so the shared
// classes stay here.
// ---------------------------------------------------------------------------

/** Minimum for a NEW password, enforced in the browser.
 *
 *  ⚠ Supabase's own project minimum is SEPARATE. J set it to 8 on 2026-08-22
 *  (Authentication → Sign In / Providers → Email). These two numbers must move
 *  together: the browser one only decides how kindly the person is told. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Mirrors the project's "Password requirements" setting, which J set to
 * "Lowercase, uppercase letters, digits and symbols" on 2026-08-22.
 *
 * 🔴 WHY THIS EXISTS AT ALL. Supabase enforces it server-side, so the account
 * is safe either way — but the rejection comes back as a generic error, and
 * this form turned every sign-up failure into "try another email or a longer
 * password". Someone typing `password1` would be told their password was too
 * SHORT, change nothing, and fail again. A rule the person cannot see is a rule
 * they cannot obey.
 *
 * ⚠ If the Supabase setting is ever changed, change this with it. Being
 * stricter here than the server is harmless; being looser puts the unhelpful
 * error message back.
 */
export function passwordRequirementProblem(password: string): "length" | "classes" | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "length";
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  // Anything that is not a letter, a digit or whitespace counts as a symbol —
  // the same shape Supabase uses. Deliberately not a fixed list: telling people
  // which punctuation is "allowed" is how you get everyone using "!".
  const hasSymbol = /[^A-Za-z0-9\s]/.test(password);
  return hasLower && hasUpper && hasDigit && hasSymbol ? null : "classes";
}

/** The one centred card both auth screens sit in. */
export const AUTH_CARD = "v2-glass px-5 pb-6 pt-7 sm:px-8";

/** Text input for the auth forms. `hasError` reddens the border. */
export function authInputClass(hasError: boolean): string {
  return [
    "w-full rounded-xl border bg-[color:var(--v2-card)] px-4 py-3 text-base text-[color:var(--v2-text)]",
    "placeholder:text-[color:var(--v2-text-soft)]/60 outline-none transition-[border-color,box-shadow] duration-150",
    "focus:border-[color:var(--v2-primary)] focus:shadow-[0_0_0_3px_rgba(91,75,214,0.18)]",
    hasError ? "border-red-400" : "border-[color:var(--v2-outline-border)]",
  ].join(" ");
}
