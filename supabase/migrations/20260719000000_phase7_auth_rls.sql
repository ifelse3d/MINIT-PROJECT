-- ============================================================================
-- Minit — Phase 7: auth link, row-level security by org tree, storage buckets
--
-- HOW TO APPLY (beginner-friendly):
--   1. Open your Supabase project dashboard → SQL Editor → New query.
--   2. Paste this ENTIRE file and click "Run". Run it ONCE, after the
--      Phase 0 migration (20260708000000_init.sql) has already been applied.
--   3. Also enable Email auth: Dashboard → Authentication → Sign In / Up →
--      make sure "Email" provider is ON. For the demo you may also turn
--      OFF "Confirm email" so sign-ups work instantly without an email server.
--
-- WHAT THIS DOES (plain English):
--   A. Links members_roles.user_id to real Supabase login accounts.
--   B. Creates helper functions that answer "which orgs can the logged-in
--      user see / write?" following the org tree:
--        - hq_admin / committee / secretary / treasurer / collector at org X
--          → can see AND write org X plus every branch below X.
--        - auditor_readonly at org X → can see EXACTLY org X (each assigned
--          org needs its own members_roles row) and can never write.
--   C. Turns those answers into RLS policies on every table, so even if the
--      browser talks to the database directly with the public (anon) key,
--      each user can only ever touch their own orgs' rows.
--   D. Creates the private storage buckets. Every file path must start with
--      the org id ("123/receipts/2026/r-0001.pdf") — the storage policies
--      check that first path segment against the same org rules.
--
-- WHAT STAYS SERVER-ONLY (service-role key, bypasses RLS — by design):
--   - Creating a new organisation (sign-up flow) — a user can't be a member
--     of an org that doesn't exist yet, so the server does it atomically.
--   - Deleting an organisation (must also wipe storage objects).
--   - The AI pipeline API routes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A1. Demo flag on orgs (used by the seeded Demo Mode org; shows a UI badge)
-- ---------------------------------------------------------------------------
alter table orgs add column if not exists is_demo boolean not null default false;

-- ---------------------------------------------------------------------------
-- A2. Link members_roles.user_id to auth.users.
--     ON DELETE SET NULL: if a login account is deleted, the person row
--     (name/role) survives as an org record — only the login link is removed.
--     One login can hold at most one role row per org.
-- ---------------------------------------------------------------------------
alter table members_roles
  add constraint members_roles_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

create unique index if not exists idx_members_roles_org_user
  on members_roles (org_id, user_id)
  where user_id is not null;

create index if not exists idx_members_roles_user on members_roles (user_id);

-- ---------------------------------------------------------------------------
-- B. Helper functions.
--
-- SECURITY DEFINER (plain English): these functions run with the database
-- owner's rights, IGNORING row-level security while they run. That is
-- deliberate and safe here for two reasons:
--   1. They only ever return org IDs for auth.uid() — the logged-in user
--     taken from the verified JWT — never for an arbitrary user.
--   2. Without it, the policies below would loop forever: a policy on
--      members_roles would call a function that reads members_roles, which
--      would re-trigger the policy, and so on.
-- "set search_path = public" pins table lookups so a malicious schema
-- cannot shadow our tables (standard hardening for SECURITY DEFINER).
-- ---------------------------------------------------------------------------

-- All org IDs in the subtree rooted at root_org_id (the org itself + every
-- branch, and branches of branches, to any depth).
create or replace function public.org_descendants(root_org_id bigint)
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select id from orgs where id = root_org_id
    union all
    select o.id from orgs o join tree t on o.parent_org_id = t.id
  )
  select id from tree;
$$;

-- Orgs the logged-in user may READ.
create or replace function public.accessible_orgs()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  -- Working roles: their org + everything below it in the tree.
  select od.descendant_id
  from members_roles m
  cross join lateral public.org_descendants(m.org_id) as od(descendant_id)
  where m.user_id = auth.uid()
    and m.role <> 'auditor_readonly'
  union
  -- Auditors: exactly the orgs they are assigned to, nothing below.
  select m.org_id
  from members_roles m
  where m.user_id = auth.uid()
    and m.role = 'auditor_readonly';
$$;

-- Orgs the logged-in user may WRITE (auditors excluded entirely).
create or replace function public.accessible_orgs_writable()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select od.descendant_id
  from members_roles m
  cross join lateral public.org_descendants(m.org_id) as od(descendant_id)
  where m.user_id = auth.uid()
    and m.role <> 'auditor_readonly';
$$;

-- Orgs the logged-in user ADMINISTERS (hq_admin only — manages members,
-- org settings; also the only role allowed to request delete-organisation).
create or replace function public.accessible_orgs_admin()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select od.descendant_id
  from members_roles m
  cross join lateral public.org_descendants(m.org_id) as od(descendant_id)
  where m.user_id = auth.uid()
    and m.role = 'hq_admin';
