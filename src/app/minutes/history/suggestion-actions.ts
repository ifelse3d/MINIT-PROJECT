"use server";

// The paper trail behind the AI suggestion cards (work order 64 §1-6: 駁回也要
// 留痕 — and the same document must never nag the same suggestion twice).
//
// This action records ONLY the verdict on a card. The actual writing — a new
// committee member, a calendar event — happens through the EXISTING actions
// (members' addCommitteeMember, calendar's saveEvent), called by the card UI
// before this mark is stored (§1-4: no new back doors into the database).
//
// FAIL-OPEN (D8): migration 36 may not be applied. The mark then answers
// { stored: false } and the card component remembers the ignore in this
// device's localStorage instead — dismissals survive on that device, and the
// cross-device promise starts the day J runs the migration.

import { getSessionUser, getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { getDocumentIdentity } from "@/lib/doc-identity";
import { can, permissionError } from "@/lib/roles";

export type MarkSuggestionState = {
  ok: boolean;
  /** true = the verdict is in the database (every device sees it);
   *  false with ok=true = migration 36 not applied yet — remembered locally. */
  stored: boolean;
  error: string | null;
};

const ERR = {
  login: "Sila log masuk semula\n请重新登入\nPlease log in again",
  noOrg: "Pilih pertubuhan dahulu\n请先选择一个机构\nChoose an organisation first",
  failed:
    "Tidak berjaya — cuba lagi\n没有成功 —— 请再试一次\nSomething went wrong — please try again",
};

function isDbBehind(message: string | undefined): boolean {
  return /suggestion_marks|schema cache|column/i.test(message ?? "");
}

export async function markSuggestion(input: {
  docId: number;
  suggestionKey: string;
  action: "applied" | "ignored";
}): Promise<MarkSuggestionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, stored: false, error: ERR.login };
  const active = await getActiveOrg();
  if (!active) return { ok: false, stored: false, error: ERR.noOrg };
  // calendar_write is the broadest non-auditor write capability — everyone
  // who can act on ANY card can also record what they did with it. (RLS's
  // accessible_orgs_writable() refuses the read-only auditor again anyway.)
  if (!can(active.role, "calendar_write")) {
    return { ok: false, stored: false, error: permissionError("calendar_write") };
  }
  const identity = await getDocumentIdentity();
  if (!identity) return { ok: false, stored: false, error: ERR.login };

  const docId = Number(input.docId);
  const suggestionKey = String(input.suggestionKey ?? "").slice(0, 200);
  const action = input.action === "applied" ? "applied" : "ignored";
  if (!Number.isInteger(docId) || docId <= 0 || suggestionKey === "") {
    return { ok: false, stored: false, error: ERR.failed };
  }

  const supabase = await getSupabaseServer();

  // The mark must hang off a document of THIS org (Hard Rule 5 on top of
  // RLS): a browser must not be able to pin marks onto another org's doc id.
  const { data: doc, error: docError } = await supabase
    .from("minutes_docs")
    .select("id")
    .eq("org_id", active.id)
    .eq("id", docId)
    .maybeSingle();
  if (docError || !doc) return { ok: false, stored: false, error: ERR.failed };

  const { error } = await supabase.from("suggestion_marks").upsert(
    {
      org_id: active.id,
      doc_id: docId,
      suggestion_key: suggestionKey,
      action,
      decided_by: identity.confirmedBy,
      decided_at: new Date().toISOString(),
    },
    { onConflict: "org_id,doc_id,suggestion_key" },
  );
  if (error) {
    if (isDbBehind(error.message)) {
      // Migration 36 not applied — not an error, a smaller promise.
      return { ok: true, stored: false, error: null };
    }
    return { ok: false, stored: false, error: ERR.failed };
  }
  return { ok: true, stored: true, error: null };
}
