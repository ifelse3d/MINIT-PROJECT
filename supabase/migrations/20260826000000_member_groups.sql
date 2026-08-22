-- ============================================================================
-- Minit — 社团自己建的群体
--
-- ⚠️ J 2026-08-23：「這個青年/小天使是我自己的 example，不是每一個社團都有的。」
--    下面凡是提到青年团／小天使的地方都只是**举例**。这一支**不建立任何预设分类**，
--    也没有一张我们想出来的清单 —— 社团自己打名字，打了第一个人那个分组就存在。
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份贴上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（每一句都有 if not exists / 先看再建）。
--   🚧 尚未套用。D8 铁律：J 本人手动跑，写这个档的人不执行它。
--
-- 只加东西：新增一张表，不动任何既有的表、不删任何一列资料。
--
-- ----------------------------------------------------------------------------
-- 这一支在补什么洞
--
-- J 的 UX 清单第 3 条：「出席名单⋯⋯之后要能选群体（AJK、青年、小天使），
-- 可单选可多选，**社团自己建 category**，选了之后出名单可以 tick。」
--
-- 2026-08-23 已经做好了「从 `committee_roster` 勾人」那一半。但 `committee_roster`
-- 只装得下**职位**（Pengerusi、Bendahari），装不下群体，而且更重要的是 ——
--
-- 🔴 **`committee_roster` 是一份呈交政府的文件。** 它就是社团呈给社团注册局的
--    「Senarai Ahli Jawatankuasa」。往里面塞「小天使组」这种社团内部的分组，
--    等于把不属于那份申报的东西混进申报里。同一个理由，`src/app/minutes/
--    roster-actions.ts` 里那支读取函式是**只读**的。
--
-- 所以群体是**另一张表**。它不是申报文件，它是社团自己的名册。
--
-- ----------------------------------------------------------------------------
-- 为什么是「一列 = 一个人在一个群体里」，而不是在人身上加一栏
--
-- 因为一个人本来就会同时在好几个群体里 —— 理事同时是青年团的，妇女组的也可能
-- 是小天使的家长。在 `committee_roster` 加一个 `group` 栏，会逼着社团为同一个人
-- 建第二列，而那一列会连带多出一个**假的职位**，然后那个假职位会跟着申报出去。
--
-- 一列一个成员关系，是唯一不会污染申报的做法。
-- ============================================================================


-- ---------------------------------------------------------------------------
-- member_groups：一列 = 「某某人属于某某群体」
--
-- `person_name` 是**文字**，不是指向 committee_roster 的外键。刻意的：
-- 一个来开会的青年团团员，多数根本不在理事名单上 —— 硬要外键，就等于说
-- 「不是理事就不能分组」，而那正好是这张表要解决的问题。
-- ---------------------------------------------------------------------------
create table if not exists member_groups (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  -- 社团自己打的名字。**不做成 enum，也不给预设清单** —— 每一个庙、每一个会馆、
  -- 每一个宗亲会的分法都不一样，一份我们想出来的清单只会逼他们把自己塞进
  -- 最接近的那一格，而且还看起来像官方规定。（J 2026-08-23 特别澄清过这一点。）
  group_name text not null check (length(trim(group_name)) between 1 and 60),
  person_name text not null check (length(trim(person_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  -- 同一个人在同一个群体里只会有一次。按两次「加入」是手滑，不是指令。
  unique (org_id, group_name, person_name)
);

comment on table member_groups is
  '社团自己建的分组（青年团／小天使／妇女组）。'
  '⚠ 跟 committee_roster 分开是刻意的：committee_roster 是呈交社团注册局的'
  '「Senarai Ahli Jawatankuasa」，内部分组不属于那份申报。';

comment on column member_groups.person_name is
  '文字，不是外键。青年团团员多数不在理事名单上 —— 用外键等于「不是理事就不能分组」。';


-- ---------------------------------------------------------------------------
-- RLS —— 跟其他 16 张 org 资料表**一模一样的四条政策**
--
-- 逐字照 `20260719000000_phase7_auth_rls.sql` 的 C1 段落。不发明新写法：
-- 一张跟别人不一样的表，是以后没有人记得去检查的那一张。
-- ---------------------------------------------------------------------------
alter table member_groups enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'member_groups'
      and policyname = 'member_groups_select'
  ) then
    create policy member_groups_select on public.member_groups
      for select to authenticated
      using (org_id in (select public.accessible_orgs()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'member_groups'
      and policyname = 'member_groups_insert'
  ) then
    create policy member_groups_insert on public.member_groups
      for insert to authenticated
      with check (org_id in (select public.accessible_orgs_writable()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'member_groups'
      and policyname = 'member_groups_update'
  ) then
    create policy member_groups_update on public.member_groups
      for update to authenticated
      using (org_id in (select public.accessible_orgs_writable()))
      with check (org_id in (select public.accessible_orgs_writable()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'member_groups'
      and policyname = 'member_groups_delete'
  ) then
    create policy member_groups_delete on public.member_groups
      for delete to authenticated
      using (org_id in (select public.accessible_orgs_writable()));
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 索引：这张表只有两种问法 ——「这个社团有哪些群体」和「这个群体里有谁」。
-- ---------------------------------------------------------------------------
create index if not exists idx_member_groups_org_group
  on member_groups (org_id, group_name);


-- ---------------------------------------------------------------------------
-- 跑完之后怎么验（贴回 SQL Editor 再跑一次）
--
--   select policyname from pg_policies
--   where tablename = 'member_groups' order by policyname;
--
-- 应该看到四条：_delete · _insert · _select · _update。
-- 少一条就是 RLS 有洞 —— 那比表没建起来更糟，因为看起来一切正常。
-- ---------------------------------------------------------------------------
