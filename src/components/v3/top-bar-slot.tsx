"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// 130 §8 (110 §沒做 1 / 119 A-4): a SLOT in the phone's top app bar.
//
// On a 375px phone the home page spent a whole row (44px bell + 12px gap) on
// the "Upcoming" bell under a 56px app bar that had room for it. The bell's
// DATA (server-computed deadlines) lives in the home page, and the app bar is
// the shell's — so the page keeps owning the bell and PORTALS its button into
// this slot when the screen is a phone. The list it unfolds stays in the page
// flow, exactly where it was.
//
// A context, not document.getElementById: the element is handed over by the
// top bar's own ref callback, so nothing reads the DOM during render.
// ---------------------------------------------------------------------------

type Slot = {
  el: HTMLElement | null;
  setEl: (el: HTMLElement | null) => void;
};

const TopBarSlotContext = createContext<Slot>({ el: null, setEl: () => {} });

export function TopBarSlotProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <TopBarSlotContext.Provider value={{ el, setEl }}>{children}</TopBarSlotContext.Provider>
  );
}

/** The top bar mounts its slot element here (a ref callback). */
export function useTopBarSlotMount(): (el: HTMLElement | null) => void {
  return useContext(TopBarSlotContext).setEl;
}

/** A page that wants a control in the app bar portals into this. `null`
 *  until the bar has mounted its slot (server render, first client render). */
export function useTopBarSlot(): HTMLElement | null {
  return useContext(TopBarSlotContext).el;
}
