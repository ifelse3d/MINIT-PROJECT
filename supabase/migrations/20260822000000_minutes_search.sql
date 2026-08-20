-- ============================================================================
-- Minit — 会议记录的语意搜寻 (pgvector)
--
-- HOW TO APPLY（照做就好）:
--   1. Supabase dashboard → Database → Extensions → 搜 "vector" → 打开它。
--      ⚠️ 先做这一步。下面第一句 `create extension` 在某些 Supabase 专案上
--      需要 Dashboard 先允许，硬跑会失败。看到 vector 是 enabled 再往下。
--   2. SQL Editor → New query → 整份贴上 → Run。
--   3. 看到 "Success. No rows returned" 就是好了。
--   跑第二次是安全的（policy 都先 drop 再 create，其余都是 if not exists）。
--
--   🚧 尚未套用。D8 铁律：J 本人手动跑，写这个档的人不执行它。
--
-- ----------------------------------------------------------------------------
-- 这是要解什么问题（docs/助手重做-设计.md 第 3 节）
--
--   J 要的是：「我记得有一次开会说了什么，你帮我找出来。」
--
--   现在的 ILIKE '%词%'    ❌ 要一模一样的字才找得到
--   Postgres 全文检索       ❌ 中文不会切词，等于还是在抠字
--   pgvector ＋ embedding   ✅ 「谁负责青少年班的活动」找得到
--                              「小小班策划由余老师带」
--
-- 🟢 为什么现在写：J 正要建新的 Supabase project，这一支跟其他 12 支照档名
--   顺序一起跑一次就好。新库建完才想起来，就变成要在**活的**资料库上贴
--   migration，还要重算全部 embedding。跟 20260821000000 完全同一个道理。
--
-- ----------------------------------------------------------------------------
-- 🔴 维度 768 是量出来的，不是选来的（2026-08-20 用 J 自己的 key 实测）
--
--   J 的 key 上能用的 embedding 模型只有三支：gemini-embedding-001 /
--   gemini-embedding-2-preview / gemini-embedding-2。**预设都是 3072 维**，
--   而 **pgvector 的 hnsw 索引上限是 2000 维** —— 3072 建不了索引。
--   （设计稿早期版本写的 text-embedding-004 在这把 key 上根本不存在。）
--
--   实测 gemini-embedding-001 要 768 拿得到，要 1536 也拿得到。
--   768 安全地低于上限、索引小、算得快，品质损失很小。
--
--   ⚠️ 维度写进 `vector(768)` 就固定了。之后要换 = 重建索引 ＋ 重算全部
--   embedding。**但换厂商不用** —— 下面这四支都吐得出 768 维：
--       gemini:gemini-embedding-001      outputDimensionality: 768
--       gemini:gemini-embedding-2        outputDimensionality: 768
--       openai:text-embedding-3-small    dimensions: 768
--       openai:text-embedding-3-large    dimensions: 768
--   所以 768 锁的是**维度**，不是**厂商**。
--
-- ----------------------------------------------------------------------------
-- 🔴 为什么是一张独立的表，不是 minutes_docs 加一栏（2026-08-21 J 决定）
--
--   设计稿原本写 `minutes_docs.embedding vector(768)`，一份记录一个向量。
--   J 的要求是「希望之後可以增加，做 slot 让我增加」——「主流的都要，之後要
--   做對比，看看性價比，也方便以後更換」。一栏做不到那件事，两个理由：
--
--   ① **一栏一次只放得下一家模型的结果。** 要对比 A 和 B，就得「全部重算成
--      A → 量 → 全部重算成 B → 量」，而且中间没办法同时查。有了 model 栏，
--      两家的向量并存，`where model = ?` 各查各的，直接比。
--
--   ② **一份记录只有一个向量，找不准。** 一份记了 12 条决议的会议记录压成
--      一个 768 维向量，等于把 12 件事平均成一个点 —— 「我记得有一次开会说了
--      什么」正好是最吃亏的问法。chunk_index 让一份记录切成好几段，
--      每段各有向量，命中的是**那一段**，出处也才指得准。
--
--   多花的成本：这张表比一个栏位多约 40 行 SQL。少花的成本：以后要加第二家
--   模型时，不用在活的资料库上再贴一次 migration。
-- ============================================================================

-- 1. 扩充功能 -----------------------------------------------------------------
--    如果这一句失败，回到最上面的步骤 1：先在 Dashboard → Extensions 打开
--    vector，再跑一次整份。不要跳过这一句往下跑。
create extension if not exists vector;


-- 2. 向量表 -------------------------------------------------------------------
--    一列 = 一份会议记录的一段文字，用某一支模型算出来的向量。
create table if not exists minutes_embeddings (
  id           bigint generated always as identity primary key,

  -- org_id 是**刻意冗余**的（它推得出来：doc_id → minutes_docs.org_id）。
  -- 理由跟 init.sql 第 102 行给 paste_packs 的理由一模一样：RLS policy 要能
  -- 是「每张表都长一样的 org_id 检查」，而不是每张表各写一个容易写错的 join。
  org_id       bigint not null references orgs (id)         on delete cascade,
  doc_id       bigint not null references minutes_docs (id) on delete cascade,

  -- 第几段。一份短记录就只有 0 一段。
  chunk_index  int    not null check (chunk_index >= 0),

  -- 这一段的原文。存原文而不是只存位移，是因为答案要引得出**这一段**给人看，
  -- 而记录被人改过之后位移会指到别的地方，原文不会。
  chunk_text   text   not null check (char_length(chunk_text) > 0),

  -- 哪一支模型算的，写成 provider:model（跟 AI_MODEL_* 同一个写法）。
  -- 这一栏就是「同时放两家来对比」那件事本身。
  model        text   not null check (char_length(model) between 1 and 80),

  -- 向量维度。今天永远是 768（下面那一栏就是 vector(768)），所以它是冗余的
  -- —— 留着当**绊线**：哪天真的要换维度，转换期间就是靠这一栏分辨哪些列是
  -- 旧的。check 让它现在不可能被写错。
  dim          int    not null default 768 check (dim = 768),

  embedding    vector(768) not null,

  -- 算这一段的时候，来源文字的杂凑。记录被人编辑过之后，杂凑对不上就知道
  -- 这一列过期了，该重算 —— 不用整个库重算。
  source_hash  text,

  created_at   timestamptz not null default now(),

  -- 同一份记录、同一段、同一支模型，只会有一列。重算就是 upsert。
  -- 换一支模型算，是**新的**一列，旧的还在（这就是能对比的原因）。
  unique (doc_id, model, chunk_index)
);

