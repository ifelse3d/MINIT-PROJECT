-- ============================================================================
-- Minit — 免費圍欄（D44，2026-08-28 J 拍板）
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份貼上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（create ... if not exists ＋ create or replace）。
--   🚧 尚未套用。D8 鐵律：J 本人手動跑，寫這個檔的人不執行它。
--
-- ----------------------------------------------------------------------------
-- J 的拍板（2026-08-28，全部「終身制」——用完不重置，刪了東西也不退次數）：
--   免費版： 文件 5 份 · 收據 20 張 · 上傳 20 頁 · 乾淨下載 3 次；
--   預覽一律浮水印＋禁複製，乾淨版只從「下載」出去；
--   收據那 20 張，每一張都可以正常下載發送（不吃那 3 次下載）；
--   價格未定（D12 照舊）——付費按鈕仍是「聯絡我們」。
--
-- 這支 migration 只做三件事：
--   1. fence_usage 表——每個 org 一行，三個「累計做過」的數字。
--      收據不在這裡：receipts 表本來就 gap-free 不可刪，count(*) 就是真話。
--   2. fence_charge() ——原子的「檢查＋記帳」。上限數字由程式傳入
--      （src/lib/plans.ts 是唯一真相；資料庫只記「發生過什麼」，不記方案內容，
--      和 orgs.plan 那支 migration 的哲學一致）。
--   3. 把 J 自己的三個 org（15 J / 58 avocado / 91 TESTING1）標成 standard
--      並把 quota 設到方案值——不然 8/31 的 Demo 截圖全是浮水印。
-- ============================================================================

create table if not exists fence_usage (
  org_id bigint primary key references orgs (id) on delete cascade,
  /* 存過幾份正式文件（會議記錄保存＋文件包乾淨產出）。累計，不退。 */
  docs_made integer not null default 0 check (docs_made >= 0),
  /* AI 讀過幾頁（照片 1 張＝1 頁，PDF 一頁＝1 頁）。累計，不退。 */
  pages_uploaded integer not null default 0 check (pages_uploaded >= 0),
  /* 拿走過幾份「乾淨（無浮水印）」的文件檔。累計，不退。 */
  clean_downloads integer not null default 0 check (clean_downloads >= 0),
  updated_at timestamptz not null default now()
);

alter table fence_usage enable row level security;
-- 刻意沒有任何 policy：只有 service role（繞過 RLS）能讀寫。
-- 畫面上的「還剩幾次」由 server 端讀了再給（app_errors 同款做法）。
-- 使用者自己改不了自己的圍欄數字，這正是要的。

comment on table fence_usage is
  'Lifetime free-plan counters per org (D44). Cumulative "has done", never '
  'decremented by deletes. Receipts are NOT here - count receipts rows. '
  'Caps live in src/lib/plans.ts and arrive as fence_charge() arguments.';

-- ----------------------------------------------------------------------------
-- fence_charge(org, Δ文件, Δ頁, Δ下載, 上限文件, 上限頁, 上限下載) → jsonb
--
-- 原子：SELECT ... FOR UPDATE 鎖住那一行再算，兩個同時按下載的人不會
-- 一起擠過最後一個名額。正數是收費——會越界就整筆拒絕、一個都不寫；
-- 負數是退次數（廠商根本沒到達那類，與 ai_usage 退款同義）——永遠成功，
-- 地板是 0。回傳 {ok, docs_made, pages_uploaded, clean_downloads}。
-- ----------------------------------------------------------------------------
create or replace function public.fence_charge(
  p_org_id bigint,
  p_docs integer,
  p_pages integer,
  p_downloads integer,
  p_max_docs integer,
  p_max_pages integer,
  p_max_downloads integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row fence_usage%rowtype;
  v_docs integer;
  v_pages integer;
  v_downloads integer;
begin
  insert into fence_usage (org_id) values (p_org_id)
  on conflict (org_id) do nothing;

  select * into v_row from fence_usage where org_id = p_org_id for update;

  v_docs      := greatest(v_row.docs_made       + coalesce(p_docs, 0), 0);
  v_pages     := greatest(v_row.pages_uploaded  + coalesce(p_pages, 0), 0);
  v_downloads := greatest(v_row.clean_downloads + coalesce(p_downloads, 0), 0);

  -- 只有「正向收費」需要過上限；退次數（負數）永遠落地。
  if (coalesce(p_docs, 0)      > 0 and v_docs      > p_max_docs)
     or (coalesce(p_pages, 0)     > 0 and v_pages     > p_max_pages)
     or (coalesce(p_downloads, 0) > 0 and v_downloads > p_max_downloads) then
    return jsonb_build_object(
      'ok', false,
      'docs_made', v_row.docs_made,
      'pages_uploaded', v_row.pages_uploaded,
      'clean_downloads', v_row.clean_downloads
    );
  end if;

  update fence_usage
     set docs_made       = v_docs,
         pages_uploaded  = v_pages,
         clean_downloads = v_downloads,
         updated_at      = now()
   where org_id = p_org_id;

  return jsonb_build_object(
    'ok', true,
    'docs_made', v_docs,
    'pages_uploaded', v_pages,
    'clean_downloads', v_downloads
  );
end;
$$;

-- spend_ai_credit 同款門禁：只有 server（service role）可以呼叫。
revoke all on function public.fence_charge(bigint, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.fence_charge(bigint, integer, integer, integer, integer, integer, integer)
  to service_role;

-- ----------------------------------------------------------------------------
-- J 的三個 org 標成付費（standard）＋ quota 設到方案值。
-- privileged-columns 鎖（20260830000000）擋一般更新，走文件裡寫好的解鎖路。
-- id 不存在時 update 到 0 行，無害（新資料庫跑這支照樣成功）。
-- ----------------------------------------------------------------------------
select set_config('minit.allow_privileged_org_update', 'on', true);

update orgs
   set plan               = 'standard',
       plan_changed_at    = now(),
       plan_changed_by    = 'migration 20260909 (D44 fence - J''s own orgs)',
       monthly_free_quota = 100
 where id in (15, 58, 91)
   and plan is distinct from 'standard';

-- ============================================================================
-- 驗證段（純 select，不改任何東西）
-- ============================================================================
--
--   select relrowsecurity from pg_class where relname = 'fence_usage';  -- true
--
--   select proname, prosecdef from pg_proc where proname = 'fence_charge';
--   -- 一行，prosecdef = true
--
--   select id, name, plan, monthly_free_quota from orgs
--    where id in (15, 58, 91);   -- 三行都 standard / 100
--
-- 回退：
--   drop function if exists public.fence_charge(bigint, integer, integer, integer, integer, integer, integer);
--   drop table if exists fence_usage;
--   -- J 的三個 org 要退回 trial 的話，照 20260830000000 檔尾的手動路。
-- ============================================================================
