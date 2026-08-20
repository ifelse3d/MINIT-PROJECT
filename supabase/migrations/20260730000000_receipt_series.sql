-- ===========================================================================
-- 2026-08-03 · 收据字号、接号，与号码分配的原子化
--
--   🚧 DRAFT — NOT YET APPLIED. NOT YET APPROVED. 🚧
--   （档名的 20260730 是**排序键**，不是日期。实际撰写日 2026-08-03。
--     档名不改：migration 的档名决定套用顺序，改了会制造更大的混乱。）
--   计划书：`2026-08-03-收据字号与接号-计划.md`（方案 B）
--   在 J 批准、而且在 STAGING 跑过之前，不要贴进正式资料库。
--
-- 依赖：必须先套用 20260726000000（client_id + 唯一约束）。
--       没有它，PART C 的幂等逻辑不成立。
--
-- 附加 only：没有 DROP TABLE、没有 DROP COLUMN、没有删资料。
-- 现有 4 个组织 / 10 张 MIN-2026-xxxx 收据的行为完全不变（预设值刻意选成这样）。
--
-- 这份档案修的是三件事：
--   A. 每间社团的收据都印着 'MIN'（产品缩写），不是自己的字号
--   B. 无法从既有纸本号码接下去 —— 每个真实客户的上线阻挡项
--   C. 号码在应用层算：Supabase 预设 db-max-rows=1000 会静默截断，
--      截断後看起来像断号，财政从此永远开不了收据；而且「读→算→写」有竞态
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- PART A. orgs 加两个栏位
--
-- receipt_opening_seq 的语意是「纸本**已经用掉**的最後一号」，不是「起始号」。
-- 财政心里想的是「我开到 846」，所以让他填 846，程式从 847 开始。少一次心算。
-- ---------------------------------------------------------------------------
alter table orgs
  add column if not exists receipt_prefix text not null default 'MIN';

alter table orgs
  add column if not exists receipt_opening_seq integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orgs_receipt_prefix_check') then
    alter table orgs add constraint orgs_receipt_prefix_check
      check (receipt_prefix ~ '^[A-Z][A-Z0-9]{1,7}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orgs_receipt_opening_seq_check') then
    alter table orgs add constraint orgs_receipt_opening_seq_check
      check (receipt_opening_seq >= 0 and receipt_opening_seq < 1000000);
  end if;
end;
$$;

comment on column orgs.receipt_prefix is
  'The society''s OWN receipt series letters, e.g. PSH -> PSH-2026-0001. '
  'Settable by hq_admin until the first receipt is issued, then frozen (trigger below).';
comment on column orgs.receipt_opening_seq is
  'Highest number ALREADY USED on the paper receipt book. Minit starts at this + 1, '
  'so a society mid-year continues its existing series instead of restarting at 0001.';


-- ---------------------------------------------------------------------------
-- PART B. 开出第一张收据之後就冻结这两栏
--
-- 跟「收据身分不可改」是同一条理由：序列的定义中途变了，前後的收据就对不起来,
-- 而这是法定凭证。
--
-- 刻意跟 20260728 的特权栏位锁**不同规则**：extra_credits 是「永远只有 service
-- role 能动」，这两栏是「**第一张收据之前** hq_admin 自己设，之後谁都不能动」——
-- 因为让社团自己填正是这个功能的意义。
-- service_role 也挡（含 Claude、含未来的管理後台）；真的要改只能先删收据，
-- 而删收据本身已经被 20260726 的锁挡住了 —— 这是刻意的死路。
-- ---------------------------------------------------------------------------
create or replace function public.freeze_receipt_series()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.receipt_prefix is distinct from old.receipt_prefix
     or new.receipt_opening_seq is distinct from old.receipt_opening_seq then
    if exists (select 1 from receipts where org_id = old.id limit 1) then
      raise exception
        'Receipt series is frozen: organisation % has already issued receipts. '
        'Changing the prefix or opening number now would break a legal document series.',
        old.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orgs_freeze_receipt_series on orgs;
create trigger orgs_freeze_receipt_series
  before update on orgs
  for each row execute function public.freeze_receipt_series();


