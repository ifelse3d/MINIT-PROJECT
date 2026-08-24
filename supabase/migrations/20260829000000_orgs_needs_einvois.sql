-- ============================================================================
-- Minit — orgs.needs_einvois：e-Invois 是選配（J 2026-08-24 拍板）
--
-- HOW TO APPLY:
--   SQL Editor → New query → 整份贴上 → Run → 「Success. No rows returned」。
--   跑第二次是安全的（add column if not exists）。
--   🚧 尚未套用。D8 铁律：J 本人手动跑，写这个档的人不执行它。
--
-- ----------------------------------------------------------------------------
-- 背景：大多数注册社团根本不需要 e-Invois —— eROSES 才是法定必须。
-- e-Invois 页面从主导航移到「更多」，而且预设隐藏。今晚 UI 先用设备偏好顶住
-- （src/lib/einvois-pref.ts）；这一栏是真正的开关：跟着机构走、换设备不丢。
-- 套用之后的接线（下一轮）：设定页把开关写进这一栏，shell 从 getActiveOrg()
-- 读它。单笔 >RM10,000 的个别 e-invois 警示不受这个开关影响，永远显示。
-- ============================================================================

alter table orgs
  add column if not exists needs_einvois boolean not null default false;

comment on column orgs.needs_einvois is
  'Whether this organisation needs the e-Invois (LHDN) pages at all. '
  'Default false: eROSES is the legal requirement, e-Invois is optional '
  '(J, 2026-08-24). The >RM10,000 individual e-invois warning ignores this.';

-- ============================================================================
-- 验证段（纯 select，不改任何东西）
-- ============================================================================
--
--   select column_name, column_default from information_schema.columns
--    where table_name = 'orgs' and column_name = 'needs_einvois';
--
-- 回退：
--   alter table orgs drop column if exists needs_einvois;
-- ============================================================================
