-- ============================================================================
-- Migration 35 — orgs: the Maklumat Am fields eROSES asks for, and the
-- society's bank accounts.
-- (工作单 56 包 D2-2：eROSES Penyata Tahunan 第 2 步 Maklumat Am)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 35 to copy it.)
--
-- WHY:
--   eROSES step 2 asks for: society phone, financial year start, REGISTERED
--   member count, office-bearer count, VOTING member count, branches, bank
--   accounts. Some of those Minit can already derive (office bearers = the
--   committee roster; branches = the org tree). The rest were nowhere:
--
--   RECORDED here (nothing else knows them):
--     * phone                — the society's phone number.
--     * financial_year_start — when the financial year begins (a date; eROSES
--                              shows DD MMMM). Also what the Penyata Kewangan
--                              date range defaults to eventually.
--     * members_registered   — Bilangan ahli yang berdaftar. Minit keeps the
--                              COMMITTEE roster, not a general member list,
--                              so this is a number the secretary maintains.
--     * members_voting       — Bilangan ahli yang layak mengundi. Same.
--     * org_bank_accounts    — Pilihan Bank / Nombor akaun table.
--
--   DERIVED elsewhere (deliberately NOT stored — "写进资料库不是一个答案，
--   先问这份资料是记录的还是推导的"):
--     * Bilangan Pemegang Jawatan = count of committee_roster.
--     * Bilangan cawangan        = count of child orgs.
--
-- PDPA / privacy: a bank account number is the SOCIETY's, not a person's, and
-- eROSES itself files it. It is still money-adjacent: org-tools (the
-- assistant's lookups) never select from org_bank_accounts, and nothing here
-- reaches the AI.
--
-- The app works before this is applied (fail-open, D8): the settings card
-- saves report an honest "not stored yet" line; reads fall back tier by tier.
-- ============================================================================

alter table orgs
  add column if not exists phone text
    check (phone is null or char_length(phone) <= 32);

alter table orgs
  add column if not exists financial_year_start date;

alter table orgs
  add column if not exists members_registered integer
    check (members_registered is null or members_registered >= 0);

alter table orgs
  add column if not exists members_voting integer
    check (members_voting is null or members_voting >= 0);

comment on column orgs.phone is
  'The society''s phone number (eROSES Maklumat Am: No. telefon Pertubuhan).';
comment on column orgs.financial_year_start is
  'When the financial year begins (eROSES Maklumat Am: Tahun kewangan bermula).';
comment on column orgs.members_registered is
  'Bilangan ahli yang berdaftar - maintained by the secretary; Minit has no general member list to derive it from.';
comment on column orgs.members_voting is
  'Bilangan ahli yang layak mengundi - maintained by the secretary.';

create table if not exists org_bank_accounts (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  bank_name text not null check (char_length(bank_name) <= 120),
  account_no text not null check (char_length(account_no) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists idx_org_bank_accounts_org on org_bank_accounts (org_id);

alter table org_bank_accounts enable row level security;

create policy org_bank_accounts_select on org_bank_accounts
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));

create policy org_bank_accounts_insert on org_bank_accounts
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_writable()));

create policy org_bank_accounts_update on org_bank_accounts
  for update to authenticated
  using (org_id in (select public.accessible_orgs_writable()))
  with check (org_id in (select public.accessible_orgs_writable()));

create policy org_bank_accounts_delete on org_bank_accounts
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_writable()));

comment on table org_bank_accounts is
  'The society''s bank accounts (work order 56 D2-2) - eROSES Maklumat Am''s Maklumat akaun bank table. Society data, not personal data; never selected by org-tools, never sent to the AI.';
