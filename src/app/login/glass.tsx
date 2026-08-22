// ---------------------------------------------------------------------------
// The sign-in screen's visual language, shared by /login and /reset-password.
//
// Extracted 2026-08-22, when /reset-password was added. Both screens are the
// same dark full-bleed surface from the "Minit Sign In" handoff, and a second
// hand-copied set of glass classes would have drifted the moment either was
// touched — two screens the user experiences as one thing must not be two
// definitions of it.
//
// Because the surface is dark in BOTH themes, these deliberately do not use the
// light-glass Card component or dark: variants — this surface is dark by design.
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

/** Glass panel fill + border + inset highlight, shared by card and inputs. */
export const GLASS_CARD =
  "border border-white/[0.16] bg-gradient-to-br from-white/[0.04] to-white/[0.01] shadow-[0_22px_52px_rgba(8,6,30,0.22),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[6px] backdrop-saturate-150";

/** Text input on glass. Placeholder colour is set explicitly: the browser
 *  default is unreadable here. `hasError` reddens the border. */
export function glassInputClass(hasError: boolean): string {
  return [
    "w-full rounded-[14px] border bg-white/[0.02] px-[18px] py-[15px] text-base text-white",
    "placeholder:text-white/50 outline-none backdrop-blur-[4px] transition-[background,border-color,box-shadow] duration-150",
    "focus:border-white/75 focus:bg-white/[0.26] focus:shadow-[0_0_0_4px_rgba(139,123,255,0.28)]",
    hasError ? "border-[rgba(255,150,150,0.7)]" : "border-white/[0.16]",
  ].join(" ");
}

/**
 * Full-bleed backdrop, layered back to front per the handoff:
 *   1. #0f1020 fallback — shows if the photo is missing, never a white flash
 *   2. the photo at public/login-bg.jpg, cover/centred, drifting very slowly
 *   3. dark scrim (115deg) — tuned so white type on 4% glass stays legible
 *   4. purple glow, centred slightly above the middle
 *
 * Fixed at z-0 (not a negative z-index: the shell's .v2-root paints its own
 * background, which would swallow a layer behind it) with the form above at
 * z-10. aria-hidden because it carries no information.
 */
export function LoginBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0f1020]">
      <div className="v2-login-photo absolute inset-0" />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(20,16,48,0.86)_0%,rgba(28,22,60,0.62)_42%,rgba(12,32,40,0.55)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,rgba(124,92,255,0.16)_0%,rgba(0,0,0,0)_60%)]" />
    </div>
  );
}