comment on table minutes_embeddings is
  'Semantic search over confirmed meeting minutes. One row = one chunk of one '
  'document, embedded by one model. Multiple models may coexist for the same '
  'chunk on purpose: that is how two models are compared without re-embedding '
  'the corpus twice. See docs/助手重做-设计.md.';
comment on column minutes_embeddings.model is
  'provider:model, e.g. gemini:gemini-embedding-001. Query with '
  'where model = $1 -- vectors from different models are NOT comparable to '
  'each other, and mixing them in one search returns nonsense.';
comment on column minutes_embeddings.dim is
  'Always 768 today, and the column vector(768) enforces that. Kept as a '
  'tripwire for the day a different dimension is introduced.';


-- 3. 索引 ---------------------------------------------------------------------
--    cosine，因为 embedding 会正规化，而且四家厂商的文件都以 cosine 为准。
--    hnsw 而不是 ivfflat：ivfflat 要先有资料才建得好，hnsw 空表就能建，
--    而新库正好是空的。
create index if not exists idx_minutes_embeddings_vec
  on minutes_embeddings using hnsw (embedding vector_cosine_ops);

--    每次查询都会 `where org_id = ? and model = ?`，所以这一条挡在向量比对
--    前面，先把候选集缩到这个 org、这支模型。
create index if not exists idx_minutes_embeddings_org_model
  on minutes_embeddings (org_id, model);

--    重算某一份记录时用（先删这一份的旧列，再写新的）。
create index if not exists idx_minutes_embeddings_doc
  on minutes_embeddings (doc_id);


-- 4. RLS —— 跟其他 16 张 org-scoped 表同一个模式 -------------------------------
--    只有 select。写入一律走 server（service role 绕过 RLS），所以使用者不可能
--    自己塞一个向量进来指向别人的记录。
--
--    🔴 助手的工具一律走 user-scoped client（docs/助手重做-设计.md 第 7 节）：
--    RLS 是边界，不是 prompt 里的一句话。工具用 service_role 的话，AI 就读得到
--    别的社团的会议记录。
alter table minutes_embeddings enable row level security;

drop policy if exists minutes_embeddings_select on public.minutes_embeddings;
create policy minutes_embeddings_select on public.minutes_embeddings
  for select to authenticated
  using (org_id in (select public.accessible_orgs()));


-- 5. minutes_docs 上的记帐栏位 -------------------------------------------------
--    「这份记录算过 embedding 了吗、用哪支算的」。补算脚本靠这两栏知道还有
--    哪些没算，不用每次都去 join 上面那张表。
alter table minutes_docs
  add column if not exists embedded_at    timestamptz;
alter table minutes_docs
  add column if not exists embedded_model text;

comment on column minutes_docs.embedded_at is
  'When this document was last embedded. NULL = never, or the text changed '
  'after the last run. Embedding happens when status becomes confirmed -- a '
  'draft is not yet a record of anything.';
comment on column minutes_docs.embedded_model is
  'provider:model that produced the CURRENT rows in minutes_embeddings for '
  'this document.';


-- ============================================================================
-- 验证段（纯 select，不改任何东西）
-- ============================================================================
--
-- 1) 扩充功能真的开了：
--      select extname, extversion from pg_extension where extname = 'vector';
--
-- 2) 表和三个索引都在：
--      select indexname from pg_indexes where tablename = 'minutes_embeddings';
--    应该看到 idx_minutes_embeddings_vec / _org_model / _doc ＋ 主键与 unique。
--
-- 3) RLS 开着而且政策在：
--      select relrowsecurity from pg_class where relname = 'minutes_embeddings';
--      select policyname, cmd from pg_policies
--       where schemaname = 'public' and tablename = 'minutes_embeddings';
--
-- 4) 记帐栏位在：
--      select column_name from information_schema.columns
--       where table_name = 'minutes_docs'
--         and column_name in ('embedded_at', 'embedded_model');
--
-- 5) 之后程式写好、跑过补算脚本以后，一份记录被切成几段、用哪支模型算的：
--      select doc_id, model, count(*) as bahagian
--        from minutes_embeddings group by 1, 2 order by 1;
--
-- 6) 要对比两支模型的时候，长这样（同一个问题、两支模型各查各的）：
--      select chunk_text, 1 - (embedding <=> $1) as skor
--        from minutes_embeddings
--       where org_id = $2 and model = $3        -- ← 换 $3 就是换一支模型
--       order by embedding <=> $1 limit 5;
--
-- 回退：
--   drop table if exists minutes_embeddings;
--   alter table minutes_docs drop column if exists embedded_at;
--   alter table minutes_docs drop column if exists embedded_model;
--   -- extension 留着，删它会连别的用途一起删。
-- ============================================================================
