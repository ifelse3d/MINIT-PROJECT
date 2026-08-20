// Delete-organisation internals (CLAUDE.md Hard Rule 5: delete-organisation
// must remove rows AND storage objects).
//
// Storage objects do NOT cascade like database rows do, so this walks every
// bucket and removes everything under the org's folder ("{orgId}/...")
// BEFORE the org row is deleted (the row delete cascades to all 18 tables).
// PDPA: object paths and errors are never logged.
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const MINIT_BUCKETS = [
  "uploads",
  "receipts",
  "letterheads",
  "einvois",
] as const;

/**
 * Recursively collect every object path under `prefix` in one bucket.
 *
 * Returns `null` if ANY listing call failed. That is deliberately different
 * from `[]` (an empty folder): if we cannot see what is in a folder we must
 * not conclude it is empty, because the caller would then delete the org row
 * and orphan donor personal data in Storage forever (PDPA / Hard Rule 5).
 */
async function listAllPaths(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[] | null> {
  const paths: string[] = [];
  const pageSize = 100;

  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: pageSize, offset });
    // A failed listing is NOT an empty folder — give up on the whole bucket.
    // PDPA: the error itself is never logged (it can contain object paths).
    if (error || !data) return null;
    if (data.length === 0) break;

    for (const entry of data) {
      // Folders come back with id === null; files have an id.
      if (entry.id === null) {
        const nested = await listAllPaths(
          admin,
          bucket,
          `${prefix}/${entry.name}`,
        );
        if (nested === null) return null;
        paths.push(...nested);
      } else {
        paths.push(`${prefix}/${entry.name}`);
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return paths;
}

/**
 * Remove every storage object belonging to an org, across all Minit buckets.
 * Returns false if any bucket could not be fully cleared (caller must then
 * NOT delete the org row, so nothing is orphaned).
 */
export async function deleteOrgStorage(
  admin: SupabaseClient,
  orgId: number,
): Promise<boolean> {
  for (const bucket of MINIT_BUCKETS) {
    const paths = await listAllPaths(admin, bucket, String(orgId));
    // null = we could not read the bucket, so we cannot claim it is clear.
    if (paths === null) return false;
    // Remove in batches (the API caps how many paths one call may take).
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(batch);
      if (error) return false;
    }
  }
  return true;
}
