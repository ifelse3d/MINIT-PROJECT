-- ============================================================================
-- 45 · charge_ai_action / refund_ai_credit — one AI action, charged atomically
--      (work order 122 §3, 2026-09-07; the bug is 121 §2-3)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 45 to copy it.)
--   3. Nothing else to do. The app notices the functions on its next call.
--      UNTIL you run this, the app keeps metering the old way (it checks
--      for the function and falls back) — nothing is broken either way.
--
-- WHAT WENT WRONG
--   src/lib/ai/usage.ts checkAndRecordUsage() COUNTED this month's rows,
--   decided free / credit / blocked in TypeScript, then INSERTED the ai_usage
--   row. Nothing held the org still between the count and the insert. With
--   ONE free action left, two requests arriving together both count "one
--   left", both insert, both reach the vendor: the free tier is over-served
--   by one. The paid path (spend_ai_credit) was already atomic; only the free
--   path was not. Small money, but it is a hole in billing honesty, and the
--   house rule is that money logic is right.
--
--   Two smaller things in the same file: the credit REFUND was a read-then-
--   write (+1), so two refunds landing together lose one; and the fallback
--   that DELETES the row when stamping refunded_at fails was not limited to
--   "the column does not exist yet" — any error erased the cost record.
--
-- THE FIX
--   Move count + decide + insert into ONE function under a per-org advisory
--   lock, so the second request waits for the first and counts the row it
--   just wrote. The decision order is decideCharge()'s exactly: free quota,
--   then a credit (same set_config escape hatch as spend_ai_credit, because
--   the orgs trigger from 20260728000000 guards extra_credits), else blocked
--   with NO row written. The refund of a credit becomes a SQL increment.
--
--   The TypeScript side stays the source of the QUOTA rules (usage-core.ts is
--   unit-tested); this function only applies the same order under a lock.
--
-- SAFETY
--   · security definer + service_role only — exactly like spend_ai_credit.
--     A member's own session cannot call either function.
--   · The first line checks the organisation exists and raises if not. That
--     is what lets scripts/check-migrations.mjs PROBE refund_ai_credit with
--     org 0 safely: no such org, zero rows updated, nothing changes.
--     🔴 The probe must NEVER call charge_ai_action — that one would charge.
-- ============================================================================

create or replace function public.charge_ai_action(
  p_org_id  bigint,
  p_action  text,
  p_user_id uuid,
  p_start   timestamptz,
  p_end     timestamptz
)
returns table (
  row_id             bigint,
  spent_credit       boolean,
  blocked            boolean,
  used_this_month    integer,
  monthly_free_quota integer,
  extra_credits      integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota   integer;
  v_credits integer;
  v_used    integer;
  v_updated integer;
  v_id      bigint;
  v_spent   boolean := false;
begin
  if not exists (select 1 from orgs o where o.id = p_org_id) then
    raise exception 'no such organisation' using errcode = 'no_data_found';
  end if;

  -- One org at a time. Transaction-scoped: released automatically at commit
  -- or rollback, so a failed request can never leave the org locked.
  perform pg_advisory_xact_lock(hashtextextended('minit:ai_usage:' || p_org_id::text, 0));

  select coalesce(o.monthly_free_quota, 0), coalesce(o.extra_credits, 0)
    into v_quota, v_credits
    from orgs o
   where o.id = p_org_id;

  -- Same count the meter shows: this Malaysian month, refunded rows excluded
  -- (usage.ts getUsage / checkAndRecordUsage, 2026-08-21 rule).
  select count(*)::integer
    into v_used
    from ai_usage u
   where u.org_id = p_org_id
     and u.created_at >= p_start
     and u.created_at <  p_end
     and u.refunded_at is null;

  if v_used < v_quota then
    v_spent := false;                              -- decideCharge: "free"
  elsif v_credits > 0 then                         -- decideCharge: "credit"
    perform set_config('minit.allow_privileged_org_update', 'on', true);
    update orgs o
       set extra_credits = o.extra_credits - 1
     where o.id = p_org_id
       and o.extra_credits > 0;
    get diagnostics v_updated = row_count;
    perform set_config('minit.allow_privileged_org_update', 'off', true);
    if v_updated = 0 then
      -- Cannot happen under the lock, but the guard costs nothing.
      return query select null::bigint, false, true, v_used, v_quota, 0;
      return;
    end if;
    v_spent := true;
  else                                             -- decideCharge: "blocked"
    return query select null::bigint, false, true, v_used, v_quota, v_credits;
    return;
  end if;

  insert into ai_usage (org_id, action, user_id)
  values (p_org_id, p_action, p_user_id)
  returning id into v_id;

  -- The three counts are the snapshot BEFORE this charge — what the caller
  -- needs to explain a refusal; on success it only uses row_id/spent_credit.
  return query select v_id, v_spent, false, v_used, v_quota, v_credits;
end;
$$;

comment on function public.charge_ai_action(bigint, text, uuid, timestamptz, timestamptz) is
  'Charge ONE AI action for an organisation atomically (work order 122 §3): free quota first, then one extra credit, else blocked with no row written. Per-org advisory lock closes the count-then-insert race. service_role only.';

revoke execute on function public.charge_ai_action(bigint, text, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.charge_ai_action(bigint, text, uuid, timestamptz, timestamptz) to service_role;


-- ----------------------------------------------------------------------------
-- Give one credit back as a SQL increment (no read-then-write). An org that
-- does not exist updates zero rows and that is the whole effect — which is
-- why check-migrations.mjs may probe this one with org 0.
-- ----------------------------------------------------------------------------
create or replace function public.refund_ai_credit(p_org_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  perform set_config('minit.allow_privileged_org_update', 'on', true);

  update orgs o
     set extra_credits = coalesce(o.extra_credits, 0) + 1
   where o.id = p_org_id;
  get diagnostics v_updated = row_count;

  perform set_config('minit.allow_privileged_org_update', 'off', true);

  return v_updated > 0;
end;
$$;

comment on function public.refund_ai_credit(bigint) is
  'extra_credits + 1 for one organisation, as a single SQL increment (work order 122 §3). Unknown org = zero rows, harmless. service_role only.';

revoke execute on function public.refund_ai_credit(bigint) from public, anon, authenticated;
grant  execute on function public.refund_ai_credit(bigint) to service_role;


-- ----------------------------------------------------------------------------
-- VERIFICATION (expected results in comments)
-- ----------------------------------------------------------------------------
-- Both functions exist, both SECURITY DEFINER (expect 2 rows, prosecdef = true):
--   select proname, prosecdef from pg_proc
--    where proname in ('charge_ai_action', 'refund_ai_credit') order by proname;
--
-- Only service_role may execute (expect true / false / false):
--   select has_function_privilege('service_role',  'public.refund_ai_credit(bigint)', 'execute'),
--          has_function_privilege('authenticated', 'public.refund_ai_credit(bigint)', 'execute'),
--          has_function_privilege('anon',          'public.refund_ai_credit(bigint)', 'execute');
--
-- Unknown org is harmless (expect false, nothing changed):
--   select public.refund_ai_credit(0);
--
-- After this file: open any AI reading in the app once — /settings/plan
-- should drop by one action, exactly as before. That is the real acceptance.
--
-- ----------------------------------------------------------------------------
-- ROLLBACK
-- ----------------------------------------------------------------------------
-- The app checks for the function on every call and falls back to the old
-- count-then-insert path when it is missing, so dropping both is safe:
--   drop function if exists public.charge_ai_action(bigint, text, uuid, timestamptz, timestamptz);
--   drop function if exists public.refund_ai_credit(bigint);
