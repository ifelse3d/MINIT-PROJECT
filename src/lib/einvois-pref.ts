"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// e-Invois visibility (R-6, 2026-08-25). J 2026-08-24: e-Invois is OPTIONAL —
// most societies never need it; eROSES is the legal must and stays first.
//
// The real switch belongs on the organisation (`orgs.needs_einvois`, migration
// 20260829000000, written for J to run). Until that column is applied this is
// a DEVICE preference so the redesign ships tonight: default OFF, toggled in
// Settings. Dot-prefix key = preference, survives sign-out (storage-scope
// contract). The /money/einvois ROUTE always works either way — hiding a menu
// entry must never break a saved link — and the >RM10,000 individual e-invois
// warning inside the money pages ignores this flag entirely.
// ---------------------------------------------------------------------------

const KEY = "minit.einvois-visible";

export function readEinvoisVisible(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function useEinvoisVisible(): [boolean, (v: boolean) => void] {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(readEinvoisVisible());
  }, []);
  const set = (v: boolean) => {
    setVisible(v);
    try {
      window.localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      // storage unavailable — the toggle just won't persist
    }
  };
  return [visible, set];
}