-- ---------------------------------------------------------------------------
-- PART C. issue_receipts() — 一个交易做完整件事
--
-- 取代 src/app/money/actions.ts 现在那 4 段式（插捐款 → 插收据 → 回填 →
-- 失败时补偿）。那 4 段之间没有交易保护，所以才需要 rollbackDonations() 和
-- needs_reconciliation。放进一个函式里，这些全部不需要了。
--
-- 为什么用 advisory lock 而不是计数器表：
--   计数器表更快，但配了号却失败就**烧掉号码 = 断号**。CLAUDE.md 规则 2 要求
--   gap-free，所以必须能从实际的 receipts 重新推导最大值。advisory lock 让
--   「读最大值 → 写」变成原子的，同时保留 gap-free。以社团的并发量绰绰有余。
--
-- 幂等（P0-2 的 6b）：撞到 (org_id, client_id) 唯一约束时，**回传那张已经开好
-- 的收据号码**，而不是「失败，请重试」。断网重按第二次是安全的。
--
-- p_rows 形状（每一列）：
--   { "clientId": "ledger-1720000000-3", "donorName": "...", "donorPhone": "...",
--     "donorMasked": "...", "amountCents": 15500, "purpose": "derma am",
--     "donatedAt": "2026-06-03", "custodyStatus": "collected", "source": "photo" }
-- 回传：{ "ledger-1720000000-3": "PSH-2026-0847", ... }
-- ---------------------------------------------------------------------------
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
    v_receipt_no := v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');

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

revoke execute on function public.issue_receipts(bigint, jsonb) from public, anon;
grant  execute on function public.issue_receipts(bigint, jsonb) to authenticated, service_role;

comment on function public.issue_receipts(bigint, jsonb) is
  'Atomically allocates receipt numbers and writes donations + receipts in ONE transaction. '
  'Replaces the 4-step compensating logic in src/app/money/actions.ts. '
  'Idempotent on (org_id, client_id): a retried request returns the receipt numbers '
  'already issued instead of issuing a second set.';


-- ===========================================================================
-- 验证段 —— 套用之後跑这些（纯 select，不改东西）
-- ===========================================================================
--
-- 1) 栏位都在，而且现有资料没被动到：
--      select id, name, receipt_prefix, receipt_opening_seq from orgs order by id;
--    应该看到 4 列，全部 prefix='MIN'、opening=0。
--
-- 2) 冻结确实生效（对一个已经有收据的 org）：
--      update orgs set receipt_prefix = 'XXX' where id = <有收据的 org>;
--    应该报 'Receipt series is frozen'。
--
-- 3) 冻结**不会**挡住还没开过收据的 org：
--      update orgs set receipt_prefix = 'TST', receipt_opening_seq = 846
--        where id = <没有收据的 org>;
--    应该成功。（记得改回来。）
--
-- 4) 接号算对了没有 —— 在一个 do 区块里跑，最後 raise exception 自动回滚：
--      do $t$
--      declare v jsonb;
--      begin
--        update orgs set receipt_prefix='TST', receipt_opening_seq=846 where id=<空 org>;
--        v := public.issue_receipts(<空 org>,
--               '[{"clientId":"t1","donorName":"A","amountCents":100},
--                 {"clientId":"t2","donorName":"B","amountCents":200}]'::jsonb);
--        raise exception 'ROLLBACK ON PURPOSE — result was %', v;
--      end $t$;
--    讯息里应该看到 {"t1":"TST-2026-0847","t2":"TST-2026-0848"}。
--
-- 5) 幂等：同一个 do 区块里把同一批再送一次，两次结果必须**完全一样**。
--
-- ⚠️ Supabase SQL Editor 不显示 raise notice，所以上面刻意用 raise exception
--    把结果带出来（顺便自动回滚）。这跟 2026-07-29 RUNBOOK 的作法一致。
--
-- 回退（只有在还没开出任何新收据时才安全）：
--   drop function if exists public.issue_receipts(bigint, jsonb);
--   drop trigger  if exists orgs_freeze_receipt_series on orgs;
--   drop function if exists public.freeze_receipt_series();
--   alter table orgs drop column if exists receipt_prefix;
--   alter table orgs drop column if exists receipt_opening_seq;
-- ===========================================================================