$$;

-- Only logged-in users (and the server) may call these — not anonymous keys.
revoke execute on function public.org_descendants(bigint) from public, anon;
revoke execute on function public.accessible_orgs() from public, anon;
revoke execute on function public.accessible_orgs_writable() from public, anon;
revoke execute on function public.accessible_orgs_admin() from public, anon;
grant execute on function public.org_descendants(bigint) to authenticated, service_role;
grant execute on function public.accessible_orgs() to authenticated, service_role;
grant execute on function public.accessible_orgs_writable() to authenticated, service_role;
grant execute on function public.accessible_orgs_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- C1. Uniform policies for the 16 org-scoped data tables.
--     Every one of these tables has an org_id column (denormalised on
--     purpose in Phase 0 exactly so this stays a uniform check).
--     The DO block below writes the same 4 policies on each table:
--       read   → org must be in accessible_orgs()
--       insert / update / delete → org must be in accessible_orgs_writable()
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'uploads', 'extractions', 'minutes_docs', 'paste_packs',
    'committee_roster', 'donations', 'receipts', 'remittance_batches',
    'einvois_packs', 'expenses', 'constitutions', 'qa_log',
    'events_meetings', 'reminders', 'rsvps', 'deadlines'
  ]
  loop
    execute format($f$
      create policy %1$I_select on public.%1$I
        for select to authenticated
        using (org_id in (select public.accessible_orgs()));
    $f$, t);
    execute format($f$
      create policy %1$I_insert on public.%1$I
        for insert to authenticated
        with check (org_id in (select public.accessible_orgs_writable()));
    $f$, t);
    execute format($f$
      create policy %1$I_update on public.%1$I
        for update to authenticated
        using (org_id in (select public.accessible_orgs_writable()))
        with check (org_id in (select public.accessible_orgs_writable()));
    $f$, t);
    execute format($f$
      create policy %1$I_delete on public.%1$I
        for delete to authenticated
        using (org_id in (select public.accessible_orgs_writable()));
    $f$, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- C2. orgs — special-cased.
--     Read: any org in your accessible set. Update: hq_admin only.
--     NO insert/delete policies: creating and deleting orgs happens through
--     server routes with the service-role key (create must atomically add
--     the first member; delete must also wipe storage objects).
-- ---------------------------------------------------------------------------
create policy orgs_select on public.orgs
  for select to authenticated
  using (id in (select public.accessible_orgs()));

create policy orgs_update on public.orgs
  for update to authenticated
  using (id in (select public.accessible_orgs_admin()))
  with check (id in (select public.accessible_orgs_admin()));

-- ---------------------------------------------------------------------------
-- C3. members_roles — special-cased.
--     Read: anyone in the org's accessible set (rosters are org-visible).
--     Write: hq_admin only — a collector must not be able to promote
--     themselves or edit other people's roles.
-- ---------------------------------------------------------------------------
create policy members_roles_select on public.members_roles
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));

create policy members_roles_insert on public.members_roles
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_admin()));

create policy members_roles_update on public.members_roles
  for update to authenticated
  using (org_id in (select public.accessible_orgs_admin()))
  with check (org_id in (select public.accessible_orgs_admin()));

create policy members_roles_delete on public.members_roles
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_admin()));

-- ---------------------------------------------------------------------------
-- D. Storage: four PRIVATE buckets. Path convention (Hard Rule 5):
--        {org_id}/rest/of/path.pdf
--     The first path segment is the org id and the policies enforce it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('uploads', 'uploads', false),       -- photographed source documents
  ('receipts', 'receipts', false),     -- issued receipt PDFs
  ('letterheads', 'letterheads', false), -- org letterhead images
  ('einvois', 'einvois', false)        -- MyInvois batch .xlsx packs
on conflict (id) do nothing;

-- Read files only in your accessible orgs' folders.
create policy minit_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id in ('uploads', 'receipts', 'letterheads', 'einvois')
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and (split_part(name, '/', 1))::bigint in (select public.accessible_orgs())
  );

-- Write files only in your writable orgs' folders (auditors: no writes).
create policy minit_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('uploads', 'receipts', 'letterheads', 'einvois')
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and (split_part(name, '/', 1))::bigint in (select public.accessible_orgs_writable())
  );

create policy minit_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('uploads', 'receipts', 'letterheads', 'einvois')
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and (split_part(name, '/', 1))::bigint in (select public.accessible_orgs_writable())
  )
  with check (
    bucket_id in ('uploads', 'receipts', 'letterheads', 'einvois')
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and (split_part(name, '/', 1))::bigint in (select public.accessible_orgs_writable())
  );

create policy minit_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('uploads', 'receipts', 'letterheads', 'einvois')
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and (split_part(name, '/', 1))::bigint in (select public.accessible_orgs_writable())
  );
