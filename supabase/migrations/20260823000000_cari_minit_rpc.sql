-- ============================================================================
-- Minit — cari_minit(): 助手用来「找出那一次开会说了什么」的搜寻函式
--
-- HOW TO APPLY（照做就好）:
--   1. 先确定 20260822000000_minutes_search.sql 已经跑过
--      （SQL Editor 跑：select to_regclass('public.minutes_embeddings');
--        要看到 minutes_embeddings，不是 null）。
--   2. SQL Editor → New query → 整份贴上 → Run。
--   3. 看到 "Success. No rows returned" 就是好了。
--   跑第二次是安全的（create or replace）。
--
--   🚧 尚未套用。D8 铁律：J 本人手动跑，写这个档的人不执行它。
--
-- ----------------------------------------------------------------------------
-- 这一支在补什么洞
--
-- 20260822000000 建好了表、索引和 RLS，但**没有建查询用的函式**。
-- 而 supabase-js 送不出 pgvector 的 `<=>` 运算子，也送不出 vector 型别的参数
-- —— 从 TypeScript 那边只有 .rpc() 这条路。所以少了这一支，上一支等于只有
-- 地基没有门：程式码根本呼叫不到那张表。
--
-- ----------------------------------------------------------------------------
-- 🔴 SECURITY INVOKER，不是 DEFINER —— 这是整份里最重要的一行
--
-- `docs/助手重做-设计.md` 第 7 节：「让工具用 service_role → AI 会跨 org。
-- RLS 是边界。」
--
-- Postgres 函式预设就是 SECURITY INVOKER，但这里**明写出来**，因为这一支是
-- AI 唯一读得到会议记录内文的入口：
--
--   * INVOKER = 函式用**呼叫者**的身分跑 → minutes_embeddings_select 那条
--     RLS policy 生效 → 只看得到 accessible_orgs() 里的 org。
--   * DEFINER = 用**函式拥有者**的身分跑 → RLS 被绕过 → 助手读得到全资料库
--     每一个社团的会议记录。**一个字之差，就是最严重的资料外泄。**
--
-- p_org_id 那个参数**不是**权限检查，只是缩小候选集用的。真正挡住越权的是
-- RLS。两层都在：参数写错顶多查不到东西，不会查到别人的。
--
-- ----------------------------------------------------------------------------
-- 为什么要传 p_model
--
-- 不同模型算出来的向量**互相不能比**，混在一起查会得到乱七八糟的结果
-- （minutes_embeddings.model 那一栏的 comment 已经写了）。呼叫端一律带着
-- 自己用的那支模型来查。这也正是「同一段文字可以同时存两家模型的向量」
-- 能拿来做对比的原因 —— 换 p_model 就是换一支模型查。
-- ============================================================================

