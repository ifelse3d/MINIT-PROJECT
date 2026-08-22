import "server-only";
import { getSupabase } from "@/db/supabase";
import { chunkHash, chunkMinutes } from "@/lib/minutes-chunks";
import { EMBED_DIM, embedTexts, resolveEmbedModel } from "./embed";

// ---------------------------------------------------------------------------
// PUTTING A CONFIRMED SET OF MINUTES INTO THE SEARCH INDEX.
//
// This is the write half of "我記得有一次開會說了什麼，你幫我找出來".
// The read half is cari_minit() in
// supabase/migrations/20260823000000_cari_minit_rpc.sql.
//
// 🔴 SERVICE ROLE HERE, USER-SCOPED THERE — and that asymmetry is deliberate.
// Writing an embedding is not a user action: minutes_embeddings has a SELECT
// policy and no INSERT policy at all, precisely so that nobody can put a vector
// of their own text into another society's index. Writes therefore go through
// the server with the service key, which is allowed to do exactly this one
// thing, from this one file. SEARCHING is the opposite: it runs as the person,
// so RLS decides what they can see (docs/助手重做-设计.md §7).
//
// 🔴 IT IS ALWAYS BEST-EFFORT. Confirming a set of minutes is the moment a
// legal record comes into existence. If the embedding vendor is down, the
// record must still save — the person's document is the product; the search
// index is a convenience that can be rebuilt at any time by the backfill
// script. So every failure here is swallowed, and `embedded_at` simply stays
// NULL, which is exactly how the backfill finds it later. Nothing is logged
// (PDPA: this is meeting content).
//
// COST: not charged to the org's AI quota — see the note at the top of embed.ts.
// ---------------------------------------------------------------------------

/** What happened, for the backfill script's progress output. */
export type IndexResult =
  | { ok: true; chunks: number; model: string }
  | { ok: false; reason: string };

/**
 * Chunk, embed and store one confirmed minutes document.
 *
 * Safe to call repeatedly: the rows are keyed by (doc_id, model, chunk_index),
 * so a second run replaces the same rows rather than duplicating them. A
 * document that has been edited produces different chunk hashes and is simply
 * re-embedded.
 */
export async function indexMinutesDoc(docId: number): Promise<IndexResult> {
  try {
    const admin = getSupabase();

    const { data: doc, error } = await admin
      .from("minutes_docs")
      .select("id, org_id, final_md, status")
      .eq("id", docId)
      .maybeSingle();
    if (error || !doc) return { ok: false, reason: "not_found" };

    // Drafts are not indexed. A draft is not yet a record of anything, and an
    // assistant quoting one as fact is worse than an assistant finding nothing.
    if (doc.status !== "confirmed") return { ok: false, reason: "not_confirmed" };

    const chunks = chunkMinutes(String(doc.final_md ?? ""));
    if (chunks.length === 0) return { ok: false, reason: "empty" };

    const { id: model } = resolveEmbedModel();
    const vectors = await embedTexts(
      chunks.map((c) => c.text),
      "document",
    );
    if (vectors.length !== chunks.length) {
      return { ok: false, reason: "vector_count_mismatch" };
    }

    // Delete-then-insert for THIS model only. Not a blanket delete: another
    // model's vectors for the same document are the whole point of the model
    // column, and wiping them here would quietly destroy a comparison someone
    // is in the middle of running.
    await admin
      .from("minutes_embeddings")
      .delete()
      .eq("doc_id", doc.id)
      .eq("model", model);

    const rows = chunks.map((chunk, i) => ({
      org_id: doc.org_id,
      doc_id: doc.id,
      chunk_index: chunk.index,
      chunk_text: chunk.text,
      model,
      dim: EMBED_DIM,
      embedding: vectors[i],
      source_hash: chunkHash(chunk.text),
    }));

    const { error: insertError } = await admin
      .from("minutes_embeddings")
      .insert(rows);
    if (insertError) return { ok: false, reason: "insert_failed" };

    await admin
      .from("minutes_docs")
      .update({
        embedded_at: new Date().toISOString(),
        embedded_model: model,
      })
      .eq("id", doc.id);

    return { ok: true, chunks: rows.length, model };
  } catch {
    // PDPA: no contents, no vendor message. The row's embedded_at stays NULL,
    // which is how the backfill script knows to come back to it.
    return { ok: false, reason: "failed" };
  }
}

/**
 * Index a document without making the caller wait for it.
 *
 * Used by the save action: the person pressed "confirm" and is waiting for a
 * page, not for an embedding vendor. Errors are already swallowed inside
 * indexMinutesDoc; the catch here is only for the promise itself.
 *
 * ⚠️ On a serverless host the function may be frozen when the response is
 * returned, so this is genuinely best-effort — another reason the backfill
 * script exists and is not optional.
 */
export function indexMinutesDocInBackground(docId: number): void {
  void indexMinutesDoc(docId).catch(() => {});
}
