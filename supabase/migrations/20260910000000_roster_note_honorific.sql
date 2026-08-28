-- ============================================================================
-- Migration 32 — committee_roster: a NOTE per person, and an HONORIFIC/TITLE.
-- (工作单 51 包B：B-6 同名同姓备注栏 · B-7 敬语/职衔地基，拍板 6 与 7)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 32 to copy it.)
--
-- WHY:
--   * note      — two members can share a name (两位陈小明). The society tells
--                 them apart their own way:（大）（小）, a village, a class.
--                 Free text, shown in the roster and the attendance picker,
--                 NEVER sent to the AI and never filed to eROSES.
--   * honorific — 陈讲师 = surname + title. The roster records the title
--                 (讲师, Dato', Ustaz…) so a meeting note that says 陈讲师
--                 can later be matched to the right person (品质场 will wire
--                 the AI side; tonight is the column and the form).
--
-- Both columns are nullable and the app works before this is applied
-- (fail-open, D8): inserts retry without the new columns, reads fall back.
-- ============================================================================

alter table committee_roster
  add column if not exists note text
    check (note is null or char_length(note) <= 120);

alter table committee_roster
  add column if not exists honorific text
    check (honorific is null or char_length(honorific) <= 60);

comment on column committee_roster.note is
  'The society''s own way of telling two same-named people apart (（大）／（小）, a village, a class). Never sent to the AI, never filed.';

comment on column committee_roster.honorific is
  'Title/honorific as the society uses it (讲师, Dato'', Ustaz…). Groundwork for matching 陈讲师-style references; the AI side comes later.';
