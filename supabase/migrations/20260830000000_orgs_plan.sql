-- ============================================================================
-- Minit — orgs.plan：訂閱層的資料庫地基（S-2，2026-08-25 通宵）
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份贴上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（add column if not exists ＋ create or replace）。
--   🚧 尚未套用。D8 铁律：J 本人手动跑，写这个档的人不执行它。
--
-- ----------------------------------------------------------------------------
-- 结构今晚立，数字之后定（J 决定 #2：等量出真实成本再定价）：
--   - orgs.plan：'trial'（预设）| 'standard' | 'hq'。方案的额度、org 上限、
--     功能旗标都在 src/lib/plans.ts —— 资料库只记「是哪一个方案」。
--   - plan_changed_at / plan_changed_by：审计，谁在什么时候改的。
--   - plan 加进 privileged-columns 锁：使用者不能自己升级方案。
--     改方案走 J 的手动 SQL（见档尾），或之后的总控台。
--   - monthly_free_quota 由 plan 派生这件事走 SERVER 写入逻辑（改 plan 的
--     SQL 顺手把 quota 设成方案值），不做 DB trigger —— 数字还是 TBD，
--     把 TBD 数字焊死进 trigger 是给未来自己挖坑。
-- ============================================================================

alter table orgs
  add column if not exists plan text not null default 'trial';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orgs_plan_check') then
    alter table orgs add constraint orgs_plan_check
      check (plan in ('trial', 'standard', 'hq'));
  end if;
end $$;

alter table orgs
  add column if not exists plan_changed_at timestamptz,
  add column if not exists plan_changed_by text;

comment on column orgs.plan is
  'Subscription tier: trial (default) | standard | hq. Quotas and feature '
  'flags per tier live in src/lib/plans.ts; prices are TBD until real cost '
  'data exists (docs/DECISIONS.md D12). Changed only via admin SQL / console.';

-- ----------------------------------------------------------------------------
-- plan 加进 privileged-columns 锁（沿用 20260728000000 的同一支 trigger 函式，
-- 原样重建 + 一段新检查；service_role 与 minit.allow_privileged_org_update
-- 的两条豁免照旧）。
-- ----------------------------------------------------------------------------
create or replace function public.orgs_privileged_columns_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_role text := '';
begin
  begin
    v_claim_role := coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
      ''
    );
  exception when others then
    v_claim_role := '';
  end;

  if v_claim_role = 'service_role' or current_user = 'service_role' then
    return new;
  end if;

  if coalesce(
       current_setting('minit.allow_privileged_org_update', true),
       'off'
     ) = 'on' then
    return new;
  end if;

  if new.tax_exempt_status is distinct from old.tax_exempt_status then
    raise exception
      'orgs.tax_exempt_status is not user-editable (CLAUDE.md Hard Rule 3): a receipt may only claim s.44(6) tax-deductibility after a verified approval. Change it server-side with minit.allow_privileged_org_update.';
  end if;

  if new.monthly_free_quota is distinct from old.monthly_free_quota then
    raise exception
      'orgs.monthly_free_quota is not user-editable: an organisation must not be able to raise its own AI quota.';
  end if;

  if new.extra_credits is distinct from old.extra_credits then
    raise exception
      'orgs.extra_credits is not user-editable: credits are granted by the vendor, not self-served.';
  end if;

  if new.parent_org_id is distinct from old.parent_org_id then
    raise exception
      'orgs.parent_org_id is not user-editable: the organisation tree decides who can read whose data, and a cycle in it stops the whole database. Move a branch server-side with minit.allow_privileged_org_update.';
  end if;

  -- 🆕 S-2 (2026-08-25): the tier is granted by the vendor, never self-served.
  if new.plan is distinct from old.plan then
    raise exception
      'orgs.plan is not user-editable: subscription tiers are changed by the vendor (admin SQL / console), not self-served.';
  end if;
  if new.plan_changed_at is distinct from old.plan_changed_at
     or new.plan_changed_by is distinct from old.plan_changed_by then
    raise exception
      'orgs.plan_changed_at/by are audit columns and not user-editable.';
  end if;

  return new;
end;
$$;

-- ============================================================================
-- J 的手动路径（S-5）：在 SQL Editor 替某个 org 改方案。
-- 整段贴上，改掉 <org id> 和方案名，Run。
-- ============================================================================
--
--   begin;
--   -- 本交易内解锁（transaction-local，交易结束自动失效）：
--   select set_config('minit.allow_privileged_org_update', 'on', true);
--   update orgs
--      set plan            = 'standard',        -- 'trial' | 'standard' | 'hq'
--          plan_changed_at = now(),
--          plan_changed_by = 'J (SQL Editor)',
--          -- quota 由 plan 派生：改方案时顺手设成方案值
--          -- （trial/standard = 100，hq = 300 —— TBD_PRICING，src/lib/plans.ts）
--          monthly_free_quota = 100
--    where id = <org id>;
--   commit;
--
-- 验证段（纯 select）：
--   select id, name, plan, plan_changed_at, plan_changed_by, monthly_free_quota
--     from orgs order by id;
--
-- 回退：
--   alter table orgs drop column if exists plan_changed_by;
--   alter table orgs drop column if exists plan_changed_at;
--   alter table orgs drop constraint if exists orgs_plan_check;
--   alter table orgs drop column if exists plan;
--   -- 再把 20260728000000 的 trigger 函式整段重跑一次（拿掉 plan 检查）。
-- ============================================================================
