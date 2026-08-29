-- ============================================================================
-- Migration 36 — suggestion_marks: what happened to each AI suggestion card.
-- (工作单 64 包 E3：会议记录存档后的智能建议卡——确认/忽略都要留痕)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 36 to copy it.)
--
-- WHY:
--   A confirmed minutes document now proposes cards ("add this appointed
--   committee member", "put this decided activity on the calendar"). Two
--   rules from work order 64 need a table:
--     * 拍板 6 — dismissing a card leaves a trace (who, when), and the SAME
--       document must never nag the SAME suggestion again, on any device;
--     * a confirmed card is recorded too, so the card does not reappear
--       after the underlying row is later renamed or deleted.
--   One row per (document, suggestion): action is 'applied' or 'ignored'.
--
--   PDPA note: suggestion_key contains the suggested person's NAME or the
--   event title (normalised) — the same names committee_roster / the minutes
--   document already store. No IC numbers, no donor data, ever.
--
-- The app works before this is applied (fail-open, D8): cards still show;
-- an ignore is remembered on that device only, and the card's own dedupe
-- (already on the roster / calendar = never suggested) still holds.
-- ============================================================================

create table if not exists suggestion_marks (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  doc_id bigint not null references minutes_docs (id) on delete cascade,
  -- Stable per-document identity computed by src/lib/minutes-suggestions.ts,
  -- e.g. "member:<name>|<position>" or "event:<date>|<title>".
  suggestion_key text not null check (char_length(suggestion_key) <= 200),
  action text not null check (action in ('applied', 'ignored')),
  -- Hard Rule 8 idiom: the real signed-in human, stamped by the server.
  decided_by text not null check (char_length(decided_by) <= 120),
  decided_at timestamptz not null default now(),
  -- One verdict per suggestion per document — the upsert target.
  unique (org_id, doc_id, suggestion_key)
);

create index if not exists idx_suggestion_marks_doc on suggestion_marks (org_id, doc_id);

alter table suggestion_marks enable row level security;

-- Same shape as every org-scoped table (phase 7): read within the accessible
-- tree, write within the writable tree (the read-only auditor is refused by
-- the database, not by a UI check that could drift).
create policy suggestion_marks_select on suggestion_marks
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));

create policy suggestion_marks_insert on suggestion_marks
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_writable()));

create policy suggestion_marks_update on suggestion_marks
  for update to authenticated
  using (org_id in (select public.accessible_orgs_writable()))
  with check (org_id in (select public.accessible_orgs_writable()));

create policy suggestion_marks_delete on suggestion_marks
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_writable()));

comment on table suggestion_marks is
  'What happened to each AI suggestion card on a confirmed minutes document (work order 64 E3): applied or ignored, by whom, when. The same document never nags the same suggestion twice.';
