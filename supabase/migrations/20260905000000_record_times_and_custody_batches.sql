-- ============================================================================
-- Minit — migration 27 · 記錄時間＋交接批次細節（32 號單 §1-6/§1-11，拍板 0-5/0-6）
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份貼上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（add column if not exists / create or replace /
--   drop constraint if exists，整份可重跑）。
--   🚧 尚未套用。D8 鐵律：J 本人手動跑，寫這個檔的人不執行它。
--
-- 內容：
--   ① donations.created_at —— 這一筆是「幾點記錄的」（拍板 0-5：錢的每一筆
--      都要有日期＋時間）。舊列保持 NULL（誠實：當時沒記）；新列由
--      issue_receipts v7 寫入登記那一刻的時間，或由 DB default 補。
--   ② issue_receipts() v7 —— 跟 20260904000000 的 v6 一字不差，
--      只加 created_at 的寫入（客戶端傳「加入登記簿那一刻」的時間戳）。
--   ③ remittance_batches 三個新欄位＋status 多一個值（拍板 0-6 交現金重做）：
--        recorded_at  —— 這筆交接是幾點「記錄」的（交接日期可以改成昨天，
--                        記錄時間是不會說謊的那一個）
--        confirmed_at —— 總會是幾點確認的
--        note         —— 備註（確認前可改）
--        status 'cancelled' —— 總會確認之前，記錯的交接可以取消。
--
-- 語義（DECISIONS.md D19 不變）：custody 狀態機 forward-only 照舊。
-- 「取消」不是錢往回走，是「這條交接記錄本身記錯了，作廢」——批次留檔
-- （status='cancelled'，審計看得到），批次裡的捐款回到 collected（它們
-- 從來沒有真的被交出去）。總會確認（settled）之後永遠鎖死，不可取消。
-- ============================================================================


-- ============================================================================
-- ① donations.created_at
-- 先加欄位（舊列＝NULL，誠實），再設 default（新列自動蓋章）。
-- 順序要緊：如果帶著 default 一起 add column，PostgreSQL 會把所有舊列
-- 全部填成「跑 migration 的這一刻」——那是發明資料。
-- ============================================================================

alter table donations
  add column if not exists created_at timestamptz;

alter table donations
  alter column created_at set default now();

comment on column donations.created_at is
  'When this row was RECORDED (拍板 0-5) — distinct from donated_at (when the '
  'money changed hands). NULL on rows saved before migration 27: honest absence.';


-- ============================================================================
-- ② issue_receipts() v7 — 跟 20260904000000 的 v6 一字不差，只加 created_at。
-- （v6＝v5＋付款方式兩欄；v5＝v4＋實物三欄；v4＝v3＋collector_name。）
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
      payment_method, transfer_proof_path,
      created_at                                                     -- 🆕 v7
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
      coalesce(nullif(v_row->>'createdAt', '')::timestamptz, now())  -- 🆕 v7
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
-- ③ remittance_batches — 交接批次細節（拍板 0-6）
-- recorded_at 同樣「先加欄位再設 default」：舊批次＝NULL（當時真的沒記），
-- 新批次由客戶端寫入或 DB 補。
-- ============================================================================

alter table remittance_batches
  add column if not exists recorded_at timestamptz;

alter table remittance_batches
  alter column recorded_at set default now();

alter table remittance_batches
  add column if not exists confirmed_at timestamptz,
  add column if not exists note text;

alter table remittance_batches
  drop constraint if exists remittance_batches_status_check;

alter table remittance_batches
  add constraint remittance_batches_status_check
  check (status in ('pending', 'settled', 'cancelled'));

comment on column remittance_batches.recorded_at is
  'When the hand-over RECORD was made. handed_over_at is the date the person '
  'says the cash changed hands (editable before HQ confirms — people record '
  'later); this timestamp is the one that cannot lie (拍板 0-6).';
comment on column remittance_batches.confirmed_at is
  'When HQ confirmed the batch (status -> settled). NULL while pending.';
comment on column remittance_batches.note is
  'Free note on the hand-over. Editable while pending, frozen at confirm.';
comment on constraint remittance_batches_status_check on remittance_batches is
  'cancelled (拍板 0-6): a mis-recorded hand-over may be voided BEFORE HQ '
  'confirms — the batch stays on file for audit, its donations return to '
  'collected (they never actually left). The custody state machine on '
  'donations stays forward-only; cancelling voids a RECORD, not money.';


-- ============================================================================
-- 驗證段（純 select，不改任何東西）
-- ============================================================================
--
-- 1) 新欄位都在了：
--      select column_name from information_schema.columns
--       where (table_name = 'donations'          and column_name = 'created_at')
--          or (table_name = 'remittance_batches' and column_name in
--              ('recorded_at', 'confirmed_at', 'note'));
--    要看到 4 列。
--
-- 2) 舊 donations 列的 created_at 是 NULL（沒有被發明）：
--      select count(*) from donations where created_at is not null;
--    剛跑完應該是 0（之後每開一張新收據會加 1）。
--
-- 3) status 接受 cancelled：
--      select pg_get_constraintdef(oid) from pg_constraint
--       where conname = 'remittance_batches_status_check';
--    要看到 'cancelled' 在裡面。
--
-- 4) 函式已是 v7（會寫 created_at）：
--      select prosrc like '%createdAt%' from pg_proc
--       where proname = 'issue_receipts';
--    要是 true。
--
-- 回退（欄位留著無害，函式退回 v6）：
--   把 20260904000000_payment_method.sql 的 issue_receipts 段整段再跑一次；
--   status check 要退回就把本檔 ③ 的 drop/add constraint 改回
--   ('pending','settled') 再跑那兩句。
-- ============================================================================
