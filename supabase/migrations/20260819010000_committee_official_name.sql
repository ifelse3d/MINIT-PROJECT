-- ============================================================================
-- Minit — the name that goes on the government form
--
-- HOW TO APPLY: Supabase dashboard → SQL Editor → New query → paste this whole
-- file → Run. Once. "Success. No rows returned" means it worked.
--
-- WHY (2026-08-19, user: "EROSES 要的不是華語而是馬來語。所以人員注冊也需要馬來語"):
-- a member of a Chinese-speaking society is 陈大明 to everyone who knows him and
-- TAN TAI BENG on his identity card. eROSES wants the second one, because it is
-- the name the Registrar can match against a person. The minutes, the roster on
-- the wall and everyone's memory use the first.
--
-- This is NOT a translation and must never be produced by translating: it is a
-- second legal fact about the same person, copied from a document. Putting it
-- in the glossary (which teaches the AI how to WRITE a word) would be a
-- category error — and an invented romanisation on a government form is a false
-- filing. So it is its own column, typed in by a human, and left empty until
-- somebody actually knows it.
-- ============================================================================

alter table committee_roster
  add column if not exists name_official text
    check (name_official is null or char_length(name_official) <= 160);

comment on column committee_roster.name_official is
  'Name as printed on the identity card / as filed with the Registrar (usually romanised). Used for eROSES. Never produced by translating person_name.';
