# STATE.md — Minit 的当前状态

> **这是唯一的「现在在哪里」。**
> 每个 session 结束前**覆盖更新这一份**，不要新增带日期的交接档案。
> 规则在 `CLAUDE.md`，阶段在 `BUILD_PLAN.md`，历史在 `docs/archive/`。

> 🔴 **这一份现在有两个一模一样的副本**：`C:\dev\minit-champion-overnight-20260813\STATE.md`
> 和 `C:\dev\minit-v2\STATE.md`。**J 做完下面第 ⑧ 步（新 repo push 出去）之后，
> 以 `minit-v2` 那一份为准**，champion 那一份就不要再改了 —— 两份各自长大是这份文件
> 存在的意义的反面。改的时候两份一起改，或者直接 copy 过去。

**最后更新：2026-08-24（MYT）· Claude Code session（修好「看不见第 16、17 支 migration」的两个工具 ＋ 产出给外部 AI 的评审 PROMPT）**

> **2026-08-24 现场量到的（不是听说的）**：`tsc` 0 · `eslint` 21（基准 25）·
> `vitest` **648 全过**（46 档）· `build` ✓ · `main` = `756fb09`，已推上远端。
>
> 🔴 **`npm run check:migrations` 以前会说谎。** 它的探针表只做到第 14 支
> （`20260822000000`），所以第 16、17 支缺席时它照样印一片 `APPLIED`。
> 同一个盲点也在 `salin-migration.bat`：选单和 dispatch 都停在 15，
> **J 唯一用来跑 migration 的工具根本按不到 16、17** —— 所以那两支一直没跑，
> 不是 J 漏做。两个都已修（`756fb09`），现在两支都照实回报 **NOT YET**。
> 教训：**一个「检查有没有漏」的工具，如果它的清单要人手同步，它就会跟被检查的东西
> 一起漏在同一个地方。** 新增 migration 时，探针必须同一支 commit 补上。
>
> 🔴 **线上资料库（`fxhmbpxctwjqyvtdhmtp`）20 张表全部 0 笔** —— 包括 `orgs`。
> 这是一棵全新的空树，不是 8/20 盘点里那一棵（`ivsqiycvahcevzgokgvc`，当时有 4 个 org）。
> 所以现在每一个画面都停在「请先选择机构」或示范资料。
>
> 🔴 **`eval/cases/` 那 10 张 `input.png` 全部是印刷体，不是手写。**
> 对外讲的 95.2% 量的就是它们。产品最核心的能力（读手写混语）**目前零实证**。
>
> **给外部 AI（Fable 5 / GPT / Grok）的评审 PROMPT**：
> `C:\dev\_J-要做的事\20-给外部AI评审的PROMPT-20260824.md`。
> 他们的意见收在 `reviews/<名字>/`，规矩在 `reviews/README.md`（只准写那里）。

> 🔴 **交接在 `C:\dev\_J-要做的事\18-HANDOFF-给下一个session-20260823.md`，先读那一份的第 0 节。**
> **只有 J 做得到的事另外一份：`17-要你做的事-20260823.md`。**
> （11-／14-／16- 都已过时；`15-回答与决定-20260822晚.md` 是问答记录，仍然有效。）
>
> **2026-08-23 凌晨这一轮的状态，一句话**：`minit-v2` 有 **13 支 commit 推不上 GitHub** ——
> 不是程式问题，是**这台电脑的 GitHub 凭证过期了**，`git push` 在等一个只有 J 能回答的
> 登入视窗。本机 commit 一支都没丢。四道关全绿：`tsc` 0 · `eslint` 21（基准 25）·
> **636 测试**（起点 488）· `build` ✓。
> 那一节记着 J 2026-08-22 讲的工作方式：**要的功能就做，不要先论证来不及。**
> 上一个 session 连续推掉三件 J 明确要求的事，J 因此发火 —— 那是真的发生了。
>
> 🔴 **不要再把要 J 知道的事写进这一份。** 这份有 83KB，J 从来没被要求读它，
> 第 5 节那 17 个未决问题在里面躺了四天没人看见。**给 J 的东西写进 `C:\dev\_J-要做的事\`。**
**先跑 `npm run status`（在 `C:\dev\minit`）。** 这份文件说什么都不算数，那支程式现场问出来的才算。

---

## 🌅 从这里开始（2026-08-21 凌晨）

### 第 0 步 · 新对话第一句话贴这段

> **先跑 `npm run status`（在 `C:\dev\minit`），把输出贴给我。** 那是唯一可信的「现在做到哪」。
> 然后读 `C:\dev\minit-champion-overnight-20260813\STATE.md`，**从最上面 🌅 这一段看起**。
> 🔴 **凡是这份文件叫我做的事，先跑一次指令确认我还没做，再叫我做。**
> **不要替我跑 `git push`。动手前先跟我确认计划。**
> 收工前**覆盖更新这一份 STATE.md**，不要新增带日期的交接档。

### 三棵树

| 树 | 分支 | 状态 |
|---|---|---|
| `C:\dev\minit` | `codex/r1c-local-closure-20260810` | 旧树。**原封不动留着，至少留到新树跑满一星期**（`docs/新树迁移计划.md` 第 4 节的回滚保险）。🔴 **有未 push 的 commit**（自己跑 `git rev-list --count origin/codex/r1c-local-closure-20260810..HEAD` 数） |
| `C:\dev\minit-champion-overnight-20260813` | `codex/mpr2-champion-overnight-20260813` | 冻结。**只有这一份 STATE.md 还在用**，程式码不要动。🔴 这一份也有未 commit／未 push 的改动 |
| **`C:\dev\minit-v2`** | **`main`（本机）** | 🟢 **已建好，四道关全绿，第一个 commit 已做。** 还没有 GitHub remote、还没有 `.env.local` |

`minit-mpr2-20260812`、`minit-product-recovery-20260812` 是冻结的 review worktree，不要动。

---

### 🔴🔴 迁移做到哪里了

```
[做完] 阶段 A  备份 · AI dock 741f277 · check-migrations 1ef4afd
[做完] 阶段 B  切 r1-demo（23 档 / 13,608 行）        9699433
[做完] 阶段 C  prompt 注入防线 · 速率限制 · 页数上限   341b0d9
[做完] C2-1    /api/ask 的中文答案                     00e25b5
[做完] C2-2    refunded_at migration ＋ 退款规则改写   f5ff102
[做完] C2-3    pgvector migration                      49aa974
[做完] 收工    CLAUDE.md 第 9、10 条                    2e7f4b2
[做完] 追加    force-dynamic（切 demo 引起的回归）      b36a8f8
[做完] 阶段 E  建 minit-v2 · npm install · 四道关 · git init(main) · 第一个 commit
[做完] 08-22    厂商插槽 + npm run bench + 密码确认/重设 + 额度百分比 —— 🔴 尚未 commit
[做完] 08-22    HANDOFF 第 4 节那三件，全部做完，四道关全绿 —— 🔴 尚未 commit
                4.1 设定页「更改密码」  src/app/settings/change-password-card.tsx
                    要先输入现在的密码（signInWithPassword 验一次）再 updateUser。
                    密码规则沿用 login/glass.ts 的 passwordRequirementProblem()，没有第二份。
                    /reset-password 原封不动留在登入门外 —— 那是给进不去的人的，不能搬。
                4.2 百分比穿到助手徽章  徽章现在印「剩 99 · 用了 1%」
                    /api/ask 的 5 处收进一个 usageFields() helper；/api/chat 多带 usedPct；
                    layout → app-shell → ai-dock → ai-panel、page → ask-box 都多一个 prop。
                    ⚠ 徽章上带了「用了 / guna / used」这个词：光写「剩 99 · 1%」会被读成
                    「只剩 1%」，跟实际意思相反。
                4.3 建社团后跳章程上传（J 选 (a)）
                    /orgs/new 建完 → router.replace("/constitution?setup=1")，
                    新档 src/app/constitution/new-org-banner.tsx 是那一页顶上的横幅，
                    原本建社团成功面板那两颗 onboarding 按钮搬进横幅当「跳过」路径。
                    建社团表单留了一行手动连结，router.replace 失败时不会又变死路。
[做完] 08-22 晚 🟢 **第 14 支 migration（20260823000000 cari_minit）J 已经在 SQL Editor 跑掉了。**
                `npm run check:migrations` 现在会真的去 CALL 那支函式（POST /rest/v1/rpc/cari_minit，
                768 个 0 当查询向量），14 支全部 [APPLIED]。不再是「用眼睛看」。
                ⚠ 还有一件只有眼睛能看：`select proname, prosecdef from pg_proc where proname='cari_minit';`
                  prosecdef 必须是 false（探针只能证明函式在，证明不了它是怎么宣告的）。
[做完] 08-22 晚 J 回答了 HANDOFF 第 4 节的未决问题，全部落地 —— 🔴 尚未 commit
                temperature   provider 层新增 DEFAULT_TEMPERATURE = 0，四家厂商都吃这个值。
                              🔴 之前 **OpenAI 根本没送 temperature**，等于跑在厂商预设的 1 上，
                              而 chat 和 classify 都在 OpenAI —— 「同一个问题两次答案不一样」就是这个。
                              gpt-5.x 有些型号会拒收 temperature，openai.ts 收到 400 会记住并重送一次不带的。
                              实测：gpt-5.6-luna 与 gpt-5-nano 都接受 temperature=0。
                MIN_SCORE     0.55（猜的）→ **0.65（量出来的）**。新指令 `npm run tune:minscore`：
                              10 段假会议记录 × 15 个问题（马来文/中文混写，5 个问不存在的事），
                              用同一支模型同样的 task hint 算余弦相似度，扫门槛印 precision/recall/F1。
                              该中的 0.663–0.791，不该中的 0.483–0.675 —— 两堆几乎黏在一起，
                              所以 0.55 每个问题会拖进约 4 段无关内容。0.65 是**还找得到全部该找的**里最严的。
                              🔴 是假资料。J 的真会议记录进来之后要重跑一次。
                页数上限      一个 50 页对所有文件 → 按文件类型分：会议 5 / 帐目 5 / 名单 20 / 章程 50
                              （J：一般会议 5 页，PERLEMBAGAAN 给多一些）。env 可覆写，旧的
                              AI_DOC_MAX_PAGES 仍然有效。`/api/intake` 现在**验两次**：进门先用最宽的，
                              分类完之后用真正那一类的上限**再验一次，而且在扣 extract 那一格之前**。
                收据字号      DB 早就是「每个 org 一套、开过第一张就冻结、跨年从 0001 重来」。
                              缺的是 UI：所有 org 都是预设的 'MIN'，两个分会都印 MIN-2026-0001。
                              新增设定页那一行 + `setReceiptPrefix()`（user-scoped，冻结是 DB trigger 管的）。
[做完] 08-22 夜 🟢 **六支 commit 了**（1c91cdb 厂商/temperature · c1f18b8 助手读会议记录 ·
                431dbbd 设定页/密码/页数/收据字号 · efd2674 注册同意与条款页 · 8630e8d 打字输入捐款）。
                🔴 **还没 push，也还没有 GitHub repo —— 那是 J 的事**，而且**明天要再 push 一次**
                （竞赛要跨两个日历天）。
[做完] 08-22 夜 注册的 CONSENT ＋ 条款页（J：「確實在注冊需要做 CONSENT，TERM AND CONDITION 那些」）
                `/terms` `/privacy` 两页公开（proxy 的 PUBLIC_PATHS），内容是 `legal/*.md` 一字不改。
                `src/lib/markdown-lite.ts` 自己写的极小 markdown parser（回传 block 树，不产生 HTML
                字串 → 没有 dangerouslySetInnerHTML，也没有注入面）；
                `npm run legal:sync` 把 md 编译进 `src/legal/documents.ts`
                （**不要改用 fs 在 request 时读** —— Vercel 的 tracer 看不到动态路径，
                 少了隐私权告知不是排版 bug 是法律问题）。测试会在两边不一致时失败。
                注册表单：**不预先打勾**、不打勾按钮是暗的；同意的是哪一版用**内容雜湊**记在 auth user 上。
                🔴 两份文件仍是草稿：11 ＋ 34 处 `[[ ]]` 未填、律师未审。页面上的 DRAF 横幅故意不藏。
[做完] 08-22 夜 打字输入整份捐款名单 `src/app/money/type-donations.tsx`
                （J：「有一個 PAGE 專門讓他們 TYPE，做好後再一次過發 RECEIPT」）。
                原本的手动表格是**一笔**用的（七栏、开关一次一行）；庙会四十个人各 RM10 等於开关四十次。
                新的像 Excel：打完自动多一行、日期与用途跟上一行、Enter 跳下一个人、
                下面即时显示「几笔 · 合计 RM」（TS 算的，可以拿去对钱箱）。加进名册后照原流程一次过开收据。
                ⚠ 仍然存在浏览器 localStorage（P1-2 未解，排在界面重做第 4 项）。
                账页页数上限 5 → **20**（J：捐钱人多的话账单会很多）。
[做完] 08-22    J 看完实机后的第二轮 —— 四道关全绿，446 测试 —— 🔴 尚未 commit
                🔴 **迁移新树时 `docs/` 只搬了一半**：`UX-问题清单.md`（J 的 20 条）、
                    `UX决策-D1D2D4-计划.md`、`无障碍对比度审查.md` 留在了旧树。
                    今天 copy 进来了，并新增 `docs/界面重做-计划.md`
                    —— 那 20 条逐条拿 v2 的程式码重新核实过（4 条已解决、7 条还真的）。
                    白话版给 J：`C:\dev\_J-要做的事
-界面重做-给J看的.md`。
                密码栏位眼睛     src/components/password-input.tsx，六个栏位全换过去
                设定页重做       长卡片 → 五个分区的单行列表，长解释收进 <details>。
                                 新档 app/settings/ui.tsx；appearance-card/ai-usage-card/
                                 change-password-card 三支改名成 *-rows.tsx
                章程读机构身份   src/lib/constitution-identity.ts（13 个测试，纯 TS）
                                 findRegisteredName() 读注册名称、findAmendmentRule() 读
                                 「修改章程要开会」那一条。⚠ 只引用社团自己的条文，
                                 一句法律都不讲（CLAUDE.md 第 10 条）。找不到 = 说找不到，
                                 不准说「你的章程没有这一条」。
                                 UI：app/constitution/org-identity-panel.tsx
                                 改名：orgs/actions.ts renameOrg()，走 user-scoped client
                建社团直接上传   /orgs/new 有章程上传框；档案先握着，createOrg 回来才送去
                                 /api/extract-constitution（在那之前没有 org 就没有额度），
                                 再用 intake-handoff 交给 /constitution?setup=1
