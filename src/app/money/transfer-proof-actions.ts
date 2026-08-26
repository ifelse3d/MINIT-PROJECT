"use server";

// ---------------------------------------------------------------------------
// D19 (拍板 34): a bank-transfer donation may carry the transfer screenshot.
// Storage only — the file goes into the private "uploads" bucket under the
// org's own prefix (the storage RLS policies require it) and NO AI ever reads
// it, so it costs no AI actions. The stored path lands on the donation row
// (donations.transfer_proof_path, migration 26) when the receipt is issued.
//
// Returns outcomes, never throws (the register keeps working without a proof —
// the proof is optional evidence, not a gate).
// PDPA: file contents and names are never logged.
// ---------------------------------------------------------------------------

import { getSupabaseServer } from "@/db/supabase-server";
import { getActiveOrg } from "@/lib/active-org";
import { can } from "@/lib/roles";

const MAX_PROOF_BYTES = 8 * 1024 * 1024; // 8MB — a phone screenshot is well under

export type TransferProofOutcome =
  | { ok: true; path: string }
  | { ok: false; reason: "no_org" | "not_allowed" | "bad_file" | "db" };

export async function uploadTransferProof(
  form: FormData,
): Promise<TransferProofOutcome> {
  const file = form.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, reason: "bad_file" };
  }
  if (file.size > MAX_PROOF_BYTES) return { ok: false, reason: "bad_file" };
  const type = file.type || "";
  if (!type.startsWith("image/") && type !== "application/pdf") {
    return { ok: false, reason: "bad_file" };
  }

  const active = await getActiveOrg();
  if (!active) return { ok: false, reason: "no_org" };
  // Recording income is money_collect — same door as recording a hand-over.
  if (!can(active.role, "money_collect")) return { ok: false, reason: "not_allowed" };

  const supabase = await getSupabaseServer();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80) || "bukti";
  const path = `${active.id}/transfer_proof/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from("uploads")
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: type || "application/octet-stream",
    });
  if (error) return { ok: false, reason: "db" };
  return { ok: true, path };
}
