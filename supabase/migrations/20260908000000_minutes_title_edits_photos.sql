-- ============================================================================
-- Migration 30 — minutes_docs grows a NAME, an EDIT LOG, and its PHOTOS.
-- (J review 2026-08-28, items 3 & 4: 「会议记录没有命名，要找回很难」「保存后……
--  没得看之前上传的照片……做修改下面就要写几时 EDIT」.)
--
-- What this adds — three column groups on minutes_docs, nothing else:
--
--   title        text   The society's own name for the saved document
--                       ("Mesyuarat Program Hari Ibu Bapa"). Suggested by code
--                       from the meeting type + date, editable before saving.
--                       NULL = older rows; the UI falls back to type + date,
--                       exactly what it showed before this column existed.
--
--   edited_at    timestamptz   When a person last corrected the saved document
--   edited_by    text          and who. NULL = never edited after confirming.
--                       Every edit ALSO appends a visible line inside the
--                       document body, so the paper trail survives printing.
--
--   photo_paths  jsonb  The storage paths (uploads bucket) of the source
--                       photos this document was read from, e.g.
--                       ["15/meeting_notes/1724…-IMG.jpg", …]. The files were
--                       ALWAYS stored (record-upload.ts, Inbox); this finally
--                       remembers WHICH files belong to WHICH saved minutes,
--                       so History can show the original handwriting.
--                       Paths only — never image data — and the storage RLS
--                       policies (20260719000000 §D) still gate every read.
--
-- Like every schema change since D8: the app DEGRADES cleanly while this is
-- not applied (title/photos are simply not stored; editing still works but
-- only the in-document line records it). Apply with salin-migration.bat → 30.
-- ============================================================================

alter table minutes_docs
  add column if not exists title text
    check (title is null or char_length(title) between 1 and 200);

alter table minutes_docs
  add column if not exists edited_at timestamptz;

alter table minutes_docs
  add column if not exists edited_by text
    check (edited_by is null or char_length(edited_by) <= 120);

alter table minutes_docs
  add column if not exists photo_paths jsonb;

-- Guard: photo_paths, when present, is a small array of strings — never a
-- dumping ground. 12 pages is far above the real page cap for minutes (5).
alter table minutes_docs
  drop constraint if exists minutes_docs_photo_paths_shape;
alter table minutes_docs
  add constraint minutes_docs_photo_paths_shape
  check (
    photo_paths is null
    or (jsonb_typeof(photo_paths) = 'array' and jsonb_array_length(photo_paths) <= 12)
  );

-- ROLLBACK (manual, if ever needed):
--   alter table minutes_docs drop constraint if exists minutes_docs_photo_paths_shape;
--   alter table minutes_docs drop column if exists photo_paths;
--   alter table minutes_docs drop column if exists edited_by;
--   alter table minutes_docs drop column if exists edited_at;
--   alter table minutes_docs drop column if exists title;
