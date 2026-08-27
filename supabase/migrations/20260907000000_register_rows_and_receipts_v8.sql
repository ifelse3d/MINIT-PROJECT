-- ============================================================================
-- Minit — migration 29 · 記錄即入庫（D32，2026-08-28 兩份 review 那一場）
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份貼上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（create or replace，整份可重跑）。
--   🚧 尚未套用。D8 鐵律：J 本人手動跑，寫這個檔的人不執行它。
--
-- 為什麼有這一支（J 27 晚 review #17：「MIN-2026-0002 已經報過了，還可以再
-- 報多一次？」）：
--   交接/總會確認一直只改瀏覽器 localStorage 裡的捐款狀態；資料庫的
--   donations.custody_status 永遠停在開收據那一刻。每次載入頁面，資料庫的
--   舊狀態把本機的新狀態蓋掉 → 已經交出去、已經確認的錢又變回「在手上，
--   可交」→ 同一張收據交兩次、確認記錄成雙。
--
-- 修法三件（DECISIONS.md D32），這支 migration 是其中兩件：
--   ① save_register_rows() —— 新 RPC：記帳的那一刻就把行寫進資料庫
--      （upsert on (org_id, client_id)）。localStorage 從此只是離線草稿。
--      程式用「這個 RPC 存不存在」判斷 migration 29 套用了沒有：沒套用就
--      維持舊行為（只在本機），不會有中間狀態。
--   ② issue_receipts() v8 —— v7 一字不差，只加一件事：捐款行已經存在
--      （①先寫進去的）而且還沒有收據 → 改為 UPDATE 那一行再配號。
--      v7 遇到這種行會 INSERT 撞 donations_org_client_uniq，整批爆掉——
--      所以①②必須同一支 migration 出貨，不留中間窗口。
--   （第三件：交接時同步回寫 custody_status，在程式端 custody-actions.ts，
--    純 update，不需要 migration，任何庫齡都可用。）
--
-- 兩個函式都 SECURITY INVOKER：RLS 照常適用，不提權。
-- ============================================================================


-- ============================================================================
-- ① save_register_rows(p_org_id, p_rows) — 記錄的每一筆錢當場入庫。
--    upsert on (org_id, client_id)。已經有收據的行跳過（收據行的身分由
--    issue_receipts 管，這裡永不碰）。custody_status 只往前不往後
--    （collected < pending_remittance < settled）——資料庫還沒聽說的交接，
--    不能被一次舊資料的重存倒轉。回傳寫入/更新的行數。
-- ============================================================================
create or replace function public.save_register_rows(
  p_org_id bigint,
  p_rows   jsonb
)
returns integer
language plpgsql
security invoker            -- 刻意：RLS 照常適用，這個函式不提權
set search_path = public
as $$
declare
  v_row     jsonb;
  v_count   integer := 0;
  v_has_receipt boolean;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    if coalesce(v_row->>'clientId', '') = '' then
      raise exception 'every row needs a clientId' using errcode = 'invalid_parameter_value';
    end if;

    -- 已開收據的行：身分鎖死（Hard Rule 2），這裡永不碰。
    select exists (
      select 1
        from donations d
        join receipts r on r.donation_id = d.id
       where d.org_id = p_org_id
         and d.client_id = v_row->>'clientId'
    ) into v_has_receipt;
    if v_has_receipt then
      continue;
    end if;

    insert into donations (
      org_id, client_id, donor_name, donor_phone, donor_masked,
      amount_cents, purpose, donated_at, custody_status, source,
      collector_name,
      kind, item_desc, est_value_cents,
      payment_method, transfer_proof_path,
      created_at
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
      coalesce(nullif(v_row->>'kind', ''), 'cash'),
      nullif(v_row->>'itemDesc', ''),
      nullif(v_row->>'estValueCents', '')::bigint,
      coalesce(nullif(v_row->>'paymentMethod', ''), 'cash'),
      nullif(v_row->>'transferProofPath', ''),
      coalesce(nullif(v_row->>'createdAt', '')::timestamptz, now())
    )
    on conflict (org_id, client_id) do update set
      donor_name          = excluded.donor_name,
      donor_phone         = excluded.donor_phone,
      donor_masked        = excluded.donor_masked,
      amount_cents        = excluded.amount_cents,
      purpose             = excluded.purpose,
      donated_at          = excluded.donated_at,
      source              = excluded.source,
      collector_name      = excluded.collector_name,
      kind                = excluded.kind,
      item_desc           = excluded.item_desc,
      est_value_cents     = excluded.est_value_cents,
      payment_method      = excluded.payment_method,
      transfer_proof_path = excluded.transfer_proof_path,
      -- 記錄時間：行第一次入庫的那一刻為準，重存不改寫歷史。
      created_at          = coalesce(donations.created_at, excluded.created_at),
      -- custody 只往前不往後（forward-only，D32）。
      custody_status = case
        when donations.custody_status = 'settled' then 'settled'
        when donations.custody_status = 'pending_remittance'
             and excluded.custody_status <> 'settled' then 'pending_remittance'
        else excluded.custody_status
      end;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.save_register_rows(bigint, jsonb) is
  'D32 (2026-08-28): every recorded income row reaches the database the moment '
  'it is recorded — localStorage is the offline draft, not the record. Upsert '
  'on (org_id, client_id); rows that already carry a receipt are never touched; '
  'custody_status only ever moves forward. SECURITY INVOKER: RLS applies.';

