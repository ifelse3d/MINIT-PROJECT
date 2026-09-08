"use client";

import { useCallback, useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// 130 §5 — THE BROWSER AS AN EXTERNAL STORE.
//
// Every "hydrate from the device after mount" in this app used to be
//   useEffect(() => setX(readFromBrowser()), [])
// which the lint rejects (react-hooks/set-state-in-effect): a setState in an
// effect body is a second render the first one could have avoided. A lazy
// initialiser is NOT the fix — the server has no localStorage, so the first
// client render would disagree with the server's HTML (hydration mismatch).
//
// useSyncExternalStore is the sanctioned answer: the SERVER snapshot is what
// the server rendered with (null / false / empty), the CLIENT snapshot is what
// the browser holds, and React swaps one for the other after hydration with no
// mismatch and no effect. These hooks are the shared plumbing; a screen
// DERIVES its values from them instead of copying them into state.
// ---------------------------------------------------------------------------

const subscribeToNothing = () => () => {};
const yes = () => true;
const no = () => false;

/** False on the server and during hydration, true right after. The honest
 *  "is this the browser yet" — replaces `const [ready, setReady] = useState(false)`
 *  + `useEffect(() => setReady(true), [])`. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeToNothing, yes, no);
}

// --- localStorage / sessionStorage strings ---------------------------------

const storageListeners = new Set<() => void>();

/** Writers that bypass the browser's own `storage` event (which only fires
 *  in OTHER tabs) call this after writing, so subscribers in THIS tab see it. */
export function notifyStorageChanged(): void {
  for (const l of storageListeners) l();
}

function subscribeStorage(listener: () => void): () => void {
  storageListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    storageListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function nullSnapshot(): string | null {
  return null;
}

/**
 * One stored string, live. `null` on the server, during hydration, when the
 * key is absent, and when storage is unavailable (private window). Strings
 * are primitives, so the snapshot is stable by value — derive objects from
 * it with useMemo keyed on the string.
 */
export function useStoredString(area: "local" | "session", key: string): string | null {
  const read = useCallback(() => {
    try {
      return (area === "local" ? window.localStorage : window.sessionStorage).getItem(key);
    } catch {
      return null;
    }
  }, [area, key]);
  return useSyncExternalStore(subscribeStorage, read, nullSnapshot);
}

// --- media queries -----------------------------------------------------------

/** Does the viewport match `query`? False on the server; tracks changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    },
    [query],
  );
  const read = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, read, no);
}
