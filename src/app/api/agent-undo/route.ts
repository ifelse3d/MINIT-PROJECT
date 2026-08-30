import { NextResponse } from "next/server";
import { z } from "zod";
import { captureAppError } from "@/lib/app-errors";
import { joinUserError, USER_ERRORS } from "@/lib/user-errors";
import { getActiveOrg } from "@/lib/active-org";
import { getSupabaseServer } from "@/db/supabase-server";

// ---------------------------------------------------------------------------
// UNDO one tier-1 agent change (work order 100 §0-4).
//
// The agent changed a committee contact detail on a person's instruction and
// the conversation shows "changed: old → new" with an undo button — this is
// that button. Restores the OLD value from the agent_changes trace and marks
// the trace undone (the row itself stays: the trail never shrinks).
//
// USER-SCOPED client throughout: RLS decides whether this person may touch
// this org's roster — same boundary as the tool that made the change.
// Zero AI, zero charge.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";

const bodySchema = z.object({ changeId: z.number().int().positive() });

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.serverError) },
        { status: 400 },
      );
    }
    const org = await getActiveOrg();
    if (!org) {
      return NextResponse.json(
        { error: joinUserError(USER_ERRORS.needOrg) },
        { status: 401 },
      );
    }

    const supabase = await getSupabaseServer();
    const { data: change, error } = await supabase
      .from("agent_changes")
      .select("id, org_id, target_table, target_id, field, old_value, undone_at")
      .eq("id", parsed.data.changeId)
      .eq("org_id", org.id)
      .single();
    if (error || !change) {
      return NextResponse.json(
        {
          error: joinUserError({
            bm: "Rekod perubahan itu tidak dijumpai.",
            zh: "找不到这条修改记录。",
            en: "That change record was not found.",
          }),
        },
        { status: 404 },
      );
    }
    if (change.undone_at) {
      // Already undone — saying so is more honest than pretending success.
      return NextResponse.json({ ok: true, alreadyUndone: true });
    }

    const { error: restoreError } = await supabase
      .from(change.target_table)
      .update({ [change.field]: change.old_value === "" ? null : change.old_value })
      .eq("id", change.target_id)
      .eq("org_id", org.id);
    if (restoreError) {
      return NextResponse.json(
        {
          error: joinUserError({
            bm: "Tidak dapat memulihkan nilai lama. Cuba sekali lagi.",
            zh: "没能把旧值改回去。请再试一次。",
            en: "Could not restore the old value. Please try again.",
          }),
        },
        { status: 500 },
      );
    }

    await supabase
      .from("agent_changes")
      .update({ undone_at: new Date().toISOString() })
      .eq("id", change.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    void captureAppError("/api/agent-undo", e);
    return NextResponse.json(
      { error: joinUserError(USER_ERRORS.serverError) },
      { status: 500 },
    );
  }
}
