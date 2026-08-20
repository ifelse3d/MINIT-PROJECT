-- ============================================================================
-- Minit — per-organisation glossary ("词库" / Glosari)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Open your Supabase project dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file and click "Run".
--   3. "Success. No rows returned" means it worked.
--
--   Running it TWICE is safe. It used to fail the second time with
--   `42710: policy "org_glossary_select" ... already exists`, because Postgres
--   has no CREATE POLICY IF NOT EXISTS. That error was alarming and meant
--   nothing was wrong — the first run had already succeeded. Each policy is
--   now dropped-if-present first, so a re-run is a no-op instead of a scare.
--   (2026-08-19: J hit exactly this.)
--
-- WHAT THIS DOES (plain English):
--   Every society has words of its own — the name of a class, a title of
--   office, a teaching, a dish, and above all the names of its own people.
--   A general-purpose model has never seen them, so it guesses: it romanises
--   a name that should stay in Chinese, translates a title that is really a
--   proper noun, or reads an unfamiliar character as a similar-looking common
--   one. Guessing differently each time is worse than guessing wrong once.
--
--   This table lets an organisation TEACH Minit its own words, once. Each row
--   is either "keep this exactly as written" or "always render this as ___".
--   The list is handed to the model in two places: when it reads handwriting
--   (so it knows these words exist and can expect them) and when it writes the
--   Malay minutes (so the same word comes out the same way every time).
--
-- PDPA (CLAUDE.md Hard Rule 5): rows here MAY contain personal names, because
-- teaching the system to read a member's name correctly is the point. They are
-- org-scoped, RLS-protected like every other org table, and never logged.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The table.
--    action = 'keep'      → copy the term exactly; never translate or romanise
--    action = 'translate' → always render it as `translation`
--    note   = optional plain-English hint ("a teaching", "a member") that
--             helps the model disambiguate. Never required.
-- ---------------------------------------------------------------------------
create table if not exists org_glossary (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  term text not null check (char_length(btrim(term)) between 1 and 80),
  action text not null check (action in ('keep', 'translate')),
  translation text check (translation is null or char_length(translation) <= 160),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  -- A 'translate' row without a target would silently do nothing, which is the
  -- kind of "configured but inert" setting that wastes an afternoon.
  constraint org_glossary_translation_required
    check (action <> 'translate' or char_length(btrim(coalesce(translation, ''))) > 0),
  -- One ruling per term per org: two contradictory rows would make the output
  -- depend on row order, i.e. random.
  constraint org_glossary_unique_term unique (org_id, term)
);

create index if not exists idx_org_glossary_org
  on org_glossary (org_id);

-- ---------------------------------------------------------------------------
-- 2. RLS — the uniform org-scoped pattern (Phase 7).
--    Members of the org can read it; members who can write to the org can
--    maintain it. Auditors are read-only everywhere, and accessible_orgs_
--    writable() already excludes them, so nothing extra is needed here.
-- ---------------------------------------------------------------------------
alter table org_glossary enable row level security;

-- Dropped first so the whole file can be re-run without an error. On a fresh
-- database these four drops do nothing; on one where the file has already been
-- applied they replace each policy with an identical one, inside the same
-- transaction, so no row is ever readable under a missing policy.
drop policy if exists org_glossary_select on public.org_glossary;
create policy org_glossary_select on public.org_glossary
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));

drop policy if exists org_glossary_insert on public.org_glossary;
create policy org_glossary_insert on public.org_glossary
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_writable()));

drop policy if exists org_glossary_update on public.org_glossary;
create policy org_glossary_update on public.org_glossary
  for update to authenticated
  using (org_id in (select public.accessible_orgs_writable()))
  with check (org_id in (select public.accessible_orgs_writable()));

drop policy if exists org_glossary_delete on public.org_glossary;
create policy org_glossary_delete on public.org_glossary
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_writable()));
