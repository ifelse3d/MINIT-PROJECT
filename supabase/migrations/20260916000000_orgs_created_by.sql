-- ============================================================================
-- Migration 38 — orgs.created_by: WHO opened this organisation.
-- (工作单 69 包H3：§1-14，J 2026-08-29 深夜拍板)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 38 to copy it.)
--
-- WHY:
--   The old "one account may create at most 3 top-level organisations" check
--   counted through members_roles and was blocking people it should not have
--   (J's decision: rip it out, do NOT spend time diagnosing it). The simplest
--   rule replaces it: a FREE account creates ONE top-level organisation —
--   counted by this column, one query, no clever logic. Being invited into
--   somebody else's organisation can never affect it, because an invite
--   never writes created_by.
--
-- Backfill: for existing root orgs the creator is the earliest hq_admin —
-- the row createOrg itself inserted at creation time.
-- ============================================================================

alter table orgs
  add column if not exists created_by uuid;

update orgs
set created_by = (
  select m.user_id
  from members_roles m
  where m.org_id = orgs.id and m.role = 'hq_admin'
  order by m.id asc
  limit 1
)
where parent_org_id is null and created_by is null;

comment on column orgs.created_by is
  'The auth user who created this organisation (set by createOrg; backfilled from the earliest hq_admin). The free-plan one-root-org rule counts THIS column only — invitations never touch it.';