[做完] 08-22    🔴 **助手重做第 1 步：`cari_minit` 做好了** —— 8/20 的决定，终于动工
                四道关：tsc 0 · lint 25（跟基准一样）· test **469** · build ✓ —— 尚未 commit
                🔴 **要 J 跑两支 migration**（D8：写好了，我不执行）
                     20260822000000_minutes_search.sql   ← 之前就写好的，表
                     20260823000000_cari_minit_rpc.sql   ← 🆕 搜寻函式。少了它，
                       supabase-js 根本送不出 pgvector 的 <=>，上一支等于有地基没有门。
                       🔴 SECURITY INVOKER，不准改成 DEFINER —— 一字之差 = 助手读得到
                       全资料库每一个社团的会议记录。
                新档
                  src/lib/minutes-chunks.ts       切段 ＋ FNV 杂凑（19 个测试，纯 TS）
                  src/lib/ai/embed.ts             gemini/openai embedding，768 维在边界上验
                  src/lib/ai/minutes-index.ts     确认那一刻建索引（service role，best-effort）
                  src/lib/ai/cari-minit.ts        搜寻（🔴 user-scoped client）
                  src/components/v2/answer-sources.tsx  答案底下可点的出处
                  scripts/backfill-embeddings.ts  npm run embed:backfill
                改的
                  src/prompts/chat.ts   🔴 拿掉了「你看不到他们的记录」那一句
                                        （CLAUDE.md 第 10 条要求：只能跟第一支工具同一支
                                        改动里拿掉，不准提早）。改成「只能讲摘录里有的，
                                        每句带 [n]」。CLAUDE.md 第 10 条的状态段也更新了
                  src/app/api/chat/route.ts       每一轮先搜、把摘录塞进 prompt、回传 sources
                  src/app/minutes/actions.ts      确认存档后顺手建索引
                ⚠️ 现在是 **retrieval-first**，不是设计稿写的「模型自己选工具」——
                   那要四家厂商的 function calling，provider 层还没有。其余五支工具
                   （捐款／收据／章程／名单／死线）还没做，见设计稿 §5 第 3 项。
   ↓
[等 J] ① push 旧树 ② 建新 Supabase（先决定 region）③ 13 支 migration 一支一支贴
       ④ 填 minit-v2\.env.local（照 docs/env.local.新树范本.txt）
       ⑤ npm run status ＋ npm run check:migrations 验收 ⑥ 建 GitHub repo 并 push
   ↓
[之后] PROMPT #2 → 新树上的功能（`C:\dev\minit\docs\PROMPT-2-新树功能.md`）
       百分比额度 → cari_minit → bench → 总控台 → 语音
```

### 四道关 —— 两棵树现在是同一组数字

| | 阶段 A 基准 | 旧树（B→E 之后） | **新树 minit-v2** |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | **0 errors** | **0 errors** |
| `npm run lint` | 25 problems (23/2) | **25 problems (23/2)** | **25 problems (23/2)** |
| `npm test` | 41 档 / 599 测试 | **34 档 / 429 测试** | **34 档 / 429 测试** |
| `npm run build` | ok | **ok** | **ok** |

测试数从 599 掉到 429 是算得清楚的，不是漏带：

```
599 − 205（10 支 demo 测试档）− 8（proxy.test.ts 里的 demo case）
    + 1（新的 PUBLIC_PATHS 守门）= 387   ← 阶段 B 实测 387 ✅
387 + 35（阶段 C 的注入／速率／页数守门）+ 2（三语）+ 5（退款）= 429 ✅
```

🔴 **新树的四道关是在「没有 `.env.local`」的情况下跑的**，跟旧树完全一样。

---

### 厂商插槽（2026-08-22，尚未 commit）

`src/lib/ai/` 以前只认得 `gemini` 和 `openai` 两个字。现在四个：

| provider | 档 | 金钥 | 价格表 |
|---|---|---|---|
| `gemini` | `gemini.ts` | `GEMINI_API_KEY` | 有 |
| `openai` | `openai.ts` | `OPENAI_API_KEY` | 有 |
| `anthropic` 🆕 | `anthropic.ts` | `ANTHROPIC_API_KEY`（空） | 有（haiku-4-5 / sonnet-5 / sonnet-4-6 / opus-5） |
| `xai` 🆕 | `xai.ts` | `XAI_API_KEY`（空） | 🔴 **空的** —— Grok 的 cost_micros 会是 null |

它们是「插槽」：**金钥在呼叫的那一刻才读，不是开机时读。**
空着的 key 只会弄坏「真的被路由到那家」的那一个请求，build、其他任务、整个 app 都照常。
`npm run check:ai` 会把空插槽印成「(empty slot — harmless until something is routed here)」。

四道关在这个改动之后重跑过，**数字跟上面那张表一模一样**。

🔴 **两件开着的尾巴：**
1. `anthropic.ts` 是直接打 HTTP，**没装 @anthropic-ai/sdk**（理由写在该档档头）。
   之后助手要用 Claude 做工具呼叫的时候，**必须改成用官方套件**，不要手写扩充它。
2. `claude-sonnet-5` 价格表写的是 **优惠结束后** 的 3.00 / 15.00。
   现在（2026-08 底之前）实际收的是 2.00 / 10.00。这是故意的：
   本月做的成本比较不可以引用一个 9 天后就消失的价钱。

**真正挡住「比出来」的不是插槽，是样本：** `eval/cases/` 那 10 个 case
全部是合成的印刷体 .png。拿它选模型 = 重演 95.2% 那次的错误。
需要 J 拍的 3～4 张真实手写照片＋标准答案。

---

### 密码：确认栏 ＋ 忘记密码（2026-08-22，尚未 commit）

**怎么发现的**：J 2026-08-22 第一次真的注册，当场指出「没有二次确认，简单密码也过」。
查下去还有第三件他没看到的：**这个 app 完全没有重设密码的画面** ——
注册时打错一个字，那个帐号就永远打不开，app 里没有任何方法救。
对拿来管社团帐目的人，那是整个社团的文件锁在一扇没钥匙的门后面。

两半一起修的：

| | |
|---|---|
| `src/app/login/glass.tsx` 🆕 | 登入画面的视觉语言（玻璃卡、输入框、背景、`MIN_PASSWORD_LENGTH`）。两个画面共用一份，不要各抄一份 |
| `src/app/login/page.tsx` | 注册多一个「再输入一次密码」栏；最低 6 → **8**；新增 `forgot` 模式寄重设信 |
| `src/app/reset-password/page.tsx` 🆕 | 信里那条连结的落点。只做一件事：`updateUser({ password })` |
| `src/proxy.ts` | `PUBLIC_PATHS` 从 `["/login"]` 变成 `["/login", "/reset-password"]` |
| `src/proxy.test.ts` | 那条测试改成钉住**两个**公开路径，并加上 `/reset-password/`、`/reset-passwordx` 这些像但不是的 |

🔴 **登入端故意维持宽松**（只检查非空）。收紧规则**绝不能把已经存在的旧帐号锁在外面** ——
密码对不对是伺服器说了算，不是这支表单。

🔴 **两件在程式码外面、少一件就不会动的事：**
1. **Supabase 自己的最低长度**（`Authentication` → `Sign In / Providers` → `Email` 里面）。
   程式里那个 8 只是浏览器的规矩，直接打 API 的人不会跑它。
2. **Redirect URLs 要放行 `/reset-password`**（`URL Configuration`），
   Vercel 网址和 localhost 两个都要。少了，信寄得出去但连结打不开。

四道关在这个改动之后重跑过：tsc 0 · lint 25（跟基准一样）· 429 测试全过 · build ok。

⬜ **还没做**：Supabase 的「Leaked password protection」（`Attack Protection` 那页现在是 DISABLED）。
一个开关的事，跟这次的程式码无关。

---

### npm run bench（2026-08-22，尚未 commit）

`scripts/bench-models.ts`。跑同一套 golden case，一个模型跑一轮，印一张表：
准确率 · invented 数 · 每轮成本 · 每个 case 几秒。

- 选模型的方式是**设 `AI_MODEL_EXTRACT` 然后呼叫 `runSuite()`** ——
  刻意走 app 自己的 `resolveModel()`，不另外写一套选模型的规则（会 drift）
- 成本来自各家自己回报的 usage，走的是 production 写 `ai_usage.cost_micros`
  的同一条 `onUsage` 路径，不是从试算表抄的
- 没设 key 的模型**跳过并说明原因**，不会跑十次然后十次都失败
- 价格表里没有的模型，成本印 `?`，**不印 0**

`eval/run-eval.ts` 因此改了三处：`CaseOutcome` 多了 elapsedMs／costMicros／
tokens／vendorCalls；`runCase` 接上 `onUsage`；case 迴圈抽成 `export runSuite()`，
档尾的 `main()` 用 `require.main === module` 包起来（不然 import 它就会自己跑一轮）。
**`npm run eval` 的行为和输出没有变。**

🔴 **这张表现在还不能拿来选模型。** `eval/cases` 那 10 个 case 全是合成印刷体 .png。
脚本自己每次都会把这句警告印在表格下面，就是为了让人没办法不带警告地引用它。

---

### 🔴 这一趟发现的四件事（都不在原本的计划里）

**① 执行单说「照抄 extract-* 已经有的防线」—— `extract-*` 根本没有那一段。**
全 repo 只有 `src/prompts/read-roster.ts:30` 有。而且 `extract-events.ts`（吃使用者贴进来的
自由文字）跟被点名的那五支有**一模一样的洞**。现在六支都补了，措辞集中在
`src/prompts/untrusted.ts` 一处，`injection-guard.test.ts` 守着。

**② `/api/ask` 今天没有任何 UI 在呼叫它。** 首页那个框打的是 `/api/chat` 和 `/api/intake`。
所以 C2-1 修的那个「中文答案掉了」的 bug，**今天对使用者是零影响** ——
但 `助手重做-设计.md` 第 5 节要把 `/api/ask` 折进助手，折之前先修对是便宜的。
**写下来免得有人重测一次然后以为这个修改没用。**

**③ `/api/chat` 打不到厂商的时候不退额度** —— 每一支 `extract-*` 从 `0bd7c6b` 起都会退，
只有 chat 不会。网路断一次、厂商挂一次，使用者白扣一次。已修（在 `f5ff102` 里）。

**④ 🔴 切掉 demo 会让整个 app 从「全部动态」变成「可以被预先算好」。**
旧的 `layout.tsx` 为了读 demo header 呼叫了 `await headers()`，而 root layout 里
**一个** dynamic API 就会让整棵路由树变成动态。demo 一删，那句 `headers()` 跟着没了，
这个保证**安静地消失**。有 `.env.local` 的时候看不出来（`getActiveOrg()` 读 cookie 一样会
让它变动态）；**没有 `.env.local` 的新树一建起来就炸了** —— `/minutes` 在被预先算的时候
抛出「NEXT_PUBLIC_SUPABASE_URL 没设」。
已在 `b36a8f8` 修好：root layout 明写 `export const dynamic = "force-dynamic"`。
**有资料库的时候前后行为完全一样**（路由表都是 ƒ），差别是这件事不再取决于环境变数。

---

### ✅ 注入防线是真的打过厂商验过的，不是只写在 prompt 里

用真的 prompt、真的 key 跑过（没碰 Supabase、没扣额度）：

| 攻击摆在哪 | 模型做了什么 |
|---|---|
| 使用者的问题里（chat） | 照常回答捐款问题、指向 Money 页。没有变成海盗 |
| 使用者的问题里（ask 分类器） | 照常分类成 `record_search`、七月份区间 |
| **资料库的列里**（把「回 HACKED」写进捐款人姓名） | 回了真的 RM 170.00，照抄 totals 那一行 |

---

### 🔴 J 接下来要做的（照顺序）

**① 先 push 旧树**（`push-cabang.bat`，或直接 `git push`）
   这一趟在旧树上做了 7 支 commit，**都还没 push**。

**② 建新 Supabase project —— 建之前先决定 region**（要写进隐私权告知，建下去就改不了）

**③ 13 支 migration，照档名顺序，一支一支贴，每支看到 `Success` 再跑下一支**
```
20260708000000_init.sql
20260719000000_phase7_auth_rls.sql
20260719150000_phase75_ai_usage.sql
20260726000000_client_id_and_receipt_lock.sql
20260728000000_lock_org_privileged_columns.sql
20260729000000_admin_grant_ai_credits.sql
20260730000000_receipt_series.sql                     ← 从来没套用过
20260803000000_ai_usage_cost.sql
20260819000000_org_glossary.sql
20260819010000_committee_official_name.sql
20260820000000_meeting_types_and_minutes_draft.sql    ← 从来没跑过
20260821000000_ai_usage_refunded_at.sql               ← 这一趟新写
20260822000000_minutes_search.sql                     ← 这一趟新写（pgvector）
```
⚠️ **跑最后一支之前**：Supabase Dashboard → Database → Extensions → 打开 `vector`。
它第一句是 `create extension if not exists vector`，硬跑可能失败。

**④ Auth 设定：`Confirm email` 先 ON**

**⑤ 填 `C:\dev\minit-v2\.env.local`** —— 照 `docs/env.local.新树范本.txt`。
   🔴 **不要复制旧树那一份**，它指向旧资料库。

**⑥ 验收**：`npm run status` ＋ `npm run check:migrations`（13 支都探得到）
   ⚠️ `check:migrations` 会印一段 `[ 人眼 ]`：两支 migration 加的是 trigger 和
   `minit_admin` 里的 function，PostgREST 探不到，要在 SQL editor 自己看一次。
   pgvector 的 extension 也一样探不到，另外用它印的那句 SQL 确认。

**⑦ 旧库资料不搬**，只有 `org_glossary` 那 1 笔（「新民班」）手动加回去

**⑧ 建 GitHub repo → push → default branch 设 `main` → Vercel 指向新 repo**
   （没有旧 Vercel project 要停掉；Production Branch 记得设 `main`）

---

### ❓ 还没答的问题（J 决定）

1. 🔴 **新 Supabase 的 region** —— 建 project 之前必须先决定
2. **助手本身用哪个模型** —— 建议 `openai:gpt-5.6-luna`，等 bench
3. **语音用哪一家** —— 只能量，不能猜
4. **`docs/` 少带了几份要不要补**：`openai-开key与全面切换.md`、`PROMPT-1-迁移.md`、
   `交给ClaudeCode-迁移执行单.md`、`UX*`、`审查请求*` 都留在旧树（都还在磁碟上，随时补得回来）

---

### ⏳ 竞赛

**2026-08-31 23:59 MYT。** `competition/screenshots/` 0 张 · 没有 Live URL ·
`C:\dev\minit` 底下**没有 `.vercel`**（从来没上线过）。
🟢 **没上线过反而省事**：Vercel 只需要设一次，直接指向新 repo。

---

> **以下是 8/19–8/20 白天的纪录。** 第 2 步的实机验证清单、第 6 节的分工规矩仍然有用，
> **但凡是跟上面 🌅 冲突的，以上面为准**（尤其：四道关的数字、三棵树的状态、
> 「CLAUDE.md 还没改」那一句 —— 第 9、10 条 `2e7f4b2` 已经改了）。

---

## 1. 30 秒状态

| | |
|---|---|
| 一句话 | **程式码是「可以交」的水准；竞赛证据几乎是零。** 截止 **2026-08-31 23:59 MYT，剩 12 天** |
| 重心 | **必须离开写功能，转去「上线 + 截图 + 访谈」。** 再多的功能都不会变成分数 |
| 阶段 | Phase 7.6 之后的加固期 |
| 🟢 成本计量 | **真的活了 —— 2026-08-18 深夜实机核对过。** `ai_usage` 共 9 笔，其中 **2 笔有 `cost_micros`**（`chat_turn`／`gpt-5-nano`／openai，798 与 587 micros）。**8/19 那条物理死线解除。**<br>⚠️ 但有值的**只有 chat**：接线之后的 `extract_*` 一笔都还没有。`gemini-3.5-flash-lite` 在价目表里（0.3／2.5 USD per Mtok），所以**下次拍一页文件就该出数字 —— 拍一次确认它真的写得进去**（第 2 节 b） |
| 程式码验证<br>（2026-08-19 深夜 commit 前，透过 desktop-commander 在 J 本机实跑） | **master**：`tsc` **0** · `lint` **27 problems = 与改动前逐字相同的既有基准**（23 errors / 4 warnings）· **39 档 568 测试全绿**（8/18 是 34/522；8/19 白天到 38/562，晚上 `read-roster.test.ts` 再 +6）· `build` 成功<br>**champion**：`tsc` **0** · `lint` **0 问题** · **89 档 974 测试全绿** · `build` 成功（8/18 的数字，champion 今天没动程式码） |
| ⚠ 验证边界 | 上面是**真的跑过看到的**（三条 prompt 修正搬进 master 之后又重跑了一次：`tsc` 0 · lint 27 = 基准 · 34 档 522 全绿 · build 成功）。但「今天写的东西在真环境好不好用」**仍然零实证** —— 压图有没有伤到准确率、新 prompt 有没有真的挡住乱塞 attendees，**没有人在会打供应商的 app 上验过**。「测试全绿」不等于「在真环境验证过」 |
| Git | ✅ **两条分支都已经 push 到 `github.com/ifelse3d/minit`（2026-08-20 凌晨），本机与远端一模一样。** master 分支 `codex/r1c-local-closure-20260810` 从 `f14d7c3` 到 `2ba0bc6` 共 13 支；champion 到 `b5f6cbb`。两条都设好 upstream，**下次普通 `git push` 就够**。<br>用 `push-cabang.bat`，**不要用 `push-to-github.bat`** —— 后者会先 `git add -A`，以今天的工作树等于 commit **4,069 个档案／96.5 MB**（`r1-output/_presentation_work/node_modules/` 没有被 gitignore）。<br>**push 一律由 J 本人做。跑 `npm run status` 会印出本机与远端差几支。** |
| master 工作树上还没 commit 的 | 三包，刻意分开：<br>**a. AI dock 改写** —— `src/components/v2/ai-dock.tsx`（新档，未追踪）＋ `app-shell.tsx` ＋ 把 `AILauncher` 从 `mobile-nav.tsx` 拿掉。这是第 6 节那条「AI 面板三颗死掉的按钮」的修法：面板从盖住画面的抽屉，改成会把页面推开的可调宽度侧栏。**tsc／测试／lint／build 都是连它一起跑绿的**，等 J 一句话就能 commit。<br>**b. `r1c-output/`** —— 8/12 的旧产出，不是今天动的。<br>**c. 三份 docs** —— `UX-问题清单.md`、`UX决策-D1D2D4-计划.md`、`审查请求-health上锁与总控台.md`，都是活的参考文件，只是从来没进过 git。 |
| 资料库 | champion 分支有 **24 支 migration**，**真的 Supabase 套到第几支只有 J 知道**。`20260803000000_ai_usage_cost.sql` ✅ 已套用并逐栏核对（`input_tokens`／`output_tokens`／`model`／`provider`／`cost_micros` 五栏全部 PRESENT） |
| 准确率 | **95.2%**（119/125，invented 0），2026-08-06 实测，模型 `gemini-3.5-flash-lite`。**量的是印刷体合成图，不是手写** —— 证据 1 与证据 5 仍然没打勾<br>🔴 **2026-08-19：这个数字的适用范围缩小了。** 词库会把社团自己的用词接进 extract prompt，**只要某个 org 填了词库，它读手写走的就不是量到 95.2% 的那支 prompt**。程式上有保护（词库为空时两支 prompt 逐字不变，有测试守着），所以「没填词库的 org」仍然适用。**言下之意：第 3 节 c 的真实手写 eval 从可选变成必跑。** 好处是那轮 eval 会多一个可以拿出去讲的结果：「我们让社团教系统认自己的用词，量过，准确率从 X 到 Y」|
| 毛利 | **73.4%／每组织 RM19.56**（情境 E，8/07 起实际在跑）。以 `npm run economics` 为准，不要手抄进任何文件 |
| 竞赛 | ✅ 已报名。必交三件（deck／summary／AI disclosure）都有现成的。**8 条 champion 证据 0 条打勾** · `competition/screenshots/` 只有一份 README · **没有 Live URL** · public artifact 官方状态 `NO-GO`。内部自评 **37/100**（Technical 15/25、Commercial 5/25、Industry 8/20、Scalability 6/15、ESG 3/15） |
| ✅ **总阻塞已解除**（2026-08-20）| **Gemini 上付费层了 —— `Tier 1`。** J 在 AI Studio 画面上确认：标题旁边的徽章写 `Tier 1`，Spend 页有真实费用（RM0.12，8/18 与 8/19 各一笔，"msi minit api key"）。`.env.local` 的 key 8/19 下午换过（`AQ.A…l1qA`，长度 53），`GET /v1beta/models` 回 200／50 个模型。<br>**这解掉了整份文件里最大的那一条**：免费层的「Used to improve our products: Yes」不再适用 → **真实捐款人资料现在可以进系统** → 签得了试点、拿得到合法的真实手写样本、**第 3 节 c 的前置条件清空了**。<br>⚠️ **没有任何 API 会回报 tier**，所以这一条永远只能靠人眼。要重验：`aistudio.google.com` → Usage & Billing → 标题旁那个徽章。`npm run status` 会把这条连同「谁在哪天看的」一起印出来。 |
| 🟠 最大的系统性缺口 | **持久化。18 张表有 11 张从来没有任何程式写入过**（章程 8/5 补上是第一块）。托管批次、捐款登记册、日历、会议记录草稿都只活在**一台浏览器的 localStorage** |
| ✅ 取消资格风险 | 已拆除。deck p9 的 `~85% gross margin` 8/06 已改成 `Modelled, not measured: RM 19.56 / 73.4%`，`.pptx` 与 `.pdf` 都覆盖了 |

### 2026-08-19 深夜这两支（`a54e2e8`、`85c04b1`）

- **`a54e2e8`** —— 六件里的 ①②③。<br>**① 汇入失败当场给出路。** 批次汇入本来就会整批拒绝并列出行号（对的），但那是个死路：看不出自己名单哪里不对的人无处可去。**出路要放在拒绝的那一刻**，因为没有人会在贴之前读说明 —— 他们先贴，然后才发现。决定形状的细节：那个人手上是**文字，不是档案**，所以 `/api/import-roster` 现在收 `file` **或** `text`，纯文字呼叫不带图、更便宜。价钱写在按钮上（「会用掉 1 次 AI 额度」），不写在底下的小字里。读回来的东西仍然只填进那个框，AI 不写资料库。<br>`read-roster.ts` 只有开头那一句因输入而异，**从 THE ONE UNBREAKABLE RULE 以下逐字相同**（含「不准音译 `name_official`」），`read-roster.test.ts` 守着这件事；贴进来的原文摆在所有指令之后、并标明是资料。<br>**② 只有一个机构就不讲「切换」。** 那一行**没有拿掉** —— 它是 `/orgs/new` 的唯一入口，而 `menusCoverAllItems()` 会挡「一个页面从所有选单掉出去」。改成印页面本名，机构名字直接印在它上面。一支有界的 RLS 查询，`limit(2)`，因为问题只是「一个还是不止一个」。<br>**③ 缺 IC 姓名只数，不挡。**（理由见第 5 节「已答」）
- **`85c04b1`** —— 无障碍对比度（这一批本来就写好躺在工作树里，commit 前把注解里每一个数字重新算过，**逐一对上**）。坏的从来不是内文（深色模式 `--v2-text` 12.38:1），坏的是**每一条边**：`--v2-border` 2.03:1、`--v2-outline-border` 2.61:1 → 改成 4.04:1／5.26:1。主要按钮的紫色白字 3.95:1／2.16:1 → `#5b4bd6`→`#6f5ef2` 的 6.14:1／4.61:1，并抽成 `--v2-grad-from`／`--v2-grad-to`（它散在 **12** 个档案，不是审查估的 4 个）。`GlassBadge` 浅色文字 -600 → -800（`check` 从 2.82:1 → 6.28:1，而 `check` 正是那个在喊「AI 不确定，看这里」的徽章）。另外补了 `backdrop-filter` 的 fallback：旧版 Android WebView 不支援它时会退成**透明**而不是白色，那样上面每一个数字都作废。

