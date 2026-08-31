-- ============================================================================
-- Migration 42 — plan_quotas: J sets each plan's monthly AI pool from the ops
-- console + the 'plus' plan + admin_set_org_plan (console replaces SQL).
-- (工作单 102 §0-6：J 自己決定每個 plan 的用量池；併 93 號拍板「控制台直接改
--  org 方案/quota」，取代 81 號 §7 那句 SQL。)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 42 to copy it.)
--
-- WHY:
--   J's ruling (2026-08-31, work order 102 §0-5/§0-6): plans read as
--   percentages of Standard (Trial 15% · Standard 100% · Plus 200%), and the
--   underlying pool sizes are J's dial — set in the ops console, effective
--   through the database, no env edit and no SQL. This table is the dial;
--   src/lib/plans.ts keeps the same numbers as compiled-in fallbacks for a
--   database that predates this file (fail-open, display only).
--
--   admin_set_org_plan: the audited console door for "put THIS org on THAT
--   plan" — it also sets the org's monthly_free_quota to the plan's pool, so
--   J can top an org's allowance back up by two clicks instead of the SQL in
--   report 83 §7. Same fail-closed platform_admins gate as
--   admin_grant_credits (migration 25 §6 pattern).
--
-- 🔴 FAIL-OPEN before this is applied: the app shows the compiled-in pool
--   sizes and the console's plan card refuses with an honest "database not
--   ready (migration 42)". Nothing else changes behaviour.
-- ============================================================================

-- ① The 'plus' plan joins the allowed values (102 §0-5).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'orgs_plan_check') then
    alter table orgs drop constraint orgs_plan_check;
  end if;
  alter table orgs add constraint orgs_plan_check
    check (plan in ('trial', 'standard', 'plus', 'hq'));
end $$;

-- ② The dial itself: one row per plan.
create table if not exists plan_quotas (
  plan_id text primary key check (plan_id in ('trial', 'standard', 'plus', 'hq')),
  monthly_ai_quota integer not null check (monthly_ai_quota >= 0),
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table plan_quotas is
  'Monthly AI action pool per plan (work order 102 §0-6). J adjusts these from the ops console (admin_set_plan_quota); the app converts them to the percentages users see. src/lib/plans.ts holds the same numbers as fallbacks for a DB without this table.';

-- Seed with today's compiled-in numbers — INSERT only where missing, so a
-- re-run never overwrites a value J has already tuned.
insert into plan_quotas (plan_id, monthly_ai_quota)
values ('trial', 15), ('standard', 100), ('plus', 200), ('hq', 300)
on conflict (plan_id) do nothing;

-- Anyone signed in may READ the pool sizes (the plan page shows them);
-- writing goes only through the definer RPC below.
alter table plan_quotas enable row level security;

drop policy if exists plan_quotas_select on plan_quotas;
create policy plan_quotas_select on plan_quotas
  for select to authenticated using (true);

-- ③ Console door 1: set one plan's pool. platform_admins-gated, audited via
--    updated_by/updated_at on the row itself.
create or replace function public.admin_set_plan_quota(
  p_plan  text,
  p_quota integer
)
returns table (plan_id text, monthly_ai_quota integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := '';
begin
  begin
    v_email := coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email',
      ''
    );
  exception when others then
    v_email := '';
  end;
  if v_email = '' or not exists (
    select 1 from platform_admins pa where lower(pa.email) = lower(v_email)
  ) then
    raise exception 'Not a platform admin' using errcode = 'insufficient_privilege';
  end if;

  if p_plan not in ('trial', 'standard', 'plus', 'hq') then
    raise exception 'unknown plan' using errcode = 'invalid_parameter_value';
  end if;
  if p_quota is null or p_quota < 0 or p_quota > 100000 then
    raise exception 'quota out of range' using errcode = 'invalid_parameter_value';
  end if;

  insert into plan_quotas as pq (plan_id, monthly_ai_quota, updated_by)
  values (p_plan, p_quota, v_email)
  on conflict (plan_id) do update
    set monthly_ai_quota = excluded.monthly_ai_quota,
        updated_at = now(),
        updated_by = excluded.updated_by;

  return query
    select pq.plan_id, pq.monthly_ai_quota from plan_quotas pq where pq.plan_id = p_plan;
end;
$$;

revoke execute on function public.admin_set_plan_quota(text, integer) from public, anon;
grant execute on function public.admin_set_plan_quota(text, integer) to authenticated, service_role;

-- ④ Console door 2: put ONE org on a plan — and align its monthly pool to
--    that plan's dial in the same breath (93 号拍板; replaces 83 §7's SQL).
create or replace function public.admin_set_org_plan(
  p_org_id bigint,
  p_plan   text
)
returns table (org_id bigint, org_name text, plan text, monthly_free_quota integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := '';
  v_quota integer;
begin
  begin
    v_email := coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email',
      ''
    );
  exception when others then
    v_email := '';
  end;
  if v_email = '' or not exists (
    select 1 from platform_admins pa where lower(pa.email) = lower(v_email)
  ) then
    raise exception 'Not a platform admin' using errcode = 'insufficient_privilege';
  end if;

  if p_plan not in ('trial', 'standard', 'plus', 'hq') then
    raise exception 'unknown plan' using errcode = 'invalid_parameter_value';
  end if;

  select pq.monthly_ai_quota into v_quota from plan_quotas pq where pq.plan_id = p_plan;
  if v_quota is null then
    raise exception 'plan_quotas has no row for this plan' using errcode = 'no_data_found';
  end if;

  update orgs o
     set plan = p_plan,
         monthly_free_quota = v_quota,
         plan_changed_at = now(),
         plan_changed_by = v_email
   where o.id = p_org_id;
  if not found then
    raise exception 'no such organisation' using errcode = 'no_data_found';
  end if;

  return query
    select o.id, o.name, o.plan, o.monthly_free_quota
      from orgs o where o.id = p_org_id;
end;
$$;

revoke execute on function public.admin_set_org_plan(bigint, text) from public, anon;
grant execute on function public.admin_set_org_plan(bigint, text) to authenticated, service_role;

-- ============================================================================
-- 驗證段（純 select，不改任何東西）
--
-- 1) 四行池子都在：
--      select plan_id, monthly_ai_quota from plan_quotas order by plan_id;
--    要看到 hq/plus/standard/trial 四列。
--
-- 2) 'plus' 已被允許：
--      select pg_get_constraintdef(oid) from pg_constraint
--       where conname = 'orgs_plan_check';
--    輸出要包含 'plus'。
--
-- ROLLBACK (only if J says so):
--   drop function if exists public.admin_set_org_plan(bigint, text);
--   drop function if exists public.admin_set_plan_quota(text, integer);
--   drop table if exists plan_quotas;
--   -- orgs_plan_check: only tighten back if NO org is on 'plus' yet:
--   -- alter table orgs drop constraint orgs_plan_check;
--   -- alter table orgs add constraint orgs_plan_check
--   --   check (plan in ('trial', 'standard', 'hq'));
-- ============================================================================
