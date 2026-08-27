-- ============================================================================
-- Minit — migration 28 · 交接批次的行連結＋詞庫三語＋用途模板
-- (J 上線晚反饋 2026-08-27：#4 先交錢後開收據 · #10 詞庫改三語 · #5 模板)
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份貼上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（add column if not exists / create table if not exists /
--   drop policy if exists，整份可重跑）。
--   🚧 尚未套用。D8 鐵律：J 本人手動跑，寫這個檔的人不執行它。
--
-- 內容：
--   ① remittance_batches.client_donation_ids —— 交接批次直接記「是哪幾筆」
--      （client_id 清單）。以前批次靠收據號碼連回捐款；現在「先拿到錢才開
--      收據」（#4），沒開收據的現金也可以交，所以要一條不靠收據號的連結。
--      舊批次此欄 NULL —— 它們當年全部有收據，收據號照樣解析得回。
--   ② org_glossary 三語欄位 —— 詞庫改成「原文＋它是什麼語言＋另外兩種語言
--      的叫法」（#10：不一定華語為原本）。舊欄位 action/translation 保留，
--      程式繼續寫它們（translation = 馬來文叫法），舊的 prompt 路一字不改。
--   ③ org_templates —— 各社團自己的用詞模板（收入用途、開支說明）。
--      RLS 跟 org_glossary 同一套。
-- ============================================================================


-- ============================================================================
-- ① 交接批次的行連結
-- ============================================================================

alter table remittance_batches
  add column if not exists client_donation_ids text[];

comment on column remittance_batches.client_donation_ids is
  'client_id of every donation row in this hand-over. The authoritative link '
  'since receipts stopped being required before a hand-over (launch feedback '
  '#4, 2026-08-27). NULL on batches recorded before migration 28 — those were '
  'all-receipted, so receipt_nos still resolves them.';


-- ============================================================================
-- ② 詞庫三語欄位（#10）
--    lang       —— term（原文）是哪一種語言：bm / zh / en。舊列 NULL。
--    render_bm / render_zh / render_en —— 三種語言各自的叫法（原文那格可
--    以留空——term 本身就是）。全部選填：一個都不填＝「保持原字」。
-- ============================================================================

alter table org_glossary
  add column if not exists lang text
    check (lang is null or lang in ('bm', 'zh', 'en'));

alter table org_glossary
  add column if not exists render_bm text
    check (render_bm is null or char_length(render_bm) <= 160);

alter table org_glossary
  add column if not exists render_zh text
    check (render_zh is null or char_length(render_zh) <= 160);

alter table org_glossary
  add column if not exists render_en text
    check (render_en is null or char_length(render_en) <= 160);

comment on column org_glossary.lang is
  'Which language the ORIGINAL term is written in (bm/zh/en). NULL on rows '
  'saved before migration 28.';


-- ============================================================================
-- ③ 用途模板（#5）
--    kind = 'income_purpose'  收入的用途（記收入、打字名單的「用途」欄）
--    kind = 'expense_desc'    開支/報銷的說明
-- ============================================================================

create table if not exists org_templates (
  id bigint generated always as identity primary key,
  org_id bigint not null references orgs (id) on delete cascade,
  kind text not null check (kind in ('income_purpose', 'expense_desc')),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  created_at timestamptz not null default now(),
  -- One template per wording per slot: two identical rows would just be
  -- the same chip twice.
  constraint org_templates_unique unique (org_id, kind, label)
);

create index if not exists idx_org_templates_org
  on org_templates (org_id);

alter table org_templates enable row level security;

drop policy if exists org_templates_select on public.org_templates;
create policy org_templates_select on public.org_templates
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));

drop policy if exists org_templates_insert on public.org_templates;
create policy org_templates_insert on public.org_templates
  for insert to authenticated
  with check (org_id in (select public.accessible_orgs_writable()));

drop policy if exists org_templates_update on public.org_templates;
create policy org_templates_update on public.org_templates
  for update to authenticated
  using (org_id in (select public.accessible_orgs_writable()))
  with check (org_id in (select public.accessible_orgs_writable()));

drop policy if exists org_templates_delete on public.org_templates;
create policy org_templates_delete on public.org_templates
  for delete to authenticated
  using (org_id in (select public.accessible_orgs_writable()));