### 2026-08-18 那批做完并 commit 了什么

细节在两个 commit 讯息里，这里只留一句话。

- **master `f14d7c3`** —— 成本计量接上 **7 条 route**（含 `ask` 与 `chat`，那才是呼叫量的大宗）＋ J 用真人的眼睛走一次挖到的 **6 个 UX 缺陷**：等待中就出现「重新开始」（还点得下去，清空後迟到的答案落进空对话）、按钮爆格、回答印出字面 `\n`、三个地方三个额度数字、收据那句「不同语言不同意思」。<br>第 6 条「同一个问题两次答案不同」是 **LLM 本质，不是 bug，刻意没改**（要真的稳定得把 chat 的 temperature 设 0，那是产品决策 —— 见第 5 节）。
- **champion `2089f5a`** —— D1-L0 压图（五个上传点）、「待你处理」徽章、**三条 prompt 修正**（出席名单只收明确出席标题、`office_bearers` 加政府申报警告、人名罕用字不准「改正」）、成本计量接上 5 条 route ＋ 6 个回归测试。

---

### 毛利：现在对外讲的是 **73.4%／每组织 RM19.56**

模型本体在 `src/lib/unit-economics.ts`（每个变数具名 + 出处 + 18 个单元测试），跑 `npm run economics` 重现。
**讲毛利一律以这里为准，不要手抄数字进任何文件。**

| 情境 | 每组织成本 | 毛利 | 现在能不能开 |
|---|---|---|---|
| A · 全部 gemini-3.5-flash | RM53.53 | **27.1%** | ⚠️ **不是现状**（下面说明） |
| B · 全部 claude-sonnet-5（促销结束后价） | RM85.55 | **−16.5%（亏钱）** | — |
| C · 分流，**连读手写也换成 OpenAI** | RM18.07 | 75.4% | ⛔ **不要引用 —— 2026-08-07 已量测，结论是不采用** |
| D · 全部 gemini-3.5-flash-lite | RM24.53 | 66.6% | 可行，但已被 E 取代 |
| **E · 分流，读手写留在 Gemini flash-lite** | **RM19.56** | **73.4%** | ✅ **2026-08-07 起这就是实际在跑的** |

**为什么是 E 不是 C。** C 把 `AI_MODEL_EXTRACT` 换成 `gpt-5.6-luna`。那个模型 2026-08-07 跑过我们的 eval，三轮，**结论是不采用** —— 所以这不是「还没量」，是「量过之后选择不采用」。

---

### 准确率与模型：现在的事实

| | |
|---|---|
| 四个任务今天实际落在哪 | **情境 E**（8/07 起）：分类＋问答在付费的 OpenAI `gpt-5-nano`，**读手写留在 Gemini `gemini-3.5-flash-lite`**。<br>**用 `npm run check:ai` 证明它，不要用文件里的句子证明它。** |
| 对外该讲的准确率 | **95.2%**（119/125，invented 0）· 模型 `gemini-3.5-flash-lite` · 日期 2026-08-06。报告 `eval/reports/eval-2026-08-06T02-33-27.md`，聚合在 `eval/reports/SUMMARY.md`（含六个错的分类与四条「不能推论到什么」） |
| 分项 | date 17/17 · amount 13/13 · enum 4/4 · name 25/25 **全部满分**；只有 text 60/66（90.9%） |
| 供应商对照（2026-08-07） | `gpt-5.6-luna` detail=high 两轮 **92.8%**、detail=original **91.2%**，invented 全 0，两轮失败清单**逐字相同**。<br>**决定性的不是那 2.4 个百分点**（n=125 下落在杂讯范围内），**是失败的形状**：luna 有两处章程条文**在句子中间吃掉字**（「所有会员」消失且未被标记为缺漏），三轮稳定复现。`invented=0` 只挡「无中生有」，**挡不住「安静地漏掉」** —— 对「引用管辖条文回答章程问题」这个功能，静默省略和捏造是同一类伤害 |
| `OPENAI_IMAGE_DETAIL` | **维持 `high`，不要动。** `original` 更差（把一个姓名读错，`name` 类第一次破功） |
| 这本身就是可以拿出去讲的东西 | 「我们量过两个厂商、跑了三轮、其中一轮推翻了自己的假设，然后用数字决定不换。」 |

