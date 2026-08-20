-- ===========================================================================
-- 2026-08-21 · ai_usage.refunded_at —— 退额度不再把成本纪录一起删掉
--
--   🚧 尚未套用。低风险：一个 nullable 栏位 ＋ 一个部分索引，没有 trigger、
--      没有 RLS 改动、没有资料迁移。
--   D8 铁律：J 本人在 Supabase SQL Editor 手动跑。写这个档的人不执行它。
--
-- 为什么需要（0bd7c6b 自己的 commit 讯息就承认了这件事）：
--
--   > refundUsage() DELETES the ai_usage row, so a refund also erases the cost
--   > figure for a call we really did pay the vendor for. … The clean fix is a
--   > refunded_at column.
--
--   一次退款同时做了两件不该一起做的事：
--     ① 把额度还给使用者          ← 这一件是对的
--     ② 把「我们付给厂商多少钱」的纪录抹掉  ← 这一件是错的
--
--   结果是 unit-economics 低估真实成本，而 docs/方案与权益设计.md 第 5.1 节
--   整节都建立在「本月真实成本」这个数字上 —— 评审最会追问的也正是它。
--   评审问「你们一个月成本多少」，答案不可以是一个把失败的呼叫悄悄扣掉的数字。
--
-- 加了这一栏之后，两个数字从此不再是同一个（这正是整件事的重点）：
--
--   额度用掉了几次   →  where refunded_at is null      （退掉的不算）
--   我们付了多少钱   →  不看 refunded_at               （退掉的照算，钱真的付了）
--
-- 🔴 还有一个更要紧的用途（docs/助手重做-设计.md 第 4.5 节，J 2026-08-20 定案）：
--   退款的意思从今天起变了。以前它是「拒答就退钱」的客服工具；现在的规矩是
--   **「打了厂商就算用掉，没打到厂商才不扣」**。所以 refunded_at 不再代表
--   「这个人不满意」，它代表 **「我们根本没打到厂商」** ——
--   也就是一个**厂商健康度指标**：退款率一高，要去看的是厂商或网路，不是客服。
--
-- 🟢 为什么现在写：J 正要建新的 Supabase project，这一支会跟其他 12 支
--   照档名顺序一起跑一次。等新库建好才想起来，就变成要在活的资料库上贴
--   migration。跟 20260822000000（pgvector）完全同一个道理。
-- ===========================================================================

alter table ai_usage
  add column if not exists refunded_at timestamptz;

comment on column ai_usage.refunded_at is
  'When this action was refunded, i.e. the member''s quota was given back. '
  'NULL for every normal row. A refunded row is NOT deleted: we paid the vendor '
  'for the call either way, so the row keeps its tokens and cost_micros and '
  'still counts towards real cost. Since 2026-08-21 a refund means one thing '
  'only -- WE NEVER REACHED THE VENDOR (network, outage, a throw before the '
  'call). It is therefore a vendor-health signal, not a customer-service one. '
  'See docs/助手重做-设计.md section 4.5.';

-- 算额度的查询会长成 `where refunded_at is null`，所以索引只需要盖住没退的那些。
-- 部分索引比全表索引小很多，而且退款照定义是少数。
create index if not exists idx_ai_usage_org_created_not_refunded
  on ai_usage (org_id, created_at)
  where refunded_at is null;

-- RLS 不用动：ai_usage_select 已经是 `org_id in (select public.accessible_orgs())`，
-- 新栏位自动跟着走。写入一律走 service role（checkAndRecordUsage / refundUsage），
-- 所以使用者永远改不了自己的用量表。

-- 幂等：上面三句都是 `if not exists`，重跑不会坏。
-- （这一支没有 policy，所以不需要 20260728000000 那种 `drop policy if exists`
--   的前置 —— Postgres 的 create policy 没有 if not exists。）


-- ===========================================================================
-- 验证段（纯 select，不改任何东西）
-- ===========================================================================
--
-- 1) 栏位在不在：
--      select column_name, data_type, is_nullable
--        from information_schema.columns
--       where table_name = 'ai_usage' and column_name = 'refunded_at';
--
-- 2) 索引在不在：
--      select indexname from pg_indexes
--       where tablename = 'ai_usage' and indexname like '%not_refunded%';
--
-- 3) 这就是「两个数字从此分开」长什么样子 ——
--    左边是使用者被扣了几次，右边是我们真的付了多少：
--      select org_id,
--             date_trunc('month', created_at at time zone 'Asia/Kuala_Lumpur') as bulan,
--             count(*) filter (where refunded_at is null) as dikira_pada_pengguna,
--             count(*)                                    as panggilan_sebenar,
--             round(sum(cost_micros)/1e6::numeric, 4)     as kos_usd_sebenar
--        from ai_usage
--       group by 1, 2 order by 2 desc, 1;
--
-- 4) 厂商健康度（第 4.5 节讲的那个用途）—— 退款率高就是厂商或网路有问题：
--      select date_trunc('day', created_at at time zone 'Asia/Kuala_Lumpur') as hari,
--             count(*) as panggilan,
--             count(*) filter (where refunded_at is not null) as gagal_hubungi_vendor
--        from ai_usage group by 1 order by 1 desc limit 30;
--
-- 回退：
--   drop index if exists idx_ai_usage_org_created_not_refunded;
--   alter table ai_usage drop column if exists refunded_at;
-- ===========================================================================
