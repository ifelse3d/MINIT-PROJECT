-- ============================================================================
-- Minit — app_errors：錯誤記錄地基（S-7，2026-08-25 通宵）
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份贴上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（create table if not exists）。
--   🚧 尚未套用。D8 铁律：J 本人手动跑，写这个档的人不执行它。
--
-- ----------------------------------------------------------------------------
-- 今天一个 API route 挂掉，除了使用者的红色横幅之外没有任何痕迹 —— 总控台
-- 那栏「30 天错误数」没有东西可数。这张表是最小的地基：
--
--   🔴 PDPA（Hard Rule 5）：不存文件内容、不存捐款人姓名电话、不存 stack、
--   不存原始错误讯息。存的是 route 名、错误码、讯息的 SHA-256 前 16 位
--   （同一种错误聚成同一个雜湊，能数「这种错发生了几次」，读不回原文）。
--
--   写入走 service role（server 端 capture helper，src/lib/app-errors.ts）。
--   RLS 开着、没有任何 policy = 普通使用者读不到也写不到，刚好是要的。
-- ============================================================================

create table if not exists app_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  /** Which API route / server action failed, e.g. "/api/extract-minutes". */
  route text not null,
  /** Coarse machine code: HTTP status or an error class name. */
  code text,
  /** SHA-256 (first 16 hex chars) of the message — groups identical errors
      without storing the message itself (PDPA). */
  message_hash text,
  /** Which organisation's request it was, when known. No user id — counting
      errors needs an org, not a person. */
  org_id bigint references orgs (id) on delete set null
);

create index if not exists idx_app_errors_created on app_errors (created_at);
create index if not exists idx_app_errors_org on app_errors (org_id, created_at);

alter table app_errors enable row level security;
-- Deliberately NO policies: only the service role (which bypasses RLS) can
-- read or write. The admin console reads through the server with an
-- ADMIN_EMAILS check in front (S-6).

comment on table app_errors is
  'Server-side error counters for the ops console. Route + code + message '
  'hash + org only — NEVER contents, names, stacks or raw messages (PDPA).';

-- ============================================================================
-- 验证段（纯 select，不改任何东西）
-- ============================================================================
--
--   select column_name from information_schema.columns
--    where table_name = 'app_errors' order by ordinal_position;
--
--   select relrowsecurity from pg_class where relname = 'app_errors';  -- true
--
-- 回退：
--   drop table if exists app_errors;
-- ============================================================================