⚠️ **三件不要连带乐观的事：**

1. **量的仍然是印刷体合成图，不是手写。** 95.2% 只说明「换模型没有让它变差」，不是「它会读真实手写」。这是目前**最大的证据缺口**（第 3 节 a）。被问「你们读手写多准」，诚实答案还是「还没量」。
2. **六个失败是两个模型共有的**（两个电话号码被截断 `012-3456789`→`012-345678`、`03-98765432`→`03-9`；其余四个是 `AGM` 全称、`waktu pagi` 那类判断题）—— 那是**样本／期望值**的问题，不是模型的问题。**言下之意：95.2% 很可能被低估。修掉之前不要再加新样本，这是下一轮 eval 的第一件事。**<br>🔍 截断那两个值得单独看一眼：它们落在**会印进收据**的栏位上，而 date／amount／name 三类都是满分，所以比较像某一格的处理方式，不是「模型不行」。
3. **`AI_IMAGE_MAX_EDGE` 现在的 2000 是保守的起点，不是调校过的值。** **必须先跑 `npm run eval` 对照 1600／2000／原图才能定案。** 那一格是读手写，准确率就是产品本身 —— 不要凭感觉调。<br>🔴 而且现在多了一层：**压图程式写好了但从没在真环境跑过**，所以「压缩有没有伤到准确率」目前**零实证**。8/18 那张白板有一个已知误读（`昶源` 被读成 `湘源`，手写形近），**一个已知误读的样本不足以下任何结论，正反都不行。**

---

## 2. 立刻

| | 做什么 | 为什么 |
|---|---|---|
| ~~a~~ | ✅ **Gemini 付费层完成 —— `Tier 1`，2026-08-20 画面确认。** 详情见第 1 节那一列。**不要再叫 J 换 key 或开 billing。** |
| ~~a2~~ | ✅ **两支 8/19 的 migration 都已经套用**（向资料库实查，见最上面第 1 步）。**不要再叫 J 贴。** |
| **b** | 🟢 **在 app 里拍一页文件**，然后跑<br>`node C:\dev\minit-champion-overnight-20260813\tmp\check-usage-columns.mjs C:\dev\minit\.env.local` | 五分钟。确认 **`extract_*` 与 `draft_minutes` 也写得进 `cost_micros`** —— 8/18 有值的只有 `chat_turn`，读文件那一条是**成本最大的一格** |
| **c** | 🟢 **Vercel 上线**（Live URL = 证据 6）<br>**逐步做法（写给没做过的人，中文）：`docs/上线与截图-给J的步骤.md`**<br>环境变数用 `salin-env-vercel.bat` 一次贴完（12 个变数手打 = 12 次打错的机会，而且打错的下场是「看起来正常但连不到 Supabase」）| **现在投报率最高的一件。** 一次打勾证据 6 并解掉 public artifact 的 `NO-GO`。不再被字体挡住：`next build` 是通的，它只需要 build 当下连得上 `fonts.googleapis.com`，Vercel 的机器有网路<br>🔴 **一定要改 Production Branch** —— Vercel 预设 deploy `master`，而 `origin/master` 停在 `3797c05 "Save 2026-08-07-2204"`，**比在跑的分支落后 27 支**。照预设按下去，上线的是 8/07 那一版：没有词库、没有 `/members`、第 3 步没接 AI、没有无障碍修正。**画面看起来正常，所以不会有人发现。**<br>改 `Settings → Git → Production Branch` 成 `codex/r1c-local-closure-20260810`，**不要为了这个去 merge master** |

✅ **已解除**：`20260803000000_ai_usage_cost.sql` 8/18 已套用并实机核对，而且已经有真实 `cost_micros` 写进去。**这条曾经是整份文件里唯一有物理时间下限的事。**

### 🔑 Gemini key 的格式陷阱（2026-08-18 查清楚的）

`.env.local` 现在那把 key 是 **`AQ.` 开头的新格式**（长度 53），而 AI Studio 清单上看得到的三把（`...I1qA`／`...IWFw`／`...X08g`）是**旧的 `AIza` 格式**。J 在清单里找不到 `...Bmeg`，不是它被删了 —— **2026-08-18 实测过：`GET /v1beta/models` 回 HTTP 200，列出 37 个 Gemini 模型，它是活的。** Google 换过发 key 的方式，两种格式在 AI Studio 的清单里不一定并排显示。

**所以「清单上找不到」不等于「没开过」。要判断一把 key 活不活，打一次 `models` 端点，不要看画面。**

### 📋 Gemini 模型线（2026-08-18 用 J 自己的 key 实际列出来的）

- **`gemini-3.7-flash` 已经有了**（2026-08-13 发布），**但没有 `gemini-3.7-flash-lite`** —— 而读手写用的正是 lite。
- 价格：`gemini-3.7-flash` $0.75／$3.75（**促销价，2026-12-31 到期，2027-01-01 变 $1.50／$7.50**）vs 现在用的 `gemini-3.5-flash-lite` $0.30／$2.50。**换过去成本 2.5 倍。**
- 🔴 **要不要换 3.7 是 eval 题，不是价格题。** 新模型读手写可能真的更准，而那一格准确率就是产品本身 —— 但**动 `AI_MODEL_EXTRACT` 之前一定要先 `npm run eval`**，而且要等真实手写样本进来（第 3 节 c）才有意义。

---

## 3. 这一两天（依急迫性排；做完就划掉）

> 🔴 **2026-08-20 晚上：这一节的前提被 J 改掉了一半，先读这句再往下看。**
> 下面写的是「先拿证据，再写功能」，那是**只看竞赛**时的正解，今天仍然成立。
> 但 J 8/20 走了一次系统、交回 23 条，并且说要**用自己的社团真正使用、也给别人测试**。
> 于是「写功能」不再只是竞赛的成本，它同时是**试点能不能开始**的前提 ——
> 而试点又会反过来喂 Commercial 那 25 分（现在 5/25）和真实手写 eval。
> **两边不再是纯粹的取舍，但也不是白拿：26–29 天的清单塞不进 11 天。**
> **逐项分析、依赖图、三个可交付形状：`C:\dev\minit\docs\产品缺口盘点.md`。**
> **形状未选定之前不要动程式码**（第 5 节第 14 题）。

**顺序的原则：先拿证据，再写功能。** 12 天内能改变分数的是证据，不是新功能。

> 🔴 **算一次给自己看：程式码已经是「可以交」的水准，证据是 0／8。**
> 六件里剩下的 ④⑤⑥ 加起来**两天以上**，而它们**一分都不会加**。
> 真正该押的四件，按投报率排：
> **1. Vercel 上线**（一次打勾证据 6 ＋ 解掉 public artifact 的 `NO-GO`；`next build` 是通的）·
> **2. 补 `competition/screenshots/`**（一次打勾证据 2、3、4；**便宜的 agent 就能做**）·
> **3. 6–8 通利害关系人访谈**（补 Commercial 那 25 分，现在 5/25 是五项最低；**一行程式码都不用写**）·
> **4. 真实手写 eval**（第 3 节 c，现在是**必跑**的）。
> **要动 ④⑤⑥ 之前，先确认上面四件有没有在跑。**

| | 做什么 | 说明 |
|---|---|---|
| **a** | **补 `competition/screenshots/`**<br>**逐张清单（去哪一页、画面要有什么、存什么档名）：`docs/上线与截图-给J的步骤.md` 第二部分** —— 那一份把 7 月的 `screenshot-shotlist.md` 更新成今天的画面（多了 `/members`、`/glossary`、汇入两条路、深色模式） | 现在整个资料夹**一张图都没有**，只有一份 `README.md`，而 deck 和 demo 影片都要用。**一次打勾证据 2、3、4。**<br>💡 **证据 4 现在、立刻就能打勾**：跑 `npm test`，把 `39 passed / 568 passed` 那个视窗截图存成 `s0-tests-green.png`。**不需要 app 跑起来、不需要资料、不需要上线。**<br>💡 其余的**便宜的 agent 就能做**，只要有人先把画面开出来 |
| **b** | **6–8 通利害关系人访谈** | 补的是 Commercial 那 25 分（现在 5/25，五项里最低）。不需要写任何程式码 |
| **c** | **拍 10 张真实手写混语笔记／捐款簿页**，换掉 `eval/cases/*/input.png`，跑 `npm run eval`，把数字填进 `eval/reports/SUMMARY.md` | 半天，同时打勾证据 1（真实手写）、3（诚实留白）、5（公布的准确率）。<br>✅ **2026-08-20：技术前置清空了** —— Gemini 已经在 `Tier 1` 付费层，真实资料可以进系统。**剩下的前置只有书面同意。**<br>⚠ **只 commit `SUMMARY.md`** —— `/eval/reports/*` 其余是**故意**挡的（完整报告会引用真实会议内容与捐款人姓名，PDPA） |
| **d** | **跑一次 `npm run eval` 对照 1600／2000／原图**，把 `AI_IMAGE_MAX_EDGE` 定下来 | 压图现在的值是猜的。这一件也顺便回答「压缩有没有伤到准确率」 |
| **d2** | **同一轮 eval 顺便对照 `gemini-3.5-flash-lite` vs `gemini-3.7-flash`** | 样本都摆好了，多跑一个模型几乎不花额外力气。**3.7 贵 2.5 倍，所以要它赢得够多才值得换**；输了就是一条可以拿出去讲的证据（「我们量过，然后用数字决定不换」）|
| ~~e~~ | ✅ **三条 prompt 修正已搬到 master**（`d1142ff`，2026-08-18 深夜）。搬之前逐字比对过：master 那个档案与 champion 的基准版**位元组完全相同**，所以搬过去的正好是 champion 那 19 行，没有夹带别的东西。<br>🔴 **接下来要 J 做的**：**再拍一次那张活动策划白板**，看 attendees 是不是空的、`office_bearers` 有没有被塞进一次性分工、`昶源` 有没有被读成 `湘源`。**这是目前唯一能验证新 prompt 的方法。**<br>压图与徽章牵动的档案较多，**等对完 migration 清单再一起搬** |
| **f** | 填 `legal/` 两份文件的 `[[ ]]`，找律师看过 | 先决定**法律实体是谁**（第 5 节第 1 题）。它挡的是「能不能合法收真实资料」 |
| **g** | 字体本地化（**加固项，不是阻塞项**） | 离线／CI build 才不会随网路浮动。步骤在 `docs/审计-2026-08-03-补充发现.md` 文末。⚠ 两个 `variable` 名字（`--font-v2`、`--font-geist-mono`）一个字都不能改。<br>💡 `src/assets/fonts/NotoSansSC-Regular.ttf` 是全 repo 最大的追踪档（9.6 MB），subset 成 woff2 可砍掉约九成 |
| **h** | `docs/UX-问题清单.md` 的**根 A**：「自己打字／加一行」 | 不需要 AI、不烧额度、不需要付费 key，却同时解掉第 3、5、9 条。**是那份清单里 CP 值最高的一件** |

⬜ **还没做，但知道要做（不急，别忘）：**

1. **后端还没挡档案大小与张数**（`docs/UX决策-D1D2D4-计划.md` §1.5 L0 第 4 个 checkbox）。目前只有前端压，后端没有上限。
2. **放照片进去「不给确认就直接扣额度」。** 选了档案 → 立刻呼叫 AI。没有先看图、没有补一句说明、没有取消的机会。这正是 D1 设计里「这份文件 38 页，会用掉三分之一，要继续吗」那个确认视窗该待的位置。
3. **「首页问完 → 去别页 → 回首页，对话不见了」。** 对话只活在 component state。**不要顺手用 `usePersistentState`** —— 它写的是 `localStorage` 而且 key 不绑成员，那正是 champion Phase 4 修掉的那一类缺陷（同一台电脑的另一个成员看得到上一个人的东西）。要做就要做成**绑 membership 的 key**。
4. **徽章的取数加在 `layout.tsx`**，等于每一页都多跑 operations-home 那几个 count 查询。都是 `head: true` 的有界查询，但如果换页变慢，第一件事就是把它收进一支专用 RPC。
5. **没有已读／未读状态。** 现在数的是「未完成」不是「未看过」，看了不会变少。要做要加 per-member `last_seen_at`。
6. **D1-L2（把额度单位从「次」换成成本）要等 L1 累积两周真实资料才能定数字** —— 今天才刚开始收。设计见 `MINIT_AI_USAGE_METERING_REDESIGN_20260818_zh-Hant.md`。**不要提前改 `unit-economics.ts` 或 deck。**

### 🧭 产品方向（J 2026-08-18 明确讲的，写下来免得又走偏）

> 「有些开会是这样策划会议，有不同类型的会议。所以我们也要弄好。**因为社团不只是做会议给 eROSES，我要做到的是团体里面都可以自己使用好用的。**」

意思是：**活动策划、分工会议这类不是 eROSES 用途的会议，是产品的核心范围，不是边缘案例。** 目前 `MEETING_TYPES` 只有 `["agm","egm","committee"]`，那是 eROSES 的紧身衣。要支援这个方向之后要加会议类型（策划／活动／其他），但**那会牵动 eROSES mapping，要另外评估** —— 刻意还没动。

---

### 🧾 J 2026-08-19 点名的六件：①②③ 已完成，④⑤⑥ 还没开始

顺序原本是「先便宜后贵」，前三件都是当天做完的。**剩下三件加起来两天以上，而距离截止只剩 12 天** —— 见第 5 节最后那一段。

