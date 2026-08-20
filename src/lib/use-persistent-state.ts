"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

// ---------------------------------------------------------------------------
// usePersistentState — a demo persistence layer backed by the browser's
// localStorage, so records survive a page refresh WITHOUT a database.
//
// This is deliberately a stop-gap for the pilot/demo. When the money register
// moves into Postgres (Phase B), swap the read/write here for scoped queries
// (by org_id, CLAUDE.md Hard Rule 5) — the component API stays identical, so
// no screen has to change. Nothing here touches the AI or money math; it only
// stores what the human has already confirmed.
//
// SSR-safe: the server render always uses `initial`; we hydrate from
// localStorage only after mount, avoiding a React hydration mismatch.
//
// 2026-07-28 AUDIT FIXES
//  * `validate`: the old code did `JSON.parse(raw) as T` inside a try/catch.
//    The catch handles MALFORMED json, not WRONG-SHAPED json — so a blob written
//    by an older build (or by another feature colliding on the key) was accepted
//    wholesale, and the money code then read `undefined.amountCents`, producing
//    NaN totals or a render crash. Callers can now pass a validator; anything
//    that fails it is discarded in favour of `initial`, and `corrupt` is set so
//    the UI can say "saved records could not be read".
//  * `quotaFull`: a failed write used to be swallowed entirely, so a treasurer
//    could keep working while nothing was actually being saved. Now reported.
//  * an unreadable blob is moved aside rather than overwritten by the seed, and
//    the write-back is suppressed while `corrupt` is true — otherwise the UI said
//    "your saved records could not be read" about data it had just destroyed.
// ---------------------------------------------------------------------------

export type PersistMeta = {
  /** True once we've read from localStorage (client only). */
  loaded: boolean;
  /** True when the stored value existed but failed `validate` and was dropped. */
  corrupt: boolean;
  /** True when the last write failed (storage full or disabled). */
  quotaFull: boolean;
  /** Wipe the stored value and fall back to the seed/initial value. */
  reset: () => void;
};

/**
 * Move an unreadable blob aside instead of losing it, so a human can still
 * recover it from the browser console if it mattered. Best-effort only.
 */
function preserveUnreadable(key: string, raw: string): void {
  try {
    window.localStorage.setItem(`${key}:unreadable-${Date.now()}`, raw);
  } catch {
    // Storage is full or disabled — nothing more we can do.
  }
}

export function usePersistentState<T>(
  key: string,
  initial: T,
  /**
   * Shape guard for whatever is already in storage. Return true only if the
   * parsed value really is a `T`. Omit it only where a wrong shape cannot hurt
   * (e.g. a boolean preference).
   */
  validate?: (parsed: unknown) => boolean,
): [T, Dispatch<SetStateAction<T>>, PersistMeta] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const [corrupt, setCorrupt] = useState(false);
  const [quotaFull, setQuotaFull] = useState(false);

  // Hydrate once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        const parsed: unknown = JSON.parse(raw);
        if (!validate || validate(parsed)) {
          setValue(parsed as T);
        } else {
          // Recognisable JSON of the wrong shape. Keep the seed rather than
          // handing malformed records to the money code — but PRESERVE the raw
          // string first. The UI tells the treasurer "the saved records could not
          // be read"; if we had already overwritten them with the seed that
          // message would be describing data we ourselves destroyed.
          preserveUnreadable(key, raw);
          setCorrupt(true);
        }
      }
    } catch {
      // Malformed JSON or storage disabled — fall back to the initial value.
      try {
        const raw = window.localStorage.getItem(key);
        if (raw != null) preserveUnreadable(key, raw);
      } catch {
        // Storage is unreadable entirely; nothing to preserve.
      }
      setCorrupt(true);
    }
    setLoaded(true);
    // `validate` is expected to be a stable module-level function; including it
    // in the deps would re-hydrate on every render for inline-arrow callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist on every change, but only after the first hydration read so we
  // never overwrite stored data with the seed on the very first render.
  useEffect(() => {
    if (!loaded) return;
    // Do NOT write while we are showing "your saved records could not be read":
    // this effect runs on the render where `loaded` flips, i.e. immediately after
    // hydration, so without this guard the seed would overwrite the unreadable
    // blob before the user had any chance to act on the warning.
    if (corrupt) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      setQuotaFull(false);
    } catch {
      // Storage full or unavailable. State still works in memory for this
      // visit, but the user MUST be told, because closing the tab loses it.
      setQuotaFull(true);
    }
  }, [key, value, loaded, corrupt]);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to do: the in-memory reset below is what the user asked for.
    }
    setValue(initial);
    setCorrupt(false);
    // `initial` is a literal/seed constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, { loaded, corrupt, quotaFull, reset }];
}
