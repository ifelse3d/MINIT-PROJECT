# STATE.md — Minit 的当前状态

> **这是唯一的「现在在哪里」。**
> 每个 session 结束前**覆盖更新这一份**，不要新增带日期的交接档案。
> 规则在 `CLAUDE.md`，阶段在 `BUILD_PLAN.md`，历史在 `docs/archive/`。
> 🔴 **给 J 的东西写进 `C:\dev\_J-要做的事\`，不要写在这里。**

**最后更新：2026-08-28 凌晨（MYT）· Fable 5（31 号单自动接力·场次 1：两个遗留档收尾 → Stage P 全部 → Stage R 全部 → Stage A 全部）**
**🔴 31 号单（`C:\dev\_J-要做的事\31-上線後修理總單-20260827.md`）场次 1 已全部勾完；下一场＝场次 2（Stage B 钱区＋migration 26）。**
**给 J 看的这一轮报告：`C:\dev\_J-要做的事\25-大改造進度報告.md`（固定档名，已覆写）。**

---

## 🌙 现在在哪里（2026-08-28 凌晨，场次 1 收工）

> **已上线**：https://minit-project.vercel.app（Vercel 专案 if-else/minit-project）。
> push 到 main 自动重新部署——**push 是 J 的事**（push-cabang.bat）。
> 线上资料库两个 org（15「J」、58「avocado」），migration 1–25 全部 APPLIED。
> **本场 6 支 commit、全部未 push**：
> `29fd9d8`（上轮遗留两档收尾，上一手已 commit）· `1349612`（P-1）·
> `371fb06`（P-2..P-4）· `7e44a54`（Stage R）· `8049833`（Stage A）·
> `d60c4a8`（STATE.md 收工）。
> 🔴 **migration 26 还没写**——那是场次 2（Stage B）唯一授权的一支。

### 现场量到的（不是听说的）

- 四道关（P、A 两个代码 Stage 收尾各跑一次）：`tsc` **0** · `eslint` **21（与基准
  逐字相同：20 errors + 1 warning）** · `vitest` **783 全过（64 档；本场 +17 个新测试）** ·
  `build` ✓
- `e2e:money` 本场跑了两次（P 收尾＋A 收尾）：**15/15、15/15**，page errors 0。
- ⚠ **没能验证的**：P-1 的修复没法在本机复现 Vercel 的 60 秒击杀（deadline 逻辑
  有单元测试＋route 测试，但「真被掐时 504 有没有到达浏览器」要等线上再遇一次才算
  实证）；/admin 的三种小计要等线上有带 provider/model 的新流量才看得到内容；
  A-1 的骨架只在 build 里验证了产出，没起 dev server 逐页点过。

### 这一场做了什么（P-1 断线案结论在 31 号单 P-1 条目里，一句话版见下）

- **P-1 断线＋ai_usage id=5 合案**：结论＝route 重试链（最坏 6 次 20 秒呼叫＋backoff）
  超过 Vercel maxDuration=60s，函数被平台掐死后退款/app_errors/回应一行都跑不到。
  修法三件套：①所有 AI route 共用 50 秒 vendor 预算（`ROUTE_AI_DEADLINE_MS`，
  postVendorJson 把每次尝试上限压进剩余预算、不够就抛 `VendorTimeoutError`，
  留 10 秒给退款＋记录＋回应）②新 `src/lib/ai/vendor-failure.ts`：任何厂商失败
  **先落 app_errors 再回应**（吞错是 id=5 查无可查的根因）；/api/ask 两步失败
  以前不退款不记录，一并修正；/api/chat 工具回退/规则7重试也记录了 ③逾时回 504
  「这次不算、已退回」（只在真退款的路上说）；ask-box 把「网络断了」和「伺服器
  没回应」分成两句真话。9 个新测试。
- **P-2 /health 补 OpenAI**：`routedProviders()`/`requiredAiKeyEnvVars()` 进
  provider.ts，/health 和 check:ai 读同一份逻辑（不再两套）；4 测钉死
  「chat 路由指 openai 而 key 缺时 /health 必须红」。
- **P-3 全站 MYT**：`formatMytDateTime()`（固定 +8、印「MYT」、坏输入回 —）进
  lib/history.ts＋4 测；修掉 /admin 两处生 UTC slice、/inbox 与 /minutes/history
  两处无时区 toLocaleString；审计行/日历/保管核对过本来就对。
- **P-4 /admin 那包**：select 补 provider/model/action/tokens（带两级降级退路）；
  每 org「供应商·模型·动作」三种小计（TS 加总，"?" 列印出来——null provider 正是
  id=5 的签名，要让操作者看见）；成本 6 位小数＋RM 固定估算（1 USD≈RM4.70，写明）；
  侧栏「管理台」入口（新 `src/lib/admin-gate.ts`，server 只传布林；/admin 404 不动）；
  /admin 全页接 <Tri>；feedback 空状态不再怪 migration 25。
- **Stage R 规则同步**：DECISIONS.md 新增 **D18–D21**（姓名预设全显／付款方式＋
  交现金改保管页／品牌杠杆／e-Invois 直接可交）；CLAUDE.md Hard Rule 5 就地注记
  指向 D18；HOW_MINIT_WORKS.md 两句过时陈述就地修正。
- **Stage A 体感**：15+1 支 loading.tsx（共用骨架 `src/components/route-loading.tsx`），
  换页立刻有反应；问一问面板头部重排三行；开场白从「我看不到您的记录」（8/22 起
  就是假话）换成「可以问记录，答案附出处」；/more 语言排旁补三语并排开关的指路；
  侧栏机构卡改「当前机构：X · 切换 →」可点（/more 同款，e2e 断言同步）。

### 🔴 J 的事（场次 1 结束时）

1. **双击 `push-cabang.bat`**（本机 main 领先 origin 6 支 commit）→ 1~3 分钟后
   线上自动更新 → 开 /health 看全绿（现在会检查 OPENAI_API_KEY 了——如果它变红，
   是 Vercel 环境变量缺 key，不是坏了）。
2. **两个地区核对**（治「换页慢」的另一半，步骤在 25-報告）：Vercel Settings →
   Functions → Region 和 Supabase Settings → General → Region 各抄一个贴给 Claude。
3. 开新对话贴 31 号单 §10 的灰框 → 场次 2（钱区＋migration 26）。
4. ⚠ **8/31 23:59 竞赛截止（内部 cutoff 18:00）——还剩 3 天**；one-pager 的 [YOU]
   两处还空着（正式 URL 已有：https://minit-project.vercel.app）。

### ❓ 未决问题

1. 🔴 Vercel/Supabase region 是否同区 —— 等 J 抄来两个值（§1-5；不同区=每击多几百 ms）
2. 助手本身用哪个模型 —— 建议 `openai:gpt-5.6-luna`，等 bench（场次 5，真手写之后）
3. 法律实体（金流前置，D12），试点前要答
4. 真实手写 eval：92.9% 量的仍是印刷体。J 拍照后重跑 `npm run eval`（场次 5 D-b）
5. Supabase 邮件模板（顺延：等网域＋SMTP）；Supabase Site URL 还停在 localhost
   （31 号单 §11，J 一分钟改）

### ⏭ 下一个 session 从哪开始

**31 号单场次 2：Stage B 钱区大整修（B-1～B-10）**，含 migration 26
（donations.payment_method + transfer_proof_path——那一场唯一授权写的 migration）。
之后场次 3（Stage C＋D-a）→ 场次 4（E＋F＋G-1/G-2）→ 场次 5（早上 J 在场：
D-b 照片、bench 实跑）。贴 31 号单 §10 的灰框开工即可，单上已勾的不重做。

---

## 6. 已知陷阱（踩过的，别再踩）

### 2026-08-28 凌晨新增（31 号单场次 1）

- 🔴 **serverless 函数被平台掐死（maxDuration）之后，你的 catch/finally 一行都不会跑。**
  「每次呼叫各有 20 秒 timeout」不等于「整个 route 会在 60 秒内结束」——重试×2、
  规则 7 再来一轮、classify+extract 两步，加起来轻松破 60。被掐死的函数不退款、
  不落 app_errors、不回应，用户看到「断线」，帐上留一笔全 null 的扣费（id=5）。
  **判断方法：任何「循环里呼叫外部服务」的 route，先算最坏情况总时长，再和平台的
  硬顶比；预算要从 route 顶上传下去共用，并留出收尾（退款/记录/回应）的时间。**
- ⚠️ **测「时间预算」逻辑时，mock 是瞬时的——预算永远不会自然缩小。** 第一版测试
  给了 2.5 秒预算＋三个瞬时 503，期望「跑不满三次」，实际三次全跑（每次都不花时间）。
  正解：让**投影的 backoff** 去吃预算（backoffMs 传非零值），或者操纵时钟。
- ⚠️ **`catch {}`（不绑变量）是搜索「吞错点」的好线索。** 这次 grep `catch \{` 一口气
  找出 8 个 AI route 里的静默吞错；修完之后新规矩是：AI route 里的厂商失败一律走
  `vendorFailureResponse()`（记录＋回应），退款留在 route 里贴着它要退的那笔 charge。

### 2026-08-27 凌晨新增（27 号单通宵那一轮）

- 🔴 **PowerShell 改档的编码坑，指定输出编码还不够——`Get-Content` 读入也要
  `-Encoding utf8`，缺一头照样把中文搅成 `é™ˆå¤§æ˜Ž`。** 8/25 的教训写的是「进出都
  指定」，8/27 又踩了一次：只给 `Set-Content -Encoding utf8`，读入没给，两个测试档
  的中文和 em-dash 全毁（系统的档案变更快照当场露馅，Write 全文重写才救回）。
  **正解：批量替换用 `[System.IO.File]::ReadAllText/WriteAllText` 明示 UTF8，或干脆
  用 Edit/Write 工具逐档改。**
- ⚠️ **e2e 的 Supabase cleanup 段偶发 `fetch failed`（网络瞬断）不是产品坏了。**
  8/27 第一跑 14 条全 PASS 后在删测试 org 时断网 exit 2；重跑 15/15。脚本用固定
  测试帐号/org 名，重跑自己会收拾上一次的残留。**一次失败先重跑再下结论**（8/23
  git push 那条的同款）。
- ⚠️ **PDF 内容流是压缩的——别对 `buildXxxPdf()` 的 bytes 做字串断言。** 8/27 想
  grep「DERMA BARANGAN」进 raw bytes，Flate 压缩后根本不可见（CJK 还会走子集字型的
  glyph id）。**正解：把「文件上该印什么」的决策抽成纯函数（receiptBoxContent 那样）
  直接测，PDF 本体只验「能 load、页数对」。**

### 2026-08-25 深夜新增（session 2，D～W 那一轮）

- 🔴 **同一个事实有两条解析路（server 一条、client 一条），只改一条就会自相矛盾——
  而且没有测试会抓到，因为两条各自都「对」。** active org 的解析 server 端是
  cookie → 第一个 membership → null（`getActiveOrg()`），client 端原本只有 cookie
  → null（`useActiveOrg()`）——fresh session 没 cookie 时页首印机构名、侧栏却叫人
  「填写您的机构名称」。修法是把 fallback 复制到 client 并在两边都 `order by org_id`
  钉死「第一个」是同一个；防再犯靠 e2e 的 fresh-session 检查（拿掉修正实测会红）。
  **判断方法：凡是「client 也要显示 server 算出来的东西」，先问 client 是重算还是
  重用——重算的就要逐条对齐 server 的 fallback 顺序，并留一个 fresh session 的测试。**
  （0-5 又补了一刀：client 版当时还漏了「跳过指向已删 org 的孤儿记录」这一层。）
- 🔴 **「每一页都窄」的时候，先查最外层的壳，再查页面。** 全站九个页面在 1920 上
  都挤在 896px 里，而每一页自己明明写着 max-w-5xl 或 7xl —— 因为 shell 的
  `<main>` 有一个 `max-w-4xl` 把所有人都箍住了。**页面内的容器改多宽都没用，
  外层不放开一格都出不去** —— 而且没有任何页面的 diff 会显示这件事，因为问题
  不在任何页面里。判断方法：版面问题先从 DevTools 由外往内看第一个变窄的元素，
  不要从页面组件由内往外猜。
- 🔴 **验证「刻意不持久化」的状态，不能用整页跳转。** e2e 里 `page.goto()` 去
  /minutes/document 之后示范模式消失了 —— 那不是 bug，示范本来就故意不写
  localStorage（0-1）。**full navigation 会把你正要验证的 React 状态洗掉**；
  要像人一样走 SPA 的链接（`page.click('a[href=…]')`）。同理反过来：一个「重载
  后就消失」的现象，先问那个状态是不是本来就设计成不落盘。
- ⚠️ **断言要对准「机制」，不是对准你想像的实现。** 「示范唯读」的机制是
  **按钮根本不渲染**（0-1 明写「no buttons at all, rather than buttons that do
  nothing」），而 e2e 第一版去验「按了没效果」——按钮数=0，断言失败，看起来像
  产品坏了。写断言之前先读那段代码旁边的注解，验它**真正承诺的形状**。
- ⚠️ **表单自带的 `window.location.assign()` 会把紧跟着的 `page.goto()` 撞成
  ERR_ABORTED。** /orgs/join 成功后 1.2 秒自动回首页；脚本要先等这个重导落定
  （轮询 url），再去下一个地址。

### 2026-08-23 新增（拆页那一轮）

- 🔴 **一个「卡住」的指令，先把它丢去背景跑完，再下结论说它坏了。** 8/23 凌晨 `git push` 每次都在 30～240 秒的 timeout 里被杀掉，看起来像卡死。我据此写了一整节「J 的 GitHub 凭证过期了，要你登入一次」放进 `17-要你做的事` —— **那会让 J 白做一次登入去修一个不存在的问题**。真相是 push 只是**很慢**（好几分钟）；丢背景的那几支后来自己跑完了。
  🔴 **而且我的「验证」让事情更糟**：我用 `GIT_TERMINAL_PROMPT=0 git ls-remote` 去证明是凭证问题，它回了 `could not read Username` —— 但那个旗标**本身就关掉了 Credential Manager 静默取用已存凭证的路**。**用一个会改变行为的旗标去验证故障，验出来的是那个旗标的行为，不是故障。** 要验就用不改行为的方式（丢背景、加长 timeout、看 exit code）。

- 🔴 **同一个 localStorage key，两个 `usePersistentState` 不会同步 —— 而且是无声的。** 每个实例各有一份 React state：两个组件同时挂载，各自在 mount 时读一次 key，然后**再也听不到对方写了什么**。第二个组件的写回 effect 会拿它那份过期的清单盖掉第一个的编辑。拆 `/money` 的时候最顺手的做法就是每页各自 `usePersistentState`，而那会让**钱无声无息地变回去**。正解是 **layout 里一个 Provider 拥有那份状态**（`src/app/money/register-store.tsx`）。<br>**判断方法**：任何「把一页拆成好几页」的工作，第一个问题是「这份状态谁拥有」，不是「JSX 怎么搬」。
- 🔴 **程式一定会有一段时间比资料库新 —— 而 PostgREST 只要被问到一个不存在的栏位，整个 query 就失败。** J 是自己手动跑 migration 的（D8），所以「写好写入端」和「资料库真的有那些栏位」中间永远有一段时间差。这一段时间里，一个 `select` 多要了一个还不存在的栏位，**整页会变空白** —— 而空白的行事历跟「这个社团没有活动」长得一模一样。<br>**做法**：每一支 action 都回传结果物件、**绝不 throw**，把「存不进去」当成正常结局由 UI 说一句话。（27 号单整晚照此办理：expenses/feedback/分人/实物全部带 fallback select 或 db_behind 一句话；顺手还发现收据历史页本来就缺这层，补了。）
- 🔴 **「写进资料库」不是一个答案，是三个不同的答案。** 同一批工作里，`events_meetings` 和 `remittance_batches` 真的需要写；`deadlines` **不需要** —— 死线是**算出来的**，两个输入都已经在资料库里。把算出来的东西再存一份，是**第二份可能跟第一份不一致的资料**，比不存更糟。真正缺的是另一半：`status = 'done'` 的打勾。<br>**判断方法**：先问「这份资料是记录的，还是推导的」。推导的东西同步的是**人的决定**（打勾），不是数字本身。
- 🔴 **失败要「说出来」，不能只是退回本机。** 每一处降级都配一句话（「这个只存在这台设备上，其他委员看不到」）。**静静地不同步是最坏的一种成功。**
- ⚠️ **一个回圈跑不完不会 throw —— 它会花钱。** 助手的 function calling 每一轮都是一次计费的厂商呼叫。`MAX_TOOL_ROUNDS = 3` 是**帐单的上限**。**判断方法**：任何「问模型、拿结果、再问模型」的结构，先写停止条件的测试，再写功能。
- ⚠️ **写得出来不等于验得了。** function calling 的两家 wire format 照官方文件写、有单元测试保证一致 —— **但没有对着真实 API 呼叫过一次**。**这种情况要讲清楚是「一致」不是「验证」**（`18-HANDOFF` 第 3b 节有症状表）。

### 2026-08-20 新增

- 🔴 **画面允许输入的东西，比 schema 和资料库允许的多 —— 中间那一截没人守。** 共用的纯文字 `<input>` 套在 enum/日期栏位上，J 填了 `event meeting` 和 `2/2/2026`，画面收下，后端双双 parse 失败。**判断方法**：凡是共用输入元件被套在有型别的栏位上，问一句「这个框吐得出来的值，schema 收不收」。
- 🔴 **「Never leak the cause」是给伺服器故障的，不是给使用者输入错误的。** 拒绝一个输入，要在拒绝的那一刻讲清楚哪一格、为什么、怎么改。
- 🔴 **「这一页是空的」先去数资料表，不要先怀疑页面。** 「功能缺失」的回报，第一步是数一次资料，第二步才读程式码。
- 🔴 **一份文件写着「刻意还没动」，那件事的时机就会由使用者替你决定。** 「刻意不做」要连带写一句「在它被撞到之前，使用者会看到什么」。
- 🔴 **「先讨论，还不要开工」就是不要开工 —— 包括「只是先改一点点」。** 开工许可必须是新的一句明确的话，不能从别的句子推论出来。
- ⚠️ **一支未批准的 migration 留在 `supabase/migrations/` 可以，但要确认没有任何东西指向它。** 判断方法：`grep` 一次那个档名。

### 关于「事实」怎么腐坏

- 🔴 **一个「有公式」的数字，不等于一个诚实的数字。** 公式让数字可重算，不会让假设变成真的。换模型要问「这一格换了会不会影响准确率」。
- 🔴 **「我们今天跑的是 X」是一个假设，不是一个事实 —— 除非你让程式去问。** `npm run check:ai` 就是那支程式。**凡是「我们现在用的是…」这种句子，都要有一个能跑的指令去证明它。**
  🔴 **2026-08-19 深夜这一条在 STATE 自己身上应验过：** 交接清单列着 J 当天已做完的事，Claude 照念。**交接清单上每一条「J 要做的事」，交出去之前先跑一次能证明它还没做的指令**（`npm run check:ai` · `node tmp\gemini-ping.mjs` · PostgREST `?select=<栏位>&limit=1`）。
- 🔴 **「预设分支」是另一个会安静腐坏的事实。** 把 repo 接给外部服务，第一件事是问「它会拿哪一根 branch」。（新 repo 预设分支已是 main，26 号报告实测过。）
- 🔴 **一个没人跑的指令，坏了也不会有人知道。** 待办清单上「跑一下 X」的项目，先确认 X 今天还跑得动。
- 🔴 **报告要印「实际解析到什么」，不要印环境变数。** 一个准确率数字旁边没有确切的 model id，等于没有量过。
- 🔴 **换掉一个预设值，等于让所有量测过的东西悄悄失效。** 改模型要连带问「这让哪些量测作废了」。
- 🔴 **价目表会腐坏，而且是「促销到期」这种有日期的腐坏。** 每次加模型进价目表，连「查证日期」和「促销到期日」一起写。
- 🔴 **一把 key 在画面上找不到，不等于它不存在。** 找一个能跑的指令去问，不要看画面。
- 🔴 **报价的情境要先确认「这个帐号我们有没有」。**
- 🔴 **「某天跑不通」不等于「坏了」，交接文字会把它冻成永久事实。** 记录失败要写「在什么条件下失败」。
- 🔴 **「二进位档我改不了」是同一类被冻住的结论。** 先把未改动的档重汇一次跟原档比对，证明工具链不走样，再谈改字。
- ⚠️ **一次失败的现象不要直接写成永久结论。**
- ⚠️ **要说「eslint 零问题」之前，先跑一次基准。**（现行基准：21 = 20 errors + 1 warning。）

- 🔴 **一支写好却没有任何呼叫者的 prompt，等于这个功能不存在 —— 而旁边的注解会让人以为它存在。** 判断一个功能在不在，`grep` 它的呼叫者，不要读它旁边的注解。
- 🔴 **模型会安静地漏掉，而且漏掉的时候输出看起来最漂亮。** 修法不是把 prompt 写得更用力，是让模型只做「分组＋措辞」并回传编号，程式再验证每个编号恰好出现一次。
- 🔴 **prompt 里让模型自由写散文的地方，就是它会捏造的地方。** 凡是「让模型总结一下」的栏位，先问「这一句被捏造了，谁会发现」。
- 🔴 **「不准改名字」是指令，不是保证。** `checkNames`：输出里每一串中文必须逐字出现在来源或词库里。
- ⚠️ **一道检查如果会误杀正确结果，就不要装上去。** 中文版明白地跳过 checkNames 并写清楚，不是假装有。
- ⚠️ **动 prompt 之前先问「这让哪些量测作废了」。** 词库为空时 prompt 逐字不变，并有测试守着。（27 号单同款：D-2 的类型预填只动读完的结果，extract prompt 一字未动。）

- 🔴 **只从设定页连过去，等于没有入口。** 每天用的东西要有侧边栏一行。
- 🔴 **新页面先看一眼真实宽度再说做好了。**
- 🔴 **「加一笔」的表单要放在它要加进去的那张卡里面。**
- ⚠️ **`<Tri>` 印的是字串，不是 Markdown。** 写完文案要在画面上读一次。
- 🔴 **批次汇入宁可整批拒绝，不要只加一半。**
- 🔴 **给了上传按钮，就要吃使用者手上真的有的档案。**
- 🔴 **能用程式解析的，不要送去 AI。** 画面上写明「这是程式读的，不会用掉您的额度」。
- ⚠️ **试算表里的空格是「位置」，不是「没有」。**
- 🔴 **「哪一条路会花钱」要写在按钮上，不是写在说明里。**
- 🔴 **AI 读出来的东西不要直接进资料库。** AI 出稿、人确认才写。
- 🔴 **`name_official`（IC 上的名字）不是翻译，不可以放进词库、更不可以让模型生成。** 独立栏位、人手照 IC 抄。（G-1 已把它接进 eROSES 贴上包——缺就挡在申报。）
- 🔴 **一条合规规矩挂上去之前，先 grep 它要挂的那个东西是不是真的存在。**（8/19 那条「贴上包读 roster」的计划 8/27 才真的接上——接的时候就是「动 eROSES mapping」那种改法，不是加一个 if。）
- 🔴 **出路要放在失败的地方，而且要吃使用者在那一刻手上真的有的东西。**
- ⚠️ **一个控制项如果不能拿掉，就改它的字。** 先问「拿掉之后，哪条路会断」。

### 关于「做完的调查」与「没人用过的画面」

- 🔴 **一份写完没有执行的审查，等於没做过。** 审查产出的是待办，不是成果。**「已写完」「已 commit」「已 push」是三个状态，交接文字要分开写。**
- 🔴 **只算「文字 vs 底色」的对比度审查，会整类漏掉边框。** WCAG 1.4.11（非文字 3:1）要单独算一次。
- 🔴 **一个功能「程式写好了」不等於「使用者摸得到」。** 只有真的打开画面点一次才会抓到。
- 🔴 **同一个元件在两个画面待遇不同，没有任何测试会抓到。** 共用逻辑不等於共用体验。
- 🔴 **「改四个地方」这种估算要先 grep 再写。**

### 关于档案

- **档名带日期／`FINAL`／`v2` 的档案永远不会被覆盖，所以只会累积、互相矛盾。** 一个用途一个固定档名，旧的进 `archive/`。
- **最危险的不是旧档案，是「旧档案占着乾净的名字」。** 修正版必须拿走乾净的名字。
- **被 gitignore 的东西，在 repo 里等于不存在。**
- **`.gitignore` 挡不住已经在追踪中的档案。** 要 `git rm --cached`。

### 关于 git 与环境

- **在沙盒／非互动环境不要跑任何会等待输入的指令。** 网路操作留给本机终端机做。
- **「已 commit」不等于「已 push」。** 两个动作分开写。（本轮：**全部已 commit、全部未 push**。）
- **卡住的 `git push` 会留下僵尸行程与 stale `index.lock`。** `Get-Process git` → `Stop-Process` → 确认 lock 不在 → 才 commit。
- 🆕 **沙盒的挂载点删不掉档案** —— 从沙盒 commit 完要从 Windows 清 `.git\*.lock`。
- **Windows 上不要用 `| head`；长 commit 讯息写成档案再 `git commit -F <path>`，路径不要用引号包。**
- 🔴 **PowerShell 批量替换源码档：读和写都要明示 UTF-8**（见 8/27 新增那条——8/25 的教训只做一半照样炸）。
- **沙盒连不到 Supabase，也下载不了二进位档。** migration 套到第几支、eval 跑出什么，Claude 只能读报告。
- **沙盒不要 `npm install` 进 `node_modules`。**

### 关于程式码

- **D8 铁律：schema 先，程式码后，migration 一律由 J 手动执行。**
- **加额度只有一条路**：`minit_admin.grant_ai_credits(...)`。（K-3 的 `admin_grant_credits` RPC 是这条路**之上**的有审计包装，不是第二条路。）
- **`service_role` 被刻意挡在 `minit_admin.*` 外面。**（admin_grant_credits 用 SECURITY DEFINER 走 owner 权限＋自己验 platform_admins，正是为了不破这条。）
- ⚠️ **client component 里「存完再送出」，mount 当下的 state 是旧的。** 另开一个 effect 监看 state 本身。
- **`AI_MODEL_*` 的值没有冒号会被静静忽略。** `npm run check:ai` 抓这个。
- **npm 漏洞剩 2 个（exceljs/uuid）刻意不修**：`audit fix --force` 会把依赖降破。等上游。
- **「从来没有程式写入过的表」清单已大幅缩短**：expenses（Stage E）、member_groups（8/23）、feedback/credit_grants/platform_admins（migration 25 后）都有写入端了。剩 `extractions`/`einvois_packs`/`paste_packs`/`qa_log`/`reminders`/`rsvps` 仍无写入端。

### 关于两棵树、交接与 commit

- 🔴 **一份 STATE.md，覆盖它。** 同一件事只留一个说法。
- 🔴 **「在哪一棵树上写的」和「哪一棵树真的在跑」是两件事。** 分辨方法是看档案，不是看文件。
- 🔴 **陈旧的 `.git/index.lock` 会静静挡住所有 commit，而 `git status` 照常能跑。** 收工前 `dir /b /s .git\*.lock` 看一眼是空的。
- **`office_bearers` 是法定申报栏位。** 放东西进去之前先看 `src/prompts/eroses-map.ts`。（G-1 后：贴上包那一格已改吃 committee_roster，extraction 的 office_bearers 只留在会议文件里。）
- **行尾 CRLF/LF 混合**：`git add` 时的 `CRLF will be replaced by LF` 是正常的。
- **贵的 agent 与便宜的 agent 分工**：碰 prompt／schema／eROSES mapping／钱的逻辑一定用贵的。

---

## 7. 分工

| 谁 | 做什么 |
|---|---|
| **J** | 手贴 migration 到 Supabase SQL Editor 按 Run · 开付费帐号与 key · 拍真实手写样本 · **所有 `git push`** |
| **Claude Code（本机）** | 改程式码 · 跑 `tsc` / `vitest` · 真正的 build 与 dev server |
| **Cowork（沙盒）** | 读写文件 · 审计 · 产报告 · 小脚本。**不要拿它 build 这个 app** |
| **Cowork + desktop-commander** | 可在本机跑指令验证；仍不要跑会等输入的指令 |

J 手贴 migration 的步骤：记事本开档 → `Ctrl+A` `Ctrl+C` → Supabase SQL Editor 中间程式码区点一下 → `Ctrl+A` `Ctrl+V` → 右上角绿色 **Run** → `Success. No rows returned` 就是成功；红字整段贴给 Claude。
（更省事：双击 `salin-migration.bat`，选 25。）

---

## 8. 文件地图

| 位置 | 放什么 |
|---|---|
| 根目录 | `CLAUDE.md`（规则）· `STATE.md`（这份）· `BUILD_PLAN.md` · `PROMPTS.md` · `DEPLOY.md`（⚠ 过期，上线照 `docs/上线与截图-给J的步骤.md`）· `README.md` · `AGENTS.md` |
| `docs/` | `DECISIONS.md`（D1–**D17**）· `功能盤點-計劃vs實作.md` · `产品缺口盘点.md` · `上线与截图-给J的步骤.md` · `换模型手册.md` · `AI-API-选型与成本.md` · 其余照旧 |
| 定价／毛利 | `src/lib/unit-economics.ts` + `npm run economics`。讲毛利以这里为准 |
| AI 分流设定 | `.env.example` 的 AI 段 + `npm run check:ai` |
| 「到底做了没有」 | `npm run status` / `status.bat`。**任何「这件事做了没」先跑它** |
| migration | `supabase/migrations/`（25 支）· `salin-migration.bat`（25 项）· `npm run check:migrations`（逐支探针，25 有 7 个新 probe） |
| 给 J 双击的 `.bat` | `status.bat` · `salin-migration.bat` · `salin-env-vercel.bat` · `push-cabang.bat`。🔴 `push-to-github.bat` 不能用（会 `git add -A` 吞垃圾） |
| `competition/` | 顶层＝当前版（one-pager 与 demo script 8/27 已对齐新 UI；**[YOU] 两处还空着**）；`screenshots/` 60 张 8/27 重拍 |
| `eval/reports/` | 整夹 gitignore；只有 `SUMMARY.md` 例外 |
| `C:\dev\_backups\` | 照旧 |
| `C:\dev\` 顶层 | `gpt handoff\`（竞赛层面参考）等，照旧 |

---

## 9. 重要日期

| 日期 | 什么事 |
|---|---|
| **2026-08-27** | J 在场：贴 migration 25 → push → **Vercel 上线** |
| **2026-08-31 23:59 MYT** | 🔴 **竞赛截止**（提交当天重新上 portal 核对）。内部 cutoff 8/31 18:00 |
| 2026-08-31 | Claude Sonnet 5 促销价 $2/$10 结束，9/1 起 $3/$15 |
| 2026-09 | 线上初审 |
| 2026-10 | 半决赛 Demo Day（KL，现场）→ `competition/qa-drill.md` 17 题练到不看稿 |
| 2026-11 | 总决赛 |
| 每月 | 看一次 Next.js 安全公告 |

---

## 10. 更新这份文件的规则

结束一个 session 前：

1. **覆盖**第 1 节（状态快照）、下一步、未决问题（勾掉已答的）
2. 新踩到的坑写进第 6 节
3. **不要新增 `YYYY-MM-DD-下一个session从这里开始.md`**
4. 完整过程报告值得留就放 `docs/archive/`，这里留一行指路
5. **写「现在是什么」，不要写「上一版写错了，其实是什么」。** 同一件事只留一个说法。