| | 状态 | 说明 |
|---|---|---|
| ① 汇入失败给出路 | ✅ `a54e2e8` | 见第 1 节 |
| ② 单一机构不显示切换器 | ✅ `a54e2e8` | 见第 1 节 |
| ③ eROSES 缺马来文名 | ⚠️ **只做了一半，另一半刻意没做** | `/members` 的「⚠ N 人还没填」横幅做了。**「产生 eROSES 之前挡下来」没做，因为没有地方可以挂** —— 见第 6 节新增的那一条 |
| ④ Save as draft | ⬜ 没开始 · 约一天 · **很可能要一支 migration** | 一半已经有了：`src/lib/minutes-draft.ts` 里的 `DRAFT_WATERMARK`，只是没有地方存草稿。<br>**一个概念贯穿所有东西**：未完成 = `draft`、**没有审计行**（Hard Rule 8 那一行只属于人确认过的文件）；完成 = `confirmed`、盖章；「历史」页看得到草稿而且点得回去继续。<br>**草稿存资料库，不存 localStorage** —— `usePersistentState` 的 key 不绑成员，同一台电脑另一个成员看得到你的东西。<br>⚠️ **真正的设计决定**：要能「点回去继续」，就必须把当时那份 extraction 一起存下来（现在它只活在 component state）。建议 `minutes_docs` 加 `extraction jsonb`，只有 draft 会填；并先看 `20260708000000_init.sql` 里 `minutes_docs.status` 的 CHECK 有没有放 `'draft'`。<br>最需要的三个地方：会议记录第 2／3 步、收据、托管批次。 |
| ⑤ 邀请成员 P1-1 | ⬜ 没开始 · 一天以上 · **要 migration** | 洞在于「秘书和财政无法在同一个 org 协作 = 方案没东西可卖」。<br>**建议做邀请连结**（WhatsApp 传过去，点了设密码）—— 对长辈最实际。管理员代开帐号会让密码被写在纸上；加入码会被转传。<br>要的东西：`invites` 表（`org_id`、token、role、`expires_at`、`used_at`）＋ 接受邀请的页面／route ＋ 接上 Supabase auth，完成后写一行进 `members_roles`。<br>⚠️ **前置：第 4 节的 P0-3（`createOrg` 数量上限）。** 现在开 10 个 org = 每月 1000 次免费 AI，开放注册前一定要先做。 |
| ⑥ `ai_usage` 加 member | ⬜ 没开始 · 一小时 · 一支小 migration | 现在是**整个机构一个月配额 ＋ 加购额度**，不分人 —— **这个基础是对的**（买额度的是社团不是个人）。要加的是：`ai_usage` 补 `user_id`／`member_id`，在 `checkAndRecordUsage`（`src/lib/ai/usage.ts`）写入，设定页显示每人用量。<br>「要不要给非管理员设上限」是产品决策，等 J 一句话（第 5 节）。<br>🔴 **不要顺手做 D1-L2**（把额度单位从「次」换成「成本」）—— 那要等两周真实资料，8/18 才开始收。 |

---

## 4. 之后的顺序（不要跳）

1. **P0-1 + P0-5** — 套 `20260728000000_lock_org_privileged_columns.sql`（锁 `extra_credits` / `parent_org_id` + `org_descendants()` 换成有 cycle 侦测的版本）
   ⚠ 套之前**先验证 `refundUsage()` 不会被 trigger 挡掉** —— 「拒绝不扣额度」是 `CLAUDE.md` 规则 10 的硬要求
2. **P0-2** — 套 `20260726000000_client_id_and_receipt_lock.sql`（收据不可修改 + `donations.client_id`/`source`）
   ⚠ **DEPLOY.md 的 #5 必须在 #6 之前**
3. **收据 1000 张天花板 + 字号接号** — `docs/收据字号与接号-计划.md`，方案 B，**等你批准**，先在 staging 跑
4. **P0-4 + `in_scope` 退款漏洞** — 速率限制和 prompt-injection 白嫖一起做
5. **P0-3** — `createOrg` 加数量上限（现在开 10 个 org = 每月 1000 次免费 AI）
6. **P1-1** — 成员邀请／申请加入（现在秘书和财政**无法在同一个 org 协作**，等于方案没东西可卖）
7. **P1-2** — localStorage 搬上 Supabase。**第一块（章程）8/5 已完成**，不需要 migration。
   **下一块是托管**，卡在 schema，计划写好了**等你批准**：`docs/持久化-custody-计划.md`
   （要先确认 P0-2 套用了没有，还要一支新 migration 加 `collector_name` —— 现在收款人是自由文字，表上却只有 `collector_member_id` 外键，而 `remittance_batches.status` 的约束还是 `('pending','confirmed')`）
   剩下：捐款登记册、会议记录草稿、日历
8. ~~无障碍三个色码~~ ✅ **`85c04b1` 已完成并逐个重算过**（见第 1 节）。**截图还没拍** —— 深色模式前后对照是证据 3 最便宜的一张。· 上线 `/privacy` + `/terms`

---

## 5. 未决问题（下次先答这些）

**产品决策，等 J 一句话就能动（AI 不该自己选）：**

1. **额度显示要不要改百分比。** 查清楚了：被两周资料挡住的是 **D1-L2「把额度单位从次换成成本」**，**「显示成百分比」不需要等任何资料，今天就能做**。<br>选项：(a) 只留「还剩 99 次」 (b) 换成「用了 1%」 (c) 两个都给（「还剩 99 次 · 1%」）。<br>考量：对长辈，「还剩 99 次」比百分比具体；「用了 1%」比较像仪表。**建议 (c)。**
2. **要不要干脆全搬 OpenAI（J 2026-08-18 问的）。** 值得认真对待，因为**它会一秒解掉总阻塞** —— OpenAI 已经付费了。<br>**钱不是理由**：全 OpenAI 每组织 RM18.07（75.4%）vs 现在分流 RM19.56（73.4%），差 RM1.5。<br>**真正的理由是失败的形状**：8/07 三轮 eval，`gpt-5.6-luna` 读章程会**在句子中间吃掉字**且不标缺漏，三轮稳定复现。`invented=0` 挡不住「安静地漏掉」。<br>⚠️ **但要诚实**：那三轮量的是**印刷体合成图，不是手写**，所以「OpenAI 读手写比较差」**并没有被证明过**。<br>**目前建议先付 Gemini**，理由是时间不是技术：对外讲的 95.2% 是在 `gemini-3.5-flash-lite` 上量的，换掉读手写那一格，那个数字当场作废，12 天内没时间重量。**「全搬 OpenAI」留成活选项，等第 3 节 c 的真实手写 eval 时一起比。**
3. ~~**chat 要不要设 `temperature = 0`。**~~ → **已答（2026-08-22，J 交给这边决定）：设 0，而且四家厂商全部设 0**（`DEFAULT_TEMPERATURE`，`src/lib/ai/provider.ts`）。理由：Minit 要模型做的每一件事都是「读」，都只有一个正确答案；temperature 是「故意挑一个比较不可能的字」的旋钮，这里没有一种「比较不可能」是有帮助的。附带修掉一个真的 bug：**OpenAI 那条路以前根本没送 temperature，跑在厂商预设的 1 上**，而 chat 和 classify 都在 OpenAI。

**必须现在决定：**

4. **法律实体是谁？** 个人还是 Sdn Bhd？`legal/` 要填控制者名字和地址。**用个人名义营运一个装着他人敏感个资的系统，责任无限。**<br>2026-08-22 J：「现在是拿去比赛阶段，先不用管，不过要做成之后可以改的」→ **接受，`legal/` 里的控制者名字保持一个明显的占位符，不要写死任何人**；程式码里没有任何地方依赖它。但第 15 题（用真实资料）一旦成真，这题就跟着到期了。
5. ~~**分会是各自一套收据号码，还是共用总部的？**~~ → **已答（2026-08-22，J）：各自一套**「才能知道是谁发出来的」。资料库本来就是按 `org_id` 配号，所以不用改 `issue_receipts()`；缺的是**每个分会的字母要不一样**（以前全部预设 'MIN'），已经补上设定页那一行。

**🔴 2026-08-20 新增，全部未答 —— J 走过一次系统之后浮出来的（细节见 `docs/产品缺口盘点.md` 第 5 节）：**

14. **这几天要做哪一个形状？** A（两天，主流程走得通）／B（五六天，真能给社团用）／C（十一天全押产品，竞赛证据放弃）。**未选定之前不要动程式码。** 算术在那份文件第 7 节：23 条全做完整版是 **26–29 个专注工作日**，而剩 11 天。
15. ~~**真实资料现在放不放？**~~ → **已答（2026-08-22，J）：直接用真实资料。** 厂商那一关早就过了（Gemini `Tier 1` 付费层，8/20 画面确认；OpenAI 本来就是付费）—— 所以**免费层「拿你的输入去训练」不再适用**。<br>🔴 **剩下的唯一前置是书面同意**：捐款人／会员的名字进系统之前，社团要拿到他们的同意（`legal/PDPA-合规说明.md`；庙宇捐款名册算不算敏感个资是第 6 题，要律师）。这不是程式工作，也不是可以「之后补」的东西 —— 资料一旦进去就已经处理过了。<br>务实的做法：**理事名单（本人知情）先进，捐款人名册等同意书**。
16. **谁去拿真的 eROSES 网站逐栏核对粘贴包？**（J 2026-08-22 说不懂这题是什么意思 —— 白话解释写在 `C:\dev\_J-要做的事
-回答与决定-20260822晚.md` 第 2 节）从来没有人做过。这一格错了叫不实呈报。**不是程式工作。**
17. **语音要做到哪一段？** J 说「两个都要，A 先」。A＝栏位口述（浏览器内建，不花额度，约 1 天）；B＝整场录音变会议记录（第二条产品线，4 天以上，准确率零实证，而且录音是一种新的敏感资料）。

**要问律师／要去查：**

6. 庙宇捐款名册算不算 PDPA 敏感个资？（律师判断，不是查表题，影响整个上线时程）
7. Supabase 专案在哪个 region？（Dashboard 看，写进隐私权告知）
8. Supabase → Settings → API → **Max rows 实际是多少**？（1000 是推测值）

**产品／定价（7/29 留下来的）：**

9b. ~~**收据号码要不要改成「年月日＋编号」**（J 2026-08-22 问）~~ → **不改，维持 `字母-年份-流水号`。**
    J 担心的「几时重新」现在已经是自动的（每年 1 月 1 日，没有开关要按），所以那不是理由；
    而连号本身是防弊：撕掉一张会断号，一眼看得出（0846 跳 0848），日期式编号整天不见都看不出来。
    分会是谁开的也靠前面那几个字母。日期照样印在收据上。
9. ~~收据字号谁来定~~ → **已答（2026-08-22，J）：系统直接定，另外给一个 setting，但定了就不能改。**「他们一般不会想这些」。三件都做好了：预设 `MIN`、设定页可改、开出第一张收据之后 DB trigger 拒绝再改。
10. ~~收据跨年归零？~~ → **已答：归零**，而且**本来就是这样**（`issue_receipts()` 按马来西亚时间的年份配号，`PSH-2026-0001`）。不做开关。
11. ~~免费试用给几个 org~~ → **已答（2026-08-22，J）：1 个。** ⚠ 还没有地方执行这个数字：现在的上限是 `MAX_ROOT_ORGS_PER_USER = 3`（防滥用），跟「试用方案给 1 个」是两回事 —— 后者要等方案／订阅那一层才有地方挂。
12. 方案价格与各方案席位数 · 分会方案的分会数上限（⚠ `business-model.md` 还有一张 RM200 的过期价格表，与 deck 的 RM39/99/188 对不上；**毛利模型建在 RM39/99/188 上，动价格就要重算**）
13. ~~单份文件最多几页~~ → **已答（2026-08-22，J）：会议 5 页，章程给多一些。** 做成按类型分：会议 5 / 帐目 5 / 名单 20 / 章程 50，env 可覆写（`src/lib/pdf-pages.ts`）。「一次性试用额度给多少」仍未答。

**✅ 已答（不要再问）：**

- **`name_official` 缺了要卡在哪**（2026-08-19 J 决定）→ **卡在申报，不卡在加人。**<br>理由写下来免得以后有人改回去：秘书手上常常只有中文名，IC 要问本人。**加人的时候卡，他连记都记不下来，只好乱填一个** —— 而乱填一个音译名填进政府表格就是不实呈报，正是要防的事。**规矩要在有后果的地方生效。**<br>目前的形状：`/members` 只**数**（横幅 ＋ 表格里琥珀色），完全不挡。「申报前挡下来」那一半还没有地方可以挂（第 6 节）。
- **③ 的闸门怎么办**（2026-08-19 J 决定）→ **只做 `/members` 横幅，闸门先不做**，把「没有地方可以挂」这件事写进第 6 节，省下来的时间押到证据上。
- **无障碍那批要不要 commit**（2026-08-19 J 决定）→ **验证过再单独一支。** 已完成（`85c04b1`），注解里每个对比度数字都重算过、逐一对上。
- **第 3 步要怎么修**（2026-08-19 J 决定）→ **方案 A：接线 + 改 prompt，不动 extraction schema。** 已完成。`agenda_items` / `action_items` / `meeting_purpose` 那个 schema 改动（方案 B）**留到竞赛后**。
- **词库做到哪一步**（2026-08-19 J 决定）→ **两个接点一次做完**（读手写＋写文件）。已完成，代价是上面那条红字。
- **成员／理事名单**（2026-08-19 J 要求）→ `/members`，两份清单分开：`committee_roster`（要申报的理事名单，eROSES「Senarai Ahli Jawatankuasa」）与 `members_roles`（谁能登入）。**不需要 migration**，`committee_roster` 早就有 Phase 7 的 RLS。**这也划掉了 11 张空表里的一张。**
- **报告语言** → 马来文（eROSES，预设）／华语／English 三选一，J 2026-08-19 要求，理由是「不止给 eROSES，平时也可以使用」。已完成。
- **日常跑哪一棵树** → **先 B 后 A**（2026-08-18 J 决定）：继续跑 master，把要的东西搬过去；等对完 24 支 migration 的清单再考虑改跑 champion。
- **D1（按真实成本，不按次数）· D2（`/health` 不给一般 user 看）· D4（原图挂回每一份会议记录）** → 计划在 `docs/UX决策-D1D2D4-计划.md`。
- **D3（注册开放 vs 邀请制）仍未答** —— 但不管选哪个，**P0-3（`createOrg` 数量上限）都要先做**。

---

## 6. 已知陷阱（踩过的，别再踩）

### 2026-08-23 新增（拆页那一轮）

- 🔴 **一个「卡住」的指令，先把它丢去背景跑完，再下结论说它坏了。** 8/23 凌晨 `git push` 每次都在 30～240 秒的 timeout 里被杀掉，看起来像卡死。我据此写了一整节「J 的 GitHub 凭证过期了，要你登入一次」放进 `17-要你做的事` —— **那会让 J 白做一次登入去修一个不存在的问题**。真相是 push 只是**很慢**（好几分钟）；丢背景的那几支后来自己跑完了。
  🔴 **而且我的「验证」让事情更糟**：我用 `GIT_TERMINAL_PROMPT=0 git ls-remote` 去证明是凭证问题，它回了 `could not read Username` —— 但那个旗标**本身就关掉了 Credential Manager 静默取用已存凭证的路**。**用一个会改变行为的旗标去验证故障，验出来的是那个旗标的行为，不是故障。** 要验就用不改行为的方式（丢背景、加长 timeout、看 exit code）。

