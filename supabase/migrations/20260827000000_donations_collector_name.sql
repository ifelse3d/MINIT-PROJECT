-- ============================================================================
-- Minit — donations.collector_name ＋ issue_receipts() 存收款人
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份贴上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（add column if not exists ＋ create or replace）。
--   🚧 尚未套用。D8 铁律：J 本人手动跑，写这个档的人不执行它。
--
-- ----------------------------------------------------------------------------
-- 这一支在补什么洞（2026-08-25 通宵 S0-1／S0-2）
--
-- 收据 PDF 上印着「收款人」，但那个名字一直只活在浏览器的 localStorage：
-- `donations` 表上只有 `collector_member_id`（外键），而实际收款的人常常是
-- 自由文字（登记的人照账页抄，或就是操作 Minit 的本人）。S0-1 把收据 PDF 改成
-- **全部内容从资料库回查**之后，「收款人」就成了唯一查不回来的栏位。
--
-- 修法：加一栏自由文字 `collector_name`，并让 issue_receipts() 把它写进去。
-- 在这支 migration 跑之前，程式码已经能安全运作：
--   - issue_receipts() v3（20260824）会忽略 JSON 里多出来的 collectorName 键；
--   - /api/receipt-pdf 查不到这一栏时（42703）会自动退回不带 collector_name
--     的查询，收款人一栏印确认人的名字。
-- 跑完之后，新开的收据就会存收款人，PDF 也会印真的收款人。
-- ============================================================================

-- A. 新栏位（自由文字；collector_member_id 外键保留，两者互补）
alter table donations
  add column if not exists collector_name text;

comment on column donations.collector_name is
  'Free-text name of whoever physically collected the cash, as recorded at issue time. '
  'collector_member_id remains the FK for when the collector is a registered member.';

-- B. issue_receipts()：跟 20260824000000 一字不差，只加 collector_name。
create or replace function public.issue_receipts(
  p_org_id bigint,
  p_rows   jsonb
)
returns jsonb
language plpgsql
security invoker            -- 刻意：RLS 照常适用，这个函式不提权
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

  -- 同一个 org 同时只有一个人在配号。交易结束自动释放。
  perform pg_advisory_xact_lock(hashtextextended('minit:receipts:' || p_org_id::text, 0));

  -- RLS 决定看不看得到这一列；看不到就等於不是你的组织。
  select receipt_prefix, receipt_opening_seq
    into v_prefix, v_opening
    from orgs where id = p_org_id;
  if not found then
    raise exception 'Organisation % not found or not accessible', p_org_id
      using errcode = 'insufficient_privilege';
  end if;

  -- 马来西亚时间的年份（不是伺服器的）。跟 src/lib/history.ts 的 dayIsoMalaysia 一致。
  v_year := extract(year from (now() at time zone 'Asia/Kuala_Lumpur'))::int;

  -- 目前最大序号 —— 在资料库里 aggregate。
  select coalesce(max(substring(receipt_no from '\d+$')::int), v_opening)
    into v_max
    from receipts
   where org_id = p_org_id
     and receipt_no like v_prefix || '-' || v_year::text || '-%';

  -- gap-free 检查：这一年开过的张数，必须刚好等於 max - opening。
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

    -- 幂等：这一列已经存过了吗？
    select r.receipt_no into v_existing
      from donations d
      join receipts  r on r.donation_id = d.id
     where d.org_id = p_org_id
       and d.client_id = v_row->>'clientId';

    if v_existing is not null then
      -- 断网重按第二次。把原本那个号码还回去，不重开、不烧号。
      v_out := v_out || jsonb_build_object(v_row->>'clientId', v_existing);
      continue;
    end if;

    insert into donations (
      org_id, client_id, donor_name, donor_phone, donor_masked,
      amount_cents, purpose, donated_at, custody_status, source,
      collector_name                                              -- 🆕
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
      nullif(v_row->>'collectorName', '')                         -- 🆕
    )
    returning id into v_donation_id;

    v_seq := v_seq + 1;
    -- 至少四位，但不截断（20260824000000 的修正，原样保留）。
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
-- 验证段（纯 select，不改任何东西）
-- ============================================================================
--
-- 1) 栏位在了：
--      select column_name from information_schema.columns
--       where table_name = 'donations' and column_name = 'collector_name';
--
-- 2) 函式还在，而且仍然是 invoker：
--      select proname, prosecdef from pg_proc where proname = 'issue_receipts';
--    prosecdef 要是 false。
--
-- 回退：把 20260824000000_receipt_no_past_9999.sql 整段再跑一次
--（collector_name 栏位留着无害，issue_receipts 会回到不写它的版本）。
-- ============================================================================
