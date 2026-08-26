-- ============================================================================
-- Minit — migration 26 · 付款方式（31 號單 Stage B-1，D19，J 8/27 拍板 34）
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份貼上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（add column if not exists / create or replace，
--   整份可重跑）。
--   🚧 尚未套用。D8 鐵律：J 本人手動跑，寫這個檔的人不執行它。
--
-- 內容：
--   ① donations.payment_method（'cash'|'transfer'，default 'cash'）
--      donations.transfer_proof_path（選填：轉賬截圖在 Storage 的路徑）
--   ② issue_receipts() v6 —— 跟 20260903000000 的 v5 一字不差，
--      只加這兩個欄位的寫入。
--
-- 語義（DECISIONS.md D19）：
--   每筆收入登記時就問「現金／轉賬」。現金照舊走保管
--   （collected → pending_remittance → settled）；轉賬直接入戶，
--   不經現金保管（不進交接批次、不算「在誰手上」）。
--   custody 狀態機 forward-only 語義不變。
-- ============================================================================


-- ============================================================================
-- ① donations 兩個新欄位
-- payment_method 預設 'cash'：既有資料一列都不用動，全部自動是現金——
-- 這也是唯一誠實的預設（它們本來就是照現金流程記的）。
-- ============================================================================

alter table donations
  add column if not exists payment_method text not null default 'cash';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'donations_payment_method_check') then
    alter table donations add constraint donations_payment_method_check
      check (payment_method in ('cash', 'transfer'));
  end if;
end $$;

alter table donations
  add column if not exists transfer_proof_path text;

comment on column donations.payment_method is
  'cash (default) | transfer. Transfer rows never enter cash custody: they are '
  'not in anyone''s hands, never in a remittance batch (D19, 2026-08-27).';
comment on column donations.transfer_proof_path is
  'Optional: Storage path (uploads bucket, {org_id}/transfer_proof/…) of the '
  'transfer screenshot the member attached. Storage only — no AI ever reads it.';


-- ----------------------------------------------------------------------------
-- ② issue_receipts() v6 — 跟 20260903000000 的 v5 一字不差，只加兩個付款欄位。
-- （v5＝v4＋實物三欄；v4＝v3＋collector_name；v3＝20260824「號碼過 9999 不截斷」。）
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
      kind, item_desc, est_value_cents,
      payment_method, transfer_proof_path                            -- 🆕 v6
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
      coalesce(nullif(v_row->>'paymentMethod', ''), 'cash'),         -- 🆕 v6
      nullif(v_row->>'transferProofPath', '')                        -- 🆕 v6
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
-- 驗證段（純 select，不改任何東西）
-- ============================================================================
--
-- 1) 兩個新欄位在了：
--      select column_name from information_schema.columns
--       where table_name = 'donations'
--         and column_name in ('payment_method', 'transfer_proof_path');
--    要看到 2 列。
--
-- 2) 函式仍是 invoker（false）：
--      select proname, prosecdef from pg_proc where proname = 'issue_receipts';
--
-- 3) 函式已是 v6（會寫 payment_method）：
--      select prosrc like '%paymentMethod%' from pg_proc
--       where proname = 'issue_receipts';
--    要是 true。
--
-- 回退（欄位留著無害，函式退回 v5）：
--   把 20260903000000_final_sprint.sql 的 issue_receipts 段整段再跑一次。
-- ============================================================================