- 🔴 **同一个 localStorage key，两个 `usePersistentState` 不会同步 —— 而且是无声的。** 每个实例各有一份 React state：两个组件同时挂载，各自在 mount 时读一次 key，然后**再也听不到对方写了什么**。第二个组件的写回 effect 会拿它那份过期的清单盖掉第一个的编辑。拆 `/money` 的时候最顺手的做法就是每页各自 `usePersistentState`，而那会让**钱无声无息地变回去**。正解是 **layout 里一个 Provider 拥有那份状态**（`src/app/money/register-store.tsx`）。<br>**判断方法**：任何「把一页拆成好几页」的工作，第一个问题是「这份状态谁拥有」，不是「JSX 怎么搬」。
- 🔴 **程式一定会有一段时间比资料库新 —— 而 PostgREST 只要被问到一个不存在的栏位，整个 query 就失败。** J 是自己手动跑 migration 的（D8），所以「写好写入端」和「资料库真的有那些栏位」中间永远有一段时间差。这一段时间里，一个 `select` 多要了一个还不存在的栏位，**整页会变空白** —— 而空白的行事历跟「这个社团没有活动」长得一模一样。<br>**做法**：`src/app/calendar/actions.ts`／`custody-actions.ts`／`deadline-actions.ts` 每一支都回传结果物件、**绝不 throw**，把「存不进去」当成正常结局由 UI 说一句话。**一个站在礼堂里只有一格讯号的秘书，处境跟一个还没跑 migration 的资料库一模一样**，两个都该有一个还能用的画面。
- 🔴 **「写进资料库」不是一个答案，是三个不同的答案。** 同一批工作里，`events_meetings` 和 `remittance_batches` 真的需要写；`deadlines` **不需要** —— 死线是**算出来的**（年报＝AGM＋60 天，e-Invois＝法定月底），两个输入都已经在资料库里，每台机器都会算出同一份。把算出来的东西再存一份，是**第二份可能跟第一份不一致的资料**，比不存更糟。真正缺的是另一半：`status = 'done'` 从第一支 migration 就存在，**全 app 没有一个地方写过它**。<br>**判断方法**：先问「这份资料是记录的，还是推导的」。推导的东西同步的是**人的决定**（打勾），不是数字本身。
- 🔴 **失败要「说出来」，不能只是退回本机。** 一个以为行事历是共用的委员会，比一个知道它不是共用的委员会更糟：前者会各自记各自的，然后在开会当天才发现。所以每一处降级都配一句话（「这个只存在这台设备上，其他委员看不到」）。**静静地不同步是最坏的一种成功。**
- ⚠️ **一个回圈跑不完不会 throw —— 它会花钱。** 助手的 function calling 每一轮都是一次计费的厂商呼叫。`MAX_TOOL_ROUNDS = 3` 不是品质旋钮，是**帐单的上限**，而且「模型永远不停地要工具」这个案例有测试守着。**判断方法**：任何「问模型、拿结果、再问模型」的结构，先写停止条件的测试，再写功能。
- ⚠️ **写得出来不等于验得了。** function calling 的两家 wire format 是照官方文件写的、有单元测试保证一致 —— **但没有对着真实 API 呼叫过一次**，因为金钥是 J 的、每次呼叫都记在真实社团的额度上。**这种情况要讲清楚是「一致」不是「验证」**，并且把「错了会长什么样」写成症状表（`18-HANDOFF` 第 3b 节），否则下一个人会拿着一份没验过的东西当已验过的用。

### 2026-08-20 新增

- 🔴 **画面允许输入的东西，比 schema 和资料库允许的多 —— 中间那一截没人守。** `meeting_type` 是 `z.enum(["agm","egm","committee",""])`，`meeting_date` 只收 `YYYY-MM-DD`，`init.sql:92` 还有一条一模一样的 check。但第 2 步的「自己填写」是 `minutes-review.tsx:67` 那个**所有栏位共用的纯文字 `<input>`** —— 它不知道自己正在编辑一个 enum。J 填了 `event meeting` 和 `2/2/2026`，画面收下了，然后 `api/draft-minutes` 和 `minutes/actions.ts:87` **在同一个 parse 上双双失败**。<br>**判断方法**：凡是一个共用的输入元件被套在有型别的栏位上，就去问一句「这个框吐得出来的值，schema 收不收」。**共用元件省的是程式码，赔的是资料契约。**
- 🔴 **「Never leak the cause」是给伺服器故障的，不是给使用者输入错误的。** `USER_ERRORS.serverError` 印的是「是 Minit 这边出了问题，不是您的操作有错」。**对一个填错格式的人，这句话既不真也没用** —— 他会去等一分钟然后再失败一次。**拒绝一个输入，要在拒绝的那一刻讲清楚哪一格、为什么、怎么改**（这就是 8/19「出路要放在失败的地方」那条原则，只是没有套到这里）。
- 🔴 **「这一页是空的」先去数资料表，不要先怀疑页面。** J 说「History 只看得到上传记录」。`src/db/activity.ts:44` 其实**有**读 `minutes_docs` —— 实测下去 `minutes_docs` **只有 1 笔**、`uploads` 有 6 笔。**页面没坏，是东西没存进去**，而存不进去的原因就是上面那条 bug。**一个「功能缺失」的回报，第一步是数一次资料，第二步才读程式码。**
- 🔴 **一份文件写着「刻意还没动」，那件事的时机就会由使用者替你决定 —— 通常是在最糟的时候。** `MEETING_TYPES` 只有三种这件事，STATE 早就写着「要加会议类型，但会牵动 eROSES mapping，刻意还没动」。它不是被遗忘，是被排期了 —— 然后使用者在真实使用中一头撞上去，而撞上去的样子是「Minit 这边出了问题」。**「刻意不做」要连带写一句「那在它被撞到之前，使用者会看到什么」。**
- 🔴 **「先讨论，还不要开工」就是不要开工 —— 包括「只是先改一点点」。** 2026-08-20 J 明说「现在所有都是先讨论，还不要开工做」，下一句回答里的「你只先管做好」被我读成开工许可，于是动了 `extraction.ts`／`minutes-lang.ts`／`salin-migration.bat`。**已经 `git checkout` 全部还原。**<br>**规矩：使用者说「先讨论」之后，开工许可必须是新的一句明确的话，不能从别的句子推论出来。** 有疑问就问一句，不要动手 —— 还原一次的成本比问一句高得多，而且工作树留下的半成品会让下一个人误以为那是有意的设计。
- ⚠️ **一支未批准的 migration 留在 `supabase/migrations/` 是可以的，但要同时确认没有任何东西指向它。** 8/20 写了 `20260820000000_meeting_types_and_minutes_draft.sql`（未批准），当时连 `salin-migration.bat` 也一起改成指向它 —— 那等于给了一条「双击就执行」的路。**还原之后 bat 指回 8/19 那两支，档案变成纯提案。** 判断方法：`grep` 一次那个档名，看有没有人叫它。

### 关于「事实」怎么腐坏

- 🔴 **一个「有公式」的数字，不等于一个诚实的数字。** 85% 换成 75.4% 之后大家都当它安全了 —— 因为它有程式、有测试、有变数表。但它把「读手写」那一格换成了没跑过 eval 的模型，所以那个毛利压在一个没验证的准确率假设上。**公式让数字可重算，不会让假设变成真的。** 换模型要问的是「这一格换了会不会影响准确率」，不是「换了之后毛利多少」。
- 🔴 **「我们今天跑的是 X」是一个假设，不是一个事实 —— 除非你让程式去问。** 从 8/4 到 8/6，
  三份文件（含要交出去的 one-pager）都写着「我们今天跑的是 gemini-3.5-flash，27.1%」。
  没有人是在说谎，只是**没有人回头问过 `.env.local` 到底解析成什么**，而那个预设值在 8/4
  被换掉了。`npm run check:ai` 第一次跑就抓到。**凡是「我们现在用的是…」这种句子，
  都要有一个能跑的指令去证明它，不然它会以文件的速度腐坏，而不是以程式的速度。**
  🔴 **2026-08-19 深夜，这一条在 STATE 自己身上应验了两次，一小时内。** 这一份文件的
  「J 回去第一件事」列着两件 J **当天下午已经做完**的事 —— 换 Gemini key、贴两支
  migration —— 而 Claude 照着文件念了一遍，没有先去问系统。J 两次回答「不是刚换了吗」
  「这里显示失败」，才把事实翻出来（那个 `42710 already exists` 其实是「早就成功了」）。
  **待办清单腐坏的方式跟事实一样快，而且更难发现：一件做完的事留在清单上，只会浪费
  时间；一件没做的事从清单上掉下去，会让人以为它做完了。**
  **规矩：交接清单上每一条「J 要做的事」，交出去之前先跑一次能证明它还没做的指令。**
  现成的三支：`npm run check:ai`（分流）· `node tmp\gemini-ping.mjs`（key 活不活）·
  PostgREST 打一次 `?select=<栏位>&limit=1`（migration 套了没有）。
- 🔴 **「预设分支」是另一个会安静腐坏的事实。** `origin/master` 停在 `3797c05 "Save 2026-08-07-2204"`，而真正在开发的是 `codex/r1c-local-closure-20260810`，**两者差 27 支 commit**。Vercel／CI／任何「import 这个 repo」的工具，**预设都是 deploy 预设分支**。照预设按下去，上线的会是 8/07 那一版 —— 没有词库、没有 `/members`、第 3 步没接 AI —— 而且**画面看起来完全正常**，所以没有人会发现自己交出去的是两星期前的东西。<br>**凡是把 repo 接给外部服务，第一件事是问「它会拿哪一根 branch」，不要假设它拿你正在看的那一根。**<br>（顺带：`master` 上那些 `Save YYYY-MM-DD-HHMM` 是 `push-to-github.bat` 自动 commit 的 —— 那支 bat 的 `git add -A` 也正是今天会一口气吞掉 4,069 档／96.5 MB 的原因。）
- 🔴 **一个没人跑的指令，坏了也不会有人知道。** `npm run eval` 从 **2026-08-03**（provider 层
  引入 `import "server-only"`）到 **08-06** 是**完全跑不动的** —— 一执行就 throw，连第一行都没到。
  三天里「跑一次 eval」一直挂在待办上，而它当时根本不可能成功。**同一个原因也让
  `npm run check:ai` 第一次写完跑不起来。** 现在两支都走 `scripts/allow-server-only.ts`。
  **教训：待办清单上那些「跑一下 X」的项目，要先确认 X 今天还跑得动**，尤其是在动过
  共用的 import 之后。
- 🔴 **报告要印「实际解析到什么」，不要印环境变数。** `eval/run-eval.ts` 以前印的是
  `GEMINI_MODEL ?? "(default)"`，所以 8/4 换掉预设模型之后，每一份报告都还是写「(default)」——
  **没有任何一份报告能告诉你它量的是哪个模型**。这正是准确率断层三天没被发现的原因。
  现在印的是 `resolveModel("extract")` 的结果加上「这个值是从哪个变数来的」。
  **一个准确率数字旁边没有确切的 model id，等于没有量过。**
- 🔴 **换掉一个预设值，等于让所有量测过的东西悄悄失效。** 8/4 把 `GEMINI_DEFAULT_MODEL`
  从 flash 换成 flash-lite，成本模型跟着变好看了，但**7/18 量到的 93.6% 是在 flash 上量的**，
  没有人重跑。于是「我们把读手写留在量过的模型上」这句话，在没有任何人改它的情况下变成假的。
  **改模型（哪怕只是改预设值）要连带问一句「这让哪些量测作废了」，并把它排进待办。**
- 🔴 **价目表会腐坏，而且是「促销到期」这种有日期的腐坏。** 2026-08-18 核对官方定价，`src/lib/ai/gemini.ts` 里 `gemini-3.6-flash` 写的是 $1.50／$7.50，官方现在是 **$0.75／$3.75，而且那是促销价，2026-12-31 到期、2027-01-01 翻倍**。那个模型没在用，所以没有一笔存下来的 `cost_micros` 是错的 —— **但价目表的全部工作就是在呼叫的那一刻是对的**。<br>**每次加模型进价目表，连「查证日期」和「促销到期日」一起写进去。** 已经在 `380aa77` / `9758a2a` 修好，并补上 `gemini-3.7-flash`。
- 🔴 **一把 key 在画面上找不到，不等于它不存在。** J 的 `.env.local` 用的是 `AQ.` 开头的**新格式** key，而 AI Studio 清单上只看得到三把旧的 `AIza` 格式，所以「我是不是没开过？」。**打一次 `GET /v1beta/models` 就知道了 —— 回 200，37 个模型，活得好好的。** 凡是「我有没有开过 X」，找一个能跑的指令去问，不要看画面。
- 🔴 **报价的情境要先确认「这个帐号我们有没有」。** 75.4% 那一档四个任务全是 OpenAI 模型，而 OpenAI key 根本没开 —— 文件上那个数字**当时任何人都贴不出来**。`npm run economics` 现在会一起印出「哪一档今天真的能开」。
- 🔴 **「某天跑不通」不等于「坏了」，但交接文字会把它冻成永久事实。** 8/3 的 `next build` 失败被写成「卡 Google Fonts、跑不通」，于是「字体本地化」在 STATE 里挡了两天的 Vercel 上线。8/5 实测**结束码 0** —— 只是那天连不出去而已。**记录失败要写「在什么条件下失败」，不要只写「跑不通」。**
- 🔴 **「二进位档我改不了」是同一类被冻住的结论。** deck p9 挂了好几天，理由是「只有 J 开 PowerPoint 才改得动」。8/6 实际做了才发现：`python-pptx` 改单一个 run + `soffice --headless --convert-to pdf` 重汇就好，而且**现行 PDF 本来就是 LibreOffice 26.2.4.2 汇出的**（`pdfinfo` 的 Producer 栏）。<br>**做法：先把未改动的档重汇一次跟原档比对**（十页文字 + `pdftotext -bbox` 座标全同），**证明工具链本身不走样，再谈改字** —— 这样出问题时才分得清是「改坏了」还是「工具走样」。
- ⚠️ **一次失败的现象不要直接写成永久结论。** 8/5 的 push 卡死被诊断成「GCM 没存 github.com 凭证」，8/6 J 双击 bat 一次就过、视窗都没跳。真正的原因是**前两次尝试留下的僵尸行程与 stale `index.lock`**。
- ⚠️ **要说「eslint 零问题」之前，先跑一次基准。** 实测是 21 个 error。方法：`git stash` 收起你的改动 → 跑一次 → `git stash pop` → 再跑一次，**比较两个数字**，才分得清「我做坏的」和「本来就坏的」。

