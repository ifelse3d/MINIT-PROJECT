-- ============================================================================
-- Migration 46 — committee_roster: IC NUMBER, ADDRESS, OCCUPATION.
-- (130 號單 §11 ← 101 §8 / 119 A-9：成品頁「加人卡」把讀出來的新人資料預填)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 46 to copy it.)
--
-- WHY:
--   The eROSES AJK step asks for each office bearer's IC number, address
--   and occupation, and the minutes reader already reads them off an
--   appointment line ("dilantik … No. K/P … alamat … pekerjaan" — 118 §5
--   prints them into the document). The add-to-roster card can now carry
--   them across so the person only confirms; before this the roster had
--   nowhere to keep them and they were retyped, or lost.
--
-- 🔴 PDPA — this REVERSES migration 37's "IC numbers remain not-collected":
--   an IC number is the most sensitive field in the roster. Same handling as
--   email and phone, tightened: shown ONLY inside the edit row of the roster
--   (never on the list, never in a print, never in a share), NEVER selected
--   by org-tools, NEVER sent to the AI, deleted with the organisation
--   (Hard Rule 5). Reported in 131 for J to keep or reverse.
--
-- All three columns are nullable and the app works before this is applied
-- (fail-open, D8): inserts retry without the new columns (the strip-and-
-- retry ladder), reads fall back one migration at a time.
-- ============================================================================

alter table committee_roster
  add column if not exists ic_no text
    check (ic_no is null or char_length(ic_no) <= 20);

alter table committee_roster
  add column if not exists address text
    check (address is null or char_length(address) <= 240);

alter table committee_roster
  add column if not exists occupation text
    check (occupation is null or char_length(occupation) <= 120);

comment on column committee_roster.ic_no is
  'Office bearer''s IC number as eROSES asks on the AJK step. Optional. Edit row only — never listed, printed, shared, selected by org-tools, or sent to the AI.';

comment on column committee_roster.address is
  'Office bearer''s address as eROSES asks on the AJK step. Optional; the Negeri box is derived from it by code (src/lib/address-state.ts).';

comment on column committee_roster.occupation is
  'Office bearer''s occupation as eROSES asks on the AJK step. Optional.';
