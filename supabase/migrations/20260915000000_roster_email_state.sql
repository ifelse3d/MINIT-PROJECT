-- ============================================================================
-- Migration 37 — committee_roster: EMAIL and STATE (Negeri), for eROSES.
-- (工作单 69 包H1：§1-3 名册补到 eROSES AJK 步真的要的每一栏)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 37 to copy it.)
--
-- WHY:
--   * email — the eROSES AJK (committee) step asks for each office bearer's
--             email address. Optional here: the rule bites at the filing, not
--             at the adding (same decision as name_official, 2026-08-19).
--   * state — "Negeri" on the same eROSES form. Free text, because societies
--             write it their own way (Selangor / SELANGOR / WP Kuala Lumpur).
--
-- PDPA: an email is personal data. Same handling as person_name — shown in
-- the roster the treasurer typed it into, NEVER selected by org-tools, never
-- sent to the AI. IC numbers remain not-collected at all.
--
-- Both columns are nullable and the app works before this is applied
-- (fail-open, D8): inserts retry without the new columns, reads fall back.
-- ============================================================================

alter table committee_roster
  add column if not exists email text
    check (email is null or char_length(email) <= 160);

alter table committee_roster
  add column if not exists state text
    check (state is null or char_length(state) <= 60);

comment on column committee_roster.email is
  'Office bearer''s email, as eROSES asks on the AJK step. Optional; never selected by org-tools, never sent to the AI.';

comment on column committee_roster.state is
  'Negeri, as eROSES asks on the AJK step. Free text — societies write it their own way.';
