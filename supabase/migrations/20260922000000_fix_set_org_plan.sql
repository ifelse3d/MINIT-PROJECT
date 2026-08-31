-- ============================================================================
-- 44 · admin_set_org_plan could never have worked (116 §3, J 8/31)
--
-- HOW TO APPLY (beginner-friendly):
--   1. Supabase dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file, press RUN. "Success. No rows returned" = done.
--   (Or double-click salin-migration.bat and pick 44 to copy it.)
--
-- WHAT WENT WRONG
--   J pressed "Change plan" on org 483 and got "The call failed — nothing
--   changed." Nothing he typed was wrong. admin_set_org_plan (migration 42 ④)
--   updates orgs.monthly_free_quota, and that column is guarded by the trigger
--   orgs_privileged_columns_immutable (migration 20260728000000) — the lock
--   that stops an organisation raising its own AI quota.
--
--   That trigger lets exactly two callers through: the service role, and a
--   transaction that has set minit.allow_privileged_org_update. A
--   `security definer` function is NEITHER: it masks current_user with the
--   function's owner, and the request's JWT still says "authenticated", so the
--   trigger raised and the update was rolled back. Every call, for every org,
--   since migration 42 — the console door has never once opened.
--
--   The raised message also matched none of the action's error patterns, so
--   the reader was told "try again" for something retrying could never fix.
--
-- THE FIX
--   Take the escape hatch the trigger documents, set transaction-locally so it
--   cannot leak between requests. Nothing else about the function changes: the
--   platform_admins gate still runs FIRST and still fails closed, so this does
--   not widen who may call it — only what the call may do once it is allowed.
-- ============================================================================

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

  -- THE ONE NEW LINE. Transaction-local (the third argument), so it is gone
  -- the moment this statement's transaction ends and cannot leak into another
  -- request. The platform_admins check above has already run.
  perform set_config('minit.allow_privileged_org_update', 'on', true);

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
