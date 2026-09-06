"use client";

import { createContext, useContext, type ReactNode } from "react";
import { pctOfQuota } from "@/lib/quota-display";

// ---------------------------------------------------------------------------
// THE MONTHLY POOL, ONCE, FOR EVERY BUTTON THAT SPENDS (work order 118 §4).
//
// J, 8/31 午 第 20 條③: users see PERCENTAGES — never "1 AI action", never
// tokens. A percentage needs its denominator, and until now only the home
// box and the floating panel were handed one (as props, from the server).
// Every other button said "1 AI action" because it had no number to say.
//
// The root layout already loads the org's usage for the shell; it now puts
// the pool (usage-core's quotaPool — allowance plus top-ups, the SAME
// denominator the Plan page divides by) in this context, and useAiCost()
// turns "this button costs N actions" into "about X%". null pool = the
// sentence names no number rather than guessing one.
// ---------------------------------------------------------------------------

const AiQuotaContext = createContext<number | null>(null);

export function AiQuotaProvider({
  quota,
  children,
}: {
  /** The org's monthly pool in actions; null when unknown / no org. */
  quota: number | null;
  children: ReactNode;
}) {
  return <AiQuotaContext.Provider value={quota}>{children}</AiQuotaContext.Provider>;
}

/** The pool itself (null = unknown). */
export function useAiQuota(): number | null {
  return useContext(AiQuotaContext);
}

/** What `actions` metered actions cost, as a share of the pool, 0–100 —
 *  or null when the pool is unknown (say "uses AI allowance", no number). */
export function useAiCost(actions = 1): number | null {
  return pctOfQuota(actions, useContext(AiQuotaContext));
}
