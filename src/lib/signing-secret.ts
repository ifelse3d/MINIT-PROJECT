// ---------------------------------------------------------------------------
// THE HMAC SIGNING SECRET (work order 122 §2, 2026-09-07).
//
// WHAT CHANGED. Until today every HMAC in the app — the receipt QR token
// (receipt-verify.ts) and the constitution continuation token
// (constitution-continuation.ts) — was signed with SUPABASE_SERVICE_ROLE_KEY.
// The HMAC itself never leaks that key (121 §2-2 agrees), but the COUPLING is
// the problem: the service-role key is the one secret the security routine
// says to ROTATE the moment it might have leaked, and rotating it would turn
// every receipt QR already printed on paper into "not issued" — calling a
// genuine receipt fake, which /verify/resit says of itself is the worst
// failure it has.
//
// SO: a dedicated RECEIPT_SIGNING_SECRET, generated once, used only for
// signing, and never rotated. Two rules keep the switch harmless:
//
//   1. UNSET MUST NOT BREAK. A deployment without the new variable keeps
//      signing with the service-role key exactly as before (D8 idiom: the
//      code tolerates the environment being behind the code).
//   2. OLD TOKENS KEEP VERIFYING. Verification tries EVERY secret in the
//      list, newest first, so a QR printed before the variable existed still
//      verifies after it is set. Signatures are derived per-secret, so a
//      token proves possession of one of them, never a mix.
//
// 🔴 Server-side only. Values are read, never logged, never returned to a
// client.
// ---------------------------------------------------------------------------
import "server-only";

/** The secret NEW tokens are signed with. Empty string = this deployment
 *  cannot sign at all (callers already treat "" as "no token"). */
export function primarySigningSecret(): string {
  const dedicated = process.env.RECEIPT_SIGNING_SECRET ?? "";
  if (dedicated !== "") return dedicated;
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

/** Every secret a token MAY have been signed with, newest first, blanks
 *  removed. Verification walks this list; an empty list verifies nothing. */
export function verifySigningSecrets(): string[] {
  const out: string[] = [];
  for (const v of [
    process.env.RECEIPT_SIGNING_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ]) {
    if (typeof v === "string" && v !== "" && !out.includes(v)) out.push(v);
  }
  return out;
}
