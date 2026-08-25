-- ============================================================================
-- Minit — migration 25 · FINAL SPRINT（27 號施工單，2026-08-26 深夜整晚的
-- 全部 schema 需求集中在這一支）
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份貼上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（add column if not exists / create table if not exists /
--   create or replace，每一節都可整份重跑）。
--   🚧 尚未套用。D8 鐵律：J 本人手動跑，寫這個檔的人不執行它。
--
-- 之後（另外一句，migration 之外）：把你自己設成平台管理員——
--   insert into platform_admins (email) values ('你的登入email')
--     on conflict (email) do nothing;
--   （25-大改造進度報告.md 最上面也有這一句。）
--
-- 分節（對應 27 號單的 Stage）：
--   ① donations 實物捐贈欄位 ＋ issue_receipts() v5        （Stage D-1）
--   ② expenses 報銷/Claim 流程欄位                          （Stage E-1）
--   ③ member groups —— 不在這裡：20260826000000 已建、已套用   （Stage H）
--   ④ feedback 反饋表                                       （Stage K-1）
--   ⑤ ai_usage.user_id 分人記帳                             （Stage K-2）
--   ⑥ platform_admins ＋ credit_grants ＋ admin_grant_credits（Stage K-3）
-- ============================================================================


-- ============================================================================
-- ① 實物捐贈（Derma Barangan）— Stage D-1，J 8/26 拍板③
--
-- 收據照樣連號（同一序列）；金額欄印品項不印錢；估值選填、只入帳目
-- （財報另列附表），不進 e-Invois 彙總、不進現金交款批次。
-- kind 預設 'cash'：既有資料一列都不用動，全部自動是現金。
-- 實物列的 amount_cents 一律寫 0 —— 任何漏掉排除的錢路加到的都是零（防呆）。
-- ============================================================================

alter table donations
  add column if not exists kind text not null default 'cash';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'donations_kind_check') then
    alter table donations add constraint donations_kind_check
      check (kind in ('cash', 'in_kind'));
  end if;
end $$;

alter table donations
  add column if not exists item_desc text,
  add column if not exists est_value_cents bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'donations_est_value_check') then
    alter table donations add constraint donations_est_value_check
      check (est_value_cents is null or est_value_cents >= 0);
  end if;
end $$;

comment on column donations.kind is
  'cash (default) | in_kind. In-kind rows: amount_cents is 0 by convention, '
  'item_desc holds the goods, est_value_cents (optional) the human estimate — '
  'ledger only, never on the receipt, never in e-Invois, never in cash custody.';
comment on column donations.item_desc is
  'In-kind donations only: what was donated ("20 kampit beras"). Printed on the receipt in place of money.';
comment on column donations.est_value_cents is
  'In-kind donations only, OPTIONAL: the human''s estimated value in cents. Ledger/statement only.';