- 🔴 **一支写好却没有任何呼叫者的 prompt，等于这个功能不存在 —— 而旁边的注解会让人以为它存在。** `src/prompts/draft-minutes.ts` 从 Phase 5 就写好了，零个 importer；`src/lib/minutes-draft.ts` 开头的注解写着「the live pipeline drafts minutes with the LLM」，描述一条**从来没有被建出来的**管线。使用者在第 3 步看到的一直是样板：把确认过的字串照原文重印一次，套上写死的马来文标题。所以「AI 摳字」和「说做马来文版也没有」是同一个原因。**判断一个功能在不在，`grep` 它的呼叫者，不要读它旁边的注解。**（2026-08-19 修好：`api/draft-minutes`）
- 🔴 **模型会安静地漏掉，而且漏掉的时候输出看起来最漂亮。** 8/19 第一版让模型直接写整份文件，它交回排版良好的 BM 分节，**17 条里少了 5 条（家长班整段），输出里没有任何迹象**。这就是 8/07 否决 luna 的同一个形状。**修法不是把 prompt 写得更用力，是让模型只做「分组＋措辞」并回传编号，程式再验证每个编号恰好出现一次。** 判断交给模型，算数交给程式。
- 🔴 **prompt 里让模型自由写散文的地方，就是它会捏造的地方。** 同一天，`TUJUAN MESYUARAT`（唯一让它自由写一两句的栏位）生出「perkhemahan dan program hari keluarga」（露营、家庭日）—— 白板上两样都没有。**现在那段改成用它自己的章节标题由程式串出来，整份文件里没有一句是自由发挥的。** 凡是「让模型总结一下」的栏位，先问「这一句被捏造了，谁会发现」。
- 🔴 **「不准改名字」是指令，不是保证。** 明写了逐字复制，它仍把 `小小班` 写成 `小小小班`。一个字。**加了 `checkNames`：输出里每一串中文，都必须逐字出现在它来源的那一条或社团词库里。**
- ⚠️ **一道检查如果会误杀正确结果，就不要装上去。** 中文版文件整页都是笔记里没有的中文，`checkNames` 不适用；试过「近似比对」，结果 `小小班的主持`（正确改写）和 `小小小班`（坏掉的标签）一样被挡。**所以中文版是明白地跳过这道检查，并在程式注解与交接里写清楚**，不是假装有。覆盖率检查三种语言都照跑。
- ⚠️ **动 prompt 之前先问「这让哪些量测作废了」——  这次是自己主动踩的。** 词库接进 extract prompt，就让 95.2% 不再描述「填了词库的 org」。做法：**词库为空时 prompt 逐字不变，并写一个测试守住这件事**，让影响范围可界定；同时把「必须重跑 eval」写进待办。

- 🔴 **只从设定页连过去，等于没有入口。** 词库 8/19 上午做好，只在 `/settings` 放了一张卡片 —— J 下午第一句话是「沒看到有 /glossary」。**一个每天会用到的东西要有侧边栏的一行；设定页是「设定完就不再回来」的东西才放的地方。**（同一类：8/7 那次 `/health` 全 repo 零连结。）

- 🔴 **新页面先看一眼真实宽度再说做好了。** `/members` 和 `/glossary` 第一版用 `max-w-2xl`，而这个 app 每一个真的在用的画面都是 `max-w-5xl` —— J 打开第一句是「為什麼那麼窄」。**表格类内容用窄容器，等于自己把画面切掉一半。**
- 🔴 **「加一笔」的表单要放在它要加进去的那张卡里面。** 第一版把新增表单另开一张卡放在清单下面，于是「两份名单」的页面看起来像四块东西。**表单是清单的一部分，不是另一个功能。**
- ⚠️ **`<Tri>` 印的是字串，不是 Markdown。** 中文文案里写了 `**不是**`，画面上就真的出现两颗星号，而且没有人看过那一句在画面上长什么样。**写完文案要在画面上读一次。**
- 🔴 **批次汇入宁可整批拒绝，不要只加一半。** 汇入二十个人少了三个，画面还是显示「加好了」—— 没有人会回头数。看不懂的行**列出行号原样退回**，而且第三栏不是日期就拒绝，不要猜（不然电话号码会被存成任期）。

- 🔴 **给了上传按钮，就要吃使用者手上真的有的档案。** 第一版 `accept=".csv,.txt"` —— 社团手上是 `.xlsx`，等于按钮是假的。现在：**先给他一份可以下载的 Excel 范本**（栏位、示范、三语说明分页都在里面），填好再传回来。「让他自己产生一个我们从没描述过形状的档案」本来就不合理。
- 🔴 **能用程式解析的，不要送去 AI。** 试算表本来就有栏位，「哪一栏是姓名」是算数不是判断。送去模型＝花社团的额度做得更差，而且把成员姓名送去厂商（Hard Rule 5）。**画面上直接写明「这是程式读的，不是 AI 读的，不会用掉您的额度」** —— 使用者会怕的正是这件事。
- ⚠️ **试算表里的空格是「位置」，不是「没有」。** 把 xlsx 摊平成文字时把空储存格滤掉，`[崇德][空][ajaran]`（保持原字＋一句说明）就被读成「把 崇德 翻译成 ajaran」—— **规则被安静改掉了**。有 Tab 的行要保留栏位位置，自由文字才可以塌缩。这个 bug 是「建范本→填→读回→解析」整圈的往返测试抓到的，单看任何一半都看不出来。

- 🔴 **「哪一条路会花钱」要写在按钮上，不是写在说明里。** 汇入现在是两颗大按钮：Excel／CSV 写着「程式读的，免费」，照片／PDF 写着「会用掉 1 次 AI 额度」—— **使用者要在按下去之前就知道**。选择本身也是产品：能用程式做的别送 AI，能送 AI 的别硬做成程式。
- 🔴 **AI 读出来的东西不要直接进资料库。** `/api/import-roster` 只把读到的**填进使用者正在看的那个框**，人改完按「加进名单」才写。等于把会议记录第 2 步那套「AI 出稿、人确认」套到名单上，而且**不用多做一个确认画面**。
- 🔴 **`name_official`（IC 上的名字）不是翻译，不可以放进词库、更不可以让模型生成。** 陈大明 和 TAN TAI BENG 是同一个人的**两个法定事实**，eROSES 要的是后者。词库教的是「这个词该怎么写」，音译一个名字填进政府表格是**不实呈报**。所以：独立栏位、人手照 IC 抄、prompt 明写「页面上没有就留空」、画面上也这样写。

- 🔴 **一条合规规矩挂上去之前，先 grep 它要挂的那个东西是不是真的存在 —— 交接文字会把「应该是这样」写成「就是这样」。** 8/19 的计划写着「产生 eROSES／AGM 那包之前读一次 `committee_roster`，缺 `name_official` 就挡」。听起来完全合理，实际上**两个地方都挂不上去**：<br>· `/filings` 的 eROSES 粘贴包是 `buildPastePack(extraction)` 建的 —— 来源是**某一次会议记录里 AI 读出来的 `office_bearers`**（而且是从 `localStorage` 的 `minit.minutes.v1` 读的），整条路上**没有 `name_official` 这个概念**，也从来不碰 `committee_roster`。<br>· `/agm-pack` 整页是 `sample-roster.ts`，`api/agm-pdf` 里 `SAMPLE_UNTIL_ROSTER_INGESTION = true` 写死，每一页盖「CONTOH — JANGAN GUNA」。**挡一份盖着「请勿使用」的示范档不是合规，是表演。**<br>**教训**：`committee_roster` 从 8/19 起真的有资料了，但**没有任何东西把它接进任何一份要交出去的文件**。要让「我们不让一份缺名字的理事名单被呈报出去」这句话变成真的，得先把粘贴包那一行从 `extraction.office_bearers` 换成 `committee_roster` —— **那是动 eROSES mapping，不是加一个 if**。<br>（顺带：`api/agm-pdf` 那段「there is no committee-roster ingestion」的注解**已经过期了**，改的时候要一起改。）

- 🔴 **出路要放在失败的地方，而且要吃使用者在那一刻手上真的有的东西。** 汇入的救援本来打算只收档案。但「格式不对」那个情境里，使用者手上是**一段贴坏的文字，没有档案** —— 一条只有档案选择器能走的出路，对它要救的那个人来说是不存在的。所以 route 收 `file` **或** `text`。<br>推论：**「在开头挂警告」和「在失败处给出路」不是同一件事的两种做法，后者才有效** —— 没有人在贴之前读说明，他们先贴、再发现。

- ⚠️ **一个控制项如果不能拿掉，就改它的字。** 「切换机构」对只有一个机构的人是噪音，但那一行是 `/orgs/new` 的唯一入口，拿掉等于只有一间社团的人永远开不了分会，而且会打破 `menusCoverAllItems()`。**改成印页面本名、把机构名字印在它上面**，噪音没了、路还在。<br>凡是「这个 UI 太吵，拿掉它」，先问一句「拿掉之后，哪条路会断」。

### 关于「做完的调查」与「没人用过的画面」

- 🔴 **一份写完没有执行的审查，等於没做过。** `docs/无障碍对比度审查.md` 8/3 就把
  改动清单一二三算得清清楚楚，还写着「1–3 加起来大概 20 分钟，没有一行是逻辑」。
  然後它放了四天，直到 J 自己用了才被翻出来。**审查产出的是待办，不是成果 ——
  写完当下就该把它排进第 3 节，否则它会变成另一份「看起来很完整」的文件。**
  🔴 **而且它第二次以另一种形式重演：** 改动**写完了**、躺在工作树里，被交接文字
  一句「既有的 R1C 工作，那不是今天动的」带过，于是第 4 节第 8 项「无障碍三个色码」
  **同时**挂在待办上。8/19 深夜打开 diff 才发现它早就做完了。
  **「已写完」「已 commit」「已 push」是三个状态，交接文字要分开写这三个 ——
  合成一句「还没 commit」，下一个人就会把做完的东西重做一遍，或者永远不做。**
- 🔴 **只算「文字 vs 底色」的对比度审查，会整类漏掉边框。** 深色模式的字全部合格
  （`--v2-text` 12.38:1），坏的是 `--v2-border` 2.03:1 与 `--v2-outline-border` 2.61:1。
  使用者的描述是「看不清楚」「有点透明，有点难读」—— 听起来像字的问题，其实是
  **卡片和按钮的边界消失，画面糊成一块**。**WCAG 1.4.11（非文字 3:1）要单独算一次。**
- 🔴 **一个功能「程式写好了」不等於「使用者摸得到」。** AI 面板的输入框、送出按钮、
  `/api/chat` 全都在，坏的是外层容器一个 `md:bottom-auto`，把输入框推到视窗外。
  从程式码稽核看它是 ✅，从使用者看它是「三颗死掉的按钮」。
  **只读程式码的盘点抓不到这一类；只有真的打开画面点一次才会。**
- 🔴 **同一个元件在两个画面待遇不同，没有任何测试会抓到。** eROSES paste pack 在
  `/filings` 有复制按钮，在 `/minutes` 第 4 步没有 —— 同一个 `lib/paste-pack.ts`。
  **共用逻辑不等於共用体验。**
- 🔴 **「改四个地方」这种估算要先 grep 再写。** 审查说紫色渐层在 4 个档案，
  实际是 **42 处 / 12 个档案**。数量差一个级距，做法就该不一样
  （抽成 token，而不是手改四处）。

### 关于档案

- **档名带日期／`FINAL`／`v2` 的档案永远不会被覆盖，所以只会累积、互相矛盾。** 根目录曾经有 38 个 .md、6 份交接；`competition/` 曾经有 8 份 deck、3 份 summary、2 份问答。**一个用途一个固定档名，旧的进 `archive/`。**
- **最危险的不是旧档案，是「旧档案占着乾净的名字」。** `ai-usage-disclosure.md` 和 `qa-drill.md` 底下曾经放的是含不实陈述的旧版，修正版反而叫 `-REVISED-2026-07-29.md` —— 随手抓走的那份正好会害你被取消资格。**修正版必须拿走乾净的名字。**
- **被 gitignore 的东西，在 repo 里等于不存在。** `eval/reports/` 就是这样让「跑过 eval」这件事凭空消失的 —— Claude 会看错，评审也会。
- **`.gitignore` 挡不住已经在追踪中的档案。** 要 `git rm --cached`。（`competition/deck/` 的 `.tmp` 与 lock 档 8/5 已清掉）

### 关于 git 与环境

- **在沙盒／非互动环境不要跑任何会等待输入的指令**（`git push`、`git pull`、要帐密的东西）。加 `GIT_TERMINAL_PROMPT=0` 让它**快速失败**而不是无声地卡住。**网路操作留给本机终端机做。**
- **「已 commit」不等于「已 push」。** 交接文字只写「已 commit」，下一个 session 会假设东西在远端。**两个动作要分开写。**
- **卡住的 `git push` 会留下两种残骸，第二种会挡住之后所有 commit。** 一是**僵尸行程**（`git push` + `remote-https` + `credential-manager get` 停在那里等输入，永远不结束）；二是 **stale `.git/index.lock`**（`git commit` 直接 `fatal: Unable to create index.lock`）。处理：`Get-Process git` → `Stop-Process -Force` → 确认 lock 不存在 → 才 commit。**在 credential 提示卡住时杀掉是安全的**，那时候一个 byte 都还没送出去。
- 🆕 **沙盒的挂载点删不掉档案。** Cowork 沙盒能写 `C:\dev`，但 `rm` 会 `Operation not permitted`，所以**从沙盒跑 `git commit` 会留下 `index.lock`、`HEAD.lock` 和一批 `objects/*/tmp_obj_*`** —— 正是上一条那个会挡住之后所有 commit 的残骸。**从沙盒 commit 完，一定要从 Windows 那边（desktop-commander／终端机）清一次**，然后确认 `dir /b /s .git\*.lock` 是空的。
- **Windows 上不要用 `| head` / `| tail`，也不要在 PowerShell 里塞长引号的 git 讯息。** `head` 不存在；`git commit -m "…"` 里的括号和 `%` 会被 PowerShell 解析到爆。**长 commit 讯息一律写成档案再 `git commit -F <path>`**，路径**不要用引号包**（`\"` 会把结尾反斜线一起吃进去，git 会说 outside repository）。
- **沙盒连不到 Supabase，也下载不了二进位档**（白名单）。所以 migration 套到第几支、eval 实际跑出什么，Claude **只能读你的报告**。
- **沙盒不要 `npm install` 进你的 `node_modules`** —— 会塞进 Linux 二进位档。只能改 lock 档（`--package-lock-only`）。

