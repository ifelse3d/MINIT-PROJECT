-- ============================================================================
-- 20260902000000_invites_and_org_type.sql
-- 邀請碼＋組織型態＋PPM 註冊號（24 號施工單 Stage B，建議①②，J 2026-08-25 已批）
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份貼上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（if not exists / drop policy if exists）。
--   🚧 D8 鐵律：J 本人手動跑，寫這個檔的人不執行它。
--
-- ----------------------------------------------------------------------------
-- 三件事：
-- 1. `invites` — 管理員產生邀請碼（挑角色、可設過期、可撤銷）；新人註冊時輸入
--    即以該角色入會。這是欠了很久的 P1-1（邀請第二個成員）。
--    RLS：只有該 org 的 hq_admin 能看/開/改（撤銷）。兌換走 server action 的
--    service key（新人還不是成員，RLS 本來就進不來——跟 createOrg 同一款設計）。
-- 2. `orgs.org_type` — 'registered'（註冊社團）| 'committee'（內部/臨時籌委會）。
--    committee 型隱藏 eROSES 催辦與年報死線（程式面），資料結構完全一樣。
-- 3. `orgs.ppm_no` — 選填 PPM/ROS 註冊號；填了就印在正式文件頁首（防冒充 v1，C-1）。
-- ============================================================================

-- ── 1. invites ──────────────────────────────────────────────────────────────
create table if not exists public.invites (
  id bigint generated always as identity primary key,
  org_id bigint not null references public.orgs(id) on delete cascade,
  -- The code people type. Generated server-side (crypto), stored uppercase.
  code text not null unique check (char_length(code) between 6 and 32),
  role text not null check (role in
    ('hq_admin','committee','secretary','treasurer','collector','auditor_readonly')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  -- null = 不過期
  expires_at timestamptz,
  -- 一碼一人：用掉就寫入這兩欄，之後不能再用
  used_by uuid,
  used_at timestamptz,
  -- 撤銷：碼即刻作廢（不刪列——誰開的、誰撤的要留痕）
  revoked_at timestamptz
);

alter table public.invites enable row level security;

-- 只有該 org 的 hq_admin 管理邀請碼。兌換不走這裡（service key）。
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select to authenticated
  using (org_id in (select public.accessible_orgs_admin()));

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_admin()));

drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites
  for update to authenticated
  using (org_id in (select public.accessible_orgs_admin()))
  with check (org_id in (select public.accessible_orgs_admin()));

-- 不給 delete：撤銷用 revoked_at，紀錄要留。

comment on table public.invites is
  'Invite codes: an hq_admin generates one per person (role + optional expiry); '
  'the new member enters it at sign-up and joins with that role. Redemption is '
  'server-side (service key) because the redeemer is not yet a member.';

-- ── 2. orgs.org_type ────────────────────────────────────────────────────────
alter table public.orgs
  add column if not exists org_type text not null default 'registered'
    check (org_type in ('registered','committee'));

comment on column public.orgs.org_type is
  '''registered'' = a ROS-registered society (eROSES nagging + annual-return '
  'deadlines apply). ''committee'' = an internal or ad-hoc committee — same '
  'features, no eROSES/annual-return nagging (work order 24, 建議①).';

-- ── 3. orgs.ppm_no ──────────────────────────────────────────────────────────
alter table public.orgs
  add column if not exists ppm_no text check (ppm_no is null or char_length(ppm_no) <= 64);

comment on column public.orgs.ppm_no is
  'Optional PPM/ROS registration number, entered by the admin. When present it '
  'is printed on official document letterheads (anti-impersonation v1, C-1).';

-- ============================================================================
-- 驗證段（純 select，不改任何東西）
-- ============================================================================
--
--   select column_name from information_schema.columns
--    where table_name = 'orgs' and column_name in ('org_type','ppm_no');
--
--   select tablename, policyname from pg_policies where tablename = 'invites';
--
-- 回退：
--   drop table if exists public.invites;
--   alter table public.orgs drop column if exists org_type;
--   alter table public.orgs drop column if exists ppm_no;
-- ============================================================================
