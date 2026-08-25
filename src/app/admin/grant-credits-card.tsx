"use client";

// K-3 (work order 27): the grant-credits form. English-only like the rest of
// /admin (operator surface). The server-side RPC is the authority; this form
// is a convenience over it.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { adminGrantCredits, type GrantResult } from "./actions";

const REASON_TEXT: Record<Exclude<GrantResult, { ok: true }>["reason"], string> = {
  no_session: "Sign in again.",
  not_admin:
    "This account is not in platform_admins — the database refused (fail-closed). Add your email to platform_admins in the SQL Editor first.",
  invalid: "Check the fields: org id and a non-zero whole-number delta.",
  db_behind: "Migration 25 (admin_grant_credits) is not applied yet. Nothing was granted.",
  db: "The call failed — nothing was granted. Try again.",
};

export function GrantCreditsCard() {
  const [orgId, setOrgId] = useState("");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function grant() {
    setError(null);
    setResult(null);
    const orgIdNum = Number(orgId);
    const deltaNum = Number(delta);
    if (!Number.isInteger(orgIdNum) || !Number.isInteger(deltaNum)) {
      setError(REASON_TEXT.invalid);
      return;
    }
    setBusy(true);
    try {
      const r = await adminGrantCredits({ orgId: orgIdNum, delta: deltaNum, note });
      if (r.ok) {
        setResult(
          `${r.orgName} (#${orgIdNum}): extra credits ${r.creditsBefore} → ${r.creditsAfter}. Audited in credit_grants.`,
        );
        setDelta("");
        setNote("");
      } else {
        setError(REASON_TEXT[r.reason]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="v2-glass flex flex-col gap-3 p-5">
      <div>
        <h2 className="text-xl font-semibold">Grant AI credits</h2>
        <p className="text-sm text-[color:var(--v2-text-soft)]">
          Routes through minit_admin.grant_ai_credits() and writes a
          credit_grants audit row. Negative delta deducts (floored at 0).
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Org id
          <input
            className="w-28 rounded-md border border-input bg-background px-3 py-2 text-base"
            inputMode="numeric"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Delta (e.g. 100 or -50)
          <input
            className="w-36 rounded-md border border-input bg-background px-3 py-2 text-base"
            inputMode="numeric"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Note (why — lands in the audit row)
          <input
            className="min-w-48 rounded-md border border-input bg-background px-3 py-2 text-base"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button onClick={() => void grant()} disabled={busy || orgId === "" || delta === ""}>
          {busy ? "Granting…" : "Grant"}
        </Button>
      </div>
      {result && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-900">
          ✓ {result}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-900">{error}</p>
      )}
    </div>
  );
}