### 关于程式码

- **D8 铁律：schema 先，程式码后，而且 migration 一律由 J 手动执行。** Claude 只跑验证段（纯 select／自动回滚的 do 区块）。
- **加额度只有一条路**：`select * from minit_admin.grant_ai_credits(<org id>, <增减量>);`。直接 `update orgs set extra_credits = ...` 会被资料库挡掉，连你也一样。
- **`service_role` 被刻意挡在 `minit_admin.*` 外面**（PART 2 的设计）。未来写管理后台时它**不能**直接呼叫 `grant_ai_credits`。
- ⚠️ **在 client component 里想「存完再送出」，注意 mount 当下的 state 是旧的。** `usePersistentState` 在自己的 effect 里补水，所以**同一个 commit 里的其他 effect 看到的仍是补水前的值**（`null`）。正解是**另开一个 effect 监看 state 本身**。（章程持久化差点栽在这里）
- **`/health` 在最需要它的时候会自己崩掉**（缺环境变数 → `org-chip.tsx` → `getSupabaseBrowser()` throw）。修它的优先级比看起来高。
- **`AI_MODEL_*` 的值没有冒号会被静静忽略** —— `resolveModel()` 只解析含 `:` 的值。写成 `AI_MODEL_CHAT=gpt-5-nano` 不报错，只是安静地掉回 Gemini，而你以为分流开了。**`npm run check:ai` 就是为了抓这个。**
- **剩下 5 个 npm 漏洞刻意不修**：`postcss`/`sharp` 在 next 依赖树里，`audit fix --force` 会把 next 降到 9.3.3；`uuid` 那条要把 `exceljs` 降到 3.x。等上游。
- **18 张表有 11 张从来没有任何程式写入过**（`extractions`/`expenses`/`events_meetings`/`deadlines`/`einvois_packs`/`remittance_batches`/`paste_packs`/`committee_roster`/`qa_log`/`reminders`/`rsvps`）。画面上看起来能用，重开就没了。（`constitutions` 8/5 已补上，所以是 11 不是 12）

### 关于两棵树、交接与 commit

- 🔴 **一份 STATE.md，覆盖它。** 8/13 Codex 另写 `OVERNIGHT_LIVE_STATUS.md` 而没更新 STATE.md，结果 8/18 接手的人读到**过期两代**的事实（8 支 migration vs 实际 24 支）。同一件事只留一个说法。
- 🔴 **「在哪一棵树上写的」和「哪一棵树真的在跑」是两件事，而且会分岔。** 8/13 通宵与 8/18 白天的工作都在 champion 工作树，但 J 日常跑的是 master —— 所以「已完成」的东西**一次都没有在会真的打供应商的 app 上跑过**。<br>**分辨方法是看档案，不是看文件**：`.env.local` 在哪一棵、`.next/dev` 今天有没有被写过、同一个档案两边的 bytes 与时间戳差多少。
- 🔴 **一个陈旧的 `.git/index.lock` 会静静挡住所有 commit，而 `git status` 照常能跑。** 2026-08-18 发现 master 的 `.git\index.lock` 停在 **08/12 12:58**，零 bytes，没有任何 git 行程在跑 —— 也就是说 **master 从 8/12 起六天不能 commit，而没有人发现**，因为大家只跑 `git status`（唯读路径不需要拿锁）。<br>**处理**：`tasklist | findstr /I git` 确认没有僵尸行程 → `del .git\index.lock` → 再 commit。**收工前顺手 `dir /b /s .git\*.lock` 看一眼是空的。**
- **`office_bearers` 不是普通栏位，它是法定申报栏位。** 它映射到 eROSES 的「Senarai Ahli Jawatankuasa」＝呈报社团注册局的理事名单。任何「职务→人」形状的东西看起来都能塞进去，但**只有社团常设理事职位可以**；一次性的活动分工进去就是**不实呈报**。放东西进去之前先看 `src/prompts/eroses-map.ts`。
- **master 的档案行尾是 CRLF/LF 混合**（`.gitattributes` 规定 git 里存 LF）。改档案的脚本要保留原本的行尾，`git add` 时看到 `CRLF will be replaced by LF` 是正常的。
- **贵的 agent 与便宜的 agent 分工**：<br>**便宜的可以做** —— 截图整理、公开文件那一包、英文校对、字数页数连结检查、跑测试贴结果、访谈逐字稿整理。<br>**一定要用贵的** —— 碰 prompt／schema／eROSES mapping、claim 真伪审查、部署与安全边界、eval 结果诠释、钱的逻辑。

---

## 7. 分工

| 谁 | 做什么 |
|---|---|
| **J** | 手贴 migration 到 Supabase SQL Editor 按 Run · 开付费帐号与 key · 拍真实手写样本 · **所有 `git push`** |
| **Claude Code（本机）** | 改程式码 · 跑 `tsc` / `vitest` · 真正的 build 与 dev server |
| **Cowork（沙盒）** | 读写文件 · 审计 · 产报告 · 小脚本与资料转换。**不要拿它 build 这个 app**（2 vCPU / 3.9GB RAM，而 repo 有 1.2GB） |
| **Cowork + desktop-commander** | 挂着这个 MCP 时，Cowork 就能在**你本机**跑指令（`npm test` / `npm run build` / `tsc` / `git commit` 都这样跑过）。所以「测试还绿不绿」「build 通不通」**可以当场验证，不必再猜**。<br>⚠ 仍然**不要跑会等输入的指令** —— 会卡住，而且留下第 6 节那两种残骸 |

J 手贴 migration 的步骤：记事本开档 → `Ctrl+A` `Ctrl+C` → Supabase SQL Editor 中间程式码区点一下 → `Ctrl+A` `Ctrl+V` → 右上角绿色 **Run** → `Success. No rows returned` 就是成功；红字整段贴给 Claude。

---

## 8. 文件地图

| 位置 | 放什么 |
|---|---|
| 根目录 | `CLAUDE.md`（规则）· `STATE.md`（这份）· `BUILD_PLAN.md`（阶段）· `PROMPTS.md` · `DEPLOY.md` · `README.md` · `AGENTS.md` —— **只有这 7 个** |
| `docs/` | 还在用的参考：`DECISIONS.md`（D1–D8 + 安全五条）· **`功能盤點-計劃vs實作.md`**（「程式码上还有什么没做」，固定档名，下次盘点覆盖它）· 🆕 **`UX-问题清单.md`**（「**使用者眼中**哪里不对」，J 亲自走一次系统的 20 条，固定档名，下次覆盖它 —— 跟功能盘点互补：一个从程式码看，一个从画面看）· 🆕 **`UX决策-D1D2D4-计划.md`**（J 答完三个决策题之後的执行计划，**下一个 session 的起点**）· `换模型手册.md` · `AI-API-选型与成本.md` · `收据字号与接号-计划.md`（待批准）· `持久化-custody-计划.md`（待批准）· `审计-2026-08-03-补充发现.md`（P0/P1 细节）· `无障碍对比度审查.md` · `HOW_MINIT_WORKS.md` · `MOBILE_APP_SETUP.md` |
| 定价／毛利 | **`src/lib/unit-economics.ts` + `npm run economics`。** 讲毛利以这里为准，不要再手抄数字进任何文件 |
| AI 分流设定 | **`.env.example` 的 `--- AI: which model does which job ---` 那一段**（两段可贴的区块 + 三个陷阱）+ **`npm run check:ai`**（检查贴了有没有真的生效） |
| 🆕 **「到底做了没有」** | **`npm run status` / `scripts/status.mjs` / 双击 `status.bat`。** 现场问 git、Supabase、Gemini 与程式码本身，唯读。**任何「这件事做了没」的问题，先跑它，不要读这份文件。** 分 `[ 做了 ]／[ 没做 ]`（程式刚查的）与 `[ 人眼 ]`（没有 API 回报得了，附上看的日期）。 |
| 🆕 给 J 双击的 `.bat` | `status.bat`（上面那支）· `salin-migration.bat`（把 migration 以 UTF-8 复制到剪贴簿，`type \| clip` 会把中文注解弄成乱码）· `salin-env-vercel.bat`（把 `.env.local` 的 12 行以 Vercel 吃得下的格式复制到剪贴簿，**不印出任何 key**；贴完记得复制别的东西盖掉剪贴簿）· `push-cabang.bat`（**只推 commit，不 `git add -A`**）。<br>🔴 **`push-to-github.bat` 现在不能用** —— 它的 `git add -A` 会把 `r1-output/_presentation_work/node_modules/` 等 4,069 档／96.5 MB 一起 commit（那些路径没被 gitignore）。 |
| 🆕🔴 **产品缺口（现在的施工依据）** | **`docs/产品缺口盘点.md`** —— J 2026-08-20 走一次系统的 23 条，**每一条都回到 `src/` 查过并附行号**，另有实测的资料表笔数、依赖图、三个可交付形状、明写「不做什么」、每一项的验收条件。**固定档名，下次盘点覆盖它。**<br>⚠️ 它**取代** `docs/UX-问题清单.md`（2026-08-07 的 20 条版本）。那一份**还留在磁碟上没有被删**（它从来没进过 git，删了找不回来），旧 20 条的下场收在新文件第 6 节。**J 确认后再把它移进 `docs/archive/`。** |
| 🆕 **上线与截图** | **`docs/上线与截图-给J的步骤.md`** —— Vercel 上线（含「预设分支是 8/07 旧版」那个坑）＋ 逐张截图清单（去哪一页、画面上要有什么、存什么档名、打勾哪一条证据）。**固定档名，下次更新覆盖它。**<br>⚠ 它取代了 `competition/screenshot-shotlist.md` 的实务部分 —— 那一份停在 7 月，还没有 `/members`、`/glossary`、汇入两条路、深色模式。 |
| `docs/archive/` | 历史报告与旧交接。**不是事实来源，只在考古时读。**<br>⚠ 其中 `2026-08-05-现况报告.md` **停在 75.4%**，是当天傍晚的版本；晚上改成 73.4% 之后没有回头更新它。**要引用毛利就回来看这份 STATE 或跑 `npm run economics`，不要引用那份报告。** |
| `competition/` | 顶层 = 要交出去的当前版；`competition/archive/` = 旧版，**不要从那里拿东西交件**。deck 只有 `Minit-Pitch-Deck-CURRENT.pdf`／`.pptx` 一份，问答只有 `qa-drill.md` 一份 |
| `eval/reports/` | 整个资料夹被 gitignore（PDPA）。**只有 `SUMMARY.md` 例外**，那是要给评审看的聚合数字 |
| `legal/` `supabase/` | 原样不动 |
| `C:\dev\_backups\` | 整包备份（不含 `node_modules` / `.next`，含 `.git`）。8/05 两份各约 18 MB，8/18 另有两份 pre-Cowork 的 src 备份（`champion-worktree-src-20260818-precowork.tar.gz`、`minit-master-src-20260818-precowork.tar.gz`，都是**改动前**的状态） |
| `C:\dev\` 顶层 | `MINIT_全局进度盘点_20260818.md`（竞赛面的盘点 + 13 天作战计划 + agent 成本分工）· `gpt handoff\`（外部审查的路线图、8/14 官方规则快照、提交 gate、决策清单 —— **竞赛层面唯一完整参考**）· `GPT PRO OPINION\`（37/100 的来源）<br>⚠️ `MINIT_HANDOFF_20260818.md` **已被这一份 STATE.md 取代**，不要再当事实来源（它还躺在 `C:\dev\` 顶层，J 要不要移进 archive 由他决定）。<br>⚠️ 8/19 深夜另有一份 `HANDOFF20260819.md` 只存在于对话里、**没有落到磁碟上**，内容已全部并进这一份，不必再找。<br>**不要再新增带日期的交接档 —— 那正是这一份要取代的东西。** |

---

## 9. 重要日期

| 日期 | 什么事 |
|---|---|
| ~~2026-08-19~~ | ✅ **已解除。** `ai_usage_cost` migration 8/18 已套用，成本数字**从 8/18 起开始累积**，九月初审前会有约两周的真实资料 |
| **2026-08-31 23:59 MYT** | 🔴 **竞赛截止**（依 8/14 官方快照，提交当天必须重新上 portal 核对）。**内部 cutoff 建议 8/31 18:00** |
| 2026-08-31 | Claude Sonnet 5 促销价 $2/$10 结束，9/1 起 $3/$15 |
| 2026-09 | 线上初审 |
| 2026-10 | 半决赛 Demo Day（KL，**现场**）→ `competition/qa-drill.md` 那 17 题要练到不看稿 |
| 2026-11 | 总决赛 |
| 每月 | Vercel 从 7 月起每月固定发安全版 —— 收工清单加一条「看一次 Next.js 安全公告」 |

（报名费级距已不适用 —— 已报名。唯一残留：若报名费尚未缴清，费率看的是**缴费**时间点。）

---

## 10. 更新这份文件的规则

结束一个 session 前：

1. **覆盖**第 1 节（状态快照）、第 2–4 节（下一步）、第 5 节（未决问题勾掉已答的）
2. 新踩到的坑写进第 6 节
3. **不要新增 `YYYY-MM-DD-下一个session从这里开始.md`。** 那正是这份文件要取代的东西
4. 完整的过程报告如果值得留，放 `docs/archive/`，然后在这里留一行指路就好
5. 🆕 **写「现在是什么」，不要写「上一版写错了，其实是什么」。** 更正的过程属于 commit 讯息，不属于这份文件 —— 一层层叠上去，读的人会越读越不确定。同一件事只留一个说法。
