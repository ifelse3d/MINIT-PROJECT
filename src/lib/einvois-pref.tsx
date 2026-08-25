"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { saveNeedsEinvois } from "@/app/settings/einvois-actions";

// ---------------------------------------------------------------------------
// e-Invois visibility (R-6, 2026-08-25; org-backed since 0-4 the same day).
// J 2026-08-24: e-Invois is OPTIONAL — most societies never need it; eROSES is
// the legal must and stays first.
//
// The switch is the ORGANISATION's (`orgs.needs_einvois`, migration
// 20260829000000, applied 8/25): a treasurer who turns it on sees it on on
// every device, and so does every other member. The old device preference
// (localStorage) remains as the FALLBACK for whenever the organisation value
// cannot be read — no active org, offline, or a database behind the code —
// so the page degrades instead of breaking, and the Settings row SAYS when
// the choice is device-only (STATE §6: silent desync is the worst success).
//
// The device half stays a useSyncExternalStore over localStorage (as before
// 0-4): the store IS external, and the server snapshot (false = hidden)
// matches the default so hydration never mismatches. The org half is plain
// optimistic state seeded from the server-provided value.
//
// The nav rail, the money tab rail, the More page and the Settings toggle all
// read this one provider, so flipping the toggle moves all of them at once.
// The /money/einvois ROUTE always works either way — hiding a menu entry must
// never break a saved link — and the >RM10,000 individual e-invois warning
// inside the money pages ignores this flag entirely.
// ---------------------------------------------------------------------------

const KEY = "minit.einvois-visible";

const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function readDevicePref(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function writeDevicePref(v: boolean): void {
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    // storage unavailable — the preference just won't persist on-device
  }
  for (const l of listeners) l();
}

type EinvoisState = {
  visible: boolean;
  set: (v: boolean) => void;
  /** True when the value shown is the organisation's (from the database). */
  orgBacked: boolean;
  /** Set when the last save to the organisation failed — the choice is live
   *  on this device but other members will not see it. */
  saveError: string | null;
};

const EinvoisContext = createContext<EinvoisState | null>(null);

export function EinvoisProvider({
  orgValue,
  children,
}: {
  /** The organisation's needs_einvois, or null = unknown (no org / column
   *  missing / fetch failed) → fall back to the device preference. */
  orgValue: boolean | null;
  children: ReactNode;
}) {
  const orgBacked = orgValue !== null;
  // Optimistic local copy of the organisation's value; only read when
  // orgBacked. Seeded from the server render, updated on toggle.
  const [orgVisible, setOrgVisible] = useState<boolean>(orgValue ?? false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const deviceVisible = useSyncExternalStore(
    subscribe,
    readDevicePref,
    () => false, // server snapshot: hidden, matching the default
  );
  const visible = orgBacked ? orgVisible : deviceVisible;

  const set = useCallback(
    (v: boolean) => {
      setSaveError(null);
      // Mirror to the device either way, so offline shows the last choice.
      writeDevicePref(v);
      if (!orgBacked) return;
      setOrgVisible(v);
      void saveNeedsEinvois(v)
        .then((r) => {
          if (!r.ok) setSaveError(r.error ?? "failed");
        })
        .catch(() =>
          setSaveError(
            "Tidak berjaya disimpan / 没能保存到机构 / Could not save for the organisation",
          ),
        );
    },
    [orgBacked],
  );

  return (
    <EinvoisContext.Provider value={{ visible, set, orgBacked, saveError }}>
      {children}
    </EinvoisContext.Provider>
  );
}

/** Same [value, setter] shape as before 0-4, so read-only consumers (nav
 *  rail, money tabs, More page) did not have to change. */
export function useEinvoisVisible(): [boolean, (v: boolean) => void] {
  const ctx = useContext(EinvoisContext);
  if (!ctx) {
    throw new Error("useEinvoisVisible() outside <EinvoisProvider> (root layout)");
  }
  return [ctx.visible, ctx.set];
}

/** For the Settings row only: whether the value is the organisation's, and
 *  whether the last organisation save failed. */
export function useEinvoisSync(): { orgBacked: boolean; saveError: string | null } {
  const ctx = useContext(EinvoisContext);
  if (!ctx) {
    throw new Error("useEinvoisSync() outside <EinvoisProvider> (root layout)");
  }
  return { orgBacked: ctx.orgBacked, saveError: ctx.saveError };
}
