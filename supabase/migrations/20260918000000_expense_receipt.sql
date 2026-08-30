-- ============================================================================
-- Migration 40 — expenses.receipt_path / expenses.no_receipt: THIS row's
-- shop receipt. (工作单 97 §5，J 2026-08-30 深夜拍板 #9「收/支流程最後一步
-- 都要見到收據」的支出半邊)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 40 to copy it.)
--
-- WHY:
--   Recording an expense now ends with "this row's receipt": attach a photo
--   of the shop receipt/invoice, or honestly record that there is none.
--   Nothing blocks saving (J: 不擋保存、不強迫) — these two columns only
--   REMEMBER what the person chose:
--     * receipt_path — the storage path of the attached photo/PDF in the
--       private "uploads" bucket (an uploads row rides along, kind
--       "expense", so it also shows in the Inbox).
--     * no_receipt   — true means the person pressed "no receipt" — an
--       honest recorded fact, not a default. NULL = never answered.
--
-- Until this is applied the app FAILS OPEN: the attach/no-receipt buttons
-- report "the database has not been updated yet (migration 40)" and nothing
-- is lost; recording and claiming expenses work exactly as before.
-- ============================================================================

alter table expenses
  add column if not exists receipt_path text;

alter table expenses
  add column if not exists no_receipt boolean;

comment on column expenses.receipt_path is
  'Storage path (uploads bucket) of the shop receipt/invoice attached to this expense. NULL = none attached.';

comment on column expenses.no_receipt is
  'TRUE = the person explicitly recorded that this expense has no receipt (an honest fact, not a default). NULL = the question was never answered.';

-- ============================================================================
-- 验证段（纯 select，不改任何东西）
-- ============================================================================
--
--   select column_name from information_schema.columns
--   where table_name = 'expenses'
--     and column_name in ('receipt_path', 'no_receipt');
--
-- 应该回两行。
--
-- ============================================================================
-- ROLLBACK（如果要撤销 — 会丢掉已记录的单据路径与「没有单据」标记）
-- ============================================================================
--
--   alter table expenses drop column if exists receipt_path;
--   alter table expenses drop column if exists no_receipt;