-- ----------------------------------------------------------------------------
-- issue_receipts() v5 — 跟 20260827000000 的 v4 一字不差，只加三個實物欄位。
-- （v4＝v3＋collector_name；v3＝20260824 的「號碼過 9999 不截斷」版。）
-- ----------------------------------------------------------------------------
create or replace function public.issue_receipts(
  p_org_id bigint,
  p_rows   jsonb
)
returns jsonb
language plpgsql
security invoker            -- 刻意：RLS 照常適用，這個函式不提權
set search_path = public
as $$
declare
  v_prefix      text;
  v_opening     integer;
  v_year        integer;
  v_max         integer;
  v_expected    integer;
  v_seq         integer;
  v_row         jsonb;
  v_donation_id bigint;
  v_receipt_no  text;
  v_existing    text;
  v_out         jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    return v_out;
  end if;

  -- 同一個 org 同時只有一個人在配號。交易結束自動釋放。
  perform pg_advisory_xact_lock(hashtextextended('minit:receipts:' || p_org_id::text, 0));

  -- RLS 決定看不看得到這一列；看不到就等於不是你的組織。
  select receipt_prefix, receipt_opening_seq
    into v_prefix, v_opening
    from orgs where id = p_org_id;
  if not found then
    raise exception 'Organisation % not found or not accessible', p_org_id
      using errcode = 'insufficient_privilege';
  end if;

  -- 馬來西亞時間的年份（不是伺服器的）。跟 src/lib/history.ts 的 dayIsoMalaysia 一致。
  v_year := extract(year from (now() at time zone 'Asia/Kuala_Lumpur'))::int;

  -- 目前最大序號 —— 在資料庫裡 aggregate。
  select coalesce(max(substring(receipt_no from '\d+$')::int), v_opening)
    into v_max
    from receipts
   where org_id = p_org_id
     and receipt_no like v_prefix || '-' || v_year::text || '-%';

  -- gap-free 檢查：這一年開過的張數，必須剛好等於 max - opening。
  select count(*) into v_expected
    from receipts
   where org_id = p_org_id
     and receipt_no like v_prefix || '-' || v_year::text || '-%';
  if v_max - v_opening <> v_expected then
    raise exception
      'Receipt series %-% has gaps: highest number is %, opening was %, but only % receipts exist. '
      'A human must resolve this before new receipts are issued.',
      v_prefix, v_year, v_max, v_opening, v_expected
      using errcode = 'check_violation';
  end if;

  v_seq := v_max;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    if coalesce(v_row->>'clientId', '') = '' then
      raise exception 'every row needs a clientId' using errcode = 'invalid_parameter_value';
    end if;

    -- 冪等：這一列已經存過了嗎？
    select r.receipt_no into v_existing
      from donations d
      join receipts  r on r.donation_id = d.id
     where d.org_id = p_org_id
       and d.client_id = v_row->>'clientId';

    if v_existing is not null then
      -- 斷網重按第二次。把原本那個號碼還回去，不重開、不燒號。
      v_out := v_out || jsonb_build_object(v_row->>'clientId', v_existing);
      continue;
    end if;

    insert into donations (
      org_id, client_id, donor_name, donor_phone, donor_masked,
      amount_cents, purpose, donated_at, custody_status, source,
      collector_name,
      kind, item_desc, est_value_cents                              -- 🆕 v5
    ) values (
      p_org_id,
      v_row->>'clientId',
      v_row->>'donorName',
      v_row->>'donorPhone',
      v_row->>'donorMasked',
      (v_row->>'amountCents')::bigint,
      v_row->>'purpose',
      nullif(v_row->>'donatedAt', '')::date,
      coalesce(nullif(v_row->>'custodyStatus', ''), 'collected'),
      nullif(v_row->>'source', ''),
      nullif(v_row->>'collectorName', ''),
      coalesce(nullif(v_row->>'kind', ''), 'cash'),                 -- 🆕 v5
      nullif(v_row->>'itemDesc', ''),                               -- 🆕 v5
      nullif(v_row->>'estValueCents', '')::bigint                   -- 🆕 v5
    )
    returning id into v_donation_id;

    v_seq := v_seq + 1;
    -- 至少四位，但不截斷（20260824000000 的修正，原樣保留）。
    v_receipt_no := v_prefix || '-' || v_year::text || '-' ||
      case when length(v_seq::text) >= 4 then v_seq::text
           else lpad(v_seq::text, 4, '0') end;

    insert into receipts (org_id, receipt_no, donation_id)
    values (p_org_id, v_receipt_no, v_donation_id);

    update donations
       set receipt_id = (select id from receipts
                          where org_id = p_org_id and receipt_no = v_receipt_no)
     where id = v_donation_id;

    v_out := v_out || jsonb_build_object(v_row->>'clientId', v_receipt_no);
  end loop;

  return v_out;
end;
$$;


