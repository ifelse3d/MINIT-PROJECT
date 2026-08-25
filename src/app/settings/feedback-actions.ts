"use server";

// ---------------------------------------------------------------------------
// K-1 (work order 27): the feedback channel. Free, touches no AI, and says
// so on the form. Rows land in `feedback` (migration 25 section ④, org-scoped
// RLS); /admin lists them. PDPA: the message is the user's OWN words to us —
// stored, shown to the operator, never logged.
// 🔴 Survives a database behind migration 25: the insert failing over a
// missing table is reported as one honest sentence, never a crash.
// ---------------------------------------------------------------------------

import { getSupabaseServer, getSessionUser } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";

export type FeedbackOutcome =
  | { ok: true }
  | { ok: false; reason: "no_session" | "no_org" | "invalid" | "db_behind" | "db" };

export async function submitFeedback(input: {
  message: string;
  /** The pathname the person was on — navigation only, never contents. */
  page: string;
}): Promise<FeedbackOutcome> {
  const message = (input?.message ?? "").trim().slice(0, 4000);
  const page = (input?.page ?? "").trim().slice(0, 200);
  if (message === "") return { ok: false, reason: "invalid" };

  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "no_session" };
  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };

  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("feedback").insert({
    org_id: active.id,
    user_id: user.id,
    message,
    page: page || null,
  });
  if (error) {
    return {
      ok: false,
      reason: /relation|schema cache|does not exist/i.test(error.message ?? "")
        ? "db_behind"
        : "db",
    };
  }
  return { ok: true };
}
