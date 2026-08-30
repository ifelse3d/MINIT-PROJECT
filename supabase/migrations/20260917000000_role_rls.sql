-- ============================================================================
-- Minit — migration 39: ROLE-AWARE RLS (work order 87 ②; 8/26 拍板的 RLS 深化,
-- 24號單建議① 的角色矩陣落到資料庫層)
--
-- 🔴 給 J（人話）：
--   1. 這支要你 **有 10 分鐘在場** 時才貼 —— 貼完立刻雙擊不了，要在
--      C:\dev\minit-v2 開個終端跑:  node scripts/probe-rls-87.mjs
--      它會印一張「六角色 × 主要表 × 增刪改」的矩陣；跟 87 號報告裡
--      「貼之後應該長這樣」的表對一對，全對＝驗收完成。
--   2. 貼法照舊：整份複製 → Supabase SQL Editor → Run。跑第二次是安全的
--      （所有 policy 都先 drop 再 create）。
--   3. 出紅字：整段錯誤貼給 Claude，先跑檔尾 ROLLBACK 區還原（也是整段
--      複製→Run），線上就回到貼之前的樣子。
--
-- WHAT THIS DOES (plain English):
--   Until now RLS only proved MEMBERSHIP: any member except the read-only
--   auditor could write EVERY table of their org at the database layer —
--   a collector could delete minutes, a committee member could edit
--   donations — and only the server-action checks (src/lib/roles.ts, B-4)
--   stood in the way. This migration teaches the DATABASE the same role
--   table, as the second layer of defence:
--
--     hq_admin           everything (unchanged)
--     secretary          minutes/roster/glossary/constitution area
--     treasurer          all of money
--     collector          donations + hand-overs + purpose templates only
--     committee          uploads/calendar/claims only (loses minutes+money)
--     auditor_readonly   still read-only everywhere (unchanged)
--
--   READS ARE NOT TOUCHED: every member still sees the whole org (the app
--   masks donor data in views; a collector's "own rows only" read needs an
--   ownership column donations does not have — flagged as future work).
--
--   DELIBERATELY UNCHANGED (they already match the app's real gates):
--     uploads/extractions      "upload" is every writing role
--     expenses                 claim submission is open to every writing role
--                              (claims.ts, J 8/26 拍板②) — per-claimant rules
--                              stay app-layer
--     events/reminders/rsvps/deadlines/qa_log
--                              calendar_write = every writing role
--     suggestion_marks         cards span minutes_write + calendar_write
--     feedback                 insert-only, every writing role
--     orgs/members_roles/invites already admin-gated since phase 7 / B-1
--     ai_usage/minutes_embeddings/fence_usage/app_errors/platform_admins/
--     credit_grants            service-role only, no user policies at all
--
--   SERVICE-ROLE paths (create/delete org, AI pipeline, admin console)
--   bypass RLS by definition and are NOT affected. issue_receipts() and
--   save_register_rows() are SECURITY INVOKER, so these policies DO apply
--   inside them — that is the point.
--
-- WHY THE APP KEEPS WORKING (verified against every server action, 87 號
-- 報告 §2 盤點表): each tightened table is only ever written user-scoped by
-- actions gated with the SAME capability this file grants. Until this file
-- is applied, nothing changes at all (D8: J applies by hand).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Helper: the orgs where the caller holds ONE OF the given roles
--    (same tree-descent semantics as accessible_orgs_writable: a role at an
--    ancestor org counts for every branch below it).
-- ----------------------------------------------------------------------------
create or replace function public.accessible_orgs_with_roles(p_roles text[])
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
    and m.role = any(p_roles);
$$;

revoke execute on function public.accessible_orgs_with_roles(text[]) from public, anon;
grant execute on function public.accessible_orgs_with_roles(text[]) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2) Minutes desk (secretary + hq_admin): minutes, drafts, paste packs,
--    constitution, roster, glossary, member groups, auditors list.
--    (All these actions are gated minutes_write in the app — B-4.)
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'minutes_docs', 'paste_packs', 'minutes_drafts', 'constitutions',
    'committee_roster', 'org_glossary', 'member_groups', 'auditors'
  ]
  loop
    execute format('drop policy if exists %1$I_insert on public.%1$I;', t);
    execute format('drop policy if exists %1$I_update on public.%1$I;', t);
    execute format('drop policy if exists %1$I_delete on public.%1$I;', t);
    execute format($f$
      create policy %1$I_insert on public.%1$I
        for insert to authenticated
        with check (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','secretary'])));
    $f$, t);
    execute format($f$
      create policy %1$I_update on public.%1$I
        for update to authenticated
        using (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','secretary'])))
        with check (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','secretary'])));
    $f$, t);
    execute format($f$
      create policy %1$I_delete on public.%1$I
        for delete to authenticated
        using (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','secretary'])));
    $f$, t);
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) Money — the collector's slice (collector + treasurer + hq_admin):
--    donations (the register: save_register_rows RPC is SECURITY INVOKER and
--    the register actions incl. delete are gated money_collect), hand-over
--    batches, and the purpose templates (template-actions, money_collect).
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['donations', 'org_templates']
  loop
    execute format('drop policy if exists %1$I_insert on public.%1$I;', t);
    execute format('drop policy if exists %1$I_update on public.%1$I;', t);
    execute format('drop policy if exists %1$I_delete on public.%1$I;', t);
    execute format($f$
      create policy %1$I_insert on public.%1$I
        for insert to authenticated
        with check (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer','collector'])));
    $f$, t);
    execute format($f$
      create policy %1$I_update on public.%1$I
        for update to authenticated
        using (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer','collector'])))
        with check (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer','collector'])));
    $f$, t);
    execute format($f$
      create policy %1$I_delete on public.%1$I
        for delete to authenticated
        using (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer','collector'])));
    $f$, t);
  end loop;
end;
$$;

-- Hand-over batches: a collector records and re-writes their own batch
-- (saveRemittanceBatch upserts under money_collect — HQ confirmation goes
-- through the same action), but deleting a custody record is treasurer work
-- (the app never deletes batches at all: cancelling is a STATUS, D26/D32).
drop policy if exists remittance_batches_insert on public.remittance_batches;
drop policy if exists remittance_batches_update on public.remittance_batches;
drop policy if exists remittance_batches_delete on public.remittance_batches;
create policy remittance_batches_insert on public.remittance_batches
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer','collector'])));
create policy remittance_batches_update on public.remittance_batches
  for update to authenticated
  using (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer','collector'])))
  with check (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer','collector'])));
create policy remittance_batches_delete on public.remittance_batches
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer'])));

-- ----------------------------------------------------------------------------
-- 4) Money — treasurer's desk (treasurer + hq_admin): receipts (issuing is
--    money_write; collector 開不了 — B-4) and the e-Invois packs.
--    🔴 receipts keep having NO delete policy: 20260726 already dropped it
--    (gap-free series, Hard Rule 2) — probe-rls-87 measured delete denied
--    for every role BEFORE this file too. The drop below is a no-op kept for
--    symmetry; delete-organisation still works (service role + cascade).
-- ----------------------------------------------------------------------------
drop policy if exists receipts_insert on public.receipts;
drop policy if exists receipts_update on public.receipts;
drop policy if exists receipts_delete on public.receipts;
create policy receipts_insert on public.receipts
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer'])));
create policy receipts_update on public.receipts
  for update to authenticated
  using (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer'])))
  with check (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer'])));
-- (no receipts_delete — deliberate, see above)

drop policy if exists einvois_packs_insert on public.einvois_packs;
drop policy if exists einvois_packs_update on public.einvois_packs;
drop policy if exists einvois_packs_delete on public.einvois_packs;
create policy einvois_packs_insert on public.einvois_packs
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer'])));
create policy einvois_packs_update on public.einvois_packs
  for update to authenticated
  using (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer'])))
  with check (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer'])));
create policy einvois_packs_delete on public.einvois_packs
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_with_roles(array['hq_admin','treasurer'])));

-- ----------------------------------------------------------------------------
-- 5) Bank accounts (Maklumat Am): manage_org = hq_admin only, same as the
--    app's maklumat-actions gate (56 D2-2).
-- ----------------------------------------------------------------------------
drop policy if exists org_bank_accounts_insert on public.org_bank_accounts;
drop policy if exists org_bank_accounts_update on public.org_bank_accounts;
drop policy if exists org_bank_accounts_delete on public.org_bank_accounts;
create policy org_bank_accounts_insert on public.org_bank_accounts
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_admin()));
create policy org_bank_accounts_update on public.org_bank_accounts
  for update to authenticated
  using (org_id in (select public.accessible_orgs_admin()))
  with check (org_id in (select public.accessible_orgs_admin()));
create policy org_bank_accounts_delete on public.org_bank_accounts
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_admin()));

-- ============================================================================
-- ROLLBACK（退回用 — 平時不要跑。整段取消註解後在 SQL Editor 跑一次，
-- 所有表就回到「任何非審計成員都能寫」的貼之前狀態。）
-- ============================================================================
-- do $$
-- declare
--   t text;
-- begin
--   foreach t in array array[
--     'minutes_docs', 'paste_packs', 'minutes_drafts', 'constitutions',
--     'committee_roster', 'org_glossary', 'member_groups', 'auditors',
--     'donations', 'org_templates', 'remittance_batches', 'receipts',
--     'einvois_packs', 'org_bank_accounts'
--   ]
--   loop
--     execute format('drop policy if exists %1$I_insert on public.%1$I;', t);
--     execute format('drop policy if exists %1$I_update on public.%1$I;', t);
--     execute format('drop policy if exists %1$I_delete on public.%1$I;', t);
--     execute format($f$
--       create policy %1$I_insert on public.%1$I
--         for insert to authenticated
--         with check (org_id in (select public.accessible_orgs_writable()));
--     $f$, t);
--     execute format($f$
--       create policy %1$I_update on public.%1$I
--         for update to authenticated
--         using (org_id in (select public.accessible_orgs_writable()))
--         with check (org_id in (select public.accessible_orgs_writable()));
--     $f$, t);
--     -- receipts stay WITHOUT a delete policy even on rollback: 20260726
--     -- dropped it long before this migration (gap-free series).
--     if t <> 'receipts' then
--       execute format($f$
--         create policy %1$I_delete on public.%1$I
--           for delete to authenticated
--           using (org_id in (select public.accessible_orgs_writable()));
--       $f$, t);
--     end if;
--   end loop;
-- end;
-- $$;
-- drop function if exists public.accessible_orgs_with_roles(text[]);
