-- ===========================================================================
-- 2026-07-29 · The way credits get granted AFTER the org columns are locked.
--
-- WHY THIS EXISTS
--
-- `20260728000000_lock_org_privileged_columns.sql` stops anyone editing
-- orgs.extra_credits / monthly_free_quota / tax_exempt_status from a browser.
-- It has exactly two escape hatches: the service role, and a transaction-local
-- config flag.
--
-- There is no admin back-office yet (handover doc D7). So the ONLY way to give
-- a paying organisation more AI credits is the SQL Editor — and the SQL Editor
-- runs as `postgres`, which is NOT the service role, so a plain
--
--     update orgs set extra_credits = 500 where id = 7;
--
-- IS BLOCKED. Applying the lock without this file would lock the vendor out of
-- their own product: customer pays, nobody can top them up.
--
-- The flag rescues it, but only if used correctly, and there is a trap:
--
--   set_config('minit.allow_privileged_org_update', 'on', true)
--
-- the third argument `true` means TRANSACTION-LOCAL. The Supabase SQL Editor
-- does not promise that two statements you paste together run in one
-- transaction. Run them as separate statements and the flag is already gone by
-- the time the UPDATE fires — the update is blocked and the reason looks
-- inexplicable. Everything below therefore runs inside ONE statement (a DO
-- block or a function body), where transaction-locality is guaranteed.
--
-- WHAT THIS FILE CREATES
--   1. Schema `minit_admin` — deliberately NOT in Supabase's exposed schema
--      list, so PostgREST will not publish anything inside it as an RPC
--      endpoint. A browser cannot reach it even with a valid anon key.
--   2. `minit_admin.grant_ai_credits(org_id, delta)` — add (or subtract)
--      credits, correctly flagged, returning before/after so the result is
--      visible rather than assumed.
--   3. `minit_admin.set_tax_exempt_status(org_id, status)` — the same, for the
--      s.44(6) flag. Separate function on purpose: CLAUDE.md Hard Rule 3 makes
--      this a statement about Malaysian tax law, so it should never be a
--      convenient extra parameter on a credits call.
--   4. A hardening of `public.spend_ai_credit` so the normal metering path
--      does not depend on the JWT-claims GUC being present.
--
-- SECURITY NOTE — why `revoke` matters more than the schema choice:
-- Postgres grants EXECUTE on new functions to PUBLIC by default. Without the
-- revokes at the bottom, any authenticated user could call these and grant
-- themselves credits — the exact hole the lock was written to close.
-- The revokes are the real control; the private schema is defence in depth.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. A schema PostgREST does not serve.
-- ---------------------------------------------------------------------------
create schema if not exists minit_admin;

