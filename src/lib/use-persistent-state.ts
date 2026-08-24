"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { adoptLegacyKey } from "@/lib/storage-scope-core";

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

// S0-4 (2026-08-25): the old `preserveUnreadable` helper is GONE. It copied an
// unreadable blob to a second key "so a human could recover it from the
// console" — but these blobs hold donor names and phone numbers, and a second
// copy under a key nothing ever clears is a PDPA leak, not a favour. The
// original blob already survives under its own key while `corrupt` is true
// (the write-back below is suppressed), which is all the recovery window a
// human needs.

export function usePersistentState<T>(
  key: string,
  initial: T,
  /**
   * Shape guard for whatever is already in storage. Return true only if the
   * parsed value really is a `T`. Omit it only where a wrong shape cannot hurt
   * (e.g. a boolean preference).
   */
  validate?: (parsed: unknown) => boolean,
  /**
   * S0-4: the pre-scoping (global) key this data used to live under. When the
   * scoped key is empty and the legacy key holds something, the blob is MOVED
   * to the scoped key once, then read as normal.
   */
  legacyKey?: string,
): [T, Dispatch<SetStateAction<T>>, PersistMeta] {
  const [value, setValue] = useState<T>(initial);
  // The seed, pinned: callers pass literals, and the hydrate effect must be
  // able to fall back to it on a key change without re-running per render.
  const initialRef = useRef(initial);
  // WHICH key has been hydrated, not just whether one has: on a key change
  // (org switch) the write-back below must stay silent until the NEW key's
  // read has landed, or it would copy the previous scope's records into the
  // new scope's key.
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const loaded = hydratedKey !== null;
  // WHICH key proved unreadable, so a key change (org switch) clears the flag
  // by comparison instead of by an extra setState in the hydrate effect.
  const [corruptKey, setCorruptKey] = useState<string | null>(null);
  const corrupt = corruptKey === key;
  const [quotaFull, setQuotaFull] = useState(false);

  // Hydrate once on mount (and again if the key changes — S0-4: the key now
  // carries the user/org scope, so switching organisation re-hydrates).
  useEffect(() => {
    try {
      if (legacyKey && legacyKey !== key) {
        adoptLegacyKey(key, legacyKey);
      }
      const raw = window.localStorage.getItem(key);
      if (raw == null) {
        // A key change (org switch) with nothing stored under the new key must
        // not keep showing the PREVIOUS scope's records.
        setValue(initialRef.current);
      }
      if (raw != null) {
        const parsed: unknown = JSON.parse(raw);
        if (!validate || validate(parsed)) {
          setValue(parsed as T);
        } else {
          // Recognisable JSON of the wrong shape. Keep the seed rather than
          // handing malformed records to the money code. The blob stays under
          // its own key (the write-back below is suppressed while `corrupt`),
          // so nothing is destroyed — and no second copy of personal data is
          // made (S0-4).
          setCorruptKey(key);
        }
      }
    } catch {
      // Malformed JSON or storage disabled — fall back to the initial value.
      setCorruptKey(key);
    }
    setHydratedKey(key);
    // `validate` is expected to be a stable module-level function; including it
    // in the deps would re-hydrate on every render for inline-arrow callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist on every change, but only after the first hydration read so we
  // never overwrite stored data with the seed on the very first render.
  useEffect(() => {
    // Only write once THIS key's own hydration has landed (see hydratedKey).
    if (hydratedKey !== key) return;
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
  }, [key, value, hydratedKey, corrupt]);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to do: the in-memory reset below is what the user asked for.
    }
    setValue(initial);
    setCorruptKey(null);
    // `initial` is a literal/seed constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue, { loaded, corrupt, quotaFull, reset }];
}
