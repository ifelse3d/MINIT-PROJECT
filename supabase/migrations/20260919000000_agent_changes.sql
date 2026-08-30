-- ============================================================================
-- Migration 41 — agent_changes: the audit trail behind "agent 直接改" +
-- committee_roster.phone.
-- (工作单 100 §0-4：可复原的普通改动 agent 直接改，但「修改必留痕」是 8/28
--  家规——谁叫改的、何时、旧值，一行一改，还要能一键复原。)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 41 to copy it.)
--
-- WHY:
--   J's ruling (2026-08-31, work order 100 §0-4, the "member 换手机号码"
--   question): the agent may change a REVERSIBLE ordinary detail (phone,
--   email, title…) directly — no form, no popup — provided the conversation
--   shows "changed: old → new" with an undo button, and the system records
--   who asked, when, and the old value. This table is that record.
--
--   committee_roster.phone: the very field J's example names. The roster had
--   email (migration 37) but no phone column; the eROSES AJK step does not
--   ask for one, but a committee you cannot call is a committee only on
--   paper. Optional like email/state — the strip-retry ladder covers it.
--
-- 🔴 FAIL-CLOSED, unlike most migrations (deliberate, the fence's
--   direction): while this table is missing, the agent REFUSES the change
--   and says the audit trail is not ready — a change without a trace
--   violates 必留痕, refusing violates nothing. Nothing else in the app
--   depends on this table, so nothing else changes behaviour.
--
--   PDPA note: old_value/new_value hold committee CONTACT fields the roster
--   already stores (phone/email/state/honorific/note). Never donor data,
--   never IC numbers — the tool's field whitelist enforces that in code.
-- ============================================================================

create table if not exists agent_changes (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  -- Hard Rule 8 idiom: the real signed-in human the agent acted for,
  -- stamped by the server from the session — never from the browser.
  actor_email text not null check (char_length(actor_email) <= 200),
  target_table text not null check (target_table in ('committee_roster')),
  target_id bigint not null,
  field text not null check (char_length(field) <= 40),
  old_value text,
  new_value text,
  created_at timestamptz not null default now(),
  -- Set when the person taps undo; the row stays (the trail never shrinks).
  undone_at timestamptz
);

create index if not exists idx_agent_changes_org on agent_changes (org_id, created_at desc);

alter table agent_changes enable row level security;

-- Same shape as every org-scoped table (phase 7): read within the accessible
-- tree, write within the writable tree.
create policy agent_changes_select on agent_changes
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));

create policy agent_changes_insert on agent_changes
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_writable()));

create policy agent_changes_update on agent_changes
  for update to authenticated
  using (org_id in (select public.accessible_orgs_writable()))
  with check (org_id in (select public.accessible_orgs_writable()));

-- No delete policy on purpose: an audit trail that can be deleted by the
-- person being audited is not a trail. (delete-organisation still works —
-- the org_id FK cascades with the org itself, PDPA Hard Rule 5.)

comment on table agent_changes is
  'One row per record change the AI agent made on a person''s instruction (work order 100 §0-4): who asked, when, field, old and new value, and whether it was undone. The conversation shows old → new with an undo; this table is the memory behind it.';

alter table committee_roster
  add column if not exists phone text;

comment on column committee_roster.phone is
  'Contact phone for this committee member (work order 100 §0-4 — J''s "member 换手机号码" example). Optional; not an eROSES field. The agent may change it (tier 1) with a trace in agent_changes.';

-- ---------------------------------------------------------------------------
-- ROLLBACK (only if J says so):
--   drop table if exists agent_changes;
--   alter table committee_roster drop column if exists phone;
-- ---------------------------------------------------------------------------
