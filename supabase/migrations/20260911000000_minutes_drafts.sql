-- ============================================================================
-- Migration 33 — minutes_drafts: unfinished minutes live in the CLOUD.
-- (工作单 51 拍板 8 / C-13：「直接做好完整的不好吗？」— 云端、跨装置、多份并存)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 33 to copy it.)
--
-- WHY:
--   The half-finished workspace used to live ONLY in one browser's
--   localStorage. J's scenario: last week's meeting record is not finished,
--   and this week's meeting is starting — BOTH must survive, and the
--   secretary may open a different device. So: one row per unfinished draft,
--   several per organisation, keyed by a client-generated draft key.
--
-- WHAT A DRAFT IS NOT (D36 stands): a SAVED document never returns to the
-- workspace — drafts are only the not-yet-saved. Saving to History deletes
-- the draft row.
--
-- The app works before this is applied (fail-open, D8): drafts then live in
-- localStorage only, exactly as before, and the cloud list simply shows
-- nothing.
--
-- PDPA (Hard Rule 5): payload holds extracted meeting facts. RLS scopes it
-- by org like every other table; photo previews are NOT stored here (the
-- payload carries storage paths, not images).
-- ============================================================================

create table if not exists minutes_drafts (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  -- Which draft this is, minted by the client that first created it — the
  -- upsert key, so autosave never duplicates a draft.
  client_key text not null check (char_length(client_key) <= 80),
  -- What the picker shows ("Mesyuarat AJK — 2026-08-20"). Derived client-side.
  title text check (title is null or char_length(title) <= 200),
  -- The workspace itself (extraction, flags, photo storage paths).
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  unique (org_id, client_key)
);

alter table minutes_drafts enable row level security;

-- Same shape as every org-scoped table (phase 7): read within the accessible
-- tree, write within the writable tree.
create policy minutes_drafts_select on minutes_drafts
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));

create policy minutes_drafts_insert on minutes_drafts
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_writable()));

create policy minutes_drafts_update on minutes_drafts
  for update to authenticated
  using (org_id in (select public.accessible_orgs_writable()))
  with check (org_id in (select public.accessible_orgs_writable()));

create policy minutes_drafts_delete on minutes_drafts
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_writable()));

comment on table minutes_drafts is
  'Unfinished minutes workspaces (work order 51 C-13). One row per draft, several per org; saving to History deletes the row (D36). Not the documents themselves - those are minutes_docs.';
