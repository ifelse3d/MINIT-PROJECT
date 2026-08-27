"use client";

import { Tri } from "@/components/language-provider";

// ---------------------------------------------------------------------------
// D19 (拍板 34): every income row answers ONE question at registration time —
// did the money arrive as cash in a hand, or straight into the bank account?
// The answer decides whether the row enters cash custody at all, so it is a
// pair of labelled pills (one tap), never a free-text field.
// ---------------------------------------------------------------------------

export type PaymentMethod = "cash" | "transfer";

export function PaymentMethodToggle({
  value,
  onChange,
  compact = false,
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  /** Smaller pills for dense places (the typing grid, a table row). */
  compact?: boolean;
}) {
  const base = compact
    ? "rounded-xs border px-2.5 py-1 text-sm font-medium"
    : "rounded-xs border-2 px-3.5 py-1.5 text-base font-medium";
  const on = "border-[color:var(--v2-primary)] bg-[color:var(--v2-primary)]/10 text-foreground";
  const off = "border-[color:var(--v2-outline-border)] text-muted-foreground hover:bg-accent";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" role="group">
      <button
        type="button"
        aria-pressed={value === "cash"}
        className={`${base} ${value === "cash" ? on : off}`}
        onClick={() => onChange("cash")}
      >
        💵 <Tri bm="Tunai" zh="现金" en="Cash" />
      </button>
      <button
        type="button"
        aria-pressed={value === "transfer"}
        className={`${base} ${value === "transfer" ? on : off}`}
        onClick={() => onChange("transfer")}
      >
        🏦 <Tri bm="Pindahan bank" zh="转账" en="Bank transfer" />
      </button>
    </span>
  );
}