-- 回传一列 = 一段命中的会议记录内文 ＋ 它属于哪一份记录、哪一天开的会。
-- 出处（doc_id / meeting_date）跟内文一起回来，因为规矩是「每个事实带出处」，
-- 让呼叫端再去 join 一次，就会出现「答案有了但出处漏掉」这种情况。
create or replace function public.cari_minit(
  p_org_id     bigint,
  p_model      text,
  p_query      vector(768),
  p_limit      int     default 6,
  p_from       date    default null,
  p_to         date    default null
)
returns table (
  doc_id        bigint,
  chunk_index   int,
  chunk_text    text,
  meeting_date  date,
  meeting_type  text,
  -- 1 - cosine distance。1.0 = 一模一样，0 = 毫不相干。
  -- 用「分数」而不是「距离」回去，是因为呼叫端要做的是「够不够像」的门槛判断，
  -- 而距离是反过来的，很容易写反。
  score         real
)
language sql
stable
security invoker            -- 🔴 见上面。不要改成 definer。
-- 🔴 `extensions` 一定要在这里，不能只写 public（2026-08-22 第一次跑就炸在这）
--
--   ERROR: 42883: operator does not exist: extensions.vector <=> extensions.vector
--
-- Supabase 把 pgvector 装在 **extensions** schema，不是 public。函式上的
-- `set search_path` 会在**建立函式的时候**就套用到函式内文的解析，所以只写
-- public 的话，`<=>` 这个运算子在函式里根本看不见 —— 连 create 都过不了。
--
-- （为什么参数写 `vector(768)` 却没报错：那是用**当下 session** 的 search_path
--   解析的，而 Supabase 的 session 预设就带着 extensions。只有函式内文吃这里
--   设定的这一条。两者不一样，很容易看走眼。）
--
-- 那为什么还要 set search_path：这是函式的标准安全写法，钉死它就没办法靠改
-- search_path 把 minutes_embeddings 换成别张表。所以是**加上 extensions**，
-- 不是把整行拿掉。
set search_path = public, extensions
as $$
  select
    e.doc_id,
    e.chunk_index,
    e.chunk_text,
    d.meeting_date,
    d.meeting_type,
    (1 - (e.embedding <=> p_query))::real as score
  from minutes_embeddings e
  join minutes_docs d on d.id = e.doc_id
  where e.org_id = p_org_id
    and e.model  = p_model
    -- 只搜「人已经确认过」的记录。草稿不是任何事情的纪录，
    -- 助手拿草稿当事实讲出来，比查不到还糟。
    and d.status = 'confirmed'
    and (p_from is null or d.meeting_date >= p_from)
    and (p_to   is null or d.meeting_date <= p_to)
  order by e.embedding <=> p_query
  -- 上限钉死：呼叫端传 1000 进来也只会拿到 20 段。这些内文会被塞进
  -- prompt，而 prompt 长度就是钱，也是「模型被无关内容淹没」的主因。
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
$$;

comment on function public.cari_minit(bigint, text, vector, int, date, date) is
  'Semantic search over CONFIRMED meeting minutes for the assistant. '
  'SECURITY INVOKER on purpose: the caller''s RLS decides which orgs are '
  'visible, so this can never read another society''s minutes. p_model must '
  'match the model that produced the stored vectors -- embeddings from '
  'different models are not comparable. See docs/助手重做-设计.md.';

-- 让登入的使用者呼叫得到。RLS 仍然是那道墙 —— 这里给的只是「可以敲门」。
grant execute on function
  public.cari_minit(bigint, text, vector, int, date, date)
  to authenticated;


-- ============================================================================
-- 验证段（纯 select，不改任何东西）
-- ============================================================================
--
-- 1) 函式在，而且是 invoker（prosecdef 要是 false）：
--      select proname, prosecdef
--        from pg_proc where proname = 'cari_minit';
--    🔴 prosecdef = true 就是错的，代表变成 DEFINER 了，会绕过 RLS。
--
-- 2) 权限给出去了：
--      select has_function_privilege(
--        'authenticated',
--        'public.cari_minit(bigint, text, vector, int, date, date)',
--        'execute');
--    要是 true。
--
-- 3) 空的资料库上也叫得动（回 0 列就对了，不该报错）：
--      select * from public.cari_minit(
--        1, 'gemini:gemini-embedding-001',
--        array_fill(0::real, array[768])::vector, 3);
--
-- ----------------------------------------------------------------------------
-- 万一还是报 42883 operator does not exist ... vector <=> vector
--
--   先看 pgvector 到底装在哪个 schema：
--      select e.extname, n.nspname
--        from pg_extension e
--        join pg_namespace n on n.oid = e.extnamespace
--       where e.extname = 'vector';
--
--   上面那句 `set search_path = public, extensions` 已经涵盖 Supabase 的两种
--   常见情况（装在 extensions，或装在 public）。如果 nspname 印出来是**别的**
--   名字，把那个名字加进 search_path 那一行，再跑一次整份。
-- ----------------------------------------------------------------------------
--
-- 回退：
--   drop function if exists
--     public.cari_minit(bigint, text, vector, int, date, date);
-- ============================================================================
