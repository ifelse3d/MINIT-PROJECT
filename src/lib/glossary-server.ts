import "server-only";

import { getSupabaseServer } from "@/db/supabase-server";
import { glossaryEntrySchema, type GlossaryEntry } from "@/lib/glossary";

// ---------------------------------------------------------------------------
// Reading the org's glossary. User-scoped client on purpose: RLS is what
// guarantees one society never sees another's names, and the glossary WILL
// contain personal names (that is the point of it).
//
// A glossary that fails to load must never block a photo the person is waiting
// on — the AI simply works without the hints, exactly as it did before this
// existed. An empty list is a valid, safe answer.
// ---------------------------------------------------------------------------

const MAX_ENTRIES = 300;

export async function loadGlossary(orgId: number): Promise<GlossaryEntry[]> {
  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase
      .from("org_glossary")
      .select("term, action, translation, note")
      .eq("org_id", orgId)
      .order("id", { ascending: true })
      .limit(MAX_ENTRIES);

    if (error || !data) return [];

    const entries: GlossaryEntry[] = [];
    for (const row of data) {
      const parsed = glossaryEntrySchema.safeParse(row);
      if (parsed.success) entries.push(parsed.data);
    }
    return entries;
  } catch {
    // No contents in logs (PDPA), and never a hard failure.
    return [];
  }
}
