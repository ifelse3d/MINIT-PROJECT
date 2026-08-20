-- ===========================================================================
-- Lock the privileged columns on `orgs`
-- Written 2026-07-28 from the full-system audit. NOT YET APPLIED.
--
-- WHAT THIS FIXES (audit finding P1-1)
--
-- `20260719000000_phase7_auth_rls.sql` grants row-level UPDATE on ALL of `orgs`
-- to `accessible_orgs_admin()`. Postgres RLS has no column granularity, and the
-- Supabase anon key + PostgREST are reachable from any browser. So any
-- `hq_admin` of an organisation could simply send:
--
--     PATCH /rest/v1/orgs?id=eq.7   {"tax_exempt_status": "s44_6"}
--
-- and from that moment every receipt the organisation issues carries the s.44(6)
-- income-tax-deduction line (see src/lib/receipts.ts). That is exactly what
-- CLAUDE.md Hard Rule 3 forbids, and it makes the server-side tax-status lookup
-- in src/lib/doc-identity.ts pointless: the value it reads is attacker-chosen.
--
-- The same hole let an admin raise their own `monthly_free_quota` and
-- `extra_credits`, which defeats the entire AI metering layer.
--
-- APPROACH — the same pattern already used for receipt immutability in
-- `20260726000000_client_id_and_receipt_lock.sql`: a BEFORE UPDATE trigger that
-- rejects changes to specific columns.
--
-- TWO ESCAPE HATCHES, both server-side only:
--   1. The SERVICE ROLE is allowed through unconditionally. This matters: the
--      quota REFUND path (`refundUsage` in src/lib/ai/usage.ts) writes
--      `extra_credits` with the service-role key on every out-of-scope refusal,
--      inside a try/catch that swallows failures. Without this bypass the
--      trigger would raise, the refund would silently never happen, and
--      refusals would quietly eat the user's quota forever.
--   2. A transaction-local config flag, for one-off admin SQL (below).
-- Neither is reachable from a browser: the anon key is not service_role, and
-- PostgREST gives no way to call set_config().
--
-- HOW TO APPLY
--   1. Supabase dashboard → SQL Editor → paste this WHOLE file as one block
--      (the do $$ … $$; block must stay intact) → Run.
--   2. Run the verification queries at the bottom.
--
-- HOW TO GRANT A REAL s.44(6) STATUS AFTERWARDS (service role only, e.g. from
-- the SQL Editor, which runs as a superuser):
--   select set_config('minit.allow_privileged_org_update', 'on', true);
--   update orgs set tax_exempt_status = 's44_6' where id = <id>;
-- Keep the approval letter on file. Hard Rule 3 exists because this line on a
-- receipt is a statement about Malaysian tax law.
-- ===========================================================================

-- ===========================================================================
-- 2026-07-29 HARDENING (before first application — this file had still never
-- been run, so it is edited in place rather than superseded).
--
-- Three problems found while reviewing it for application:
--
--  H1. `current_setting('request.jwt.claims', true)::json` throws
--      `invalid input syntax for type json` if that setting is present but
--      EMPTY or malformed (it is a plain text GUC; nothing guarantees it
--      parses). The cast sits in a BEFORE UPDATE trigger, so the failure mode
--      is not "the guard mis-fires" — it is "EVERY update to orgs raises",
--      including renaming an organisation and including the credit refund.
--      Fix: parse inside a sub-block that swallows the parse error.
--
--  H2. The JWT-claims check is the ONLY way the service role is recognised.
--      That GUC is set by PostgREST; anything reaching Postgres by another
--      route (a direct connection, a pooled session, a future job runner)
--      would be blocked even though it is legitimately server-side.
--      Fix: also accept `current_user = 'service_role'`.
--      NOTE both checks are kept deliberately: `security definer` functions
--      such as public.spend_ai_credit run as their OWNER, so `current_user`
--      is 'postgres' inside them and only the JWT check sees the truth.
--      Neither check alone covers both paths.
--
--  H3. There was no documented way to UNDO this. Applied by hand-pasting,
--      with no CLI migration history, the rollback is the only safety net.
--      Fix: the ROLLBACK section at the foot of this file.
-- ===========================================================================

-- ===========================================================================
-- 2026-07-29 SECOND PASS — `parent_org_id`, and the cycle it can create.
--
--  H4. `parent_org_id` was named in the security rules as a column that must
--      be locked, and it was NOT in the list below. The `orgs_update` RLS
--      policy lets an hq_admin PATCH their own row, and its WITH CHECK only
--      asks "is this row one you administer?" — the row id does not change
--      when the parent changes, so the check PASSES. Any admin could send:
--
--          PATCH /rest/v1/orgs?id=eq.7   {"parent_org_id": 7}
--
--      and re-parent their organisation anywhere, including under itself.
--
--  H5. That matters far more than it looks, because `public.org_descendants()`
--      (20260719000000) is a plain `WITH RECURSIVE ... UNION ALL` with NO
--      cycle detection. Every RLS policy in the schema calls it through
--      accessible_orgs() / _writable() / _admin(). So a single self-parenting
--      row turns EVERY query in the application into an infinite recursion:
--      the database pegs a CPU core and the whole product stops, and it
--      cannot be fixed from the UI because the UI can no longer read anything.
--      Reachable deliberately by any admin, and reachable by accident.
--
--      Fixed in BOTH places, because either fix alone is not enough:
--        · the trigger below now rejects parent_org_id changes, so the cycle
--          cannot be created from a browser;
--        · org_descendants() is replaced with a path-tracking version, so a
--          cycle that arrives some other way (service role, the escape hatch,
--          a future admin tool, a hand-typed UPDATE) degrades to "stops
--          walking" instead of hanging the database.
--
--      Cost of the trigger change: zero. Nothing in src/ ever UPDATEs
--      parent_org_id — it is written once, by createOrg's INSERT, and this
--      trigger is BEFORE UPDATE only. Branch creation is unaffected.
-- ===========================================================================

