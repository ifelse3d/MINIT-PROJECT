-- ============================================================================
-- Minit — 让「行事历 · 死线 · 现金交接」真的存得进资料库
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份贴上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（每一句都有 if not exists / 先 drop 再建）。
--   🚧 尚未套用。D8 铁律：J 本人手动跑，写这个档的人不执行它。
--
-- 只加东西，不删东西：没有 DROP TABLE、没有 DROP COLUMN、不会动到任何一列资料。
--
-- ----------------------------------------------------------------------------
-- 这一支在补什么洞
--
-- `remittance_batches`、`events_meetings`、`deadlines` 三张表从第一天就存在，
-- RLS 也早就配好了（`20260719000000_phase7_auth_rls.sql` 那个 for-loop 里
-- 三张都在），**但是 `src/db/activity.ts` 里一个 insert 都没有**。
-- 换句话说：读得到，写不进去。所以托管批次、行事历、死线到今天为止
-- 全部只活在这一台浏览器的 localStorage 里 —— 换一台电脑登入，这个社团
-- 什么都没有。（J 的 UX 清单根 B。）
--
-- 要把它们写进去，栏位对不上的地方有三处，这一支就是补这三处：
--
--  A. `events_meetings` 存不下我们手上的活动。
--     现在只有 `starts_at timestamptz`，但使用者输入的时间是**一句话**
--     （"7:30 malam"、"晚上七点半"），不是一个时刻 —— 硬要塞进 timestamptz
--     就得替他们猜一个时分，那是发明资料。而且 `/calendar` 早就支援
--     「那一天的备注」（2026-07-28，J：「点了进去也没办法 add event 或者写
--     note」），也没有地方放。
--
--  B. `remittance_batches` 存不下我们手上的交接。
--     `collector_member_id` 指向 `members_roles`，但收款人在程式里是一个
--     **名字字串**（登入者的名字，见 `register-store.tsx` 里 registerCollector
--     的注解），大多数社团根本还没建名册。`receipt_ids bigint[]` 也一样：
--     客户端手上的是收据**号码**（`PSH-2026-0042`），不是资料列的 id。
--     硬要查表转换，等于让一次交接依赖两趟往返，其中一趟失败就交接一半。
--
--  C. 三张表都需要「同一件事按两次不会变成两笔」。
--     `donations` 在 `20260726000000` 已经用 `client_id` ＋
--     `unique (org_id, client_id)` 解过一次，这里照抄同一个做法 —— 手机在
--     送出之前先给这一笔一个 id，网路断在半路、使用者再按一次，资料库自己
--     认得出来是同一笔。
-- ============================================================================


-- ---------------------------------------------------------------------------
-- A. events_meetings — 时间照人写的存，备注有地方放，加上 client_id
--
-- 每一栏都可以是 NULL：这一支跑之前建的列没有这些值，而且 PostgreSQL 把
-- NULL 当成彼此不相等，所以旧列有几笔都不会互撞。
-- ---------------------------------------------------------------------------
alter table events_meetings
  add column if not exists client_id text,
  add column if not exists time_text text,
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default now();

comment on column events_meetings.time_text is
  '时间照使用者写的原样存，例如 "7:30 malam"。starts_at 只保证日期是对的；'
  '要一个准确到分钟的时刻就得替使用者猜，那是发明资料（Hard Rule 1）。';

comment on column events_meetings.note is
  '这一天的备注，例如「要先订椅子」。2026-07-28 J 提的。';

comment on column events_meetings.client_id is
  '手机在送出之前给这一笔的 id。配合下面的唯一约束，让「按两次」不会变成两笔。';

-- 用「表约束」而不是 partial index：PostgREST / supabase-js 的 upsert 要靠
-- 它才推得出 onConflict: 'org_id,client_id'。
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_meetings_org_client_uniq'
  ) then
    alter table events_meetings
      add constraint events_meetings_org_client_uniq unique (org_id, client_id);
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- B. remittance_batches — 收款人存名字，收据存号码，加上 client_id
--
-- `collector_member_id` 和 `receipt_ids` 都留着不动：以后社团真的建了名册，
-- 那两栏就是正确的关联，届时用一支 backfill 把名字对上人即可。现在多的这两栏
-- 是「今天手上真的有的东西」，不是取代品。
-- ---------------------------------------------------------------------------
alter table remittance_batches
  add column if not exists client_id text,
  add column if not exists collector_name text,
  add column if not exists receipt_nos text[] not null default '{}';

comment on column remittance_batches.collector_name is
  '收款人的名字，照记下来。collector_member_id 要等社团建了名册才有值；'
  '大多数社团还没有，而「钱在谁手上」这件事不能等名册。';

comment on column remittance_batches.receipt_nos is
  '这一批交接涵盖的收据号码（PSH-2026-0042 那种）。客户端手上只有号码，'
  '不是资料列 id；先查表换 id 会让一次交接依赖两趟往返，断在中间就交接一半。';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'remittance_batches_org_client_uniq'
  ) then
    alter table remittance_batches
      add constraint remittance_batches_org_client_uniq unique (org_id, client_id);
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- C. deadlines — 只差 client_id
--
-- 这张表的栏位本来就对得上（kind 的三个值跟 src/lib/deadlines.ts 的
-- DEADLINE_KINDS 一模一样，due_date、source、status 都在）。差的只有
-- 「按两次不会变两笔」。
-- ---------------------------------------------------------------------------
alter table deadlines
  add column if not exists client_id text;

comment on column deadlines.client_id is
  '同 donations.client_id：让重送同一条死线是安全的。';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deadlines_org_client_uniq'
  ) then
    alter table deadlines
      add constraint deadlines_org_client_uniq unique (org_id, client_id);
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 索引：这三张表都是「拿一个月的资料出来画行事历」，所以按 org ＋ 日期查。
-- ---------------------------------------------------------------------------
create index if not exists idx_events_org_starts
  on events_meetings (org_id, starts_at);

create index if not exists idx_deadlines_org_due
  on deadlines (org_id, due_date);

create index if not exists idx_remittance_org_handed
  on remittance_batches (org_id, handed_over_at);


-- ---------------------------------------------------------------------------
-- 跑完之后怎么验（贴进 SQL Editor 再跑一次就好）
--
--   select column_name from information_schema.columns
--   where table_name = 'events_meetings' order by column_name;
--
-- 应该看得到 client_id · created_at · note · time_text。
-- 或者直接跑 `npm run check:migrations`，它会真的去问资料库。
-- ---------------------------------------------------------------------------