revoke all on schema minit_admin from public;
revoke all on schema minit_admin from anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. Grant / remove AI credits.
--
-- `delta` is a CHANGE, not a new total: +500 adds five hundred, -50 removes
-- fifty. Deliberate — a total invites "set it to 500" against a stale number
-- read a minute ago, silently discarding whatever the org spent in between.
--
-- The balance is floored at 0 because orgs.extra_credits carries a
-- `check (extra_credits >= 0)` constraint; without the floor, an over-large
-- negative delta would fail with a constraint violation instead of doing the
-- obvious thing.
-- ---------------------------------------------------------------------------
create or replace function minit_admin.grant_ai_credits(
  p_org_id bigint,
  p_delta integer
)
returns table (
  org_id bigint,
  org_name text,
  credits_before integer,
  credits_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before integer;
  v_after integer;
  v_name text;
begin
  -- Called as grant_ai_credits((select min(id) from orgs), 10) on a database
  -- with no organisations yet, p_org_id arrives as NULL and the lookup below
  -- would fail with a confusing "No organisation with id " (blank). Say what
  -- actually happened instead, so this does not look like a broken back door.
  if p_org_id is null then
    raise exception
      'org_id is NULL — there are probably no organisations yet. Check with: select id, name from orgs order by id;';
  end if;

  select o.extra_credits, o.name
    into v_before, v_name
    from public.orgs o
   where o.id = p_org_id;

  if not found then
    raise exception
      'No organisation with id % — check the id on the /orgs page or with: select id, name from orgs order by id;',
      p_org_id;
  end if;

  -- Transaction-local, and this function body IS one transaction.
  perform set_config('minit.allow_privileged_org_update', 'on', true);

  update public.orgs
     set extra_credits = greatest(0, extra_credits + p_delta)
   where id = p_org_id
   returning extra_credits into v_after;

  -- Close the hatch again immediately. Belt and braces: the setting is
  -- transaction-local anyway, so it cannot outlive this call.
  perform set_config('minit.allow_privileged_org_update', 'off', true);

  -- The floor above is a convenience, not a silent one: if it actually bit,
  -- part of the requested deduction was discarded and the operator must know.
  if v_before + p_delta < 0 then
    raise notice
      '⚠️ Balance floored at 0. Requested % but the org only had % — % point(s) of the deduction were NOT applied.',
      p_delta, v_before, abs(v_before + p_delta);
  end if;

  return query select p_org_id, v_name, v_before, v_after;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. Set the tax-exempt status (CLAUDE.md Hard Rule 3).
--
-- Read the rule before calling this. Setting 's44_6' makes every receipt the
-- organisation issues carry an income-tax-deduction line. That is a claim
-- about Malaysian tax law, and it must be backed by an approval letter you
-- have actually seen and filed.
-- ---------------------------------------------------------------------------
create or replace function minit_admin.set_tax_exempt_status(
  p_org_id bigint,
  p_status text
)
returns table (
  org_id bigint,
  org_name text,
  status_before text,
  status_after text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before text;
  v_after text;
  v_name text;
begin
  if p_org_id is null then
    raise exception
      'org_id is NULL — there are probably no organisations yet. Check with: select id, name from orgs order by id;';
  end if;

  if p_status not in ('none', 's44_6', 'pure_religious') then
    raise exception
      'tax_exempt_status must be one of: none, s44_6, pure_religious (got %)',
      p_status;
  end if;

  select o.tax_exempt_status, o.name
    into v_before, v_name
    from public.orgs o
   where o.id = p_org_id;

  if not found then
    raise exception 'No organisation with id %', p_org_id;
  end if;

  perform set_config('minit.allow_privileged_org_update', 'on', true);

  update public.orgs
     set tax_exempt_status = p_status
   where id = p_org_id
   returning tax_exempt_status into v_after;

  perform set_config('minit.allow_privileged_org_update', 'off', true);

  return query select p_org_id, v_name, v_before, v_after;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. Nobody but the database owner may call these.
--
-- This is the line that actually protects the credit balance. It must come
-- AFTER the create-or-replace statements: replacing a function resets its
-- default grants.
-- ---------------------------------------------------------------------------
revoke all on function minit_admin.grant_ai_credits(bigint, integer) from public;
revoke all on function minit_admin.grant_ai_credits(bigint, integer) from anon, authenticated, service_role;

revoke all on function minit_admin.set_tax_exempt_status(bigint, text) from public;
revoke all on function minit_admin.set_tax_exempt_status(bigint, text) from anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. Harden the normal metering path.
--
-- public.spend_ai_credit is `security definer`, so inside it current_user is
-- the function OWNER, not 'service_role'. It therefore reaches the new orgs
-- trigger relying entirely on the `request.jwt.claims` GUC still being set and
-- still parsing. That works today with PostgREST, but it is a single point of
-- failure on the paid path: if it ever stops working, every org that has
-- exhausted its free quota is silently blocked from all AI.
--
-- Setting the flag explicitly makes the legitimate spend independent of it.
-- Body is otherwise byte-for-byte the Phase 7.5a version.
-- ---------------------------------------------------------------------------
create or replace function public.spend_ai_credit(p_org_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  perform set_config('minit.allow_privileged_org_update', 'on', true);

  update orgs
     set extra_credits = extra_credits - 1
   where id = p_org_id
     and extra_credits > 0;
  get diagnostics updated = row_count;

  perform set_config('minit.allow_privileged_org_update', 'off', true);

  return updated > 0;
end;
$$;

revoke execute on function public.spend_ai_credit(bigint) from public, anon, authenticated;
grant execute on function public.spend_ai_credit(bigint) to service_role;


-- ---------------------------------------------------------------------------
-- VERIFICATION (expected results in comments)
-- ---------------------------------------------------------------------------
-- Both admin functions exist (expect 2 rows):
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'minit_admin' order by p.proname;
--
-- Neither is callable by a logged-in user (expect false, false):
--   select has_function_privilege('authenticated',
--            'minit_admin.grant_ai_credits(bigint,integer)', 'execute'),
--          has_function_privilege('anon',
--            'minit_admin.grant_ai_credits(bigint,integer)', 'execute');
--
-- Granting credits works (expect one row, credits_after = credits_before + 10):
--   select * from minit_admin.grant_ai_credits(
--            (select min(id) from orgs), 10);
--   -- then put it back:
--   select * from minit_admin.grant_ai_credits(
--            (select min(id) from orgs), -10);
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
--
-- Safe to run at any time: dropping these removes the ABILITY TO GRANT
-- credits, not any credits already granted. Note that dropping them while the
-- orgs trigger is still in place leaves NO WAY to top anyone up, so drop the
-- trigger too if that is the situation you are in.
--
--   drop function if exists minit_admin.grant_ai_credits(bigint, integer);
--   drop function if exists minit_admin.set_tax_exempt_status(bigint, text);
--   drop schema if exists minit_admin;
--
-- Restore the original spend_ai_credit (Phase 7.5a body, no flag):
--   create or replace function public.spend_ai_credit(p_org_id bigint)
--   returns boolean language plpgsql security definer set search_path = public
--   as $$
--   declare updated integer;
--   begin
--     update orgs set extra_credits = extra_credits - 1
--      where id = p_org_id and extra_credits > 0;
--     get diagnostics updated = row_count;
--     return updated > 0;
--   end;
--   $$;
-- ---------------------------------------------------------------------------
