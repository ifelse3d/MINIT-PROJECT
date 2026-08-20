-- ---------------------------------------------------------------------------
-- 20260820000000 — 两件事，一次贴完
--
-- 1) minutes_docs.meeting_type 放宽
--    2026-08-20：J 拍了一张活动策划会议的白板，在第 2 步自己填了 "event meeting"。
--    画面收下了，但 meeting_type 的型别是 z.enum(['agm','egm','committee',''])，
--    资料库这里也是同一条 check。于是「让 Minit 写正式文件」和「Save to History」
--    两个动作都在同一个 parse 上失败，而画面上印的是「Minit 这边出了问题」——
--    一个使用者输入的问题被显示成伺服器的问题。
--
--    社团开的会不只是 eROSES 那三种（J 2026-08-18 讲的产品方向：
--    「社团不只是做会议给 eROSES，我要做到的是团体里面都可以自己使用好用的」）。
--
--    ⚠ eROSES 只认 AGM／EGM。新增的类型不会被当成申报值 —— 见 src/lib/paste-pack.ts，
--      非申报类型印的是「这场会议不进年报」，不是把 'planning' 塞进政府栏位。
--
-- 2) minutes_docs.extraction jsonb —— Save as draft 要能「点回去继续」
--    status 的 check 从 20260708000000_init.sql 起就有 'draft' 了，这里不必动它。
--    缺的是：第 2 步那份 extraction 目前只活在 component state，
--    存了草稿也回不去继续核对。只有 draft 会填这一栏。
--
-- 可重复执行（re-runnable）：先 drop 再 add，栏位用 if not exists。
-- ---------------------------------------------------------------------------

-- 1 · 会议类型 ------------------------------------------------------------

alter table minutes_docs
  drop constraint if exists minutes_docs_meeting_type_check;

alter table minutes_docs
  add constraint minutes_docs_meeting_type_check
  check (
    meeting_type in (
      'agm',        -- Mesyuarat Agung Tahunan · 常年大会      ← eROSES 要的
      'egm',        -- Mesyuarat Agung Khas · 特别大会          ← eROSES 要的
      'committee',  -- Mesyuarat Jawatankuasa · 理事会议
      'planning',   -- Mesyuarat Perancangan · 活动策划会议
      'event',      -- Mesyuarat Program/Aktiviti · 活动会议
      'other'       -- 其他（社团自己的叫法写在 meeting_type_label）
    )
  );

-- 社团自己的叫法，只有 meeting_type = 'other' 时才有意义。
-- 其余类型画面上印的是三语标签，不读这一栏。
alter table minutes_docs
  add column if not exists meeting_type_label text;

comment on column minutes_docs.meeting_type_label is
  '社团自己写的会议名称。只有 meeting_type = ''other'' 才填。永远不进 eROSES。';

-- 2 · 草稿要能点回去继续 ---------------------------------------------------

alter table minutes_docs
  add column if not exists extraction jsonb;

comment on column minutes_docs.extraction is
  '第 2 步那份核对到一半的 extraction。只有 status = ''draft'' 才填；'
  '确认之后以 final_md 为准，这一栏不再是事实来源。';

-- ---------------------------------------------------------------------------
-- 验证（唯读。跑完把这一行的结果贴回给 Claude）
-- ---------------------------------------------------------------------------

select
  (select pg_get_constraintdef(oid)
     from pg_constraint
    where conrelid = 'minutes_docs'::regclass
      and conname = 'minutes_docs_meeting_type_check')          as meeting_type_check,
  (select count(*) from information_schema.columns
    where table_name = 'minutes_docs' and column_name = 'extraction')
                                                                as has_extraction,
  (select count(*) from information_schema.columns
    where table_name = 'minutes_docs' and column_name = 'meeting_type_label')
                                                                as has_type_label;
