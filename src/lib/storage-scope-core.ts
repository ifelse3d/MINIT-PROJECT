// ---------------------------------------------------------------------------
// STORAGE SCOPE — the React-free half (S0-4, 2026-08-25).
//
// Plain functions only, no "use client": this module is imported by data
// modules (local-events.ts, minutes-storage.ts) that server actions also
// import for their types and guards, and a client-directive module cannot sit
// on that path. The React provider that SETS the scope lives in
// src/lib/storage-scope.tsx.
//
// Key contract: `minit:<userId>:<orgId>:<what>` = someone's records, cleared
// on sign-out / delete-organisation; `minit.<what>` = device preferences,
// kept. See storage-scope.tsx for the reasoning.
// ---------------------------------------------------------------------------

export const ANON_SCOPE = "anon:none";

// Set by StorageScopeProvider during render — React renders the provider
// before its children, so any child's effect sees the right value. On the
// server this stays ANON_SCOPE and is never used to touch storage.
let currentScope = ANON_SCOPE;

export function setCurrentScope(scope: string): void {
  currentScope = scope;
}

/** `minit:<userId>:<orgId>:<base>` for the current signed-in scope. */
export function scopedKey(base: string): string {
  return `minit:${currentScope}:${base}`;
}

/**
 * One-time adoption of a pre-scoping blob: if the scoped key is empty and the
 * legacy (global) key holds something, MOVE it — the first signed-in person to
 * touch the data on this device becomes its owner, and the global copy stops
 * existing so the next account cannot read it. Validation stays the caller's
 * job, exactly as before.
 */
export function adoptLegacyKey(scoped: string, legacy: string): void {
  try {
    if (window.localStorage.getItem(scoped) != null) return;
    const raw = window.localStorage.getItem(legacy);
    if (raw == null) return;
    window.localStorage.setItem(scoped, raw);
    window.localStorage.removeItem(legacy);
  } catch {
    // Storage unavailable — nothing to adopt.
  }
}

/** Data keys from before scoping existed, cleared on sign-out too. */
const LEGACY_DATA_KEYS = [
  "minit.minutes.v1",
  "minit.constitution.v1",
  "minit.events",
];

/**
 * Remove every record this browser holds: all `minit:`-prefixed keys (every
 * scope — a shared laptop must not keep the previous member's records after
 * sign-out) plus the known pre-scoping data keys. Preferences (`minit.` dot
 * keys except the legacy data ones) survive.
 */
export function clearMinitLocalData(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith("minit:")) doomed.push(k);
    }
    for (const k of [...doomed, ...LEGACY_DATA_KEYS]) {
      window.localStorage.removeItem(k);
    }
  } catch {
    // Storage unavailable — nothing stored, nothing to clear.
  }
}
