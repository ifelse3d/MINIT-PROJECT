/**
 * npm run embed:backfill  —  make existing minutes searchable.
 *
 * Confirming a set of minutes indexes it straight away
 * (src/app/minutes/actions.ts → indexMinutesDocInBackground). This script is
 * for everything that route did not catch:
 *
 *   * documents confirmed BEFORE semantic search existed;
 *   * documents whose indexing was best-effort and lost — the vendor was down,
 *     or a serverless function froze before the background promise finished;
 *   * every document, again, after AI_MODEL_EMBED is pointed at a different
 *     model (with --all), which is how two models get compared.
 *
 * It is safe to run at any time and safe to run twice: rows are keyed by
 * (doc_id, model, chunk_index), so a re-run replaces rather than duplicates.
 *
 * USAGE
 *   npm run embed:backfill              only documents never embedded
 *   npm run embed:backfill -- --all     every confirmed document, re-embedded
 *   npm run embed:backfill -- --limit=5 stop after 5 (try it out cheaply first)
 *
 * NEEDS: .env.local with SUPABASE_SERVICE_ROLE_KEY and the embedding vendor's
 * key, and both migrations applied (20260822000000 + 20260823000000).
 *
 * PDPA: prints ids, counts and dates. Never a line of meeting content.
 */

import { config } from "dotenv";
import { getSupabase } from "../src/db/supabase";
import { indexMinutesDoc } from "../src/lib/ai/minutes-index";
import { resolveEmbedModel } from "../src/lib/ai/embed";

config({ path: ".env.local" });

type Args = { all: boolean; limit: number | null };

function parseArgs(argv: string[]): Args {
  const all = argv.includes("--all");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : null;
  return {
    all,
    limit: Number.isFinite(limit) && (limit as number) > 0 ? limit : null,
  };
}

async function main() {
  const { all, limit } = parseArgs(process.argv.slice(2));
  const { id: model } = resolveEmbedModel();

  console.log(`Model: ${model}`);
  console.log(all ? "Mode:  ALL confirmed documents" : "Mode:  never-embedded only");

  const admin = getSupabase();

  // The service-role client on purpose: this is a maintenance job over every
  // organisation, not a user request. It is also why it lives in scripts/ and
  // is never reachable from the web app.
  let query = admin
    .from("minutes_docs")
    .select("id, org_id, meeting_date, embedded_at, embedded_model")
    .eq("status", "confirmed")
    .order("id", { ascending: true });

  if (!all) {
    // Never embedded, or embedded by a DIFFERENT model — the second case is
    // what makes a model switch pick itself up without --all.
    query = query.or(`embedded_at.is.null,embedded_model.neq.${model}`);
  }

  const { data: docs, error } = await query;
  if (error) {
    console.error("Could not read minutes_docs:", error.message);
    process.exit(1);
  }

  const todo = (docs ?? []).slice(0, limit ?? undefined);
  if (todo.length === 0) {
    console.log("Nothing to do — every confirmed document is already indexed.");
    return;
  }
  console.log(`Found ${todo.length} document(s) to index.\n`);

  let done = 0;
  let chunks = 0;
  const failures: { id: number; reason: string }[] = [];

  for (const doc of todo) {
    const id = Number(doc.id);
    const result = await indexMinutesDoc(id);
    if (result.ok) {
      done++;
      chunks += result.chunks;
      console.log(`  ✓ doc ${id} (${doc.meeting_date ?? "no date"}) — ${result.chunks} chunk(s)`);
    } else {
      failures.push({ id, reason: result.reason });
      console.log(`  ✗ doc ${id} (${doc.meeting_date ?? "no date"}) — ${result.reason}`);
    }
  }

  console.log(`\nIndexed ${done}/${todo.length} document(s), ${chunks} chunk(s) total.`);
  if (failures.length > 0) {
    // Not a crash: a failed document simply keeps embedded_at = NULL and will
    // be picked up the next time this runs. Exit non-zero so CI notices.
    console.log(`${failures.length} failed. Run again after fixing the cause.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  // PDPA: the message, never the payload.
  console.error("Backfill stopped:", e instanceof Error ? e.message : "unknown error");
  process.exit(1);
});