-- ============================================================================
-- ② 報銷/Claim 完整批准流 — Stage E-1，J 8/26 拍板②「做最好的給我」
--
-- expenses 從 Phase 0 就存在（description/amount_cents/category/spent_at），
-- 但從來沒有任何程式寫入過。現在補上 claim 流程欄位：
--   recorded  — 財政直接記的開支（不用批）
--   submitted — 成員交上來的 claim，等批
--   approved  — 批了，等付錢
--   paid      — 付了，結案
--   rejected  — 退回（reject_reason 必看得到）
-- 角色驗證在 server action（B-4 的做法）；RLS 照全庫慣例 org 域（20260719 C1
-- 那四條 policy 對 expenses 早就建好了，這裡不用動）。
-- ============================================================================

alter table expenses
  add column if not exists status text not null default 'recorded',
  add column if not exists claimant_user_id uuid,
  add column if not exists claimant_name text,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists reject_reason text,
  add column if not exists created_by text,
  -- 冪等鍵＋來源標記：跟 donations 同一套習慣（斷網重送不重複；
  -- 審計看得出哪一筆是拍單據讀的、哪一筆是手打的）。
  add column if not exists client_id text,
  add column if not exists source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_status_check') then
    alter table expenses add constraint expenses_status_check
      check (status in ('recorded', 'submitted', 'approved', 'paid', 'rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_source_check') then
    alter table expenses add constraint expenses_source_check
      check (source is null or source in ('photo', 'manual'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'expenses_org_client_unique'
  ) then
    alter table expenses add constraint expenses_org_client_unique
      unique (org_id, client_id);
  end if;
end $$;

comment on column expenses.status is
  'recorded (treasurer''s own entry) | submitted -> approved -> paid | rejected. '
  'Role checks live in the server actions (lib/claims.ts holds the state machine).';


-- ============================================================================
-- ③ 出席群體分類 — Stage H
--
-- 這一節刻意是空的：member_groups（org_id, group_name, person_name）在
-- 20260826000000_member_groups.sql 就建好了，而且你已經套用（check:migrations
-- 的 probe 17 是綠的）。Stage H 的程式直接用那張表，不再建第二套。
-- ============================================================================


-- ============================================================================
-- ④ 反饋管道 — Stage K-1
--
-- 設置頁一個小表單（免費、不碰 AI），/admin 看得到全部。
-- ============================================================================

create table if not exists feedback (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  user_id uuid,
  message text not null check (length(trim(message)) between 1 and 4000),
  -- 哪一頁送出的（pathname），純導航字串，不含任何文件內容。
  page text,
  status text not null default 'new' check (status in ('new', 'seen', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_org on feedback (org_id);

alter table feedback enable row level security;

-- org 域：自己組織的人看得到／寫得進自己組織的反饋；狀態由管理面（service
-- role）改，使用者端沒有 update/delete policy。
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'feedback' and policyname = 'feedback_select') then
    create policy feedback_select on public.feedback
      for select to authenticated
      using (org_id in (select public.accessible_orgs()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'feedback' and policyname = 'feedback_insert') then
    create policy feedback_insert on public.feedback
      for insert to authenticated
      with check (org_id in (select public.accessible_orgs_writable()));
  end if;
end $$;


-- ============================================================================
-- ⑤ ai_usage 分人 — Stage K-2
--
-- 可空：舊列沒有人；新列由 recorder 落 auth uid。彙總照舊按 org，分人只是
-- 多一個切面（/admin 與設置用量卡可按人看小計）。
-- ============================================================================

alter table ai_usage
  add column if not exists user_id uuid;

comment on column ai_usage.user_id is
  'Which signed-in member triggered this AI action. Nullable: rows from before '
  'migration 25, and server-initiated actions, have no person.';


-- ============================================================================
-- ⑥ 管理台加額度（有審計的路）— Stage K-3
--
-- platform_admins：**空表**。J 明早自己插一行（檔頭那句 SQL）。
-- admin_grant_credits()：SECURITY DEFINER；內部驗 auth.jwt()->>'email' ∈
-- platform_admins（fail-closed：沒 email、不在表裡 → 一律拒絕）；內部呼叫
-- minit_admin.grant_ai_credits()（維持「加額度只有一條路」）；寫 credit_grants
-- 審計表（誰、給誰、多少、何時、備註、前後餘額）。
-- service_role 仍然被擋在 minit_admin.* 外面 —— 這支 public 函式是那個設計
-- 之下唯一、明確、有審計的門。
-- ============================================================================

create table if not exists platform_admins (
  email text primary key,
  added_at timestamptz not null default now()
);

-- RLS on，零 policy：PostgREST 拿它一點辦法都沒有；只有 definer 函式與
-- service role 讀得到。
alter table platform_admins enable row level security;

create table if not exists credit_grants (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  delta integer not null,
  note text,
  granted_by text not null,
  granted_at timestamptz not null default now(),
  before_credits integer,
  after_credits integer
);

create index if not exists idx_credit_grants_org on credit_grants (org_id);

-- RLS on，零 policy：審計表只進不出（管理面用 service role 讀）。
alter table credit_grants enable row level security;

create or replace function public.admin_grant_credits(
  p_org_id bigint,
  p_delta  integer,
  p_note   text default null
)
returns table (
  org_id bigint,
  org_name text,
  credits_before integer,
  credits_after integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := '';
  r record;
begin
  -- fail-closed：JWT 沒有 email、或 email 不在 platform_admins —— 拒絕。
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

  if p_delta is null or p_delta = 0 then
    raise exception 'delta must be a non-zero integer' using errcode = 'invalid_parameter_value';
  end if;

  -- 加額度仍然只有一條路：minit_admin.grant_ai_credits()。
  select * into r from minit_admin.grant_ai_credits(p_org_id, p_delta);

  insert into credit_grants (org_id, delta, note, granted_by, before_credits, after_credits)
  values (p_org_id, p_delta, p_note, v_email, r.credits_before, r.credits_after);

  return query select r.org_id, r.org_name, r.credits_before, r.credits_after;
end;
$$;

-- 匿名不可呼叫；登入使用者可以呼叫（函式內部自己驗 platform_admins）。
revoke execute on function public.admin_grant_credits(bigint, integer, text) from public, anon;
grant execute on function public.admin_grant_credits(bigint, integer, text) to authenticated, service_role;


-- ============================================================================
-- 驗證段（純 select，不改任何東西）
-- ============================================================================
--
-- 1) 實物欄位在了：
--      select column_name from information_schema.columns
--       where table_name = 'donations'
--         and column_name in ('kind', 'item_desc', 'est_value_cents');
--    要看到 3 列。
--
-- 2) claim 欄位在了：
--      select column_name from information_schema.columns
--       where table_name = 'expenses' and column_name in
--         ('status','claimant_user_id','submitted_at','approved_by','paid_at',
--          'reject_reason','client_id','source');
--    要看到 8 列。
--
-- 3) 三張新表在了：
--      select tablename from pg_tables
--       where tablename in ('feedback', 'platform_admins', 'credit_grants');
--
-- 4) ai_usage.user_id 在了：
--      select column_name from information_schema.columns
--       where table_name = 'ai_usage' and column_name = 'user_id';
--
-- 5) 兩支函式在了、屬性對：
--      select proname, prosecdef from pg_proc
--       where proname in ('issue_receipts', 'admin_grant_credits');
--    issue_receipts 的 prosecdef 要是 false（invoker）；
--    admin_grant_credits 要是 true（definer，內部自己驗身份）。
--
-- 6) 沒把自己加進 platform_admins 之前，admin_grant_credits 對誰都說不：
--      （用 SQL Editor 跑的話 request.jwt.claims 是空的，本來就會被拒 ——
--        這正是 fail-closed 的意思。）
--
-- 回退（整節 ⑥）：
--   drop function if exists public.admin_grant_credits(bigint, integer, text);
--   drop table if exists credit_grants;
--   drop table if exists platform_admins;
-- 回退（節 ①的函式）：把 20260827000000 的 B 段整段再跑一次。
-- ============================================================================