revoke execute on function public.save_register_rows(bigint, jsonb) from public, anon;
grant execute on function public.save_register_rows(bigint, jsonb) to authenticated, service_role;


-- ============================================================================
-- ② issue_receipts() v8 — 跟 20260905000000 的 v7 一字不差，只加一件事：
--    捐款行已存在（save_register_rows 先寫的）而且沒有收據 → UPDATE 再配號。
--    （v7＝v6＋created_at；v6＝v5＋付款方式；v5＝v4＋實物；v4＝v3＋collector。）
-- ============================================================================
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

    -- 冪等：這一列已經存過而且開過收據了嗎？
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

    -- 🆕 v8（D32）：行已經在登記簿裡（save_register_rows 記錄時寫的），
    -- 只是還沒有收據 → 更新那一行再配號。v7 在這裡 INSERT 會撞
    -- donations_org_client_uniq，整批爆掉。
    select d.id into v_donation_id
      from donations d
     where d.org_id = p_org_id
       and d.client_id = v_row->>'clientId';

    if v_donation_id is not null then
      update donations set
        donor_name          = v_row->>'donorName',
        donor_phone         = v_row->>'donorPhone',
        donor_masked        = v_row->>'donorMasked',
        amount_cents        = (v_row->>'amountCents')::bigint,
        purpose             = v_row->>'purpose',
        donated_at          = nullif(v_row->>'donatedAt', '')::date,
        source              = nullif(v_row->>'source', ''),
        collector_name      = nullif(v_row->>'collectorName', ''),
        kind                = coalesce(nullif(v_row->>'kind', ''), 'cash'),
        item_desc           = nullif(v_row->>'itemDesc', ''),
        est_value_cents     = nullif(v_row->>'estValueCents', '')::bigint,
        payment_method      = coalesce(nullif(v_row->>'paymentMethod', ''), 'cash'),
        transfer_proof_path = nullif(v_row->>'transferProofPath', ''),
        created_at          = coalesce(created_at,
                                nullif(v_row->>'createdAt', '')::timestamptz, now()),
        -- custody 只往前不往後（D32）。
        custody_status = case
          when custody_status = 'settled' then 'settled'
          when custody_status = 'pending_remittance'
               and coalesce(nullif(v_row->>'custodyStatus', ''), 'collected') <> 'settled'
            then 'pending_remittance'
          else coalesce(nullif(v_row->>'custodyStatus', ''), 'collected')
        end
      where id = v_donation_id;
    else
      insert into donations (
        org_id, client_id, donor_name, donor_phone, donor_masked,
        amount_cents, purpose, donated_at, custody_status, source,
        collector_name,
        kind, item_desc, est_value_cents,
        payment_method, transfer_proof_path,
        created_at
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
        coalesce(nullif(v_row->>'kind', ''), 'cash'),
        nullif(v_row->>'itemDesc', ''),
        nullif(v_row->>'estValueCents', '')::bigint,
        coalesce(nullif(v_row->>'paymentMethod', ''), 'cash'),
        nullif(v_row->>'transferProofPath', ''),
        coalesce(nullif(v_row->>'createdAt', '')::timestamptz, now())
      )
      returning id into v_donation_id;
    end if;

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

comment on function public.issue_receipts(bigint, jsonb) is
  'v8 (D32, 2026-08-28): rows already saved by save_register_rows are UPDATED '
  'and numbered instead of colliding with donations_org_client_uniq. '
  'Idempotent on (org_id, client_id): a retried request returns the receipt '
  'numbers already issued instead of burning new ones. SECURITY INVOKER.';


-- ============================================================================
-- 驗證 — 套用後跑這些。預期結果寫在註解裡。
-- ============================================================================
-- select proname from pg_proc where proname = 'save_register_rows';
--   -- expect 1 row
--
-- select obj_description(oid, 'pg_proc') like 'v8%' as is_v8
--   from pg_proc where proname = 'issue_receipts';
--   -- expect t
