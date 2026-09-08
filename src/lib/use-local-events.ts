"use client";

import { useSyncExternalStore } from "react";
import { localEventsStore, type SimpleEvent } from "@/lib/local-events";

/**
 * 130 §5: this device's events, live — empty on the server and during
 * hydration, the stored list (sorted by date) right after, updated on every
 * saveEvents(). The store itself lives in local-events.ts (which server
 * actions also import, so it cannot import React); only the hook is here.
 */
export function useLocalEvents(): SimpleEvent[] {
  return useSyncExternalStore(
    localEventsStore.subscribe,
    localEventsStore.getSnapshot,
    localEventsStore.getServerSnapshot,
  );
}
