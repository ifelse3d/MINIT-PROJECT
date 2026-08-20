-- ============================================================================
-- Minit — Phase 7.5a: AI usage metering + credits
--
-- HOW TO APPLY (beginner-friendly):
--   1. Open your Supabase project dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file and click "Run". Run it ONCE, after the
--      Phase 7 migration (20260719000000_phase7_auth_rls.sql).
--
-- WHAT THIS DOES (plain English):
--   Every AI call (photo extraction, "Tanya Minit" search) now writes one
--   small row per action into ai_usage. Each org gets a monthly free quota;
--   when it runs out, extra_credits (topped up manually by an admin) are
--   consumed one by one. When both are gone, AI features are blocked with a
--   friendly message — nothing crashes, nothing is charged automatically.
--
-- PDPA (CLAUDE.md Hard Rule 5): ai_usage stores ONLY the org id, a short
-- action code and a timestamp. Never question text, document contents,
-- donor names or any personal data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Quota + credit columns on orgs.
--    monthly_free_quota: free AI actions per calendar month (Malaysia time).
--    extra_credits: manually topped-up balance, consumed only AFTER the free
--    quota is used up. Does NOT reset monthly.
-- ---------------------------------------------------------------------------
alter table orgs
  add column if not exists monthly_free_quota integer not null default 100
    check (monthly_free_quota >= 0);

alter table orgs
  add column if not exists extra_credits integer not null default 0
    check (extra_credits >= 0);

-- ---------------------------------------------------------------------------
-- 2. ai_usage: one row per charged AI action.
--    action is a short machine code (enforced as an enum in TypeScript —
--    src/lib/ai/usage-core.ts — and length-capped here as the backstop).
-- ---------------------------------------------------------------------------
create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  action text not null check (char_length(action) between 1 and 40),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_org_created
  on ai_usage (org_id, created_at);

-- ---------------------------------------------------------------------------
-- 3. RLS — same uniform pattern as every other org-scoped table (Phase 7).
--    Members can SEE their org's usage (the settings meter). Rows are
--    INSERTED server-side only (service role bypasses RLS), so no insert/
--    update/delete policies are granted to users: the meter is not editable.
-- ---------------------------------------------------------------------------
alter table ai_usage enable row level security;

create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));

-- ---------------------------------------------------------------------------
-- 4. Atomic credit spend. Called by the server ONLY when the free quota is
--    already used up. The WHERE guard makes it impossible to go negative,
--    even with two simultaneous requests. Returns true if a credit was
--    consumed, false if none were left (caller then blocks the AI call).
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
  update orgs
     set extra_credits = extra_credits - 1
   where id = p_org_id
     and extra_credits > 0;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

-- Server-only: users never spend credits directly.
revoke execute on function public.spend_ai_credit(bigint) from public, anon, authenticated;
grant execute on function public.spend_ai_credit(bigint) to service_role;
