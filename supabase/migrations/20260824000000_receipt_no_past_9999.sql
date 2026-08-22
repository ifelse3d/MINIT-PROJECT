-- ============================================================================
-- Minit — issue_receipts()：让收据号码越过 9999
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份贴上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（create or replace）。
--   🚧 尚未套用。D8 铁律：J 本人手动跑，写这个档的人不执行它。
--
-- ⚠ 不急。一个 org 一年要开满 9999 张收据才会撞到 —— 但撞到的时候是**开不出
--   收据**，而且是在庙会当天才发现，所以现在修比较便宜。
--
-- ----------------------------------------------------------------------------
-- 这一支在补什么洞（J 2026-08-22 问：「如果超過 1000 呢？」）
--
-- 1000 完全没问题：号码是 `PSH-2026-1000`，四位刚刚好。
-- **9999 才是墙**，而且墙的形状很难看：
--
--   lpad('10000', 4, '0')  在 PostgreSQL 回的是 '1000'，不是 '10000'。
--   官方文件写得很清楚：字串比目标长度长的时候，lpad **从右边截断**。
--
-- 所以第 10000 张收据会拿到 `PSH-2026-1000` —— 跟第 1000 张一模一样。
-- 好消息是它不会安静地发生：`receipts` 上有 `unique (org_id, receipt_no)`，
-- 所以那一笔交易会整个失败、什么都不会写进去。坏消息是从那一刻起，
-- 那个 org 那一年**再也开不出任何收据**，而且错误讯息是唯一约束冲突，
-- 看起来跟号码位数一点关系都没有。
--
-- TypeScript 那边没有这个问题（`src/lib/receipts.ts`：
-- `String(seq).padStart(4, "0")` 只补不砍，`parseReceiptNo` 收 `\d{4,}`），
-- 所以这一行是 SQL 与 TS 唯一对不上的地方。
--
-- 修法：位数够四位就原样输出，不够才补零。
--   9999  → 'PSH-2026-9999'
--   10000 → 'PSH-2026-10000'
-- 字典序仍然是对的（'0999' < '10000'，因为 '0' < '1'），所以照号码排序、
-- 以及 `substring(receipt_no from '\d+$')::int` 那个断号检查都不受影响。
--
-- 已经开出去的收据一张都不会变：这支只改「下一张怎么取名」。
-- ============================================================================

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
  -- 这一行就是 1000 列天花板消失的地方：不再把整张表读进应用层。
  select coalesce(max(substring(receipt_no from '\d+$')::int), v_opening)
    into v_max
    from receipts
   where org_id = p_org_id
     and receipt_no like v_prefix || '-' || v_year::text || '-%';

  -- gap-free 检查：这一年开过的张数，必须刚好等於 max - opening。
  -- 不相等 = 有人删过收据，或者号码是在系统外开的。要人来处理，不要默默续号。
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
      amount_cents, purpose, donated_at, custody_status, source
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
      nullif(v_row->>'source', '')
    )
    returning id into v_donation_id;

    v_seq := v_seq + 1;
    -- 🔴 至少四位，但**不截断**（2026-08-23 修）。
    -- lpad('10000', 4, '0') 在 PostgreSQL 会回 '1000' —— 它比目标长度长的时候
    -- 是从右边砍掉，不是放行。第 10000 张收据因此会拿到第 1000 张的号码，撞上
    -- (org_id, receipt_no) 的唯一约束，整笔交易失败：一个 org 一年开满 9999 张
    -- 之后，收据就再也开不出来了。TypeScript 那边（src/lib/receipts.ts 的
    -- formatReceiptNo / parseReceiptNo）本来就写着「超过 9999 自然变长」，
    -- 所以这一行是两边唯一不一致的地方。
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
-- 1) 函式还在，而且仍然是 invoker：
--      select proname, prosecdef from pg_proc where proname = 'issue_receipts';
--    prosecdef 要是 false。
--
-- 2) 补零逻辑本身（不碰任何表）：
--      select case when length(x::text) >= 4 then x::text
--                  else lpad(x::text, 4, '0') end
--        from unnest(array[1, 999, 1000, 9999, 10000, 123456]) as x;
--    要看到：0001 / 0999 / 1000 / 9999 / 10000 / 123456
--    （对照组，看看旧的会怎样：select lpad(10000::text, 4, '0');  → 1000）
--
-- 回退：把 20260730000000_receipt_series.sql 的 PART C 整段再跑一次。
-- ============================================================================
