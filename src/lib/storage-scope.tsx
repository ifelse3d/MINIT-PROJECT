"use client";

import { createContext, useContext, type ReactNode } from "react";

import { ANON_SCOPE, setCurrentScope } from "@/lib/storage-scope-core";

// ---------------------------------------------------------------------------
// STORAGE SCOPE (S0-4, 2026-08-25).
//
// Every localStorage key holding RECORDS is namespaced by who is signed in and
// which organisation is active: `minit:<userId>:<orgId>:<what>`. Before this,
// the keys were global to the browser — a second member signing in on the
// shared laptop saw (and silently overwrote) the first member's register,
// half-checked minutes and constitution. That is a PDPA failure and a
// data-loss failure in one.
//
// What is deliberately NOT scoped: appearance keys (text size, theme, language,
// sidebar width). They are device preferences, carry no records, and must apply
// before anyone signs in — they keep their old `minit.` dot-prefix. The
// colon/dot split is the contract: `minit:` = someone's records, cleared on
// sign-out and on delete-organisation; `minit.` = this device's preferences,
// kept.
//
// The scope value comes from the server (root layout) — never from anything a
// page can invent. The React-free helpers (scopedKey, adoptLegacyKey,
// clearMinitLocalData) live in storage-scope-core.ts so plain data modules can
// import them without pulling a client directive onto a server path; they are
// re-exported here for convenience.
// ---------------------------------------------------------------------------

export {
  adoptLegacyKey,
  clearMinitLocalData,
  scopedKey,
} from "@/lib/storage-scope-core";

const StorageScopeContext = createContext<string>(ANON_SCOPE);

export function StorageScopeProvider({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  // Mirror into the module global DURING render: React renders this provider
  // before its children, so any child's effect reads the right scope.
  setCurrentScope(scope);
  return (
    <StorageScopeContext.Provider value={scope}>
      {children}
    </StorageScopeContext.Provider>
  );
}

/** `minit:<userId>:<orgId>:<base>` for the current signed-in scope. */
export function useScopedKey(base: string): string {
  const scope = useContext(StorageScopeContext);
  return `minit:${scope}:${base}`;
}
