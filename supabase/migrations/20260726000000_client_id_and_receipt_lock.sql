-- ===========================================================================
-- 2026-07-26 · Phase A — data-integrity fixes
--
-- Additive only. No DROP TABLE, no DROP COLUMN, no data deletion.
-- Safe to run on a database that already has rows.
--
-- WHAT THIS FIXES (plain English):
--
--  A. Right now, when the treasurer issues receipts, the code matches each
--     receipt number to a donor by POSITION in a list. The database does not
--     promise to return rows in the order they were sent, so a receipt can
--     end up printed with the WRONG donor's name and amount. That is a legal
--     document, so this is the most serious bug in the app.
--     Fix: give every donation a "client_id" — a label the phone generates —
--     so the code can match by NAME instead of by position.
--
--  B. Right now, if the internet drops after the receipts were saved but
--     before the phone hears back, the app says "no receipts were issued,
--     try again" — which is false. Tapping again issues a SECOND set of
--     receipts for the same donations, burning receipt numbers and
--     double-counting money.
--     Fix: the unique (org_id, client_id) rule below makes a second attempt
--     harmless — the database recognises the rows and refuses to duplicate.
--
--  C. Cash handovers (collector → HQ) would crash on the very first real
--     save: the code writes status 'settled' but the database only allowed
--     'pending' or 'confirmed'.
--     Fix: allow 'settled', the word the code actually uses.
--
--  D. Any committee member with write access could edit or delete a receipt
--     number. CLAUDE.md Hard Rule 2 says receipt numbers must be
--     "sequential, non-editable, gap-free".
--     Fix: a trigger makes the identity of an issued receipt permanent.
--
--  E. Donations added by hand were supposed to be tagged for auditors, but
--     there was no column to tag them in, so the tag was silently thrown
--     away on save.
--     Fix: add a "source" column.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- A + B. donations.client_id — match receipts to donors safely, and make
--        retrying an interrupted "Issue receipts" harmless.
--
-- Nullable on purpose: rows created before this migration have no client_id,
-- and Postgres treats NULLs as distinct, so any number of legacy rows can
-- coexist. New code always sets it.
-- ---------------------------------------------------------------------------
alter table donations
  add column if not exists client_id text;

comment on column donations.client_id is
  'Row id generated on the client before saving. Lets the server return receipt '
  'numbers matched to the exact row the phone sent (never by array position), and '
  'makes a retried "Issue receipts" idempotent via the unique constraint below.';

-- A plain table constraint (not a partial index) so PostgREST/Supabase upsert
-- can infer it with onConflict: 'org_id,client_id'.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'donations_org_client_uniq'
  ) then
    alter table donations
      add constraint donations_org_client_uniq unique (org_id, client_id);
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- E. donations.source — 'photo' (AI read it from a ledger picture) or
--    'manual' (a human typed it in). Auditors need to tell these apart.
--    Left nullable: legacy rows genuinely do not know which they were.
-- ---------------------------------------------------------------------------
alter table donations
  add column if not exists source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'donations_source_check'
  ) then
    alter table donations
      add constraint donations_source_check
      check (source is null or source in ('photo', 'manual'));
  end if;
end;
$$;

comment on column donations.source is
  'How this donation entered the system: photo = AI extraction from a ledger '
  'image, manual = keyed in by a human. NULL for rows predating 2026-07-26.';


-- ---------------------------------------------------------------------------
-- C. remittance_batches.status — the database said ('pending','confirmed');
--    src/lib/custody.ts writes 'settled'. The code is the source of truth for
--    the custody state machine (collected → pending_remittance → settled), so
--    the database follows it.
--
--    Any legacy 'confirmed' row is migrated to 'settled' first (there should
--    be none — nothing writes this table yet — but this is free insurance).
-- ---------------------------------------------------------------------------
update remittance_batches set status = 'settled' where status = 'confirmed';

alter table remittance_batches
  drop constraint if exists remittance_batches_status_check;

alter table remittance_batches
  add constraint remittance_batches_status_check
  check (status in ('pending', 'settled'));


-- ---------------------------------------------------------------------------
-- D. Make an issued receipt's identity permanent (Hard Rule 2).
--
--    Two changes:
--      1. Remove the blanket DELETE policy — an issued receipt is never
--         deleted by a user. (Deleting the whole organisation still works:
--         that runs with the service-role key and via ON DELETE CASCADE,
--         neither of which is subject to these policies.)
--      2. Keep UPDATE allowed, but a trigger rejects any change to the
--         columns that define WHICH receipt this is. Operational columns
--         (pdf_storage_path, language, delivered_via, issued_at) stay
--         editable so delivery tracking can be added later.
--
--    A trigger is used rather than column-level GRANTs because Supabase
--    re-grants table privileges to `authenticated` in several situations; a
--    trigger cannot be silently undone that way.
-- ---------------------------------------------------------------------------
drop policy if exists receipts_delete on public.receipts;

create or replace function public.receipts_identity_is_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.receipt_no is distinct from old.receipt_no
     or new.donation_id is distinct from old.donation_id
     or new.org_id is distinct from old.org_id then
    raise exception
      'Receipt identity is immutable (Hard Rule 2): receipt_no, donation_id and org_id cannot be changed once issued.';
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_identity_immutable on public.receipts;

create trigger receipts_identity_immutable
  before update on public.receipts
  for each row
  execute function public.receipts_identity_is_immutable();


-- ---------------------------------------------------------------------------
-- Verification — run these after applying. Expected results in comments.
-- ---------------------------------------------------------------------------
-- select column_name from information_schema.columns
--   where table_name = 'donations' and column_name in ('client_id','source');
--   -- expect 2 rows
--
-- select conname from pg_constraint
--   where conname in ('donations_org_client_uniq','donations_source_check',
--                     'remittance_batches_status_check');
--   -- expect 3 rows
--
-- select tgname from pg_trigger where tgname = 'receipts_identity_immutable';
--   -- expect 1 row
--
-- select policyname from pg_policies
--   where tablename = 'receipts' order by policyname;
--   -- expect receipts_insert, receipts_select, receipts_update (NO receipts_delete)
