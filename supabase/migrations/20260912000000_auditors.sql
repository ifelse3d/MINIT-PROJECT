-- ============================================================================
-- Migration 34 — auditors: the society's Juruaudit roster.
-- (工作单 56 包 D2-1：eROSES Penyata Tahunan 第 4 步 Maklumat Juruaudit)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 34 to copy it.)
--
-- WHY:
--   eROSES step 4 asks for the society's appointed auditors: name, identity,
--   e-mail, appointment date, status — and warns that the ACTIVE count must
--   match the constitution. The app had no concept of an auditor at all
--   (work order 51 B-7 left the space; this fills it).
--
-- Mirrors committee_roster's conventions:
--   * name_official — the name AS PRINTED ON THE IC, copied not transliterated
--     (the committee list's 2026-08-19 rule: bites at the filing, not the add).
--   * PDPA (Hard Rule 5): NO IC numbers, ever. eROSES asks for one on its own
--     form — the person types it THERE; Minit's guidance says so instead of
--     storing government identifiers.
--
-- The app works before this is applied (fail-open, D8): the auditors card
-- shows an honest "not stored yet" line and nothing crashes.
-- ============================================================================

create table if not exists auditors (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  person_name text not null check (char_length(person_name) <= 120),
  -- As printed on the IC; empty until somebody copies it from the card.
  name_official text check (name_official is null or char_length(name_official) <= 120),
  email text check (email is null or char_length(email) <= 254),
  -- eROSES: Tarikh Lantik.
  appointed_on date,
  -- eROSES: Status (Aktif / Tidak aktif). The active count is what must
  -- match the constitution.
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create index if not exists idx_auditors_org on auditors (org_id);

alter table auditors enable row level security;

-- Same shape as every org-scoped table (phase 7): read within the accessible
-- tree, write within the writable tree.
create policy auditors_select on auditors
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));

create policy auditors_insert on auditors
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_writable()));

create policy auditors_update on auditors
  for update to authenticated
  using (org_id in (select public.accessible_orgs_writable()))
  with check (org_id in (select public.accessible_orgs_writable()));

create policy auditors_delete on auditors
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_writable()));

comment on table auditors is
  'The society''s appointed Juruaudit (work order 56 D2-1) - what eROSES Penyata Tahunan step 4 files. No IC numbers (PDPA): name_official is the IC NAME only.';
