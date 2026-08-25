// B-2 (2026-08-25): an invite code typed at SIGN-UP cannot be redeemed until
// the account exists and is signed in — email confirmation sits in between.
// So it waits on the device, and /orgs/join fills itself in from here after
// the first sign-in. Device storage, deliberately not the dot-prefix
// preference namespace: it is one-shot hand-off data, cleared on use.

const KEY = "minit.invite.pending";

export function stashInviteCode(code: string): void {
  const clean = code.trim().toUpperCase();
  if (clean === "") return;
  try {
    window.localStorage.setItem(KEY, clean);
  } catch {
    // storage unavailable — they retype the code on /orgs/join
  }
}

export function readStashedInviteCode(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearStashedInviteCode(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // fine — the code is used up server-side either way
  }
}