create or replace function public.orgs_privileged_columns_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_role text := '';
begin
  -- 1. The service role (server-side keys only) is trusted. See note above:
  --    the AI-credit refund path depends on this.
  --
  --    H1: the cast is isolated so a malformed/empty claims GUC degrades to
  --    "not the service role" instead of raising and bricking every UPDATE.
  begin
    v_claim_role := coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
      ''
    );
  exception when others then
    v_claim_role := '';
  end;

  -- H2: two independent ways to be the service role. PostgREST sets the JWT
  -- claims GUC *and* switches role, but `security definer` functions mask
  -- current_user while leaving the GUC intact, so both are needed.
  if v_claim_role = 'service_role' or current_user = 'service_role' then
    return new;
  end if;

  -- 2. Escape hatch for deliberate, one-off administrative SQL.
  -- `set_config(..., true)` is transaction-local, so it cannot leak between
  -- requests. A browser using the anon key can never set it, because it cannot
  -- run set_config through PostgREST.
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

  -- H4. The org tree defines who can see whose data, and a cycle here hangs
  -- every RLS query in the schema (see H5). Nothing in the application ever
  -- updates this column, so rejecting the change costs nothing.
  if new.parent_org_id is distinct from old.parent_org_id then
    raise exception
      'orgs.parent_org_id is not user-editable: the organisation tree decides who can read whose data, and a cycle in it stops the whole database. Move a branch server-side with minit.allow_privileged_org_update.';
  end if;

  return new;
end;
$$;

drop trigger if exists orgs_privileged_columns_immutable on public.orgs;

create trigger orgs_privileged_columns_immutable
  before update on public.orgs
  for each row
  execute function public.orgs_privileged_columns_immutable();


-- ---------------------------------------------------------------------------
-- H5. Make the org-tree walk cycle-safe.
--
-- Same signature, same results for every well-formed tree — this is a drop-in
-- replacement for the version in 20260719000000_phase7_auth_rls.sql. The only
-- difference is that it carries the path it has walked and refuses to revisit
-- a node, so a cycle terminates instead of recursing forever.
--
-- `union all` is kept rather than `union`: the path guard already prevents
-- repeats, and `union` would force a sort/dedup on a function that runs inside
-- every single RLS check.
--
-- Safe to run before or after the trigger above; it depends on nothing here.
-- ---------------------------------------------------------------------------
create or replace function public.org_descendants(root_org_id bigint)
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select id, array[id] as walked
      from orgs
     where id = root_org_id
    union all
    select o.id, t.walked || o.id
      from orgs o
      join tree t on o.parent_org_id = t.id
     where not (o.id = any (t.walked))
  )
  select id from tree;
$$;

-- ---------------------------------------------------------------------------
-- VERIFICATION (run these after applying; expected results in comments)
-- ---------------------------------------------------------------------------
-- The service role is NOT blocked (run from the SQL Editor, which is superuser,
-- so use the flag below instead to prove the guard itself works).
--
-- 1 trigger named orgs_privileged_columns_immutable on orgs:
--   select tgname from pg_trigger
--    where tgrelid = 'public.orgs'::regclass and not tgisinternal;
--
-- The guard bites (expect an exception mentioning Hard Rule 3):
--   update orgs set tax_exempt_status = 's44_6' where id = (select min(id) from orgs);
--
-- The parent_org_id guard bites too (expect an exception; this is the one that
-- used to be able to hang the whole database):
--   update orgs set parent_org_id = id where id = (select min(id) from orgs);
--
-- org_descendants() survives a cycle (expect rows back, NOT a hang). This
-- creates a real cycle inside a transaction and rolls it back, so run the two
-- statements together with the rollback:
--   begin;
--     select set_config('minit.allow_privileged_org_update', 'on', true);
--     update orgs set parent_org_id = id where id = (select min(id) from orgs);
--     select public.org_descendants((select min(id) from orgs));
--   rollback;
--
-- The escape hatch works (expect UPDATE 1, then roll back):
--   begin;
--     select set_config('minit.allow_privileged_org_update', 'on', true);
--     update orgs set tax_exempt_status = 's44_6' where id = (select min(id) from orgs);
--   rollback;
--
-- Renaming an org still works (expect UPDATE 1, then roll back):
--   begin;
--     update orgs set name = name || ' (test)' where id = (select min(id) from orgs);
--   rollback;
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (H3) — paste this if applying the above breaks something.
--
-- Removing the trigger restores the PREVIOUS behaviour, which is the
-- self-service credit hole (audit P0-1). That is a deliberate trade: a broken
-- app you cannot use is worse than a hole you know about and are watching.
-- Re-apply as soon as the cause is understood.
--
--   drop trigger if exists orgs_privileged_columns_immutable on public.orgs;
--   drop function if exists public.orgs_privileged_columns_immutable();
--
-- Do NOT roll back the org_descendants() replacement (H5). It has the same
-- signature and the same results as the original; keeping it only removes the
-- ability to hang the database. Reverting it while parent_org_id is once again
-- browser-writable is the worst of both worlds.
--
-- Confirm it is gone (expect 0 rows):
--   select tgname from pg_trigger
--    where tgrelid = 'public.orgs'::regclass and not tgisinternal;
-- ---------------------------------------------------------------------------
