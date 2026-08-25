// Record a processed photo into the org's history (Phase 7):
//   1. store the file in the private "uploads" bucket under "{orgId}/…"
//   2. insert an uploads row so it appears in the Inbox history.
//
// Runs with the USER-scoped client so RLS enforces org access, and it is
// deliberately BEST-EFFORT: if the user has no active org (or is an
// auditor), the AI extraction still succeeds — we just don't keep a record.
// PDPA: file contents and names are never logged.
import "server-only";

import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";

type UploadKind =
  | "meeting_notes"
  | "ledger_page"
  | "constitution"
  | "attendance_sheet"
  | "expense"
  | "other";

export async function recordUpload(
  file: File,
  kind: UploadKind,
): Promise<void> {
  try {
    const active = await getActiveOrg();
    if (!active || !can(active.role, "upload")) return;

    const supabase = await getSupabaseServer();

    // Path starts with the org id — the storage RLS policies require it.
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "photo";
    const path = `${active.id}/${kind}/${Date.now()}-${safeName}`;

    const { error: storageError } = await supabase.storage
      .from("uploads")
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || "application/octet-stream",
      });
    if (storageError) return;

    await supabase.from("uploads").insert({
      org_id: active.id,
      filename: file.name,
      storage_path: path,
      kind,
      status: "done",
    });
  } catch {
    // Best-effort only — never let history-keeping break the extraction.
  }
}
