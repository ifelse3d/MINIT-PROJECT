-- ===========================================================================
-- 2026-08-03 · ai_usage 加 token 与成本栏位
--
--   🚧 尚未套用。低风险：纯附加栏位，全部 nullable，没有 trigger、没有 RLS 改动。
--   D8 铁律：这一份要在部署新版程式码**之前**跑。
--   （不过就算顺序反了也不会坏 —— src/lib/ai/usage.ts 的 recordTokens()
--    是 best-effort，栏位不存在时它会安静地失败，app 行为完全跟今天一样。）
--
-- 为什么需要（2026-07-29 交接与设计决策 D2 + 2026-08-03-AI-API-选型与成本.md）：
--   ai_usage 现在只有 org_id + action + created_at。所以「一间庙一个月花你多少
--   钱」这个数字**今天算不出来** —— 而商业可行性占竞赛评审 25%，那一页的全部内容
--   就是这个数字。
--
--   资料一直都在：Gemini 每一次回应都带 usageMetadata，只是 gemini.ts 直接丢掉了。
--   现在接起来了。
--
-- 为什么存 cost 而不只存 token：
--   不同供应商 token 单价不同，而且会调价。只记 token 的话，换一次供应商、或者
--   Google 调一次价，所有历史数字就失去可比性。cost_micros 在**呼叫当下**用当时
--   的价目算好存下来，之后永不重算。
-- ===========================================================================

alter table ai_usage add column if not exists input_tokens  integer;
alter table ai_usage add column if not exists output_tokens integer;
alter table ai_usage add column if not exists model         text;
alter table ai_usage add column if not exists provider      text;
alter table ai_usage add column if not exists cost_micros   bigint;

comment on column ai_usage.input_tokens is
  'Prompt tokens reported by the vendor for this action. NULL for rows written '
  'before 2026-08-03, and for any call where the vendor returned no usage data.';
comment on column ai_usage.output_tokens is
  'Generated tokens (including thinking tokens where the vendor bills them).';
comment on column ai_usage.model is
  'Exact model id the vendor served, e.g. gemini-3.5-flash-lite. Recorded because '
  'Google retires models (2.0 Flash, Jun 2026) — without it, historical costs '
  'cannot be compared across a model change.';
comment on column ai_usage.provider is
  'Provider name, e.g. gemini. Set from the provider layer, not from the browser.';
comment on column ai_usage.cost_micros is
  'Cost in USD millionths, computed AT CALL TIME from the price table in '
  'src/lib/ai/gemini.ts and never recomputed. 1000000 = US$1. NULL means the '
  'model was not in the price table — an honest gap, not a guess.';

-- 全部 nullable 是刻意的：既有的列真的不知道自己花了多少，
-- 硬填 0 会让「免费额度时期」看起来毛利无限好。NULL 才是诚实的。

-- 只有 org 自己看得到自己的用量 —— 沿用既有的 ai_usage_select 政策，不用改。
-- （service role 走 checkAndRecordUsage / recordTokens 写入，不受 RLS 限制。）


-- ===========================================================================
-- 验证段（纯 select）
-- ===========================================================================
--
-- 1) 栏位都在：
--      select column_name, data_type, is_nullable
--        from information_schema.columns
--       where table_name = 'ai_usage' order by ordinal_position;
--
-- 2) 部署新程式码、跑几次 AI 之后，看看有没有真的写进去：
--      select id, org_id, action, model, input_tokens, output_tokens, cost_micros, created_at
--        from ai_usage order by id desc limit 20;
--    新的列应该有数字；旧的列 model / cost_micros 会是 null，那是对的。
--
-- 3) 这就是 deck 那一页要的数字 —— 每个组织每月的真实成本：
--      select org_id,
--             date_trunc('month', created_at at time zone 'Asia/Kuala_Lumpur') as bulan,
--             count(*)                       as tindakan,
--             sum(input_tokens)              as tok_in,
--             sum(output_tokens)             as tok_out,
--             round(sum(cost_micros)/1e6::numeric, 4) as kos_usd
--        from ai_usage
--       where cost_micros is not null
--       group by 1, 2 order by 2 desc, 1;
--
-- 4) 换模型之前/之后的比较（第 4 步 eval 会用到）：
--      select model, count(*), round(avg(cost_micros)/1e6::numeric, 6) as purata_usd
--        from ai_usage where model is not null group by 1;
--
-- 回退：
--   alter table ai_usage drop column if exists input_tokens;
--   alter table ai_usage drop column if exists output_tokens;
--   alter table ai_usage drop column if exists model;
--   alter table ai_usage drop column if exists provider;
--   alter table ai_usage drop column if exists cost_micros;
-- ===========================================================================
