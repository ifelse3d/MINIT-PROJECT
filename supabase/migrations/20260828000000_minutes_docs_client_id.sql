-- ============================================================================
-- Minit — minutes_docs.client_id：确认存档的幂等键
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份贴上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（add column if not exists ＋ create unique index if not exists）。
--   🚧 尚未套用。D8 铁律：J 本人手动跑，写这个档的人不执行它。
--
-- ----------------------------------------------------------------------------
-- 这一支在补什么洞（2026-08-25 通宵 S0-3）
--
-- 「确认并保存」是一支普通的 insert：网路慢、按钮被按两次、或 timeout 后重试，
-- 同一份会议记录就会存成两笔 —— 历史页出现两份一模一样的正式文件，搜索也会
-- 把同一句话找到两次。收据那边早有 client_id 挡这件事（20260726000000），
-- 会议记录一直没有。
--
-- 修法：加 `client_id`（浏览器给每一次「确认」发一个 UUID，重试沿用同一个），
-- 部分唯一索引挡住同 org 同 key 的第二笔。旧列 client_id 是 NULL，不受影响。
-- 程式码已经先写好：没有这一栏时自动退回旧行为（check-then-insert 仍然挡住
-- 最常见的连按两下）；套用之后，连并发的重复也会被资料库本身拒绝。
-- ============================================================================

alter table minutes_docs
  add column if not exists client_id text;

comment on column minutes_docs.client_id is
  'Idempotency key from the browser: one per confirmation, resent on retry. '
  'NULL for rows saved before 2026-08-28.';

create unique index if not exists minutes_docs_org_client_uniq
  on minutes_docs (org_id, client_id)
  where client_id is not null;

-- ============================================================================
-- 验证段（纯 select，不改任何东西）
-- ============================================================================
--
-- 1) 栏位在了：
--      select column_name from information_schema.columns
--       where table_name = 'minutes_docs' and column_name = 'client_id';
--
-- 2) 索引在了：
--      select indexname from pg_indexes
--       where tablename = 'minutes_docs' and indexname = 'minutes_docs_org_client_uniq';
--
-- 回退：
--   drop index if exists minutes_docs_org_client_uniq;
--   alter table minutes_docs drop column if exists client_id;
-- ============================================================================
