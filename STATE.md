# STATE.md — Minit 的当前状态

> **这是唯一的「现在在哪里」。**
> 每个 session 结束前**覆盖更新这一份**，不要新增带日期的交接档案。
> 规则在 `CLAUDE.md`，阶段在 `BUILD_PLAN.md`，历史在 `docs/archive/`。
> 🔴 **给 J 的东西写进 `C:\dev\_J-要做的事\`，不要写在这里。**

**最后更新：2026-08-31 深夜（MYT）· Opus 5（113 号场：首页入口卡场——ALL IN ONE）**
**🔴 本场（113 号场）状态一句话（115 号报告）：首页空的时候，中间那块大留白
变成六张可以按的卡。**
一张卡＝一件真的工作：`开会的笔记`／`收到的钱`／`章程 Undang-Undang Tubuh`／
`刚开完会`（直接开麦克风）／`问一句`（常问的几题折进去，点了就送出）／
`接着做（N 份还没做完）`（只有真的有才出现，加重）。
**卡 1–3 的重点不是「开档案选择器」，是「人已经说了这是什么纸」**——
`/api/intake` 直接跳过 classify 那一步：**每次少扣一个 AI 动作，
也少一次分类猜错的机会**（`actionsUsed = (forcedKind ? 0 : 1) + files.length`）。
**直接拖进来、不按卡的照旧分类**（有一条断言专门守这件事）。
卡片长在**对话区【里面】**（104 §8＋109 §1 治过两次的病，这次没复发）：
四个状态 × 三种宽度实测输入框 y 座标**逐字同 109**
（桌机 730–885／1920 宽 910–1065／手机 578–751），
对话区 **604／784／447px 一格没掉**。
送出第一则之后整组卡**淡出＋高度收合到真正的 0**（实测第一版残留 34px，
真凶是「有 padding 的 grid item 只会收到自己的 padding 为止」——
已改成外层裸、内层带间距）；`清除对话` 之后卡回来。
收起来的时候 `inert`，Tab 和读屏都到不了。
顺手（§3）：输入框上方那段四行操作说明 → 一句「有什么要处理的？」，
拖放提示只在**真的在拖**的时候才出现；顶上那行「您有 N 份还没做完」
不再单独占一列（变成第 6 张卡）。
**🔴 一个 prompt 都没动——`git diff src/prompts/` 空、
`git diff --stat f74cdf3..HEAD -- src/prompts/` 空（整场对照 109 收工点一个 byte 都没动）。**
**测过：tsc 0 · eslint 20（基准逐字同）· vitest 1413（+15）· build ✓ ·
三条 e2e 全绿 · e2e-105 全绿 ·
新 shot-cards-113 34 条全 PASS（六张卡的落点／kind 真的传出去／收合与回来／
四状态×三宽度）· 既有 shot-layout-109（20）· shot-minutes-109（8）·
shot-workbench-104 · shot-queue-105 全 PASS ·
品质 eval 3/3 PASS 0 findings US$0.0030（与 105/109 基准同）·
全场真钱 US$0.0030（授权 ≤0.30）。**
**🔴 🔴 J 的一件事：双击 `push-cabang.bat`（本场 4 支 commit）。
没有新 migration、没有新环境变数。上线后看三件：①首页空的时候中间有六张卡；
②按「开会的笔记」再选照片，扣的用量应该比以前少一点（少一次分类）；
③打了第一句话之后卡片收起来，`清除对话` 之后回来。
🔴 108 号单（品质急救：不准编、不准丢）**还是**没跑过——「正式文件把人物关系
写反」那件事还在线上等它，**下一场就是它**。旧拍板照旧欠：bench 模型、
eval 对外口径。**

---

## 🌙 现在在哪里（2026-08-31 深夜，113 号场收工）

> **已上线**：https://minit-project.vercel.app —— **109 场的 6 支 J 已推**
> （开工实测 main==origin/main、工作树乾净）。
> **113 号场 4 支 commit 等 J push-cabang.bat**，没有新的 migration。

### 这一场做了什么（113 号场 ✅，115 号报告——首页入口卡场）

- **§1 六张入口卡（主菜）**：卡片清单是**资料**，在 `src/lib/entry-cards.ts`
  （纯逻辑先进 lib——家规规则 13），15 条单元测试盯三件事：
  每个字串三语齐、不准出现行话（`upload`/`extraction`/`draft`…）、
  **没有任何一张卡是死的**（浏览器没有语音辨识 → 没有「刚开完会」那张；
  未完成份数是 `null`（读不到）或 0 → 没有「接着做」那张——`null` 不准
  render 成「你没有」）。长相在 `src/app/entry-cards.tsx`。
- **🔴 §1 真正的价值：卡 1–3 预先标记文件种类**。`presetKind` 跟着夹进来的
  档案一路走到 `sendFiles()` 的 `forcedKind`，`/api/intake` 跳过 classify。
  探针不是看画面，是**从 FormData 本身读 `kind`**——三条断言各自证明
  `meeting_notes` / `ledger_page` / `constitution` 真的传出去了，
  第四条证明**没按卡的照旧分类**（这条是守住「捷径只是捷径」的那一条）。
- **⚠️ 卡 2 的字改了，而且是故意的**：单子写「收據、單據、帳單 → 記進帳本」，
  同一行又写「副標是意思，不是死字」。照字面做会出事——Minit 只有
  **捐款账页**那一个钱的读取器（`ledger_page`）；把一张电费单硬塞进去
  不会报错，会**很有把握地读出一页空的账**。所以卡面写的是它真的收的东西
  （捐款簿、记钱的账页），其他纸照旧丢进来让分类器认。
  **答应少于能做的只是浪费捷径；答应多于能做的是给错答案。**
- **§2 卡怎么收起来**：跟着「对话是不是空的」这一个事实走，不记进
  localStorage。**没有 phase state、没有 timer、没有 unmount**——
  `grid-template-rows: 1fr → 0fr` 纯 CSS 收合（`.minit-collapse`），
  收完那一列是**真正的 0**。`inert` 是承重的：看不见但 Tab 得到的六个按钮
  比没有按钮更糟。`prefers-reduced-motion` 保留淡出、拿掉位移。
- **§3 空状态的一句话**：四行操作说明 →「有什么要处理的？」＋
  一行小字（**手机上藏起来**：447px 的对话区，那一行值 44px，
  而底下六张卡本来就把同一件事做成可以按的了）；拖放提示只在 drag 的时候亮。
- **新验收**：`scripts/shot-cards-113.mjs`（34 条，**零 vendor 呼叫**——
  `/api/intake` 拦成罐头、问的每一题都是 prepared 层免费答的）。
  改前／改后成对截图 6 张（桌机空／桌机送出后／手机空／手机送出后，
  外加桌机深色一张）在 `eval/reports/cards-113-*`。

### 本场没做的（照实留残，下一场的料）

1. **手机上六张卡放不满一屏**：447px 的对话区里第一排＋第二排整齐可见，
   第三排（`问一句`／`接着做`）露出一点点、要往下捲一下才整张看到。
   不是 bug（§4-3 只要求「不准把输入框挤出画面」，实测 578–751 一格没动），
   但**最该先处理的「接着做」在第三排**。去路就是 110 报告留的那 69px
   （铃铛移进上方 app bar 56px＋安全告示压两行 13px）——拿到之后第三排就上来了。
2. 卡片收起来那一下是**唯一**一处动高度的动画（109 明令不准动高度，
   这里是写清楚理由的例外）。若以后对话区里再有第二处想动高度，先回来读
   globals.css 里那段注解。
3. `问一句` 折出来的常见问题目前是 **2 题**（`suggestedQuestionsFor`，
   e-Invois 那题在 beta 闸后面）。单子说「三四个」——要加题必须先在
   `prepared-answers.ts` 里有对应的**免费**答案（每一颗 chip 都不准扣额度，
   61 §1-6 ①），所以本场没有硬凑。
4. 108 号单还是没跑。

---

## 上一场：版面场（2026-08-31 深夜，109 号场，110 号报告）

> **已上线**：https://minit-project.vercel.app —— **105 场的 14 支 J 已推、
> migration 43（`ai_jobs`）已贴**（本场 e2e-105 的排队那条真的跑起来了，
> 105 场那轮是 SKIP）。**109 号场 6 支 commit 等 J push-cabang.bat**，
> 没有新的 migration。

### 这一场做了什么（109 号场 ✅，110 号报告——版面场）

- **§1 首页＝一个聊天画面（主菜）**：`isChatScreenRoute()`
  （`src/lib/chat-screen.ts`，纯函式＋5 条测试）告诉外壳这条路由要画哪一种
  形状的页。`/` 拿到 `h-dvh` 一个视窗高，`shell.tsx` 一路往下每层
  `flex-1 min-h-0`，`ask-box.tsx` 的对话区从 `h-[46dvh]` 固定窗变成
  **flex-1 剩多少是多少**，输入框是这根柱子最后一个孩子——
  **它的位置变成版面的事实**，不用 sticky／fixed／z-index／不用知道
  手机 tab bar 多高。卡片全在框里（104 §8 的规矩没破），
  连 error 与「额度用完」也搬进去了（它们在框外就会推走输入框）。
- **§1 顺手**：176px 大虚线框 → 输入框上方一句轻引导；输入框**跟着字长高**
  （一行起跳、最多约五行）；迴纹针／麦克风／送出收进**同一个框**
  （手机上旧排法折成 380px 高）；**首页的浮动助手球关掉**
  （钉底之后它正好盖住送出键——手机截图抓到的）。
- **§2 「即将到来」预设收起**（只有存过「展开」的装置才展开），
  实测对话区 755→1137px；`⏰ N` 小标一直都在（没有事情时只显示鬧钟不显示 0）；
  `shot-workbench-104.mjs` 同一支 commit 里教会新预设。
- **§3 步骤条与文件框**：手机 **3 层 181px → 1 行 79px**（真凶是写成句子的
  黄色数字牌，移到步骤牌右上角的实心小圆，句子留在 sr-only）；
  文件框 408→568px（`min-h-[60dvh]` / `max-h-[70dvh]`）；DRAF 0.40→0.22。
- **§4 动画**（开工先跑唯读盘点，没改任何档案）：加动画 token
  （`--ease-out` / `--ease-in-out` / `--dur-press` / `--dur-fast` / `--dur`）；
  对话区里「到达」的东西 180ms 淡入＋6px 上浮（**只动 transform/opacity**）；
  `prefers-reduced-motion` 走另一组只淡入的 keyframes；助手侧栏的 framer-motion
  弹簧终于尊重这个设定；四处 `transition-all` 换成真正在动的属性。
- **新验收**：`scripts/shot-layout-109.mjs`（20 条：四状态×三宽度的座标、
  对话区高度对照 before JSON、视窗高度变动时的钉底、两条动画断言）、
  `scripts/shot-minutes-109.mjs`（8 条：步骤条一行、文件框、DRAF 透明度，
  全部对照 before 那一轮量出来的数字）。两支都**零 vendor 呼叫**
  （`/api/intake` 拦截成罐头）。

### 本场没做的（照实留残，下一场的料）

1. **手机对话区再拿 69px**：铃铛移进上方 app bar（56px）＋安全告示压两行
   （13px）→ 1.34×。真要 1.4× 得动 44px 触控下限，不建议。
2. **§3 最后一条：108 场拿掉 Formal 卡之后的空位**——**108 场还没跑**，
   那张卡还在，收拾一个不存在的空位＝编工作。留给跑 108 的那一场。
3. 动画剩下的：助手推开内容改用 transform（现在动 padding）、共用 Button
   的按压回馈、Upcoming 收合的过场、步骤勾的淡入、多张成品卡错开出现。
4. `shots-dock-open.mjs` 在首页拍不到助手侧栏了（首页浮动球关掉）——
   它 `if (launcher)` 会跳过不会炸，但那张 proof 图从此是空的。

---

## 上一场：底座场（2026-08-31 深夜，105 号场，107 号报告）

> **已上线**：https://minit-project.vercel.app —— 开工实测 main==origin/main
> （104 场 10 支 J 已推上 ✓）；**105 号场 14 支 commit 等 J push-cabang.bat**。
> 🔴 **migration 43（`ai_jobs`）NOT YET —— 等 J 亲手贴**，check:migrations
> 实测 1 条 NOT YET，就是它。**这是本场唯一一条挡路的**：没贴时
> `/api/job/start` 回 `available:false`（软性拒绝，非 500），门口走回单请求
> 旧路，**行为＝105 之前，不坏不乱扣**；贴完自动生效。
> 线上 org 与 106 相同：15「J」、58「avocado」、91、197「TESTING2」、315、
> 369「Persatuan」。**#369 与 #91 的名字仍是坏的**（104 修了 bug，没动线上
> 资料；修法在 106 号报告 §3，J 自己两分钟改完）。

### 这一场做了什么（105 号场 ✅，107 号报告——底座场）

- **§1-1 先查再选（结论写进代码注解与迁移档头）**：这个专案部署在
  **Vercel Hobby**（`DEPLOY.md` 第 4 行），**Hobby 的 cron 一天只跑一次**——
  伺服器自己推进那条路在这个方案上不存在。所以**前端驱动**：浏览器拿 job id
  反覆打 `/api/job/step`。不用换方案、不用多一个厂商、不用多一把钥匙，
  进度条白送。若日后换到有分钟级 cron 的方案，伺服器推那条可以加在**旁边**
  ——前端这条必须永远能独立跑通。
- **§1 排队底座**：`src/lib/jobs-core.ts`（纯逻辑 25 支测试：切批／D47 定价／
  租约／状态机／估价）＋ migration 43 `ai_jobs`（含 `claim_ai_job`
  **SECURITY INVOKER** 租约函式）＋ `jobs-server.ts`（**一律 user-scoped
  client，RLS 是边界**；表不在就回 unavailable，门口 fail-soft）＋
  `pdf-slice.ts`（**伺服器端**切页——开始读的那个浏览器可能早就关了）＋
  三支路由 start／step／open ＋ `jobs-client.ts`（驱动回圈、localStorage
  记住 job id、busy 就退让等待）。UI：报价卡／进度条／「接着读」黄卡，
  全在捲动框里（104 §8 的规矩没破）。
- **§1-2 钱（四条都落地）**：`/api/job/start` **一个动作、一页围栏都不扣**
  （它只是报价，人还没说开始）；A6 围栏在**第一批**才扣、存在列上，
  一批都没读成就整个退回；每批只扣**自己那几页的 D47 差额**；失败只退
  **它自己**扣的且 `pages_done` 一动不动（专门的单元测试钉死）；
  一份文件＝一列 job，重整／换装置／换人都接同一列，两个分页由资料库租约
  挡住（同一页绝不读两次）。分母沿用 104 §5 的 `quotaPool`。
  **顺手抓到真毛病**：缩图条按「档案数」猜的 13% 与排队按「真页数」算的
  20% 同框——正是 104 §5 要杀的「两个数字互相打脸」。已修＋两条探针断言。
- **§1-3 聊天里真的能下指令（併掉 90 号单的一半）**：`staged-instructions.ts`
  （三语、写死、有测试的词汇表——**不是再叫一次 AI**：这个判断决定两份文件
  怎么合併，而且要在扣任何钱之前跑）。送出前＝当成勾了「不同版本」；
  送出后＝**用手上已读好的内容重併，当场出新成品卡**，回覆写明「照片没有
  重读，所以这一次不花用量」。🔴「第 2 页」这类话一律压过其他判断。
- **§1-4** `documentTooLongError` 尾巴那句「排队慢慢读施工中」三语全删，
  **原本钉住它的测试反过来钉住它不准存在**；PDF 那条建议改成「重新另存／
  列印成一份新 PDF」（真的会走到那句话的 PDF 只剩切不开的那种）。
- **§2 会议记录两层**：新 prompt `src/prompts/tidy-minutes.ts`（🔴 **只多一个
  新档，`extract-meeting-notes.ts` 一个 byte 没动**——`git diff src/prompts/`
  实证）＋`src/lib/tidy-minutes.ts`（确定性半边，26 支测试）＋
  `src/lib/ai/tidy-minutes-run.ts`（coverage 修补回圈，只回**索引**不回内容）
  ＋`/api/tidy-minutes`（新动作 `tidy_minutes`，纯文字所以便宜；拒绝就退款）
  ＋`src/app/minutes/tidy-view.tsx`（两个分页📑正式版／✍原文（逐字），
  每段「原文 ↩」，三语写死「送 eROSES／下载／确认一律用逐字层」）。
  **锁死清单用形状守**：整理 pass 只拿得到决议那几行，金额/名册/日期/地点
  **它根本看不到**。再用五道用数的检查守剩下那一个欄位（coverage 少一条
  **整份退**／数字不准生也不准掉／中文串要活着／**拉丁人名要落在词界上**
  ——`Tan Kim Looi` 不算 `Tan Kim Loo`，`includes` 抓不到多一个字母的名字／
  决议语气通过不通过延后三态锁死）。过不了 → 那一段**退回逐字**并挂
  「照原文显示」，卡片上方说有几段。
- **§3 读完后侦测重复页**：`src/lib/duplicate-pages.ts`（7 支测试）。
  🔴 **门槛是量出来的，而且对照组救了它**：第一次量，对照组（真印刷 minit
  切成两半）得 0.60 会乱问——真凶是**印刷 minit 自己带议程表，表头那行
  字面上就包含在内文段落里**，拍成两页就一条条报「重复」。实测误判是
  59↔294／43↔95／85↔476 字元（表头 vs 段落），J 那条真重复是 29↔41。
  所以多一条「两行长度要相当（≥0.5）」，对照组掉到 0.00，J 那条照样 0.33。
  🔴 这条放在 `duplicate-pages.ts` **不放进 `sameItem`**——人**自己勾了**
  「不同版本」时（104 §10）「包含」就是对的判准，不能动。
- **测过**：见上方一句话块。⚠ 没能验证的（107 §7 逐条）：**①排队链路真的
  跑一次**（要 migration 43 才有表，而 D8 不准工作场对线上 DB 跑 migration；
  切页／扣费／状态机／四张卡／软性拒绝都验了，`claim_ai_job` 真跑与 result
  逐批长大没验）；②整理 pass 实测 4 次 **3 成 1 拒**（拒绝不扣钱，画面停在
  原文层）；③有一次合併把三条不相干的併成一段——**检查挡住了**（退回逐字，
  三行都在），但版面上挤成一段，**没有硬加「合併必须相似」规矩**，因为 §3
  刚证明这种规矩很容易误杀对的合併；④真手机；⑤Vercel 线上；
  ⑥**章程故意没改走新底座**（81 号单那套有 e2e 与探针钉住，「加功能顺手整理
  旧东西」正是 http.ts 开头警告的事）——所以章程目前仍不能关分页；
  ⑦Office 档不走排队（没有「页」可切）。

### 上一场做了什么（104 号场 ✅，106 号报告——上线第二轮十件快修）

- **§2 章程读取根治**：extraction 新 `organisation` 区块（registered_name／
  registered_address／registration_no，完整 Hard Rule 1 契约、跨行接成一串、
  逐字、读不到就 missing），跟条文同一次呼叫、不另外收费。
  `constitution-identity.ts` 的 regex **降级为后备**并修掉两处砍头：
  ①`\n` 从断句字元里拿掉（PDF 换行不是句号）；②「hereinafter／簡稱」
  尾巴要在找引号**之前**先砍——不然 Fasal 1 里唯一的引号是尾巴里的简称，
  答案就是「Persatuan」。**旧代码对今晚这份 extraction 实测就回
  "Persatuan"**（tmp 对照跑，零 AI）。章程 eval 21/22 invented=0（改前 20/22）。
- **§1 建机构岔路**：`/orgs/new` 第一眼是岔路不是名字框。「我有章程」把
  上传搬到最前、名字框变可留空，读完**留在原页**把注册名／注册号／地址
  填进可改的框；「我自己打」一 tap 回到原本那张表（名字必填、章程框仍在
  最后，当初把它放最后的理由原文保留在代码里）。因为每个 AI 动作都算在
  某个 org 头上，章程那条路的 org 先用暂名
  `PERTUBUHAN BARU — NAMA BELUM DIISI` 建起来，读完就被换掉；读失败也会
  开一个空的名字框在「再试一次」旁边。新 server action `saveOrgIdentity`
  （name＋ppm_no，走 column ladder、user-scoped）。
- **§3 名字读错要能自己打**：识别卡从两条路变三条（「都不对，我自己打」，
  预填读到的名字）；两个 not-found 分支也长出同一个框；**`/settings/general`
  新增改名框**——那两个画面叫人「到设定→机构改」已经好几个月，而那一页
  上的名字一直只是文字，没有任何控制项。三条路走同一支 `renameOrg`。
- **§4 孤儿条**：真因在 `sortClauses` 把标签字（Fasal/Clause/Perkara）当
  token 排——「Fasal 8」是字、「8.2」是数字，数字排在字前面，所以每一条
  裸号子条都跑到 Fasal 1 前面。改成排序前先脱标签。97 §3 的「沉底」于是
  没必要了（那正是 J 说的「观感＝坏掉」：正本後面又跟一本），
  `sinkOrphanClauses` → `markOrphanClauses`：位置不动，只挂淡色「找不到
  父条」标签＋清单顶端一行说有几条。
- **§5 额度含充值**：usage-core 新 `quotaPool`（= 已用＋还剩，写成这样
  才经得起「充值被花掉一部分」的中局），所有面向用户的 % 都以它为分母；
  两道钳制保住不变量（说 0% 就真的不能做事、还能做事就不准说 0%）。
  Plan 页的「+607% 充值额度」整行删掉，`/settings/ai` 的「+N kredit
  tambahan」与 `/orgs` 的「0/15」原始次数一并改 %。9 支断言（含 105 组
  状态扫描）＋ shot-quota-104 在 J 的真状态下拍照：**14% 已用 · 86% 还剩**。
- **§6 人工开通指路**：`/admin` 两张面板（用量池、加额度）搬到大表**上面**
  ＋`#plan` 锚点，各加一句人话；Plan 页黄字对 operator 多一行「去控制台
  开通 →」（非 operator 照旧看不到控制台存在）；旧的「跑 SQL」折叠改成
  指那颗按钮。
- **§7 .docx 不再被叫去切 PDF**：`documentTooLongError(kind)` 按 PDF／
  Office／照片／未知分四种说法，`docKindOfUpload` 认 MIME 再退回副档名；
  六条上传路全部传 kind。两件事故意不动：**永不说「再试一次」**（重传必
  同样失败、还再扣一次钱，四种 × 三语都有测试钉住）和「额度已退回」。
  ⏳ 讯息末尾多一句「长文件排队慢慢读施工中」——**105 场做完要拆掉**，
  函式注解写了。
- **§8 输入框不再被推下去**：真因不是对话，是**四张 ask-back 卡长在捲动框
  外面**（缩图条、这是什么纸、章程价格闸、这张纸有好几场会）。四张全搬
  进框里，框改**固定高**（`h-[46dvh]`，不是 max-h——会长大的框一样会推）。
  实测（真 dev server、intake 被拦截喂假回覆，零 AI）：桌机 470→759（推了
  289px）变 693→693；手机 684→1067 变 696→696。`position: sticky` 的浮动
  版做过又拆了，为什么写在代码里。顺手修掉手机上「聚焦输入框时被 tab bar
  盖住送出键」（scroll-mb-24）。
- **§9 Upcoming 可收起**：桌机右栏收合、宽度让给对话（757px→1139px）、
  留「⏰ N」小标记点回来、选择记在装置上。手机照旧是铃铛。
- **§10 上传时选「不同页/不同版本」**：缩图条多两个选项（预设照旧「不同
  页」）。选「不同版本」时 `mergeMeetingVersions` 用**最完整**那份当正文
  （比事实数，不是比字数），其余版本只补它没有的。`sameItem` 三条臂：
  相同／包含／**共同词比例**——第三条臂的门槛是从 J 两张真件量出来的
  （真重复 0.67、真不同 0.11 与 0.00），且至少要三个实词才启用。实测
  14 行 → 13 行，重复那行消失，另外两条真新的照留。
- **§11 委员卡**：IC 名字＋州属（会议没写日期时还有任命日期）摆在按钮
  **前面**，填好前「确认加入」是灰的；判断用的是伺服器同一支
  `missingErosesCommitteeFields`，两边不会走岔。`MALAYSIAN_STATES` 搬进
  lib（两个画面各写一份州名，迟早在政府表单上拼出两种 Pulau Pinang）。
- **顺手**：`clausesFromExtraction` 搬进 `src/lib/constitution-display.ts`
  （两个画面要用）；`eval/run-eval.ts` 新 `EVAL_ONLY` 环境变数（只跑某几
  个 case——本场只动章程 prompt，不该花钱重量没动过的会议记录）；
  **44 支探针/截图脚本＋三条 e2e 教会新岔路**（插入的那一步在没有岔路的
  页面上是 no-op，对旧 build 也还能跑）。
- **测过**：见上方一句话块。⚠ 没能验证的：真手机（375 是 headless 量的）；
  Vercel 线上；「不同版本」在真 UI 上从头跑一遍（合并逻辑与 UI 分别验过，
  两者接起来的那一次真读取留给 J 上线丢两张纸最省）；§11 委员卡的真
  截图（要一份已确认、且带 add_member 建议的会议记录，成本不值当，
  单元测试与伺服器同函式已钉住）。

### 上一场做了什么（102 号场 ✅，103 号报告——聊天路接脑＋额度百分比）

- **S1 病历**：probe-chat-102.mjs 用 J 四句原话录改前行为
  （eval/reports/chat-102-before.json；「不需要更改任何设置」「請到
  Minutes 頁面」两句话就是病）。
- **S2 接脑（主菜）**：①tukar_bahasa 工具（两级制第一级；语言是装置
  偏好 localStorage+cookie，不进 DB——改动卡即留痕、undo 全逆，工程判断
  写在 103 §2 等 J 过目）；chat prompt 换 agent 口吻（「工具能做的自己做」
  取代「Minit does the work on its pages」）＋口述规则（缺日期先问、
  dictated_minutes 旗标）＋settings_language 深链；②/api/intake 新
  dictatedText 分支（同 extract prompt 当 untrusted 文本块、1 个
  extract_minutes、零围栏页、rule-7/退款照套）；③两个聊天面接
  uiChanges（setMode 当场切）＋UiChangeCard＋runDictation（先让 send 的
  finally 落地再接 busy——macrotask yield）。
- **S3 citation 守门**：chat-sources.ts（[n] 在文里为主证、used_sources
  为辅、docId 去重、上限 3、零引用零显示）＋7 支测试；show-all fallback
  退役。
- **S4 佈局**：对话区 max-h[55dvh] 自卷＋输入框钉底（恢复旧对话停在最新，
  只卷区域不扯页）；回纹针进 composer（staged 条与问答卡搬到 composer
  旁）；Clear 旁「还剩 X%＋清空对话较省用量」；桌机 Upcoming 右栏
  （@4xl container 变体）、手机 UpcomingBell 铃铛（数字徽章、点开摊同
  一张 HomeUpcoming）。shot-workbench-102.mjs 13 项断言＋5 截图。
- **S5 百分比**：quota-display.ts（pctOfQuota 真动作永不显示 0%、
  remainingPct）；页脚/staged 预估「这次读取大约用 X%」/自我报告「用了
  大约 X%」/重读按钮「约 X%」全换；「0 动作」改「免费」。plans.ts 新
  plus（=标准×2）；Plan 页额度行显示相对标准 %（分母一行说明）、HQ 栏
  operator-only（已在 hq 的 org 照看）、「已选未开通」三拍句点名量的是
  试用池；create-org 选项 Trial/Standard/Plus（%文案写死——池子改比例
  要跟着改，103 §6 留残）。
- **S6 控制台用量池**：migration 42 只写档（plan_quotas 四池 seed
  15/100/200/300 重贴不盖调过的值；orgs_plan_check 放行 plus；
  admin_set_plan_quota/admin_set_org_plan 两支 SECURITY DEFINER RPC 走
  platform_admins 闸）；plan-quotas.ts loadPlanQuotas DB-first 编译值
  fail-open；/admin PlanQuotasCard（池子四格＋org 方案切换，db_behind
  诚实拒绝）；salin 42 项＋check:migrations 探针。
- **S7 收纳**：settings/general 的 Switch organisation 只对 >1 org 的人
  显示（RLS 计数 fail-open）；/orgs 路由与头像选单门照旧。
- **§0-7 顺手修**：ai-panel 的 error 过 localizeError（马来英双语叠印
  bug 根治）＋额度用完框加「看方案 →」。
- **测过**：见上方一句话块。⚠ 没能验证的：42 贴上后两支 RPC 真路（贴完
  J 点一次面板即验）；真手机铃铛/卷动/键盘；Vercel 线上；>500 字单句
  口述（上限照旧，分句讲即可）；tukar_bahasa 在不接工具的 vendor
  （Claude/xai）退回指路（设计如此）。

### 上一场做了什么（100 号场 ✅，101 号报告——AGENT 工作台主菜）

- **①Home＝工作台（D51）**：四张卡删除（task-cards/home-card-lines 连测试
  一并退役，home-stats 只留侧栏徽章那支计数）；AskBox 升级：空状态大拖放
  英雄区、读档步骤卡逐步亮（失败停在哪一步看得见）、多成品卡片（minit 卡
  ＋「笔记里还读到 N 笔钱要一起记吗」offer 卡＝figures 直译 ledger 行、
  donor/日期诚实 missing、零额外 AI）、⑨人话自我报告（做了什么/几个动作/
  去哪核对）。主成品同时写进 intake 快递（重载不丢已付费读取）；章程照旧
  直达 /constitution。额度页脚加「还剩 N 次」。
- **②SOUL**：agent-soul.ts（身份=整理员；放松=形式自由/主动问/多成品/
  改稿；锁死六条逐字=钱系统算/收据编号不可改/donor 不进模型/不代确认
  不代交/不给法税会意见/成本上限；两级改动制）——参数化（无工具 vendor
  不被许诺 update tool），agent-soul.test 逐条钉；chat prompt 开头挂上。
- **③两级改动制**：migration 41（agent_changes 审计表·无 delete policy＋
  committee_roster.phone）；org-tools 新 tukar_maklumat_ajk（联系欄白名单
  phone/email/state/honorific/note；名字找人 0/多匹配都回问；🔴 trace
  first fail-closed＝41 没贴就拒绝并指路 Members 页）；/api/chat 回传
  changes；两个聊天面 AgentChangeCard（旧划线→新粗体＋还原键→
  /api/agent-undo 零 AI 复原）；members 页 phone 进 select 阶梯/表格/
  Edit 行/OPTIONAL_COLUMNS 阶梯。
- **④两场侦测＋新人整包（读取半边）**：extraction 新 other_meetings
  （optional+catch）＋officeBearer 可选 ic_no/address/occupation；prompt
  批次落地后真件 A 实测读出 8/7/26 与 18/7 两场（带出处）＋速记页 IC 号
  照抄；工作台「要做哪一场？」卡（重读按钮标价 N 动作、免费「照原样」
  出口、跨页同日期去重）。**卡片预填（④后半）留残下一场。**
- **⑤写路三件**：速记展开规则进两支写作 prompt（虚构人名示例，A3；
  「展开是措辞、添加是发明」）；/api/draft-minutes 新 polish 旗标＝结构化
  文件全段就地措辞（D34 一次一动作，按钮标价，minutes-document 有结构才
  显示）；minutes-pdf 新 kv 行别（连续 ≥2 行「标签: 值」对齐印、数字开头
  行永不误判，测试钉住；bench-98 的 current-A/B.pdf 已用新代码重生成）。
- **⑥孤儿条归位（§0-6）**：proposeOrphanHomes（存档顺序推「上一条
  Fasal」为父，纯逻辑零 AI）＋reattachedClauseNo（"(3)"→"Fasal 8(3)"，
  排序即归位不再沉底）＋reattachOrphanClauses server action（trace-first
  fail-closed，41 没贴回诚实拒绝＋重拍备选句）；clause-list 提案卡只挂
  真书（sample 与只读皮不给写路）。org197 实测形状（只查形状）：24 Fasal
  ＋8 条「(N)」型＝卡会出。
- **⑦收纳**：/agm-pack 与 /settings/members railOnly（SettingsNav 补
  railOnly 过滤）；门＝/filings/eroses 页脚一行＋/members 标题下一行。
- **⑧⑨**：三语「AI 会犯错」小字（ai-disclaimer.tsx）常驻工作台＋浮动
  面板；discuss-section 改「直接套用＋旧→新＋还原键」（标 check，保存前
  仍须人过目＝确认闸没动）。
- **🔴 顺手修的真 bug**：extraction-merge 的合并字面量没跟上 G1——
  meeting_time/attendance_count/adjournment/prepared_by/endorsed_by/
  financial_resolutions 全被丢（两页会议合并无声删 MASA）；修＋测试钉住。
- **bench-98（Stage 1）**：真件 A/B 双轨 4 模型，成品逐份在
  eval/reports/bench-98/（含 README 对比表＋COSTS 逐笔）；建议读写都
  不换（3.6-flash 读写全超墙、luna 少收条目、terra 贵 7 倍）；.env 零动。
- **测过**：见上方一句话块。⚠ 没能验证的：41 贴上后的换电话/孤儿条真路
  （探针式验收步骤在 101 §4）；真件 A 选场重读与真件 B 重读的真 vendor
  全链路（真钱，留 J 上线丢一次）；工作台真手机观感（headless 量的）；
  Vercel 线上行为；写路 polish 的真 vendor 一轮（品质 eval 3/3 过的是
  既有三案）。

### 上一场做了什么（97 号场 ✅，99 号报告——九条快修＋收纳场）

- **①首页门 PDF（P0）**：openai.ts extractJson 对 `application/pdf` 改包
  `input_file`（其余 mime 照旧 input_image），classify/classifyOnly 一处
  全盖；openai.test.ts 3 支钉住请求形状；probe-intake-pdf-97（真 vendor，
  2 页 BM 会议 PDF 走真 UI 首页门）：classify 成功→extract 接手→落
  /minutes→计费零退款→app_errors 0 行，US$0.0059/轮，进常备清单。
- **②BM 闸**：CJK_RE 只认汉字；normalizeFullwidth()（FF01-FF5E→半形、
  U+3000→空格、。、「」『』映射；preserve 列表走 NUL 哨兵）在四个掛点
  自动套用：renderMinutesDraftBm、draft-minutes 三个出口（lang=bm）、
  保存 action、updateSavedMinutes（BM 从信头认）；中文版永不套。警告框
  cjkSegments() 汉字标红。J 原句 `2 ＃mes. agung…` 钉住不再被标。
- **③章程**：cleanClauseField()（"missing" 字串→空，flatten＋显示双防，
  org197 立刻干净、clauses_json 零动）；prompt 48 行改对（无 eval 基准，
  铁线测试＋下本真件验收）；sinkOrphanClauses()（Fasal 书的纯数字/"(N)"
  孤儿沉书末＋三语诚实说明；纯数字书不套；有父条的 8.1 不沉）；
  clause-list.tsx 共用件（搜索＋列表＋缩进＋沉底，cards/collapsible 两皮）
  ——/constitution 第 3 区块与 /constitution/clauses 同一份代码；侧栏
  「条文全文」删、路由保留（cari_fasal 引用锚点）、/constitution 去 exact。
- **④侧栏收纳**：/money/custody 藏（引擎/测试/路由零动，D50 记方向：
  交接状态长在收入记录上）；/money/balance 卡搬 /money/report 顶部
  （all-time、money 角色、遮眼睛原样）＋路由 redirect（非 308）；/orgs 藏
  （门：头像选单、/settings/general、/more 页顶、空状态、ask chip；
  引导流不经侧栏零断）。
- **⑤收据在流程尾**：收入半边现况已达标（/money/issue 就是终点，零改动）；
  支出半边＝保存后「这一笔的单据」卡（掛店家单据照片走 recordUpload
  kind"expense"＋Inbox 可见，或「没有单据」诚实记录；不挡保存不强迫；
  开支簿每行带状态＋签名 URL 点开）。migration 40 只写档（expenses.
  receipt_path + no_receipt；salin 40 项＋check:migrations 两条探针）；
  没贴前 fail-open 点名 migration 40。Manage receipts 改 railOnly、门在
  Receipt history 页顶一键直达；功能零删、围栏/计数零 diff；预备问答
  chip 目标 /money/receipts 不用搬（页面没动窝）。
- **⑥看原稿**：出席页「看原稿」收合区（PhotoLightbox＋PDF/Office 开真
  原档签名 URL）；notes-review 缩图条同门；成品页 HistoryPhotoStrip 按
  类型分流（图片缩图/PDF 磚/DOC 磚开新页；无副档名照旧当图）。机制＝
  ThumbPage 带 storagePath＋PageThumbs openOriginal prop＋open-original.ts
  一份签名包装。⚠ Office「显示读出的文字」没做（client 没存转出文字，
  改开原档——要真做得存 officeText，等 J 说）。
- **⑦小修**：settings 布局 showSystem 改 isOperatorEmail（行与页同一事实，
  einvoisOperatorOnly 前例）；检举冒用块搬 /settings/feedback、system 页
  给非 operator 指路句；members-rows 成员名（常是 email）限宽＋
  overflow-wrap anywhere＝375 横向溢出根治（57 字长 email 当饵实测）。
- **⑧AI_MODEL_WRITE**：provider.ts 新 task "write"（未设→退回 long_doc
  整套解析＝行为零变化，测试两头钉）；draft-minutes 两处走 "write"；
  discuss-minutes/extract-constitution/draft-activity-report 刻意留
  long_doc；check:ai 印 write 行；.env.example 带警告；.env 零动。
- **测过**：tsc 0 · eslint 20（基准逐字同）· vitest **1240（+21）** ·
  build ✓ · 三条 e2e 全绿（契约零改动）· probe-ui-97 新 27 项＋六支旧
  探针全 PASS（k1-82 按 D49 改契约后）· check:migrations 40 唯一 NOT YET ·
  真钱 ≈US$0.015（授权内 $0.0118＋k1 旧探针误烧 $0.003 照实报）。
- ⚠ 没能验证的：migration 40 贴上后的真路（probe 走的是 db_behind 分支，
  贴完重跑 probe-ui-97 会走 recorded 分支）；真手机观感（members 375 是
  headless 量的）；Vercel 线上行为；operator 正向半边照旧；BM 正规化在
  真中文 IME 正式文件上的实战；write 通道没跑过真 vendor（设计上未设
  env＝原路，e2e 成文步全绿间接证明）。

### 上一场做了什么（94 号场 ✅，96 号报告——partner 包合并＋e-Invois BETA 闸）

- **①partner 包合并（逐行审过才收）**：zip 解到 temp 对 origin/main 复核
  ——真差异恰好＝约定的 5 档（其余全是行尾/档名编码假差异；package-lock
  与 tsbuildinfo 按单不收）。einvois-governance.ts（303 行纯逻辑：批款→
  审计状态＋findings，零 vendor 呼叫、零写入、门槛引 einvois.ts 既有
  常数、章程上限只认自家条文读不到不出、无任何「LHDN 已验证」状态）＋
  22 支测试；extraction schema 加 financial_resolutions（optional+catch
  旧档不炸，coerceMissingFieldsEmpty 是通用递归走访自动盖到）；
  minutes-document 加「批款与 e-Invois 状态」面板（跟 einvoisVisible 走）。
  三档 diff 纯新增零删改＝89⑥ 多页排队与五条管线不可能被碰。
  修正：注解撞号 90→94；BM 两句（perlukan→memerlukan e-invois
  tersendiri；「Bendahari rekod sudah dimuat naik」→「Bendahari telah
  merekodkan muat naik」）；图示复核只有中性 ⚠️。
- **②D49 BETA 闸（93 号 §1-4 拍板落地）**：EinvoisProvider 多 operator
  bit（root layout 传 isOperatorEmail，与 /admin 同名单），visible =
  operator && org 开关＝所有 useEinvoisVisible 消费点一处全闸；
  /money/einvois、/settings/einvois（开关页本身）、/api/einvois-xlsx
  对非 operator fail-closed 404（取代旧「route 永远能走」注解）；
  nav 新旗标 einvoisOperatorOnly（settings 行只看 operator 不看开关，
  不然 operator 关着时进不去开关页）；预备问答两条＋e-Invois chip 跟闸
  （chip 永不扣费是 K1 铁律）；/api/chat 的 money_einvois 深连结按钮对
  非 operator 不回；EinvoisBetaBadge 一颗（violet 家族、tooltip 三语）
  挂 rail/more/settings 行/settings 页标题/partner 面板 summary。
  probe-einvois-94 首跑抓出三个漏网当场补：/calendar 旁栏与
  /filings/eroses/tarikh 的月底截止日（预设 einvoisCount=3 没跟闸）、
  顶栏在 404 画面上还印被藏页面的名字（pageWords 滤 beta 项）。
- **③eval 回退路（§4-3 照走）**：92.1%（116/126）invented=1 对基准
  95.2%（119/125）0——case-02 钱进决议文字＋figures 清空（−3）、case-04
  「Kutipan derma RM830」发明成决议，根因＝prompt 段明文「同一决议也留
  在 resolutions＝刻意记两次」弱化 G1 一实一记。prompt 段整段回退
  （git checkout 基准版，byte 同 8/29 立基准那份）；schema/lib/UI 照留
  ＝financial_resolutions 永远 undefined、面板不出、零害。**没重跑 eval
  确认**（回退后 prompt 与基准逐字同，重跑只是花钱量采样方差）。
- **④花钱项全收**：三支探针重跑全 PASS（i1-81：D47 真链路 5 次扣费/
  seed 行累计/fence 5 页/21 页 6 段 55.1s 全对，86 场起的欠账结清；
  d0-56：45s 修与 Office 直传全绿；createorg-68：33.1s 一次落地）；
  D37 真 vendor 合并写作＝eval:quality 3/3 PASS 0 findings（真管线含
  checkMergedFacts）。
- **测过**：tsc 0 · eslint 20（基准逐字同）· vitest **1219（+27）** ·
  build ✓ · 三条 e2e 全绿（money S0-1b 改 D49 契约：非 operator 404＋
  404 画面无内容；roles W-2 偶发瞬断 6 跑 4 断后改 15s 上限轮询，
  连三绿——真回归 15s 也救不了，只吸时序噪音）· probe-einvois-94
  14 项 PASS · check:migrations 39 全 APPLIED · 零 migration 零 env。
- ⚠ 没能验证的：operator 正向半边（面板可见、BETA 徽章观感、RM10,000
  门槛三语文案在真 UI）——probe 进不了 ADMIN_EMAILS 帐号，22 支单元
  测试钉住逻辑，可见半边＝J §6 ② 自己帐号一看；面板有真数据要等
  prompt 二轮（现在 AI 不吐 financial_resolutions）；assistant 的
  tarikh_akhir 工具与 chat prompt 能力清单仍会在**文字**里提 e-Invois
  截止日（工具 ctx 没有 operator 位，动它要碰 chat 契约——留给 J 拍板
  要不要下一场收）；Vercel 线上闸的真行为（本机 next start 已证）。

### 上一场做了什么（89 号场 ✅，92 号报告——J＋tester 第二轮反馈八件事）

- **①–⑤ 小件**：章程显示梳头（constitution-display.ts 纯档＋org197
  三形态测试；两处清单接上；数据零改动）· portal 家族收尾
  （portalContainer()——Sheet/Tooltip/HoverCard 进 .v2-root，全站扫过
  再无逃兵）·「可以不填」→（选填）六档 · UploadLimitNote 缩一行
  格式进 title · .ics 改「加入手机日历」（下载行为 byte 同）。
  probe-ui-89 逐项验＋4 张截图（eval/reports/proof-89-*.png）。
- **⑥ minutes 多页排队（UX only）**：onPhotoPicked 学会回报成败
  （Promise<boolean>），notes-review 排队机（ref 拿最新 callback——
  stale closure 会让第 2 页覆盖第 1 页，档内写明）；BeforeReading
  一次、进度人话、坏页停、续读、随时加页。**钱零改动**：路由零 diff，
  probe-queue-89 拦截钉死请求数与 ai_usage 0 行。
- **⑦ D48 双硬挡**：eroses-committee.ts 一份清单管表单挡/表格
  amber+banner/申报挡三处；fillCommitteeErosesGaps 原地补四栏；
  minutes-document BM 卡原地对照表＋?tambah_nama 带参加人；
  members/page 的 8/19 旧拍板注释改写指向 D48（音译风险留档）。
  probe-h1-69（+负路径）/probe-members-51/probe-h2-69 全改全重跑全绿。
- **⑧ D47 章程收费**：constitutionReadActions/Delta（任意切法加总
  =整本价，测试证明）；续读令牌加 pagesDone（旧令牌 30min 内失效＝
  诚实退回重新收费读）；route 每请求只扣自己页数的增量、退款只退
  自己的；requireAiQuota 部分扣款失败自动退（intake 旧潜洞一并补）；
  估价行/续读文案三门跟上；A6 与 demo 不动。probe-i1-81 断言对版
  **未重跑**（无 AI 授权）。
- **测过**：tsc 0 · eslint 20（基准逐字同）· vitest **1192（+38）** ·
  build ✓ · 三条 e2e 全绿 · 新旧六支探针全 PASS（全零 AI）·
  probe-rls-87 --expect=after 264 项 0 mismatch（J 贴的 39 验收）·
  check:migrations 39 支全 APPLIED exit 0 · 零 migration 零 env 零 AI 费。
- ⚠ 没能验证的：⑧ 真厂商整链路（probe-i1-81 ≈US$0.04 等授权）；
  ⑦ 表单硬挡在真名册上的体感（会不会逼出当场音译，D48 有风险注记）；
  手机真机三处观感；首页门多张章程照片仍是每张各扣（89 前旧行为，
  与 D47 公式不一致——见未决 #16）。

### 上一场做了什么（87 号场 ✅，88 号报告——⑨ 上线后第一批）

- **① 收据 QR 查证页（D46，完整验收）**：receipt-verify.ts（HMAC token，
  无期限、domain-separated、零 migration）＋receipt-qr.ts（qrcode-generator
  编码、jsQR 真解码钉住）＋receipt-pdf.ts verifyUrl 参数（无＝旧版面
  一字不变）＋/verify/resit 公开页（三语堆叠、三种话：查到只覆述纸上
  栏位／查无＝没开过＋检举管道／DB 打嗝＝稍后再试）。三条出 PDF 的路
  同一扇门 /api/receipt-pdf（S0-1），QR 三路同源。qr-in-pdf.ts＝测试/
  探针用 content-stream 解析器（从 PDF bytes 还原 QR 矩阵）。
  probe-qr-87.ts 16 项全 PASS＋三张截图留证。
- **② RLS 深化（半成品等通电）**：migration 39 只写档（14 张表写入
  按角色收紧；读取不动；档尾 ROLLBACK；档头人话「10 分钟在场才贴，
  贴完跑 probe-rls-87」）；probe-rls-87.mjs 基线 --expect=before
  264 项 0 mismatch（今天 DB 层的洞：collector/committee 能写会议/
  名册/捐款，全靠 server action 一层）；--expect=after 是 J 的验收。
  盘点表（policy 现况＋每张表哪支 action 用哪种 client）在 88 号报告 §2。
- **③ 三支探针重跑**：d0-56/createorg-68/i1-81 全 PASS，合计 US$0.115。
- **测过**：tsc 0 · eslint 20（基准逐字同）· vitest **1154（+12）** ·
  build ✓ · 三条 e2e 全绿 · probe-qr-87 全 PASS（零 AI）· probe-rls-87
  基线 0 mismatch（零 AI）· check:migrations 恰好一支 NOT YET＝39。
- ⚠ 没能验证的：39 贴上后的真行为（贴完 --expect=after＋重跑 e2e:roles）；
  真手机真相机扫纸上 QR（headless 已证可解码，31mm 远大于下限）；
  Vercel 线上 /verify/resit＋NEXT_PUBLIC_CONTACT_EMAIL 有没有设；
  org 被 PDPA 全删后其收据 QR 显示「没开过」＝诚实结果，先记下免得
  日后当 bug 报。

### 上一场做了什么（86 号场 ✅，86 号报告——85 号小单六件事）

- **① NAMA 补洞＋讯息三分**：constitution-identity.ts 认「(hendaklah)
  dikenali sebagai」＋切「selepas ini disebut…」同句尾巴（三语版本）；
  新 findNameClause() 把「条文在不在」与「名字读不读得出」分开；
  org-identity-panel 三种话：(a) 真没有照旧 (b) 条文在抓不准→引 verbatim
  ＋「MinitAI 现在用的名字是 X，不一样就到设置改」 (c) 页没拍全→NotFound
  点名缺条照旧。sampleClauses 补 Fasal 1（与 contoh 生成器逐字同源，
  生成器与 PDF 都没动）；铁线测试钉住名字与两个变体。
- **② 60 hari 误标**：readNoticeDays 只认 30 字内（不跨句）贴着 notis/
  notice/通知 的「N hari」；contoh Fasal 14（呈报 Pendaftar 的期限）铁线
  测试 noticeDays=null、majority/GM/ROS 照旧读出；中文「开会前 21 天要
  通知会员」照读（钉住）。
- **③ 系统检查门改平台管理员**：/health callerMayReadHealth 改
  isOperatorEmail(getSessionUser().email)（admin-gate，/admin 同款，
  fail-closed 照旧——85 号坐实旧门在多租户下人人可看 env 名单，是自架
  时代假设过期）；settings/system 的「系统检查」行同 operator 门＋文案
  去自架化；检举冒用行照旧全员；拒绝卡沿用、「机构管理员」改「MinitAI
  平台管理员」三语。侧栏入口没动（manage_org）＝等 J 拍板要不要全开。
- **④ 读章程先讲价**：constitution-pages.ts 新 estimateConstitutionRead
  （+4 测试，3.1 s/页基准）＋components/constitution-read-estimate.tsx
  一行三语（≥90s 讲分钟）；constitution-read-client 新
  countConstitutionPages（pdf-lib 数真页数）。/constitution staging 条
  显示预估、送出钮改「开始读 —— 共 N 页」；create-org 选档即显示预估
  （不加第二颗钮，读取跟创建那一下跑——照意图不照字面，报告记明）；
  ask-box 长 PDF classify 认出章程→停：预估＋开始读/先不读；resume 免
  重讲价；闸开时主送出=同意不重扣 classify。demo 路零 AI 未碰。
- **⑤ pindaan 卡收敛**：AmendmentDisclosure（details/summary 预设收合，
  标题行＋「点开看您自己的章程是怎么写的」＋箭头）；内容一项没删。
- **⑥ 地址读出来**：findRegisteredAddress/findAddressClause（heading 以
  alamat/tempat urusan/address/地址/会址开头＋第 1/2 条带地址关键词——
  contoh 地址在 Fasal 1 的 1.2 句，只看 Fasal 2 会漏；「No./Lot」句点
  lookbehind 不切地址；atau di mana-mana 尾巴切除）；AlamatRow 三态
  （读出/引原文/沉默）；orgs 无地址栏（查证）→ 只显示＋出处，零 migration。
  铁线测试：contoh 必回「No. 12, Jalan Tepi Sungai, 41100 Klang,
  Selangor Darul Ehsan」。
- **探针同步**：probe-d0-56、probe-i1-81 钉旧按钮「读这 N 页」的断言改
  「共 N 页」＋点「开始读」，i1 加「21 页预估行在场」一条。⚠ 两支都
  **没重跑**（烧真 vendor 钱，本场无 AI 授权）；probe-createorg-68 同。
- **测过**：tsc 0 · eslint 20（基准逐字同）· vitest **1142（+14）** ·
  build ✓ · 三条 e2e 全绿（本机真 DB＋next start，page errors 0）·
  check:migrations exit 0 零 NOT YET · 零 migration · 零 env · 零 AI 费。
- ⚠ 没能验证的：③ 用 J 真帐号开 /health 的放行路（e2e 帐号不在
  ADMIN_EMAILS，只能证被拒方向）；三支花钱探针的真跑；手机真机上
  disclosure 与预估行的观感。

### 上一场做了什么（82 号 ⑧ 助手场 ✅，84 号报告——免 AI 预备问答层＋面板重整）

- **K0 先验证（动刀前）**：probe-k0-82 证实面板对话**有留**（scoped
  localStorage `minit:<user>:<org>:chat.panel.v1`）——X 关、点外面关、
  整页重载，桌面 rail 与手机 sheet 全部找得回。J 的「不见了」最可能＝
  首页框与面板是两个对话（`chat.home.v1` vs `chat.panel.v1`，两把 key
  设计使然，probe 也断言了不互通）。→ Clear 鈕保留、缩小（K2）。
- **K1 免 AI 预备问答层（主菜）**：`src/lib/prepared-answers.ts`（纯逻辑
  ＋14 支测试）——8 条入口（年度呈报/开收据/什么是 e-Invois/生成 e-Invois/
  日历在哪/会议记录在哪/什么是 eROSES/我要上传文件），三语答案照现门牌
  写（/filings=308 转 eroses 那套）；深连结按钮只从 ask-routes 白名单来
  （死按钮教训）；保守匹配＝词界比对（cek/kecekapan 教训钉在测试里）＋
  trouble 词（salah/错/why/delete…）与 >120 字一律照旧送模型；命中语言＝
  回答语言。chips（SUGGESTED_QUESTIONS）由这支档拥有，面板与首页共用；
  免费交换不进 /api/chat 的 history（不吃 MAX_TURNS 不花 token）。
  UI 两面接上：命中→泡泡直出＋「⚡系统直接回答，不扣 AI 用量」三语标注。
  ⚠ 英文 trouble 词一度收了 "fail"——马来语 fail＝档案，K6 整条被误杀，
  测试当场抓到（改 failed/fails）。
- **K2 Clear/用量收纳**：Clear→标题列 ↺ 小图标（ConfirmedAction 先问，
  §1-10）；徽章行＝「本月已用 X%」＋「这轮还能问 N 题」小字＋ ? 图标
  （Modal 弹窗讲解：月配额/轮数重置/太长变慢/预备层免费）；答案区不再
  被任何说明块盖住。首页同款收纳（Clear 带确认、一行计数）。
- **K3 手机面板**：sheet 高度 `h-[calc(100dvh-4.5rem)]`（原 80vh 浪费
  ~150px；dvh 跟键盘缩）。probe-k3-82（375×812）：sheet 735px、无横向
  溢出、答案 ≥200px 可见且 elementFromPoint 无遮挡、深连结真导航、
  ? 弹窗进出视口、输入框在屏上。
- **K4 语言跟提问走**：chat prompt 的 HOW TO WRITE 换成 ANSWER LANGUAGE
  条（跟问题语言；判不出→介面语言，route 从 minit-lang cookie 读、
  all→bm）；chat.test.ts 契约钉住。真 vendor 验收（介面 BM 一场三问）：
  BM→BM、EN→EN、ZH→ZH，3 笔 chat_turn US$0.0025。J 若要改成「跟介面
  走」＝改 chat.ts ANSWER LANGUAGE 那一行。
- **K5 首页问答对话式**：讯息流在上、输入框在下（与浮动面板同一逻辑，
  两处体验一致——这就是选它的理由）；送出后 scrollIntoView 滚到最新
  答案＋输入框（ref 旗标，恢复旧对话不抢滚）；How it works、上传门、
  示范入口原位。
- **K6 档案意图指路**：预备层 upload_file 条目（三语、按钮回首页那道门）
  ＋chat prompt 能力清单一行＋FILES 段（不许答「这里不能上传」就完，
  suggested_page=home）。聊天面板照旧不开上传门（拍板 4）。
- **收尾死按钮全名单**：probe-deadbuttons-82.ts（tsx，直接 import
  ask-routes 不抄清单）——15 颗 key 逐颗渲染＋点击＋断言落页，15/15 活；
  /filings→/filings/eroses、/settings→/settings/display 都按现门牌断言。
- **测过**：tsc 0 · eslint 20（基准逐字同）· vitest **1128（+19：prepared
  14＋chat prompt 5）** · build ✓ · 三条 e2e 全绿（最终 build 复跑；
  minutes 首跑撞旧陷阱「cleanup 段偶发 fetch failed」重跑即过）·
  probe-k0/k1/k3/k4/deadbuttons-82 全 PASS · probe-i3-81 回归全 PASS ·
  check:migrations 38 全 APPLIED · 零 migration · 真额度 US$0.0025/0.10。
- ⚠ 没能验证的：手机**真键盘**顶不顶输入框（dvh 是设计推理，headless
  出不了键盘——tester 真机一摸便知）；「all 并排模式」的观感；预备答案
  8 条入口的覆盖率（上线后看真问题再扩，宁可漏配不可答错）；J 原始
  「对话不见了」场景仍未重现（若再报，先问是不是两个框搞混）。

### 上一场做了什么（81 号场 ✅，83 号报告——章程分段读＋A6＋三件修）

- **I1 章程分段读**（主菜）：`src/lib/constitution-pages.ts`（段长 4 页＋
  A6 数字，纯逻辑+测试）· `constitution-continuation.ts`（HMAC 续读令牌：
  rowId+orgId+pagesLeft+30min 期限，pagesLeft 是防滥用上限，零 migration）·
  `constitution-read-client.ts`（浏览器数页/拆段/逐段送/合并/断点续读，
  三个门共用）。/api/extract-constitution 学会 `docPages`（首段declare＋
  收 1 action＋A6 围栏一次）与 `continuation`（后续段零收费、cost 种子
  累计到同一行，createUsageRecorder 新 seed 参数）；「教人拆档」句从
  章程路退役。/api/intake 学会 `classifyOnly=1`（长 PDF 只送第一段问
  「这是什么」，只收 classify；章程转分段读器、其他类型整份照旧）＋
  围栏改「先收 min(页数,5)、分类后非章程补差额」。
- **I2 A6/D45**：三个章程门一律扣 min(实际页数,5)；分段读整份只收一次；
  DECISIONS.md D45 落档（822 行「等 J 说」过期句改掉）。
- **I3 死按钮**：probe-i3-81 证实两个面（手机 sheet／桌面 rail）按钮可点
  可导航、elementFromPoint 无遮挡——61 号嫌疑 (a) 现版重现不出；坐实的
  死案只有「已在目标页＝同 URL no-op」，ai-panel 的按钮同路径点击时
  window.scrollTo 顶部（永远有可见回应）。完整版重设计仍归 ⑧ 助手场。
- **I4 出席同名**：`src/lib/attendee-identity.ts`（name+note 身份键）贯穿
  roster-picker（勾选/全选/变灰全按键）、minutes-store.addNamedAttendees
  （签名改收 {name,note}[]、note 写进出席列）、attendance-review（打字加人
  同键、备注在收合行与展开行都显示）；extraction.attendeeSchema 加可选
  note（AI 不吐、旧资料无键照旧，round-trip 相容测试钉住）。
- **I5**：probe-e3-64 按「migration 36 已贴」新契约改（fail-open 提示不得
  出现＋ignore 必须落 suggestion_marks 行）重跑全 PASS；bench 真数据表
  与 3.6-flash 章程速度实测（数字在上方一句话与 83 号报告；env 没动。
  gemini-3.5-flash 没跑：单模型估价 $0.24 就爆掉本场 ≤$0.30 授权，
  72 号表已载它不是候选）。
- **测过**：tsc 0 · eslint 20（基准）· vitest 1109（+22：constitution-pages
  8+continuation 5+attendee-identity 5+extraction note 相容 1 ≈22 支净增）·
  build ✓ · 三条 e2e 全绿 · probe-i1-81 全 PASS（最终 build 复跑过）·
  probe-i3-81 全 PASS · probe-e3-64 全 PASS · 真额度 ≈US$0.24。
- ⚠ 没能验证的：J 的真 undang-undang 件走分段读（org197 的指纹病灶——
  合成 21 页与 CONTOH 都过了，真件等 J 传一次）；分段读在 Vercel 线上的
  真行为（本机 next start 无 60s 杀，但每段各自一请求＝设计上已在墙内）；
  续读令牌 30 分钟过期后的降级路（代码走「重新收费的新读取」，未实测）；
  手机真机的死按钮原始场景仍未能重现（tester 若再报，先问「当时是不是
  已经在那一页上」）。

### 这一场做了什么（78 号小单 ✅，80 号报告——eROSES 前门＋COPY 围栏）

- **① /filings 门牌**：page.tsx 改成 permanentRedirect(308)→/filings/eroses
  （?doc 保留）；filings-view.tsx（846 行旧长页）删除；nav 零改动（前缀
  比对，/filings/laporan 也照亮）。残余功能逐项搬（80 号报告盘点表）：
  「这类会议不用登记」结论先行＋摺叠、PDF 水印钮＋FenceCleanDownload＋
  25MB 句 → mesyuarat 页；净额行＋minit 财务摘要交叉核对行 → 年报第 5 步；
  laporan 直达行 → 卡片入口页脚；flow 第 9 步「完成」与 activity 两连结
  改直指 /filings/eroses。
- **② flow COPY 围栏**（D44 延伸，J 8/30 拍板）：flow-data.loadFlowBase
  多带 `fence`（getFenceState，demo isDemo 自动豁免、读失败开着败）；
  flow-ui.ValueRow 新 `locked` prop（值 select-none＋copy/cut/contextmenu
  拦截＋🔒 disabled 按钮，与旧 /filings §1-11 真锁同款字句）；九步＋
  mesyuarat 全部 ValueRow 接上。
- **测过**：tsc 0 · eslint **20**（基准 21−1：删旧长页带走一条基准内旧错；
  改动档单独 lint 0 条）· vitest 1087 · build ✓ · 三条 e2e 全绿
  （minutes 新增：308 门牌＋doc 保留、三张卡、S0-5 改在 mesyuarat 页验、
  trial org 🔒＋select-none＋干净下载在场＋无活「复制」按钮漏网）·
  probe-h2-69 51 项重跑全 PASS · probe-d2-56 重跑全 PASS ·
  check:migrations 38 支全 APPLIED（本场零 migration）· 零 AI 费。
- ⚠ 没能验证的：demo org 走 flow 不被锁（靠 getFenceLimits 首行 isDemo
  放行，与成品页同路，未专开 demo 实测）；308 是浏览器会记住的永久转址
  （若未来 /filings 要改回真页面，得先想快取）。

### 上一场做了什么（69 号场 · 包 H4 ✅，77 号报告——收尾小修）

- **§1-10 全站删除确认**：新共用件 confirm-delete.tsx（ConfirmingDeleteButton
  ＋ConfirmedAction render-prop 版，包既有 ConfirmDialog/portal-target）。
  14 处接上：理事/词库/分组×/草稿/审计员/银行户口/成员移出/日历活动×2/
  章程重来/工作区栏位垃圾桶（空列照旧免问）/钱区清空批/删一笔/删所选/
  清空打字草稿。window.confirm 全站清零（裸框、讲浏览器语言、手机可关）。
- **§1-12 银行摘录**：①查证**非跨 org**（org_id 定界＋RLS 双保险）——
  tester 看到课表＝最新 confirmed minutes 选错内容＋CONTOH 示范，非 P0；
  ②决议改可勾选（关键词命中预设勾，index 送服务器、文字只从 DB 来，
  全不勾三语拒绝；"cek"在"kecekapan"里会误中→人勾的赢，+3 测试）。
- **§1-13 Members & invites 破版**：两层根因——SettingsRow 用 sm: 视口
  断点（§6 壳里说谎陷阱→改 @xl: 容器断点），且整个管理 UI 被塞进
  46%/54% 的「设定列控制栏」→改 SettingsBlock 全宽堆叠、说明折叠顶上；
  select 加 min-w-0。探针断言无横向溢出。
- **§1-15a 草稿收纳**：工作区收合一行（数量＋最近一份名字时间），展开
  最多 2 份＋「看全部→」；新页 /minutes/drafts（历史页旁入口、records
  版 chrome、按更新时间排、确认删除）；自动起名实测「Mesyuarat Agung
  Tahunan (AGM) — 2026-05-20」；专页 Resume=/minutes?draft=key（工作区
  接手前先 stash，G3-2 照旧；接完抹参数）。
- **测过**：tsc 0 · eslint 21 · vitest **1087（+3）** · build ✓ ·
  三条 e2e 全绿 · `probe-h4-69.mjs` **21 项 PASS**（自动起名对版→收合/
  展开→专页→删除弹窗取消留/确认删（DB 验证）→Resume 回工作区内容在
  参数抹→理事删除同款双验证→invites 版面三断言→ZZZ 全删）。
- ⚠ 没能验证的：银行摘录勾选的真 UI 全流（要带决议的 confirmed
  minutes；单元测试钉住）；tester 破版截图的原始视窗条件。

### 这一场做了什么（69 号场 · 包 H3 ✅，76 号报告——onboarding＋机构上限）

- **§1-6 /orgs/welcome 引导序列**（create-org 直接落这里）：章程→名册→
  Maklumat Am 三张顺序卡；**完成状态问数据库**（别页做完回来自动 ✓）、
  跳过是「稍后填」按钮（localStorage 每装置）、Maklumat 步直接嵌 H2 的
  就地填表单；三步齐→收尾卡。旧主页 ?welcome=1 卡删除（welcome-card.tsx
  拆掉不留孤儿）；/orgs 页加常驻入口；constitution setup banner 加
  「继续开机构引导」。新/老机构两套清单合一（DB 驱动的 ✓ 取代 lama=1）。
- **§1-14 机构上限**（J 深夜拍板照做）：旧 MAX_ROOT_ORGS_PER_USER=3 及
  其 members_roles 计数**整个删除**（不深挖）；migration 38 只写档
  （orgs.created_by＋回填最早 hq_admin；createOrg 写入带剥离重试；
  salin 38 项＋探针）；新规则一条查询 created_by=me AND root，≥方案
  上限（trial=1）→「多机构需付费方案——联络 MinitAI」三语。被邀请
  构造上数不到；分会没动；20 个防滥用总上限保留。38 未贴＝fail-open
  （旧检查已拆，新上限贴上才生效——报告白纸黑字告诉 J）。
- **测过**：tsc 0 · eslint 21 · vitest 1084 · build ✓ · **三条 e2e 全绿**
  （三支脚本「落 welcome=1 主页」旧断言按新契约改成「落 /orgs/welcome」）·
  `probe-h3-69.mjs` **14 项 PASS**（建 org→引导页→稍后填×2 顺序推进→
  就地填电话自动 ✓→收尾卡→REST 种名册重开自动 ✓→旧卡消失→
  **连开 4 个总机构全放行＝旧 3 上限证死**→ZZZ 全删）。
- [SKIP]（诚实）：1-root 拒绝句本身（38 未贴数不了）——探针分支写好，
  J 贴完 38 重跑即走拒绝路。

### 这一场做了什么（69 号场 · 包 H2 ✅，75 号报告——eROSES flow 重构主菜）

- **§1-1 入口三张卡**（J #12 原话）：/filings/eroses = 🗓️ 登记会议
  （/mesyuarat）· 📋 年度呈报（/penyata）· ⏰ 截止日（/tarikh），?doc 跟卡走。
- **年报 = folder of routes（Hard Rule 13）**：/penyata 起点（选会议＋财年
  区间＋大字空状态）→ /penyata/langkah/1…9 一步一页；共用状态在 URL
  （?doc/?dari/?hingga）；LangkahRail 名字逐字照 portal，走过的步打 ✓。
  旧 868 行单页 eroses-guide.tsx 删除（内容与诚实计算说明原样搬进各步）。
- **§1-2 缺值原地填**：第 2 步 Maklumat Am 小表单＋银行户口就地加（重用
  settings 的 server action）；第 3 步缺 IC 名逐人一行补（新精简 action
  fillCommitteeIcName）；第 4 步审计员就地加（重用 addAuditor）；
  存完 router.refresh 重读，全程不离开 flow。
- **§1-15b 每步示意图**（portal-sketch.tsx）：假浏览器列＋portal 勾选
  rail＋栏位框，每框标「复制/自己填/上传/读了再勾/portal 自动带出」＋
  ①②③三句；版面照 J 的 17 张截图、**数据全虚构**、图下写明是示意图。
- **§1-11 真锁**（现场拍板）：/filings 免费版值区 select-none＋copy 拦截
  （FenceLock 同族），不再是「按钮灰了字照样反白」的假锁。📌 flow 内
  COPY 无围栏照旧（D3 就没有）——要不要圈进 D44 等 J 拍板，报告有 📌。
- **测过**：tsc 0 · eslint 21 · vitest 1084 · build ✓（5 条新路由）·
  三条 e2e 全绿 · `probe-h2-69.mjs` **51 项全 PASS**（打字 AGM→问句→
  三张卡→九步全走、URL 不出 flow、三处原地填全进真表、金额对到分、
  真锁双断言、ZZZ 全删）· probe-d3-56 档头标 SUPERSEDED（旧单页断言）。
- ⚠ 没能验证的：引导文案/示意图 vs 真 portal 逐字对版（等 J 圈）；
  真 org 全套资料走 flow 的观感（tester 清单在 75 号报告）。

### 这一场做了什么（69 号场 · 包 H1 ✅，74 号报告——名册补完）

- **Migration 37 只写档等 J 贴**（`20260915000000_roster_email_state.sql`＋
  salin 37 项＋check:migrations 2 条探针——实测 37 是唯一 NOT YET）：
  committee_roster + email + state（eROSES AJK 步真的要的欄）。fail-open：
  增/改走点名剥离重试梯度（OPTIONAL_COLUMNS 四欄共用一个 ladder），
  页面读取三阶退阶（37→32→base）。
- **§1-3 列内 Edit**（committee-table + EditCommitteeRow）：每列全欄位可改；
  空姓名（种子列）显示 amber「还没填」。电邮格故意 `type="text"`——
  `type="email"` 的浏览器原生验证会抢在前面且只讲浏览器语言（探针撞到
  才改），现在坏电邮由伺服器三语拒绝＋该格红框。
- **§1-5 「加常见职位」一键起表**（positions-template.tsx＋
  seedCommonPositions）：默认 7 列（四职位＋AJK×3），只补缺的（按「/」
  分段精确比对防止 Pengerusi 误盖 Naib Pengerusi），名字空着等 Edit；
  **章程接上**：新纯函数 `src/lib/constitution-committee.ts` 零 AI 解析
  「terdiri daripada seorang Pengerusi…」句（CONTOH 实测 5 职位 11 人），
  显示「照章程（Fasal N）要 X 名现在有 Y 名」，读不出整块不显示。
  Pemeriksa Kira-kira 刻意不进种子（auditors 卡才是它的家，一行字指路）。
- **§1-4 Excel 模板 8 欄**（+Gelaran/E-mel/Negeri/Nota）＋解析器**照表头
  认欄**（bulk-paste committeeHeaderMap：空格是位置；认不得的欄有资料
  整行拒收；旧 4 欄模板照样对号）；无表头贴字新增 @→email、州名整值
  比对→state 两个辨识；批量匯入带四个可选欄＋整批剥离重试。
  xlsxToPasteText 不再代吞表头（两个 parser 各自吞自己的）。
- **§1-7/8/9**：敬语按语言分组、介面语言组排最前；Title (optional)；
  📅→lucide CalendarDays；长日期句删；IC 说明缩一句；「Who can log in」
  行删（probe-members-51 的旧断言按新契约改）。
- **测过**：tsc 0 · eslint 21 · vitest **1084（+13）** · build ✓ ·
  **三条 e2e 全绿** · `probe-h1-69.mjs` **18 项 PASS**（一键起表→再按不重
  →Edit 补名/IC/电邮/州→表单加人→坏电邮三语拒→8 欄 xlsx 真上传匯入
  →ZZZ 全删）· probe-members-51 17 项重跑全 PASS。
- ⚠ 没能验证的：37 贴上后 email/state 真存档路（两处 [SKIP] 写明，贴完
  重跑 probe-h1-69 即变 PASS）；章程对照行的真章程 org 路（单元测试钉住）。

### 这一场做了什么（68 号 ⑦ 品质场 · 包 G3 ✅，73 号报告——12 条 UX 件＋timeout 真因）

- **「AI took too long」真因根治**（§1-8）：git 探针证实 45s 修（D0）
  **当时已上线**（origin/main=20c6d52），J 照样撞——所以真因只有一条：
  **flash-lite「标 missing 却塞值」**→Hard Rule 1 打回整份→rule-7 重读爆
  50s 预算→包装成 timeout。修＝`coerceMissingFieldsEmpty`（parse 前
  信标签、抹值不提升，extraction.ts 五条管线全装）。实测 CONTOH 8 页
  25s 读通 41 条；**真机 create-org 33.1s 一次过落地**（probe-createorg-68，
  ZZZ 全删）。失败 UI 诚实化：红卡自己一张＋原地「再试一次」，绿框只讲
  成功。⚠ 修后曾有一轮探针以旧指纹失败、紧接重跑全过（疑杀旧 server
  race）——线上如再见，先查 app_errors 指纹。
- **UX 九件**：浮窗左下 resize；草稿照片签名 URL 载回＋按真类型标
  （signPhotoPaths，未决 15 结案）；Resume 承诺白纸黑字；首页卡＋侧栏
  New minutes 未完成草稿徽章（countUnfinishedMinutesDrafts，读不到不出）；
  「N 项等你确认＋确认完才能写正式文件」；eROSES 空状态大字（committee
  型/无 confirmed minutes）；出席 Next 闸（没加人没按稍后补不放行）；
  ganti/替换/menggantikan/digantikan oleh 换届卡（旧人须在名册给职位、
  新人不在才出，golden=样本 A 页边那行）。
- **held-out 最终验收（两半都过）**：白板活动照 0 缺陷（顺手修掉两个真病：
  斜线复合标签被拆组→prompt 规则；未决区块双重编号→渲染层剥自带编号）；
  手写 Charity 照 0 缺陷一次过；**中文 typed docx 自动走结构化路**，
  42 段 zh→BM 一次过围栏 0 缺陷。
- **测过**：tsc 0 · eslint 21 · vitest **1071（+13）** · build ✓ ·
  三条 e2e 全绿（roles 一项偶发瞬断重跑过——既有陷阱型）· 品质 eval
  3/3 PASS。真额度累计 ≈US$0.30/1.00，失败读取全退款。

### 这一场做了什么（68 号 ⑦ 品质场 · 包 G2 ✅，72 号报告——主菜）

- **成文分两条路**：结构化（G1 读出的打印 minit）＝**确定性组装零 AI 费**
  （composeStructuredMinutesMd：总表由节重建、段落 verbatim、own_no 原样）；
  要换语言的段落＋节标题才叫模型（runPhraseMinutesItems 就地措辞，
  buildPhraseWork 一份协议 route/eval/probe 三处共用）；无结构照旧模型
  编排，渲染统一走 minit-format 版式。
- **新围栏 checkLatinNames**（实战抓到）：zh 版把 Latin 人名音译成发明
  汉字（checkNames 对 zh 天生盲）——名字形状的拉丁字串（敬称标记人名＋
  大写多词串扣文体词表）必须逐字存活，违者进 repair。实测第一轮被挡、
  第二轮全对。两个迴圈（编排/措辞）都装了。
- **zh 自然化**：kind 前缀 zh 不印（bm/en 保留）；措辞 prompt 禁公文腔。
- **敬语 chips**（拍板 7 后半）：honorific-match.ts 纯函数＋FieldRow
  suggestions prop＋loadFilingRoster 带 honorific（32 未贴退阶）。
- **预览同源**：结构化文件免费预览＝同一支组装器（byte 相同，只差水印/
  audit line）；PDF 学会 **粗体** 会议标题行（置中）。
- **真样本验收**：样本 A→BM 量尺 0 缺陷（改前 6）＋§1 病 1-4 全消；
  样本 A→zh 0 缺陷＋名字全保。品质 eval 3/3 PASS。模型对比
  flash-lite（要 repair）/flash/3.6-flash（一次过最便宜）——72 号报告表，
  等 J 拍板，env 没动。
- **测过**：tsc 0 · eslint 21 · vitest **1061（+22）** · build ✓ ·
  e2e:minutes ✓ · eval:quality 0 findings。

### 这一场做了什么（68 号 ⑦ 品质场 · 包 G1 ✅，71 号报告）

- **schema 学会文件结构**（extraction.ts，**零 migration**——都在 JSON）：
  可选新栏 meeting_time／attendance_count（整行照抄）／adjournment／
  prepared_by／endorsed_by；决议带 section_no／section_title／own_no
  （fail-soft：标记坏只丢标记）。**模型标 missing 的可选栏 parse 时剪掉**
  ——打字/白板流零新增核对负担（测试钉住）。
- **prompt 改版**：打印正式文件一段一条逐字照抄不摘要、总表不重复吐、
  页边注记归节；清单逐行绝不跳号；**一个事实只记一次**（钱行归 figures
  ——顺手治好 8/24 的 invented=1）。
- **notes-review**：结构化文件按「议程 N：标题」分组核对；会议组新增
  MASA/出席人数/散会句/签名栏核对列（页面有才出现）；决议列抽成模组级
  ResolutionRowBlock（两种分组共用）。
- **真样本实测**（迭代组，probe-sample-extract.ts，内容只落本机
  git-ignored）：样本 A 表头全 confirmed＋5 节逐节对上＋own_no 2.1；
  样本 B 25 条 1–12 无缺口；手写页 5 条对 5 行、任命进 office_bearers。
  探针＋eval 共 ≈US$0.06。
- **🔴 eval 重立基准**：95.2%（119/125）**invented=0**（2026-08-29 现行
  prompt；仍是印刷体合成图）。SUMMARY.md＋competition/summary-onepager.md
  对外句子已更新。
- **测过**：tsc 0 · eslint 21 · vitest **1039（+9）** · build ✓ ·
  e2e:minutes ✓（最终 prompt 的 build 上重跑，page errors 0）。

### 这一场做了什么（68 号 ⑦ 品质场 · 包 G0 ✅，70 号报告）

- **版式规格 `src/lib/minit-format.ts`（＋22 测试）**：标准马来西亚社团
  minit 版式（照 J 样本 A）——信头＋会议标题行、TARIKH/**MASA**/TEMPAT、
  出席人数照抄原字、Agenda 总表（原编号）、逐节正文（原编号＋散文段落）、
  penangguhan 照抄、签名栏带职称。双重编号在渲染层根治（自带编号的行
  永不再包一层；日期/时间不被误剥，测试钉住）。信头 `# MINIT MESYUARAT —`
  机器契约刻意不动（re-stamp/PDF/历史页都靠它）。
- **量尺 `lintMinitMd()`＋品质 eval `npm run eval:quality`**：§1 病历变成
  可数缺陷代号；三个**虚构** golden case（打印正式/手写混语/白板清单，
  A3：真样本不进 repo）跑真管线。**改前基准：打印正式型 6 findings**
  （masa/agenda_table/attendance_count missing＋content_lost×3），
  手写/白板型 0（丢东西的围栏本来就立着，病全在版式与散文保留）。
- **draft-minutes 迴圈抽一份** `src/lib/ai/draft-minutes-run.ts`：route 与
  品质 eval 共用（两份手抄会漂）。route 行为零变化。
- **基准重跑**：擷取 eval 92.9%（117/126）invented=1，与 8/24 一致；
  品质三案花费 ≈US$0.005，全场额度用了 ≈US$0.015 / 1.00。
- **样本夹分半（J 明令防过拟合）**：迭代组＝样本 A 打印版＋同场手写页＋
  样本 B 白板＋青班6 docx；**held-out**＝另两张照片＋三份 docx，迭代期间
  不看，最终验收才开。
- **测过**：tsc 0 · eslint 21 · vitest **1030（+22）** · build ✓ ·
  e2e:minutes ✓（page errors 0）。

### 这一场做了什么（64 号 AI 智能建议场 · 包 E3 ✅，67 号报告——主菜）

- **Migration 36 只写档等 J 贴**（`20260914000000_suggestion_marks.sql`＋
  salin-migration.bat 36 项＋check:migrations 2 条探针）：suggestion_marks
  表——每份记录每条建议一行 {suggestion_key, applied/ignored, decided_by,
  decided_at}，upsert on (org, doc, key)；RLS 同 auditors 形状。
- **成品页卡片区**（suggestion-cards.tsx＋suggestions-data.ts＋
  suggestion-actions.ts）：/minutes/history/[id] 在 eROSES 问句下出
  「💡 从这份会议记录读到的建议」；加人卡（任命日期自动带会议日期、
  换届提示现任、同名询问黄框全继承 members 的 action）、活动卡
  （日期三语写出、时间照抄）；确认 → ✓＋去名册/去日历指路；忽略 →
  留痕＋「已忽略 N 条」。按角色滤卡（加人卡只给 minutes_write；
  活动卡给 calendar_write；做不了的卡不渲染）。
- **fail-open 实测**（本机真 DB 未贴 36）：卡照出、确认照写、忽略记
  本机 localStorage＋卡上人话「migration 36」；SELECT_FULL 加 extraction
  栏（migration 11 已套用，BASE 阶梯不带）。
- **测过**：tsc 0 · eslint 21 · vitest 1008 · build ✓ · **三条 e2e 全绿** ·
  `probe-e3-64.mjs` **36 项全 PASS**（打字存档→三张卡带来源→忽略消失
  留痕→确认加人＝roster 真多一行（职位/任命日期全对）→确认活动＝
  events_meetings 真多一行（马来西亚当天＋"pukul 8" 照抄）→重开页
  三张卡全不再纠缠→ai_usage 0 行→ZZZ 全删）。
- ⚠ 没能验证的：36 贴上后「忽略跨装置」真路；真 vendor 照片→卡一条龙
  （同 zod schema，66 号报告写了为什么不烧）；卡上同名黄框的真点击路。

### 这一场做了什么（64 号 AI 智能建议场 · 包 E1 ✅，65 号报告）

- **`src/lib/minutes-suggestions.ts`（＋32 支测试）**：纯推导，零 AI 呼叫
  零写入。输入＝已存档 extraction＋现有名册＋现有日历；输出＝建议候选
  {类型, 内容, source_ref}（拍板 5：无来源不出卡）。
- **加人/换届**：只从 office_bearers 结构化栏位（prompt 本就把委任/选举导
  进这栏）；名册已有（任何职位、大小写空格不敏感）＝不出；同职位现任
  别人＝replaces 提示（只显示不代删——政府申报名单的移除是人的决定）；
  term_start 自动带会议日期。
- **加活动**：resolutions 文字里规则解析明确日期（ISO/12/9/12 Ogos/1hb
  Ogos 2026/9月12日/2026年9月12日）＋时间照抄原字；只出会议日**之后**；
  无年份且日期在会议日前＝当过去引用整条放弃**绝不跳年**；日历同日同名
  已有＝不出。
- **误杀防线（测试钉住）**：小写 may/jun 不当月份、month-first 不解析、
  「第3点」不当三点钟、「每月12日」不当日期、31/2 拒绝、会议无日期时只认
  带年份完整日期、名册读不到＝不出加人卡；上限 15 人卡/6 活动卡。
- **不上（照实）**：改地点/改资料（orgs 无地址栏无处可写）、散文里的
  新成员人名（规则猜＝误杀）、中文数字日期。
- **测过**：tsc 0 · eslint 21（基准）· vitest **1008 全过（+32）** · build ✓。
  e2e 未跑——纯 lib 没动页面（E3 卡片上线后三条一起跑）。

### 这一场做了什么（56 号 eROSES 场 · 包 D3 ✅，60 号报告——主菜）

- **拍板 9 落地**：/minutes/document 的「要贴进 eROSES 的内容」区块删除；
  保存落地页（/minutes/history/[id]）与 alreadySaved 面板问
  「要呈报 eROSES 吗？」→ `/filings/eroses?doc=<id>`；/filings 第 3 卡同款门。
- **/filings/eroses 九步引导**（照 J 的 17 张截图＝portal 的 Langkah rail）：
  server 聚值（pastePack/roster/auditors/Maklumat Am/banks/推导数/
  buildPenyataKewangan，财年区间取 orgs.financial_year_start）→ client 只
  渲染＋COPY。缺值格子指路（/members、设置→机构、/filings/laporan）；
  34/35 未贴＝「migration N」人话；非 AGM/EGM＝amber 拒绝照旧；步 1 带
  Pengurusan Mesyuarat 前置引导；步 9 讲 Seksyen 54A。
- **步 5 = D1-2 对照表上屏**：非零格「BM 标签 + 16,252.00 + N 笔记录 + COPY」＋
  总计对照＋Nota kiraan（assumed/实物/pending/undated）＋官方模板指路
  （拍板 7：公网无原档、在 portal 登入墙内——J 下载，报告有留言）。
- **测过**：tsc 0 · eslint 21 · vitest 976 · build ✓ · e2e ×3 ✓ ·
  `probe-d3-56.mjs` **30 项 PASS**（打字 AGM→存→问句→引导九步全在、
  旧区块消失、三格金额对到分、COPY 真复制；零 AI 费）。
- ⚠ 没能验证的：引导文案 vs 真 portal 逐字对版（等 J 圈）；34/35 贴上后
  步 2/4 显示真值的路。

### 这一场做了什么（56 号 eROSES 场 · 包 D2 ✅，59 号报告）

- **Migration 34/35 只写档等 J 贴**（salin-migration.bat 34/35 项＋
  check:migrations 5 条探针）：34=auditors 表（无 IC 号码欄，PDPA）；
  35=orgs.phone/financial_year_start/members_registered/members_voting＋
  org_bank_accounts 表。职位数/分会数**刻意不存**（推导：roster count/org 树）。
- **D2-1 审计员**：/members 新「审计员名单」卡（auditor-actions +
  auditors-card；minutes_write；现任人数 vs 章程提示；IC 名字照抄规矩同
  理事名单）。fail-open：表缺席＝卡上人话「migration 34」，页不白屏（实测）。
- **D2-2 Maklumat Am**：设置→机构新段（maklumat-actions + maklumat-am-card；
  manage_org）；银行户口表可增删；org-tools 永不 select org_bank_accounts。
- **D2-3 活动报告**：/filings/laporan（/filings 第 3 卡有入口）——
  `draft_activity_report`（新 AiAction）从 events_meetings＋confirmed
  minutes_docs 起草（空＝诚实 400 零扣费，实测 ai_usage 0 行）；
  laporan-aktiviti.ts 纯逻辑＋prompt 禁发明（untrustedBlock）；
  /api/laporan-aktiviti-pdf 走 financial-report 同款围栏文件线；
  buildTextDocPdf 从 agm-pdf 导出共用。
- **测过**：tsc 0 · eslint 21 · vitest **976（+7）** · build ✓ · 三条 e2e ✓ ·
  probe-d2-56 **11 项 PASS**（fail-open 实测）· probe-laporan-56 **7 项 PASS**
  （真 vendor 起草 $0.0007，两活动名都在可编辑稿）。
- ⚠ 没能验证的：34/35 贴上后的真存档路（本机 DB 未贴）；干净下载扣费路。

### 这一场做了什么（56 号 eROSES 场 · 包 D1 ✅，58 号报告）

- **D1-2 eROSES 科目对照（先做——它决定资料模型）**：
  `src/lib/eroses-penyata.ts` = Penyata Kewangan 全欄位 taxonomy（BM 标签
  逐字照 J 的 17 张截图，含 portal 自己的「Kahirat kematian」「officeSupplies」
  怪写法）＋ `buildPenyataKewangan()`（每格 {金额, 行数}＋诚实侧栏：in-kind
  列出不加总、对不上类别的行按 Derma 计入另计 assumed、支出只算
  recorded+paid、pending 另报、年度过滤 inclusive＋undated 计数）＋
  `penyataAmount()`（"16,252.00" portal 格式）。
  `src/lib/money-categories.ts` = 收入/支出类别单一来源（原藏两个组件里），
  每项带 eroses 欄位 id；🔴 value 是存 DB 的字永不改名。支出类别新增
  「Kebajikan & khairat」（eROSES 2.1 有格、旧清单没地方放）。15+5 支测试。
- **D1-1 两表合并**（51 号拍板 9① 欠的那半，未决 14 结案）：
  manual-income.tsx 删除；type-donations.tsx 吸收其三样独有件——每行
  「类型」select（换类型清掉属于别类型的旧用途字样）、每行转账截图
  （File 不进 localStorage 草稿、addAll 前逐张上传、失败停整批点名哪行）、
  拍单据门（onSlipPhoto+类型 select）。存档格式 `storedPurposeFor()` 与
  两张旧表 byte 相容——**donations 表零 schema 变动**；旧草稿（无 category）
  过 guard 不丢（测试钉住）。register-store 删 addManualDonation（无呼叫者）。
- **测过**：tsc 0 · eslint 21（同基准）· vitest **969 全过（+20）** · build ✓ ·
  **e2e:money ✓（9 笔打字流原样过新表格）· minutes ✓ · roles ✓**。
- ⚠ 没能验证的：从新表格出发的转账截图真流（旧表单时代也没有 e2e）；
  对照表 vs J 真报表数字（等 D3 上线 J 对一次账）。

### 这一场做了什么（56 号 eROSES 场 · 包 D0 ✅，57 号报告）

- **D0-2「The AI took too long」真因＋修**（拍板 5）：线上取证
  （probe-timeout-56.mjs，唯读）——J 8/29 那笔＝org 91 extract_constitution
  扣费 49s 后退款＋app_errors VendorTimeoutError，cost NULL（三次尝试全被
  20s abort 掐断）；8/27 旧 MAX_TOKENS 案反推生成速度 ≥410 tok/s ⇒ 51 场把
  ceiling 提到 64k 后 20s 单次时限必死（**截断案的修法把死因搬进了逾时**）。
  修：`EXTRACT_ATTEMPT_TIMEOUT_MS=45s`（三方配对算术在 http.ts 档头），
  `VisionJsonRequest.timeoutMs` 通到 gemini/openai，七支文件路由全传；
  `TIMEOUT_SPLIT_ADVICE_PAGES=10`——大 PDF 超时是决定性失败，
  vendorFailureResponse 加 bigDocument → 教拆档不教重试。
  **实测：CONTOH 8 页 42.0s 一次读通（$0.052）**；42s 贴近 45s 墙＝8 页已近
  上限，更大的会被教拆档（设计使然，60s serverless 硬顶下无解）。
- **D0-1 章程页 A-5 化**（拍板 3）：onFilePicked（选了就读就扣）拆成
  stageFiles＋sendStaged——多张照片＋缩图＋可删＋「＋加下一页」＋
  「读这 N 页」按了才送；PDF 一次一份；失败页停在原地不丢已读的页。
  「多张只限照片」抽成 `src/lib/multi-page-staging.ts` 纯函数，AskBox 共用。
  input 拿掉 capture（同 AskBox #8：才有相簿多选）。
- **D0-3 Office 大档直传**（拍板 4）：relay 收 .pptx/.docx（PK 魔术字＋
  副档名白名单；.xlsx 刻意不收——表格门 40k 字符顶吃不下，通到墙的路不是路）；
  maybeRelayLargeDocument 经 prepareUploadForSend 八门全接；server 按 kind
  验魔术字重建正确 MIME → office 分流自然接手；新 USER_ERRORS.officeTooBigForAi。
  **门口白纸黑字**：新 UploadLimitNote（数字从 RELAY_MAX_BYTES 算），挂六个门。
- **D0-4**：qa-drill.md 新增 Q16b 限制清单（平台的 vs 我们的，数字↔常数对应）。
- **测过**：tsc 0 · eslint 21（同基准）· vitest **949 全过（+19）** · build ✓ ·
  **e2e:minutes ✓ money ✓ roles ✓** · 新探针 probe-d0-56.mjs **22 项全 PASS**
  （double confirm 送出前 0 请求；4.77MB pptx 走 relay 读通、读完即删；
  12.21MB 诚实拒绝零扣费；总花费 $0.0594，ZZZ 全删）。
- 顺带如实记：ai_usage 有三笔 draft_minutes 退款（8/28）＝厂商有回话的
  另一类失败（疑 8192 预设 ceiling 或 zod 两败）——**品质场（⑦）的线索**，本包没动。
- ⚠ 没能验证的：Vercel 线上 45s 与 maxDuration 的真互动（本机 next start
  没有 60s 杀）；真手机相簿多选。

### 这一场做了什么（51 号过夜场 · 包 A ✅，52 号报告）

- **A-4 大 PDF 直传 Storage**（拍板 4）：新 `src/lib/upload-relay.ts`（纯逻辑
  ＋7 支测试）· `upload-relay-client.ts`（浏览器直传 uploads bucket 的
  `{org}/relay/`，RLS 是边界；上传前顺手扫掉 >2h 的弃件）·
  `upload-relay-server.ts`（fileFromRelay：验路径→下载→**读完即删**→
  验 %PDF 魔术字→重建 File）。`prepareUploadForSend()` 一个 helper 统一
  「缩图→太大→PDF 走直传→诚实拒绝」，六支收 PDF 的路由（extract-minutes/
  intake/ledger/constitution/expense/import-roster）＋八个前端门全接上。
  上限只剩页数围栏＋RELAY_MAX_BYTES 12MB（厂商 20MB 请求顶的余量，
  USER_ERRORS.pdfTooBigForAi 教人拆档）。
- **A-3 收 .pptx/.docx**（拍板 3，推翻拍板 41 的 no-PPT）：office-text.ts 加
  `pptxToText`（slide XML 剥标签，同 docx 手法）＋ `isLegacyOfficeFile`
  （.doc/.ppt/.xls 挡下＋legacyOfficeFile 三语句）；/api/extract-minutes 也收
  office 档（文字走 untrustedBlock，同 intake 模式）；旧测试那条
  `a.pptx → false` 按新拍板改。
- **A-1/A-2 错误分流＋记真因**：aiCouldNotReadPdf（讲扫描/拆页，不讲相机）、
  aiCouldNotReadOffice（完全不提相机）；五支 extract 路由「两次都读不出」时
  `captureAppError(..., code:"unreadable_twice")`（只记代号，PDPA 照旧）。
  PPT→PDF 与 Word→PDF 的根因＝48 号已证实的平台 413（大档），现在
  .pptx 直收＋大 PDF 直传，两条死路都消了。
- **A-5 首页多张照片**：ask-box 可一次选多张（multiple）＋缩图预览＋
  「＋加下一页」；多张当同一份文件逐页读（第 1 张 classify，其余 forced
  kind 各收一个 extract action），extraction 客户端按 kind 合并
  （meeting/ledger 用既有 merge，constitution 新增 mergeConstitutionExtractions），
  IntakeParcel 加 `pages[]` 带全部缩图/storagePath 到工作区。多张只限照片
  （PDF/Office 一次一份，staging 时就有三语提示）。/minutes 的选档按钮在
  已有内容时自动变「＋加下一页」。
- **A-6「让 AI 写 BM 版」按了没动静**：根因＝draftError 只渲染在页面顶部、
  离 BM 守门按钮很远（常在屏幕外）。改成就近显示（bmOffenders 在场时错误
  出现在守门按钮旁，顶部那条同时隐藏，不会叠两条红框）。
- **测过**：tsc 0 · eslint 22（同基准）· vitest **922 全过（+12）** · build ✓ ·
  e2e:minutes ✓ e2e:money ✓（page errors 0）· 新探针
  `scripts/probe-relay-51.mjs`：.pptx → 200＋extraction；**5.25MB 单页 PDF
  走真 UI → Storage 直传 → AI 读出进工作区**；relay 档读完即删、历史留档；
  实测花费 US$0.008（ai_usage 两行）；ZZZ org/user 全删。

### 这一场做了什么（51 号过夜场 · 包 B ✅，53 号报告）

- **B-1 删「任期结束」整套**（拍板 5）：表单栏位、Former 分区、Excel 模板
  Tamat 栏、import-roster 输出栏全拆；term_end 数据库栏保留但无人读写
  （org-tools 的 senarai_ajk 例外，栏还在无碍）。任命日期加 📅 小日历
  （隐形 native date input 借 showPicker；打字多格式照旧）。
- **B-2 错误本地化＋哪格错哪格红**：members/glossary 的 ERR 全改三行
  joinUserError 格式；`permissionError()` 全局改三行（roles.test 跟着改）；
  `useLocalizedError` 学会「三行＋空行＋细节」（bulk import 的坏行清单保留）；
  MemberActionState 加 `field` 标记，对应输入框红框。
- **B-3 三清单表格化＋表单在上**：members/page 重排（AddCommitteeRow +
  ImportCommittee 在上，新 `committee-table.tsx` 客户端搜寻表在下）；
  glossary 同款（新 `glossary-table.tsx`：搜寻＋每页 20 笔分页＋B-10 呈现）；
  groups-card 表单上移＋搜寻＋表格化。删除钮全站红字＋Trash2。
- **B-4 表单自动清空**：🔴 根因是 React 19 会在 server action 返回后自动
  reset 非受控栏位（成功、失败、同名询问都会）——旧日期栏是受控的所以
  「不清空」，其他栏位其实会被「错误时也清空」。改法：AddCommitteeRow 全部
  改受控（值活过 auto-reset，错误/询问时输入不丢），成功后 setTimeout(0)
  清空（eslint 基准的 sanctioned 写法）。glossary 表单靠 auto-reset 即可。
- **B-5 分组下拉**：datalist（要打字才出现，tester 读成坏的）删掉，改成
  「已有的分组」可点 chips（主表单＋弹窗同款，点了填入，新分组照样打字）。
- **B-6 同名规则＋备注栏**（拍板 6）：同名＋同 IC 姓名＝挡；同名＋不同 IC
  姓名＝amber 询问框「是另一位吗？」（确认钮手动组 FormData +
  startTransition(formAction)——不赌 submitter name/value 是否进 FormData）。
  备注栏进表单/表格/出席勾选（roster-actions loadRosterNames 带 note、
  dedupe key 变 name+note；roster-picker 显示）。
- **B-7 敬语/职衔地基**（拍板 7）：honorific 栏＋表单（多族群建议 datalist：
  Dato'/Ustaz/讲师…）＋表格小标签。AI 对人是品质场的事。
- **B-8**：/members 的「谁可以用 MinitAI」卡删除，留一行指去
  /settings/members（本来就有完整管理）。
- **B-9**：members 两处＋glossary 一处的档案选择器改真按钮（file: 伪类紫底白字）。
- **B-10**：词库原文格直接显示词本身；全 keep 的词一句「三语都保持原字」
  colSpan 横跨，不再三格灰字重复。
- **B-11**：徽章改「现任 X 人」，数表格行数，对得上。
- **Migration 32** `20260910000000_roster_note_honorific.sql`（只写档，J 早上贴）：
  committee_roster + note(≤120) + honorific(≤60)；salin-migration.bat 加第 32 项；
  check:migrations 加两条列探针。程序未套用时 fail-open：insert 走 minutes_docs
  同款「点名剥离重试」梯度，select 走退阶。
- **测过**：tsc 0 · eslint 22（同基准）· vitest 922 全过（roles.test 那条改成
  验三行格式）· build ✓ · e2e:minutes ✓ e2e:money ✓（page errors 0）·
  新探针 `scripts/probe-members-51.mjs` 17 项全 PASS（真 UI、零 AI 费、
  ZZZ 全删）——含 migration 32 未套用的 fail-open 实测。
- 诚实记下：①「IC 尾号」实为 IC 姓名比对（系统从不收 IC 号码，PDPA）；
  ② note/honorific 真存档等 J 贴 32；③ 出席勾选显示备注但同名两人仍按
  名字一起勾（要分开得动出席底层，长尾）。

### 这一场做了什么（51 号过夜场 · 小修包 ✅，55 号报告）

- **C-1 弹窗裸样式**：🔴 根因＝RESPONSIVE 场把 Modal/CommandPalette portal 到
  `<body>`，逃出了 `.v2-root`——全部 --v2-* token 落空＝透明裸框。修法：新
  `src/lib/portal-target.ts`（portal 进 .v2-root：无 filter/transform，fixed 仍
  量视窗；token 齐全），两处换上。截图证据 proof-51-c1-templates-modal.png。
- **C-2 马来西亚公共假期**：新 `src/lib/malaysia-holidays.ts`（8 测试）——固定
  日程式算＋CNY/卫塞用现有 lunar 表推＋回历节日用现有 Umm al-Qura 推（标
  approx「以官方宣布为准」）＋屠妖节内建表 2026/27；hijri.ts 加数字月日 API。
  overlays 加 holidays 开关（旧存值兼容）、格子红标＋日面板显示；只含全国、
  州属不含（弹窗写明）。
- **C-3** 选档案文案短句化（attach-icon＋首页括号「照片 / PDF / Office」）。
- **C-4** privacy「不用于训练」段删（documents.ts＋legal/ 正本 md 同步——
  legal 有 compiled-vs-md 的一致性测试，只改一边会红）。
- **C-5 e2e:roles 修好**：三处全是脚本对旧 UI（打字格在 /money·「自己打字」、
  开收据在 /money/issue、报销文案改版）。15/15 全过——**三条 e2e 全绿**。
- **C-6** check-ai.bat cd `%~dp0`；最后一颗黑按钮（出席筛选 chip 选中态
  slate-900）随 C-9 消灭——#10 长尾清零。
- **C-7 围栏撞墙实测**（`scripts/probe-fence-51.mjs`，零 AI）：文件第 6 份挡 ✅
  干净下载第 4 次 402 ✅ 收据第 21 张整批拒、零号码烧 ✅（未决 #1 大头结案；
  第 21 页不测——要烧 20 页真额度）。
- **C-8** 54 号 GUIDE（Supabase Site URL＋邮件模板，J 五分钟照做）。
- **C-9** 出席：分组筛选改 dropdown、「全部勾起来」→「全选」、名单旁
  「＋加名字」跳到输入格。
- **C-10** Next 按钮只剩一个词（目的地句移出按钮变旁注）；「华语 / 中文」→「中文」。
- **C-11** How it works 进 AskBox 标题旁（howItWorks prop）。
- **C-12** PhotoLightbox 改真浮窗：无遮罩不挡操作、标题列可拖（pointer
  capture）、右下角原生 resize、常驻自关。
- **C-13 云端草稿**（拍板 8）：migration 33 `minutes_drafts`（org+client_key
  upsert，RLS 四政策；salin 33 项＋探针）；`draft-actions.ts`（save/list/load/
  drop，表缺席=db_behind fail-open）；minutes-store 自动存云（2.5s 节流、
  photoPages 只存路径不存图）、「先存成草稿开新的一份」、草稿列表可续可删、
  存历史即删草稿（D36 不变）；draftKey 进 localStorage blob。fail-open 实测：
  未套用 33 时人话提示＋工作区一字不清。
- **C-14 做一半（如实）**：② ✅ 每行 Purpose 变 select（模板喂选项＋
  「✏️ 自己写…」自由打；PurposeCell）、模板 chip 只填空行＋提示写明、入口带
  说明。① 两表合并（打字名单 vs 手动添加收入）**没做**——手动表带转账凭证/
  收入类型等独有件，凌晨不动钱区最敏感的表；留给下一场专门做。
- **测过**：tsc 0 · **eslint 21（比基准 22 少一条**——C-9 改版消掉一条旧错，
  新基准 21=20 错+1 警告）· vitest **930 全过（+8 假期）** · build ✓ ·
  **e2e:minutes ✓ money ✓ roles ✓（三条全绿，page errors 0）** ·
  probe-fence-51 ✅ · probe-smallfix-51 ✅（含两张截图证据）。

### 上一场（48 号单＋追加第二案；49 号报告给 J 的版本在 _J-要做的事）

- **证实（先证实，再动刀）**：`scripts/probe-payload.mjs`——ZZZ 帐号打线上，
  canvas 生 7.13MB 噪点 JPEG POST /api/extract-minutes → **HTTP 413
  text/plain FUNCTION_PAYLOAD_TOO_LARGE**（没进代码，零扣费）；6MB 假 PDF
  POST /api/import-roster → 同款死法（第二案同根）；0.09MB canvas 画的 BM
  会议记录 → 200＋完整 extraction（US$0.004，授权 ≤$0.05 内）。跑完 ZZZ
  全删。`SKIP_SMALL=1` 可跳过要花钱的对照。
- **修①·浏览器端先缩图再上传**：新共用 helper `src/lib/shrink-photo.ts`
  （21 支测试）——canvas 缩到长边 ≤2000px q0.8，仍 >3.5MB 逐阶再降；
  EXIF 方向用 createImageBitmap `imageOrientation:"from-image"` 烤进像素；
  HEIC 解不了/任何失败＝原图照送（helper 永不成为新死点）。接到全部
  八个照片门：minutes 拍照、money 账本、expense 单据、constitution、
  events、首页 intake（ask-box）、roster 照片（members）、开机构时的章程
  （create-org-form）＋转账凭证（manual-income）。
- **修②·诚实前置挡**：缩完仍 >4MB（PDF 缩不了）＝上传前就用三语句挡下
  （USER_ERRORS.fileTooLargeForUpload：「照片靠近点只拍有字的；PDF 分几份
  传」）。上限常数一处：`UPLOAD_HARD_LIMIT_BYTES = 4MB`（档头注明为什么：
  Vercel ~4.5MB 硬顶留余量给 multipart）。伺服器 MAX_BYTES 8MB 防御层没动。
- **修③·413 不再叫「连不上 AI」**：`uploadErrorMessage(status, serverError)`
  ——有伺服器 JSON error 用它；413 无 JSON＝「文件太大」句；其余
  aiUnavailable。九个门全换上。
- **修④·members 第二案**：两处 `"…"` 后备字全灭（全站 grep 过仅此一处）；
  fetch throw → 新 USER_ERRORS.networkNoCharge（「没连上，一分没扣」）；
  AI 错误与表单错误合并成**一条**错误栏（useActionState 的旧 state.error
  无法命令式清掉——记「当时那个 state 物件」比对身份来隐藏，errorHiddenFor
  模式），逃生口挪到错误行旁边、busy 时按钮自任进度条。本机重演 tester
  操作（空框按 Import 出旧红字→丢 6MB PDF）：红框只剩一条、讲人话——
  证据照 `eval/reports/proof-48-members-big-pdf.png`（scripts/proof-48-members.mjs 重拍）。
- **修⑤·server action 的隐形 1MB**：转账凭证走 server action，Next 预设
  bodySizeLimit 1MB——比谁的承诺都小，>1MB 截图一直传不上。next.config.ts
  设 4400kb（>4MB＋multipart 余量、<Vercel 4.5MB）；uploadTransferProof
  的 throw 也接住了（不再无声炸）。
- **四道关＋e2e**：tsc 0 · eslint 22（21 错+1 警告，逐字同基准）·
  vitest **910 全过（+21 shrink-photo）** · build ✓ · **e2e:minutes 与
  e2e:money 全过、page errors 0**（真 DB、next start）。
- 没动：Vercel 设定/env、migration（仍 31 支）、线上真 org、AI 路由、prompt。

### 再上一场（46 号单 RESPONSIVE；47 号报告）

弹窗被玻璃顶栏切头（backdrop-filter 包含块）→ Modal/CommandPalette 一律
createPortal；Ask MinitAI 盖顶栏 → rail top-14 z-30＋右推只推内容；全站
37 页×4 宽×亮暗 300 张病历（scripts/shots-responsive.mjs），真破版仅
/filings 一处已修；15 处视窗断点格线改 container variants。详见 47 号报告
与 §6 的 RESPONSIVE 陷阱条目。

### 更早一场（D44 免费围栏；45 号报告）

- **地基**：migration `20260909000000_free_fence.sql`（第 31 支，✅ 已套用，2026-08-29 探针实测）——
  `fence_usage` 表（每 org 一行，docs_made / pages_uploaded / clean_downloads，
  累计不退；RLS 开、无 policy＝只有 service role 能碰，app_errors 同款）＋
  `fence_charge()`（SELECT…FOR UPDATE 原子「检查＋记账」，正数收费会越界就整笔
  拒绝，负数退次数地板 0；只授权 service_role，spend_ai_credit 同款门禁）＋
  把 J 的 org 15/58/91 标 standard / quota 100（走 privileged-columns 解锁路）。
  收据**不在**这张表：receipts gap-free 不可删，count(*) 就是真话。
- **纯逻辑** `src/lib/fence-core.ts`（13 支测试）：状态计算、挡谁先挡、RPC 结果
  解析、三语拒绝句（都带数字与「设置 → 订阅方案」的路）。数字唯一真相在
  `src/lib/plans.ts` 的 `PLANS.trial.fence`（5/20/20/3，standard/hq = null）。
- **I/O** `src/lib/fence.ts`：`getFenceLimits`（谁被围：quota ≤ 15；demo 永不围；
  读失败**开着败**——打嗝不准给付费社团盖水印）、`chargeFence`（RPC 缺席=
  完全照旧 D8；其他失败**关着败**——数不了就不交干净档）、`refundFence`
  （厂商没到达就退，与 refundUsage 并排）、`checkReceiptFence`。
- **浮水印** `src/lib/fence-watermark.ts`：把生成完的 PDF 重开、每页盖
  「PERCUBAAN · 免費版 · FREE PLAN」斜章×2＋页脚一行不透明说明（裁掉斜章
  也留痕）；中文字走 subsetNotoFor，字型拿不到就退 Helvetica 不炸。**关着败**：
  盖不上章就报错，绝不把干净档漏给免费 org。2 支测试（页数不变、还能重开）。
- **七个上传门全装页闸**（extract-minutes / ledger / constitution / expense /
  events / import-roster / intake）：photo=1 页、PDF=实页数、贴字=0 页、Office
  档=1 页；在 AI 扣费之后收、便宜拒绝在前；**每一条 refundUsage 旁边都有
  refundFence**（intake 的 unknown-kind 422 也退——强制重送会再收一次）。
- **文件线**：minutes 保存动作收 docs:1（幂等重存不重复收；23505 输给并发
  双胞胎会退）；`/api/minutes-pdf` 免费版默认浮水印 inline（看＋打印免费），
  `?clean=1` 收 downloads:1 转 attachment；agm-pdf / bank-extract / financial-report
  加 `clean:true` 参数（干净=docs:1+downloads:1，默认=浮水印）；einvois-xlsx
  没法盖水印＝每次导出就是干净档（fileIndex 0 收一次，多档一包只收一包），
  按钮门口写明要花什么。sample/CONTOH 路完全在围栏外（禁令照旧）。
- **收据闸**：issueAndSaveReceipts 在 RPC 之前数 receipts 行，trial 超 20 张整批
  拒绝（reason:"fence"＋现成三语句），一个号码都不烧；register-store /
  issue-controls 渲染那句话。已开收据永远干净下载（J 拍板）。
- **画面**：`src/components/fence-ui.tsx` —— `FenceLock`（选不了字、copy/右键
  拦截、三行斜水印、附一句为什么）用在 minutes 成品页全文；`FenceCleanDownload`
  （干净下载（剩 N）按钮，402 时把服务器句子原地显示）用在成品页与 /filings；
  /filings 免费版复制按钮全锁（🔒 复制（付费版））；/settings/plan 加终身
  仪表卡（4 个 x/y）＋对照表 4 行（trial 数字 vs ∞）。
- **四道关**：`tsc` 0 · `vitest` **889 全过（+13 fence-core、+2 watermark）** ·
  `eslint` 与基准逐字同类同数（22 = 21 错 + 1 警告，stash 对照跑过）· `build` ✓ ·
  **e2e:minutes 全过、e2e:money 全过，page errors 0**（真 DB＋next start；
  e2e 的 trial org 真的踩到了围栏 UI——快照里看得到「打印/PDF（带水印）」
  「干净下载（剩 3 次）」与 PERCUBAAN 水印；当时 RPC 未套用是 fail-open，
  现在 31 已套用、计数走真 DB）。
- 探针与工具跟上：`npm run check:migrations` 新增 fence_usage 列探针＋
  fence_charge RPC 探针（org 0 的 FK 会中止事务，探针零写入）；
  `salin-migration.bat` 新增第 31 项。
- **e2e:roles 那 4 项 collector 失败照旧未修**（上一场的旧账，不是本场弄的）；
  修好前不说「三条 e2e 全过」。
- D43（全站无黑按钮，--primary=品牌紫）这次补记进了 `docs/DECISIONS.md`
  （上一场做完但漏写档）。

### ⚠️ 围栏的已知后果（设计使然，不是 bug）

- ~~章程常 20–40 页 > 免费 20 页 ⇒ 免费版基本传不完~~ **口子已开（D45/A6，
  81 场落地）**：章程一律扣 min(实际页数,5) 页、分段读整份只收一次；
  其他文件照旧按实页数扣（引流引擎在钱区，口子只开给章程）。
- 转账证明照片、贴上的文字、Office/表格转文字**不占页数**（钱区免费是引流
  引擎；页数只数 AI 读的「纸」）。
- 上传门的「还剩几页」目前只显示在 /settings/plan 与拒绝讯息里，没有印在每个
  上传按钮旁（要做得每页发 fence 状态，本场没做——诚实记下）。
- localStorage 里已存的旧文件文本（工作区草稿）不在锁内：锁的是成品页与
  文件出口，工作区是进行中的自己的字。

### 现场量到的（不是听说的，2026-08-29 晚本场实测）

- 开工时 `git status` 干净、main == origin/main（46 号那 3 支 J 已 push）。
- **线上 413 实测**（probe-payload.mjs，两轮）：7.13MB JPEG → 413 text/plain
  「FUNCTION_PAYLOAD_TOO_LARGE」；6MB PDF 打 /api/import-roster → 同款；
  0.09MB 对照图 → 200＋extraction，ai_usage 记 cost_micros=4121
  （US$0.004，gemini-3.5-flash-lite）。ZZZ org/user 两轮都删干净。
- 四道关：`tsc` 0 · `eslint` 22（21 错+1 警告，同基准）· `vitest` 910 全过 ·
  `build` ✓。
- **e2e:minutes 全过、e2e:money 全过，page errors 0**（真 DB，`next start`）。
- 本机重演第二案：一条红框、三语人话（proof-48-members-big-pdf.png）。
- ⚠ 没能验证的：**线上**修好后的真机验证（要等 J push 后 tester 手机实拍）；
  真 HEIC 大图在真手机浏览器上的行为（helper 的 HEIC 退路只有单元测试）；
  围栏真挡下（未决 #1 照旧）；真 vendor 合并写作（D37 旧项）。

### 🔴 J 的事（2026-08-31 深夜，113 场收工版）

0. **双击 push-cabang.bat（最要紧）**——113 号场 **4 支** commit 等推。
   ~~109 场 6 支~~ 已推 ✓。没有新 migration、没有新环境变数。
   上线后看三件：①首页空的时候中间有六张卡；②按「开会的笔记」再选照片，
   扣的用量应该比以前少一点（少一次分类）；③打第一句话之后卡片收起来，
   `清除对话` 之后回来。
1. ~~**双击 push-cabang.bat（最要紧）**——105 号场 **14 支** commit 等推。~~
   ~~104 场 10 支~~ 已推 ✓。
2. 🔴🔴 **贴 migration 43**（`20260921000000_ai_jobs.sql`，排队慢慢读那张表）。
   `salin-migration.bat` 选 43，或直接开档 Ctrl+A / Ctrl+C，贴进 Supabase →
   SQL Editor → New query → RUN，看到「Success. No rows returned」就好了。
   **没贴＝排队整条休眠**：长档案照旧读不完，讯息叫人拆小 PDF——就是 105
   之前的行为，**不会坏、不会乱扣钱**；贴完自动生效，不用改设定。
   （107 号报告 §6 有逐步。）
3. **上线走一次排队**：首页丢一份 **12 页以上**的 PDF → 看报价卡（几页／
   几批／几 % ）→ 按「开始读」→ 看进度条「第 N／M 批」→ **中途关掉分页**，
   再打开首页，应该有一张黄卡问「要接着读吗（已读的页不会重扣）」。
   再开一份会议记录 → 「做好的记录」→ 最上面那张卡的 **📑 正式版**。
4. **两个名字要自己改回来**（工作场不动线上资料）：org **#369**「Persatuan」、
   org **#91**「…Cawangan Klang, dan selepas ini」——两个都是本场修掉的
   regex 咬到的伤口。改法：切到那个机构 → **设定 → 机构 → 「改机构的名字」**
   （这个框是本场新加的；在那之前那一页只印名字，没有控制项）。
5. **104 的新岔路还没走过**：`/orgs/new` → 「我有章程」→ 丢一份章程 →
   看名字栏是不是完整的注册名；再看 **Plan 页那一行**还剩多少 %
   （不该再出现「0% left」旁边挂「+607%」）。
6. 100 场两个验收案照旧欠一试：对 agent 说「TESTER3 换了电话」、org197
   孤儿条归位。
7. **两个一句话拍板照旧**：①bench 模型（101 §3）；②eval 对外口径
   93.6–95.2% 区间（101 §5）。
8. 旧账照旧：收据 QR 真机一扫（87 场欠）；Vercel 的
   `NEXT_PUBLIC_CONTACT_EMAIL`；MyInvois 模板（未决 #12）；真
   undang-undang 重传；tester 清单（73/77 号）；54 号 GUIDE 设 Supabase
   邮件。

### ❓ 未决问题

1. ~~围栏真挡下未实测~~ **大头已结案**（8/29 probe-fence-51 实测：文件第 6 份、
   收据第 21 张、干净下载第 4 次全被挡、讯息对版）。只剩**第 21 页**没撞
   ——要烧 20 页真 AI 读取，不值得脚本烧；等真用户自然撞到或 J 授权。
2. ~~助手/读写用哪个模型~~ **bench-98 已跑**（100 场，真件双轨 4 模型）：
   建议 EXTRACT 与 WRITE 都不换（3.6-flash 读写全超时间墙、luna 少收
   条目、terra 贵 7 倍）——等 J 一句话拍板，.env 零动
2b. 🔴 **eval 基准 vendor 漂移**（100 场发现）：8/29 的 95.2%/invented=0
   在 08-31 同字节对照只剩 92.9%/invented=1（错格稳定、大半在没动过的
   管线）。对外口径要不要改成 93.6–95.2% 区间＋注记，等 J 拍板；
   以后「回退」必须配同日对照轮才算数（§6 有新陷阱条目）
2c. 写路单呼叫墙 20s：若 J 拍板换慢的写作模型（3.6-flash/terra），得
   先把 draft 路的 per-attempt timeout 加大——现行墙只装得下 flash-lite
   与 luna（bench-98 README 有数）
3. 法律实体（金流前置，D12），试点前要答
4. 真实手写 eval：对外数字（95.2%，2026-08-29 重立）量的仍是印刷体——
   真手写批量等 J 授权/收样；迭代组三张的结构形状已实测（71 号报告）
5. Supabase 邮件模板＋Site URL 还停 localhost —— **54 号 GUIDE 已写好**，
   等 J 照做（五分钟）
6. ~~/privacy「不用於訓練」句~~ 已删（8/29 小修包 C-4，J 在 51 号拍板）
7. 竞赛首页主图重拍（拍板 0-9）—— push 已全上线，条件已齐，工程排队中
8. 配套定价（管理台毛利卡等它）—— 先量成本；围栏已立，价格牌之后挂（D44/D12）
9. ~~#10 按钮长尾~~ 已清零（最后一颗黑 chip 随 C-9 消灭）
9b. ~~e2e:roles collector~~ 已修（8/29 小修包 C-5：三处全是脚本选择器过期，
    15/15 全过——三条 e2e 全绿）
10. 真 vendor 的合并写作效果（D37）—— 等 J 一次真额度实测
11. 免费版上传门旁没有「还剩几页」的常驻提示（只在 /settings/plan 和拒绝讯息
    里）——要不要补，等真用户反应
12. （旧，小）MyInvois 官方模板逐栏对齐（B-7 后半）等 J 给原档
13. ~~check-ai.bat cd 旧资料夹~~ 已修（8/29 小修包 C-6）
14. ~~C-14① 两套钱录入合并~~ **已做完**（8/29 包 D1，58 号报告：manual-income
    删除，类型/转账截图/拍单据门全进打字表格，旧资料一笔不丢）
15. ~~云端草稿的跨装置照片预览~~ **已做完**（8/29 G3：signPhotoPaths 签名
    URL 载回原图＋按真类型标示，73 号报告）
16. 首页门（intake）一次多张章程照片仍是**每张各扣 1 次**——89 前旧
    行为，⑧/D47 没动它；正路是 /constitution 门（分段读、按公式）。
    要不要把首页多照片也并进 readConstitutionFiles，等 J 一句话。
17. D48 表单硬挡的音译风险（D48 有注记）——上线后盯真名册有没有
    「当场拼出来」形状的 IC 名；tester 反馈进来再定要不要软化。

### ⏭ 下一个 session 从哪开始

**🔴 下一场就是 108 号单（品质急救：不准编、不准丢）。**
它已经被 109、113 两场各推后一次了，而「正式文件把人物关系写反」
（`Tan Kim Loo ditugaskan untuk melantik…`——把**被委任的人**写成
**去委任别人的人**）那一份**就是会送 eROSES 的那一份**，现在还在线上。
109 与 113 两场都一个 prompt 都没动，108 要动的东西原封不动等着。

**113 号场（首页入口卡场 ✅）做完**（115 号报告；之前：109 号=110 号、
105 号=107 号、104 号=106 号、102 号=103 号、100 号=101 号、97 号=99 号）。
113 之后的候选：**手机那 69px**（铃铛移进上方 app bar 56px＋安全告示压两行
13px）——拿到之后首页第三排卡片就上来了，对话区也到 1.34×；
`问一句` 想凑到三四题得先在 `prepared-answers.ts` 补免费答案。

**（旧）105 号场（底座场：排队背景工＋会议记录两层＋侦测重复页 ✅）做完**
（107 号报告；之前：104 号=106 号、102 号=103 号、100 号=101 号、97 号=99 号）。
🔴 **migration 43（`ai_jobs`）是唯一 NOT YET，等 J 亲手贴**；
**105 场 14 支 commit 等 J push**。
**下一场最该做的一件事：排队链路的第一次真跑**——J 贴完 43 之后，丢一份真的
12 页 PDF，把 `ai_jobs` 那一列的 `batches_done / pages_done / actions_charged`
三个数字对一次帐（工作场做不了这一步：D8 不准对线上 DB 跑 migration，
所以本场只验到切页／扣费算式／状态机／四张卡／软性拒绝）。
其他候选：**整理 pass 的拒绝率**（实测 4 次 3 成 1 拒）与**合併分组偶尔怪**
（107 §7-3，故意没硬加规矩）；**正式版存进 minutes_docs**（要再一支 migration，
先让 J 用过再说）；**章程改走新底座**（目前故意不动，107 §7-6）；
**④后半小包**（加人卡预填 ic/地址/职业＋州属从地址带出）；
**90 号单剩下的一半**（右下角浮动面板还没有回纹针）；
**% 长尾小包**（深页估价行全换 %，103 §7 留残）；agent 对话额度/定价重设计
（讨论场议题）；RLS 下一阶段。
**等 J 反馈的**：🔴 贴 migration 43；排队上线走一次（含关分页再回来）；
正式版看一眼值不值得存；104 的新岔路走一次；#369／#91 两个名字自己改回来；
100 场两个验收案（换电话/孤儿条）；bench 模型拍板；eval 口径拍板；
真 undang-undang 重传；tester 清单（73/77 号）；MyInvois 模板原档
（未决 #12）。竞赛 8/31 截止已过内部 cutoff，材料 J 自己定，**不催**。
RESPONSIVE：J 若再圈破版，贴 46 号单同段 PROMPT 继续。

---

## 6. 已知陷阱（踩过的，别再踩）

### 2026-08-31 深夜新增（113 号入口卡场）

- ⚠ 🔴 **收合一列的时候，padding 不会跟着收。** `grid-template-rows: 0fr`
  收的是 grid item 的**内容框**；padding 与 border 是加在那之上的，
  所以一个 `pt-6 pb-2` 的 item 收到 32px 就停住——实测输入框上方留了
  **34px 的空气**，正是单子 §2 明令不准留的残余高度。
  正解：**grid item 本身裸的，间距放进它里面那一层。**
  （另外 `.minit-collapse > *` 要同时有 `min-height: 0` 与 `overflow: hidden`，
  少一个收合就完全不动。）
- ⚠ **收起来 ≠ 拿掉。** 高度 0 的那一列，里面的按钮照样 Tab 得到、读屏读得到。
  一定要 `inert`（React 19 直接支持这个属性）＋ `aria-hidden`。
  「看不见但按得到的六个按钮」比没有按钮更糟。
- ⚠ 🔴 **要 render 空状态，就要先把上一次的对话清掉——量测尤其。**
  首页对话是**故意**跨页面存活的（F-4），所以探针跑完桌机那一轮，
  下一个宽度开首页时 localStorage 里还有上一轮的成品卡：
  「空状态（有卡）」那一格被**带着一段对话**量了、也拍了照。
  断言全是绿的，是**看截图**才发现的。规矩：每个宽度开跑前清掉
  `chat.home` 那把 key，并且加一条断言说「这一格真的是空的」。
- ⚠ **eslint 的 `react-hooks/set-state-in-effect` 是有基准的**：为了做
  「淡出→卸载」的三段 phase，第一版写了 `useEffect` 里同步 `setState`，
  基准从 20 涨到 21。**基准不准涨**是家规，正解不是加 disable 注解，
  而是换一个不需要 state 的做法（纯 CSS 收合，块一直挂在树上）。
  ——顺带：那个做法本来就更好，`清除对话` 之后卡是**展开回来**而不是瞬间蹦出来。
- ⚠ **图示不是照抄单子的建议。** 单子的图示是建议不是定案（家规：每个图示
  上线前对照马来西亚每一族群读一遍）。本场退掉三个：lucide 的 `Receipt`
  （上面有一个 **$** ——这是马来西亚产品，钱是 RM，改用 `ReceiptText`）、
  `Banknote`／`PiggyBank`／`HandCoins`（动物与手势正是符号不再中立的地方，
  D41 的猪扑满就是这么删掉的）、以及全部 emoji（每个平台画得不一样）。
- ⚠ **别照字面实现一张卡的承诺，先去看那条路真的能做什么。**
  单子的卡 2 写「收據、單據、帳單」，但 `/api/intake` 只有**捐款账页**
  那一个钱的读取器。硬塞一张电费单**不会报错**——会很有把握地读出一页空的账，
  比报错糟得多。卡面照实写它真的收的东西，其余的照旧走分类器。

### 2026-08-31 深夜新增（109 号版面场）

- ⚠ **要「钉在画面底部」，就不要让页面本身会捲。** 104 用「固定高度的捲动窗」
  治好了输入框被卡片推走；剩下的那一半病是**整页还是一份会捲的文件**——
  桌机上方一大片白、手机上输入框整个掉到摺线以下（实测 738–1117，视窗只有
  812 高）。正解是让**那条路由**拿到 `h-dvh`，每一层 `flex-1 min-h-0` 往下传，
  捲动交给对话区自己。`min-h-0` 是承重的：flex 子元素预设 `min-height:auto`，
  少了它，框不肯缩、只会把输入框顶出画面。
- ⚠ **`h-screen` 在手机上是「视窗最高的时候」，`h-dvh` 才是「现在看得见的」。**
  用 `h-screen`，网址列缩回去之前输入框就藏在它底下。
- ⚠ **量「改前」的数字，选择器要指名道姓。** `.v2-scroll.overflow-y-auto`
  这种 fallback 在旧版（空状态还没有对话区）会量到**左边的侧栏**，
  于是记录里出现「空状态的对话区有 731px」这种鬼数字。改成 `main ...` 之后
  才是对的。（同一支探针的 state-3 数字一直是对的，因为那时两版都有对话区。）
- ⚠ **Python 改档：`open(path,"w")` 会先清空档案，字串编不出去就只剩 0 bytes。**
  本场把 `globals.css`、一支新脚本、`STATE.md` 各清空过一次（当场从 git 复原
  ／重写）。规矩：**先把整份字串 encode 成 bytes 成功，再开档写入**
  （`data = s.encode("utf-8")` 写成一行，`open(...).write(s.encode(...))`
  不算——Python 先开档再算参数）。emoji 用单码位写法（大写 U 八位数），
  代理对（小写 u 四位数那两个一组）在 Python 里编不出 UTF-8。
- ⚠ **`git checkout HEAD -- <file>` 会把「已改但还没 commit」的修正一起沖掉。**
  为了拍改前对照图，把三支档案切回旧版重建；切回来时用 `git checkout HEAD --`，
  把 commit 之后才做的三处修正一起还原掉了，重做了一次。
  规矩：**拿旧版档案去量测之前，先 commit 或 stash 手上的修改。**
- ⚠ **改一个预设值，就要在同一支 commit 里教会所有脚本。**（104 的老规矩，
  本场再中一次：「即将到来」改成预设收起，`shot-workbench-104.mjs` 的 §9
  立刻整段 FAIL——它假设一开页就是展开的。）
- ⚠ **别为了凑一个验收数字去砍触控下限或删掉别的单子要保留的东西。**
  手机对话区差 77px 才到 1.4×，那 77px 只存在于「§2 说要保留的铃铛那一列」
  和「44px 触控下限」里。正解是**照实写下差多少、差在哪、下一步怎么拿**，
  并把那一格的验收换成**更严的**两条（输入框必须完整在画面上——旧版是 FAIL）。
- 💡 **Tailwind v4 的颜色算在 oklab**：`getComputedStyle().color` 回来的是
  `oklab(L a b / 0.22)`，不是 `rgba(...)`。用 regex 读透明度要两种都接。

### 2026-08-31 深夜新增（105 号底座场）

- ⚠ 🔴 **量一个门槛之前，先做出「不该触发」的那一组。** §3 的重复页侦测，
  第一次量：J 那两张真件 0.33（要问 ✅），**对照组 0.60（不该问 ❌）**。
  真凶不是门槛订太低，是**一份印刷 minit 自己就带议程表，而议程表那一行
  字面上就是内文段落的一部分**——`sameItem` 的「包含」判准会一条条报重复。
  只看正面例子的话，这个门槛会以「在真件上验过」的名义上线，然后对每一份
  正常的两页 minit 乱问。加一条「两行长度要相当（短÷长 ≥ 0.5）」就分开了
  （误判是 59↔294、43↔95、85↔476 字元；真重复是 29↔41）。
- ⚠ **`includes` 抓不到「多一个字母的名字」。** `"…Tan Kim Looi…"
  .includes("Tan Kim Loo")` 是 **true**——名字被改了却验不出来。要验人名
  必须检查**词界**（前后不是字母）。中文没有词界，而且正常句子本来就会把
  词吃进更长的串里（「小小班」在「小小班主持由…」里），所以中文那边只能
  验「原本有的还在不在」，不能验「有没有被改」——这一条要在画面上讲清楚
  （每一段都点得回原文），不是假装验过了。
- ⚠ **同一个画面上永远只准有一个百分比。** 排队报价卡（照真页数算 20%）
  和缩图条那行旧预估（照档案数猜 13%）同框出现——就是 104 §5「607% 旁边
  写 0% left」的同一个病，只是换了两个数字。**新的估价一出现，旧的必须闭嘴。**
  （拍截图才发现的：不拍就看不到。）
- ⚠ **`next build` 会覆盖 `.next`，而 `next start` 正在读它。** 边跑探针边
  重建，探针会对着半个 build 打，错误长得像 UI 坏了（`page.$(...)` 回 null）。
  重建完要**先杀掉 3000 埠上的那个行程再重开**。
- ⚠ **前端驱动的背景工，别指望 cron。** Vercel **Hobby 的 cron 一天只跑
  一次**（`DEPLOY.md` 第 4 行写着方案）。任何「伺服器自己推进」的设计在这个
  方案上都是空的；浏览器回圈那条必须能独立跑通，伺服器那条只能加在旁边。
- ⚠ **两个分页读同一份文件＝同一页读两次＝扣两次钱。** 排队一定要有租约
  （`claim_ai_job`，资料库端原子），而且租约要**比路由自己的 vendor 预算还长**
  ——租约在第一个分页还在正常工作时就过期，正是它要防的那件事。
- ⚠ **失败的那一批不准移动 `pages_done`。** 下一批的价钱是从 `pages_done`
  量出来的（D47 差额），所以退了钱却把水位往前推，等于重试时替同一批
  再付一次。这条有专门的单元测试。

### 2026-08-31 晚新增（104 号上线第二轮快修场）

- ⚠ **`position: sticky` 只能在**自己的父层**里走动——底下没有东西可走，
  它就不会 stick。** §8 第一版把输入框做成 `sticky bottom-…` 想「钉在画面
  底部」：手机上根本没生效（composer 是父层最后一个孩子，父层底就是它的
  底），桌机上则在页面刚好变得可捲的那一刻**跳了 241px**（实测 483→724）。
  正解是把上面那块做成**固定高度的捲动窗**，输入框跟在它下面——不用 z-index、
  不用知道手机 tab bar 多高、也不会漂。要浮动只有 `fixed` 一条路，代价是
  宽度、遮挡、tab bar 三样都要自己算。
- ⚠ **`max-h` 的捲动框一样会推下面的东西。** 会长大的框只是把「推」变小，
  没有消掉。要「位置不变」就得 `h-`。
- ⚠ **手机浏览器把聚焦的输入框捲进视野时，对齐的是「视窗底」，不是
  「app 自己那条 fixed tab bar 的上缘」**——送出键就被导航栏盖住。
  `scroll-mb-*` 是给这件事用的。
- ⚠ **`display:none` 的元素 `getBoundingClientRect()` 回 0×0 在原点。**
  探针拿 tab bar 的 top 当「可用高度上限」，在桌机上就变成 0，好好的断言
  一路 FAIL。量一个可能被藏起来的元素，先看它 height > 0。
- ⚠ **改了 `/orgs/new` 的第一屏 = 全部探针脚本一起断。** 44 支脚本＋三条
  e2e 都在 `page.type('input[name="name"]')`。规矩：动建机构第一屏，
  同一支 commit 里把脚本一起教会（插入的那一步要写成在没有岔路时是 no-op，
  这样对旧 build 也还能跑）。
- ⚠ **`sortClauses` 之类的排序把「标签字」当 token，会让两种编号风格
  排进两个宇宙。**「Fasal 8」是字、「8.2」是数字，而规则是数字排在字前面
  —— 于是每一条裸号子条都排到 Fasal 1 前面。**排序前先脱标签**。
  （97 §3 当时把它们「沉底」当解，那是治了症状：J 看到的是「正本後面又
  跟了一本」。）
- ⚠ **写 regex 抓「名字」时，先砍尾巴再找引号。** Fasal 1 常写
  「…dikenali dengan nama X, dan selepas ini disebut "Persatuan"」——
  整句里唯一的引号在尾巴里，先找引号就会答「Persatuan」，而且这个答案
  会被人按下「用章程的名字」写进 orgs.name（线上 #369／#91 就是这样来的）。
- ⚠ **`\n` 不是句号。** PDF 在名字和地址中间换行是排版，不是句子结束。
  断句字元集里放 `\n`，跨行的名字地址一律被砍头。
- ⚠ **eval 只动了一支 prompt，就只跑那几个 case。** `EVAL_ONLY=constitution`
  （104 场加的）——不然会花真钱重量一支 byte 都没动的 prompt。
  但**对外公布的准确率永远是全套跑出来的数字**。
- ⚠ **要证明「改前是坏的」，就得让探针在旧代码上也跑得动。** 旧档没有
  `data-probe`，选择器要留 fallback（`#minit-ask-input` 的 closest form）；
  另外把断言在 `SHOT_TAG=before` 时降级成「量测不是闸」，不然 before 那
  一轮自己就 exit 1。
- ⚠ **「同一件事的两个版本」不能靠 `includes` 判重。** 两只手写同一件事，
  词序会不同、名字会拼错（真件：`Ooi Bee Huar` vs `Ooi Bee Huay`）。
  门槛要从真资料量出来再写死，并把量到的数字写进注解（0.67 vs 0.11/0.00）
  ——不然下一个人不知道能不能动它。

### 2026-08-31 下午新增（102 号聊天路接脑场）

- ⚠ **Next.js route 档只准 export handler 与 config——加一个 `export
  function` 帮测试，运行时直接拒收。** citedSources 第一版写在
  /api/chat/route.ts 里 export 出来给 vitest 用；正解是抽去 src/lib/
  （chat-sources.ts）。**规矩：route 里要测的纯逻辑一律先抽 lib。**
- ⚠ **等聊天回答的探针，「思考中」占位泡泡要按三种介面语言全滤**——
  只滤了中/马来文，「MinitAI is thinking…」被当成答案收走，白烧一轮
  真 vendor（$0.0009）。§6「wait 的字串」家族的聊天版：占位样式判定
  用一条跨语正则（/正在想|sedang berfikir|is thinking/）。
- ⚠ **fetch handler 里 void 启动第二段 async 工作，会跟自己的 finally
  抢 busy 旗标**——send() 的 finally setBusy(null) 会把 runDictation
  刚设的 "file" 盖掉。**修法：第二段开头 `await new Promise(r =>
  setTimeout(r, 0))` 让第一段的同步收尾（含 finally）先落地；判断
  方法：「第二段明明在跑、busy 指示灯却灭了」先想这条。**
- 💡 **build 的 tsc target 比 IDE 检查严**——`/s` regex 旗标过了
  `tsc --noEmit` 却在 `next build` 的 typecheck 炸 es2018。测试里跨行
  匹配用 `[\s\S]*` 不用 dotall。
- 💡 **「按钮文字」与「路由描述」是两份字**：ask-routes 每路新增 `btn`
  短标签（测试禁吓人字眼），按钮渲染 btn、答案渲染描述。以后加新路由
  两份都要写，少一份 tsc 会抓（btn 是必填栏）。

### 2026-08-31 凌晨新增（100 号 AGENT 工作台场）

- 🔴 **temperature 0 挡不住 vendor 端行为漂移——「回退后与基准逐字同＝
  不用重跑」是错的。** 100 场把 8/29 基准 prompt 一字不动重跑，只剩
  92.9%/invented=1（基准 95.2%/0），错格逐轮稳定、大半在没动过的管线
  （账簿电话截断、章程吃字、events 缩写）。94 场的「回退」从没验证过，
  很可能当时量到的一部分就是漂移。**规矩：动 prompt 的 eval 结论必须配
  一轮「同日基准对照」才能归因；比较只在同日轮之间做，跨日比较先声明
  漂移风险。判断方法：错格出现在你没动的管线＝先怀疑 vendor。**
- 🔴 **Glob 工具用反斜线路径会静默查无（No files found）——「不存在」
  可能只是问错了。** 100 场差点因此把已有 12 支测试的
  extraction-merge.test.ts 当新档整个 Write 盖掉（git status 的 M 标记
  抓回来的）。**规矩：Glob 一律正斜杠；「新建」测试档后看一眼
  git status 是 ?? 还是 M。**
- 🔴 **给 schema 加可选栏位时，每个「手拼整个物件」的字面量都要跟上——
  tsc 抓不到可选栏位的遗漏。** extraction-merge 的合并字面量停在 G1 前，
  meeting_time/attendance_count 等六栏被无声丢了两天（两页会议一合并
  MASA 就没了），单元测试全绿因为没人测过。**判断方法：schema 加栏后
  `grep` 该型别的物件字面量逐个过；修法照 mergeOptionalScalar。**
- ⚠ **长驻服务器的输出管过 `head`/截断管道＝管道断后整个服务器卡死**
  （`next start | head -50`：head 收满退出→「destination stream closed
  early」刷屏→:3000 挂着但不回应）。**规矩：背景服务器输出导档案或
  不接管道；判断方法：端口在听但 curl 超时＋log 里 stream closed。**
- ⚠ **`next start` 的页面对 puppeteer 的 `networkidle2` 可能永不安定**
  （长轮询/流式）——goto/reload 用 `domcontentloaded`＋等唯一内容，
  与「wait 独有深层内容」旧条目同族。
- 💡 **onClick={fn} 的 MouseEvent 参数陷阱又来一次**（writeWithAi 加
  polish 参数）：除了包箭头函数，服务器端用 `=== true` 收窄能兜底。

- 🔴 **旧探针的「chip 找不到就打字」后备，在收费 UI 上会花真钱。**
  probe-k1-82 的 chip 清单没跟上 D49：e-Invois chip 进了闸，非 operator
  找不到 chip，脚本退而打字送同一句——那句的预备条目也在闸后＝真去了
  模型，4 笔 chat_turn（≈$0.003）烧在一支「零 AI」探针里。**规矩：任何
  probe 的 typed-fallback 先问「这条路现在还免费吗」；闸类拍板落地时，
  把引用同一清单的探针挨个重跑（94 场只跑了 einvois-94，k1 漏了）。**
- ⚠ **server page 的 `redirect()` 到浏览器是 200＋客户端补跳**，不是
  307 文档转址——puppeteer `goto()` 结束时 url 还是旧的，紧接的
  evaluate 撞「Execution context was destroyed」。**修法：等
  `location.pathname === 目标`；判断方法：goto status 200 + 下一步
  context destroyed ＝先想这条。**（对匿名请求 middleware 是真 307，
  两种形态并存。）
- ⚠ **RSC 串流下，waitForFunction 等 section 标题会抢先**——财报页标题
  先到、表格与 balance 卡后到，探针读了半张页面红了三条。等「这一步
  独有的深层内容」（表格头 PENERIMAAN），别等标题（§6 旧条目「wait 的
  字串会出现在上一步画面」的串流版）。
- 🔴 **PowerShell 一行式过滤改档（`Get-Content | Where | Set-Content`）
  同样毁中文**——不只批量替换：这场删两行 import 把 nav-items.ts 整档
  搅成乱码，git checkout 才救回。**规矩收紧：源码档一律用 Edit/Write
  工具动，PowerShell 只碰 ASCII 档（.bat 也小心）。**
- 💡 **「有 railOnly 就别整条拔」**：把 /money/receipts 从侧栏收起来时，
  railOnly 让群组照亮、coverage 照数、选单不渲染——比从 NAV_ITEMS 删行
  少断三个测试（byHref throw、群组亮灯、覆盖清单）。收纳类需求先想它。

### 2026-08-30 深夜新增（89 号八件事场）

- 🔴 **shadcn/Radix 组件的 Portal 预设挂 `<body>`＝逃出 .v2-root，token
  与字体全落空**——55 场修了 Modal/CommandPalette，这场又抓到 Sheet/
  Tooltip/HoverCard 三个。**规矩：新装任何 shadcn 组件先 grep 它有没有
  `.Portal`，有就给 `container={portalContainer()}`（src/lib/
  portal-target.ts）。判断方法：截图出现 serif 字体/白钮＝先想这条。**
- 🔴 **把「硬挡/补格」内容挂在「值存在」的分支下＝值缺席时挡也消失。**
  D48 第一版把缺格表单塞进 ValueRow 的 blocked prop，而 AJK 的 paste
  值来自 minutes 的 office_bearers——打字 AGM 没写理事＝值 missing＝
  整个硬挡区不渲染，探针当场抓到。**修法：门禁与就地修补渲染成
  sibling，值的有无只决定复制钮的形态。**
- 🔴 **async 迴圈里呼叫「身份随渲染变」的 useCallback，要经 ref 拿最新
  版**——minutes 队列若捉住旧 onPhotoPicked，`continuing` 用读前快照
  判定，第 2 页会整份**取代**第 1 页（merge 本身是 functional update
  救不了这个判定）。模式：`ref.current = cb`（useEffect 每渲染更新），
  迴圈里 `await ref.current(...)`。
- ⚠ **日历格线第一周带上月残日：按日号找格子，第一个匹配可能是上个月
  的那天**（八月格线第一行有 Jul 31；probe 点「31」点到过去日，未来日
  才有的匯出鈕全 FAIL）。**修法：取最后一个匹配；判断方法：「加了东西
  面板有、future 区没有」先想选错月。**
- 💡 **旧拒绝句的关键词常常同时是表单 label**（「任命日期」就在标签上）
  ——D48 探针等拒绝句要等它**独有**的整句（§6 旧条目「wait 的字串会
  出现在上一步画面」的表单版）。

### 2026-08-30 晚新增（87 号 ⑨ 上线后第一批场）

- ⚠ **pdf-lib 画矩形不是 `re`，是 translate(cm)＋moveTo/lineTo 路径**——
  要从 PDF bytes 还原画了什么，解析器必须跟踪 CTM（q/Q/cm）再对填充
  子路径取 bbox（qr-in-pdf.ts；对着 node_modules 的 operations.js 验过）。
  另外**别把所有 FlateDecode stream 都当内容流**：字体/图片流解出来是
  二进位噪音，会 tokenize 出幻影运算子——按 dict 类型（FontFile/Image/
  Metadata）先排除＋可打印字符比例把关。
- ⚠ **puppeteer 的 `response.buffer()` 对「页面已当 blob 消费」的 fetch
  回应常拿到空**（body 被逐出）。要拿真点击产生的下载 bytes，钩
  `URL.createObjectURL` 把 blob 存一份再读——仍是真按钮真路径的最后
  一步，不是绕过。
- 💡 **写「贴 migration 前的基线期望」自己也要被探针打脸一次**：我以为
  receipts 的 delete 在贴 39 前「除审计全员可删」，probe-rls-87 实测
  全员被拒——20260726 早就拆了 receipts_delete。两个教训：基线不是
  想出来的，是量出来的；**rollback SQL 不准复活更早的 migration 已经
  删掉的东西**（39 的 rollback 为此对 receipts 特判）。
- ⚠ **tsx 跑 .ts（repo 无 "type":"module"）＝CJS 输出，顶层 await 直接
  炸**——探针脚本包一层 `async function main()`。probe-deadbuttons-82
  没踩到是因为它没用顶层 await。

- ⚠ **跨语言关键词表先查同形词：英文 "fail" ＝ 马来文「档案」。** 预备
  问答层的 trouble 词表收了 "fail"，「macam mana nak upload fail」整条
  被当故障题误杀——单元测试当场抓到（改收 failed/fails）。**判断方法：
  任何「一份词表管三种语言」的过滤器，每个词先问它在另外两种语言里
  是不是普通词（同 §6 旧条目「Minit 在 BM 里就是会议记录」一族）。**
- ⚠ **手机版聊天面板的 DOM 里第一个 `<aside>` 是隐藏的侧栏，不是面板**
  （桌面才有 motion.aside 包一层；手机 sheet 是 div）。探针用
  `document.querySelector("aside")` 量到 0×0 还以为面板没开。**修法：
  选面板用 `aside.v2-glass`；判断方法：getBoundingClientRect 全 0 ＝
  抓到 display:none 的别人。**
- 💡 **「面板关掉对话就不见」这类观察，先用探针重现再动刀（K0 的规矩
  值得再用）**：实测对话在两面、三种关法下都留着——J 看到的最可能是
  首页框与浮动面板本来就是两个对话（两把 key，设计使然）。观察是真的，
  病因未必是观察到的那个。

### 2026-08-30 深夜新增（81 号章程分段读场）

- 🔴 **换「读长文件」的模型，先量它的生成速度（tok/s），再跟时间墙比。**
  3.6-flash 在 72 号表里「一次过最自然还便宜」，但章程实测 139 tok/s——
  比 flash-lite（489 tok/s）慢 3.5 倍，整本 92.3s、bench 10 案 2 案直接
  逾时。「上限要装得下同路径最大件」的时间维度对**模型**也成立：
  `npx tsx scripts/probe-constitution-speed.ts <provider:model>` 一条命令
  就能量，换 AI_MODEL_LONG_DOC 前先跑它。
- ⚠ **对模型输出做字面断言要大小写不敏感**——探针断言合成 PDF 里的
  「PEMBUBARAN」，模型正常化成「Pembubaran」，断言红了但产品是对的。
  probe-i1-81 第一轮就踩了；对 AI 吐回的字串一律 `/…/i`。
- 💡 **app_errors 只存 hash，但含变量的讯息也能暴力还原**：两枚指纹对不上
  任何固定句，把「timed out after {N}ms」的 N 从 0 扫到 60000 一秒就对上
  （19753ms/20402ms）——还原出的不是句子，是**当时剩多少预算**这条证据。
  取证时先想「讯息里哪一段是变量、值域多大」。

- 🔴 **从 "use client" 档 import「非元件」的导出到 server component，拿到
  的是 client reference 不是值**——LANGKAH 常数阵列放在 flow-ui.tsx
  （client）被 server 步页 import，`LANGKAH[n-1].bm` 直接
  TypeError（build 过、运行才炸）。**修法：client 与 server 共用的常数/
  纯函数放「无指令」的 plain module（langkah-meta.ts）；判断方法：
  server 页炸 undefined 而 import 来源档头有 "use client"，先想这条。**
- 🔴 **探针「按名字捞 org id」＋失败跑残留的同名孤儿＝种子种错 org 的
  分裂脑**——UI 的 active org 是新建的，REST 捞到的是旧孤儿；症状
  非常诡异：UI 自写自读的步骤全 PASS（自洽），只有「REST 种的资料」
  读不到、「UI 写的资料」REST 验证 0 行。**修法：捞 id 用
  order=id.desc&limit=1；开场先按名字扫残留；finally 按名字整批删。
  判断方法：见到「一半 PASS 一半 0 行」的分裂，先 select 一下同名 org
  有几个。**
- ⚠ **org 名输入框自动大写，再验证一次**（§6 旧条目）：探针的 ORG_NAME
  带小写字母，按原字串查库永远查不到——固定资料写「变形后」的形状。
- ⚠ **`type="email"` 的浏览器原生验证会抢在 server action 前面，而且只讲
  浏览器的语言**——我们的三语拒绝句永远到不了屏幕。要三语错误就用
  `type="text"`＋`inputMode="email"`，让 server 当唯一的验证者（H1 电邮格）。
- 🔴 **Provider 挂在 section layout 上时，「挂载时读一次 URL 参数」的
  effect 在 SPA 导航后不会再跑**——一次性 ref 在同 layout 的别的子页
  就被消耗掉（/minutes/drafts 和 /minutes 共享 MinutesProvider，Resume
  的 ?draft 被无声吞掉）。**修法：带参数重新进入的入口用整页导航
  （plain `<a>` 不用 `<Link>`），或让 effect 对 searchParams 起反应。
  判断方法：「点了没反应、参数还挂在网址上」先想这条。**
- 💡 **window.confirm 不算确认弹窗**（§1-10 拍板落地时记下）：浏览器
  裸框、只讲浏览器语言、部分手机浏览器能整个关掉它。全站删除一律走
  `src/components/confirm-delete.tsx`（包 ConfirmDialog/portal-target）；
  新增删除控件别再写 window.confirm——grep 已清零，别再加回来。

### 2026-08-29 深夜新增（68 号 ⑦ 品质场）

- 🔴 **模型会把拉丁人名音译成「发明的汉字」——而 checkNames 对中文文件
  天生不设防**（它只会问「这个汉字哪来的」，中文文件满页汉字问不了）。
  实战：zh 版把 En.Loo Sio San 写成「吕兆生先生」，字字是猜的，盖在真人
  头上。**修法：反向围栏 checkLatinNames（minutes-compose.ts）——原文里
  名字形状的拉丁字串必须逐字存活；判断方法：凡「输出语言＝中文」的
  AI 写作路，先问拉丁名字靠什么活下来。**「不准改名字」是指令不是保证，
  再次验证。
- ⚠ **给「大写词串＝名字」类启发式加豁免词表时，敬称缩写（En./Pn./Dr.）
  要进词表**——否则「Setiausaha En」这种半截串被当名字，合法翻译全被
  误杀（写测试当场撞到）。
- 💡 **结构化文件的成文＝组装不是写作，能做到零 AI 费**：打印 BM minit
  出 BM 版全程 code（分节/编号/段落 verbatim），模型只翻要换语言的段落。
  「确定性管线优先」在成文端的形状就是这个——先问「这一步真的需要
  判断吗」，再决定要不要花钱。
- ⚠ **grep 说 minutes-compose.ts 是 binary 不是坏档**——checkNames 里
  有一个刻意的字面 NUL（join("\0") 防跨串误配）。要搜这支档用 Read/
  PowerShell，别对 grep 的 binary 判定慌。
- 🔴 **flash-lite 会把栏位标 `missing` 却又塞值——契约打回整份读取，
  rule-7 重读又塞不进 50s 预算，最终包装成「AI took too long」。**
  逾时是症状不是病。**修法：parse 前信标签（coerceMissingFieldsEmpty，
  只抹值绝不提升——缺口保持缺口）；判断方法：timeout 案先本机跑
  probe-constitution-speed.ts，看是「真慢」还是「读回来但 FAILED
  CONTRACT」。** 上限算术（45s/50s/60s）本身没错，别再动它。
- ⚠ **「上一轮量的数字一模一样」不是巧合是警报**——探针连四轮 54.2s/
  51.2s 分秒不差＝量到的是我们自己的 deadline 墙（或旧进程），不是
  vendor。看到 suspiciously identical timings，先确认到底在量谁。
- 💡 **held-out 样本真的抓得到迭代组抓不到的病**（J 的防过拟合令实证）：
  斜线复合标签「青/小/小小班」被模型拆组、未决区块双重编号，两条都是
  held-out 才暴露。规矩留着：分半、迭代期间不碰。

### 2026-08-29 傍晚新增（64 号 AI 智能建议场）

- ⚠ **一支 server action 里的 `revalidatePath()`，会让「从别的页面呼叫它」的
  那一页也整页重渲染**——建议卡确认加人走 members 的 addCommitteeMember
  （里面 revalidatePath("/members")），成品页跟着重渲染、名册 dedupe 把
  刚确认的卡从 props 里拿掉，✓ 和指路链接一起消失。**修法：确认瞬间在
  client 端记一份快照（confirmedHere），卡被 dedupe 掉后 ✓ 照渲染。
  判断方法：「按了确认，卡无声消失」先想这条。**
- ⚠ **探针在「多张卡共享一个外层容器」里按卡找按钮，只能比对「最近的
  rounded 祖先」**——爬到外层 Card 才比对文字，每张卡的 textContent 都
  包含全部卡的字，第一颗按钮永远中签（第一版探针把「忽略」按到了别张卡，
  还写进了别张卡的表）。跟既有陷阱「wait 的字串会出现在上一步画面」同族：
  **断言/点击都要圈定「这一张卡独有」的 DOM 范围。**
- 💡 **成品页的 `<pre>` 全文会逐字重复决议内容**——对卡片区的文字断言
  一律读 `[data-probe="suggestion-cards"]` 范围，不读 body.innerText。

### 2026-08-29 下午新增（56 号场 · 包 D2/D3）

- ⚠ **PostgREST 批量 insert 的每个物件「键」必须完全一致**（PGRST102
  "All object keys must match"）——第二笔少带一个 venue_text，整批 400。
  可选栏位在批量里写 null，不要省略。
- ⚠ **render 里定义元件会吃 `react-hooks/static-components`（error，
  基准外）**——每次渲染都是新元件、state 全重置。元件一律模组级；要
  hook（useTriText/useState）就让元件自己调，不要从父层闭包里拿。
- ⚠ **`navigator.clipboard.writeText` 的 rejection 要 `.catch`**——无头/
  权限被拒时 unhandled rejection 算 page error（探针会红）。UI 规矩：
  剪贴簿失败＝降级（值仍可手选），绝不炸。无头 Chrome 测复制要在
  **开页之前** `overridePermissions`，事后授权来不及。

### 2026-08-29 午后新增（56 号场 · 包 D1）

- ⚠ **重跑 e2e 前先杀旧 `next start` 再看 build**。旧进程占着 3000、新 build
  改写了 .next 的 chunk 名 → 全场 ChunkLoadError、13 项连锁 FAIL，看起来像
  产品坏了。Git Bash 的 `pkill`/`kill %1` 在 Windows 上杀不掉背景 node——
  用 PowerShell `Get-NetTCPConnection -LocalPort 3000` 找 OwningProcess 杀。
  判断方法：e2e 大面积红＋page errors 全是 ChunkLoadError＝先怀疑这个。

### 2026-08-29 午新增（56 号场 · 包 D0）

- 🔴 **放大一个上限，先查同路径上每个「时间」上限装不装得下新的最大件。**
  51 场把章程输出 ceiling 提到 64k 修好了截断案，但单次 vendor 时限还停在
  20s——生成 64k 要的时间远超 20s，修截断把死因搬进了逾时（J 的「AI took
  too long」）。既有教训「上限要装得下同路径其他上限允许的最大件」**包括
  时间维度**。判断方法：任何 maxOutputTokens 的调整，拿实测生成速度
  （app_errors/ai_usage 反推得出 ≥410 tok/s）除一下，跟 timeoutMs 比。
- 💡 **被 abort 的 vendor 呼叫连 usageMetadata 都不会有**——ai_usage 一行
  cost NULL＋refunded、app_errors 记 VendorTimeoutError，就是「我们自己
  掐断了它」的指纹（厂商真的挂了通常至少有部分回应或 5xx 记录）。
- ⚠ **对「读多页」的 UI 断言，成功的中间态会提前满足 wait 条件**：
  「条条文已读入」在第 1 页合并后就出现、第 2 页还在读，探针提前断言＋
  下一步 uploadFile 被 aiBusy 静默吞掉。等「整个 run 结束」（busy 字样消失）
  再断言；另外收合的 `<details>` 内文不在 innerText 里，断言要对可见的
  summary/heading。

- 🔴 **React 19 会在 form action 返回后自动 reset 非受控栏位——成功、报错、
  「再问一句」全都会**。后果两种：①受控栏位不清（B-4 的「日期卡着上一笔」）；
  ②报错时用户输入被清光、「确认后重送」送出的是空表单（同名确认第一版就是
  这样死的，探针抓到）。**修法：要活过 action 的表单一律受控；成功后要清就
  effect 里 setTimeout(0) 清（eslint 基准的 sanctioned 写法）；「确认重送」
  不要靠 submit button 的 name/value（版本行为有差），手动组 FormData +
  startTransition(formAction(fd))。**
- ⚠ **探针/e2e 的 waitForFunction 等的字串，先 grep 它会不会出现在「上一步
  的画面」里**——members 探针等「另一位同名」，而上一步的拒绝句里恰好也有
  这四个字，wait 瞬间通过、按钮还没渲染就去点（点了个寂寞，还以为产品坏了）。
  等「这一步独有」的字（按钮文案「照加」）。
- ⚠ **Edit 工具写「哨兵字元」类不可见字符会写出 NUL 进源码**（office-text
  的 pptx 第一版）——不可见字符的批量替换用 PowerShell/.NET 写行，不要在
  Edit 的字符串参数里放特殊码位。

### 2026-08-29 晚新增（48 号救 AI 场）

- 🔴 **Vercel 对 serverless 请求体有 ~4.5MB 硬上限，超了回 text/plain 413，
  根本不进我们的代码**——所以 app_errors 0 行＋ai_usage 0 行＋客户端红框
  「连不上 AI」三件事同时出现时，先怀疑它。本机 dev 没这个限制，
  「本机都好好的」不算反证。**判断方法：`node scripts/probe-payload.mjs`
  一跑便知（零额度即可证实/证伪；SKIP_SMALL=1 跳过花钱的对照）。修法：
  客户端缩图＋4MB 前置挡，常数只写在 `src/lib/shrink-photo.ts` 一处。**
  这是「上限要装得下同路径其他上限允许的最大件」的镜像：平台上限比
  我们的 8MB 承诺小，而且它不是我们写的。
- ⚠ **server action 的 bodySizeLimit 预设 1MB**——比路由的 8MB、平台的
  4.5MB 都小，而且失败是 throw 不是 outcome。转账凭证 >1MB 一直传不上，
  没人报过错。改在 next.config.ts（4400kb）；新的「文件走 server action」
  路先想这条。
- ⚠ **客户端后备错误字串是最后一道人话防线，写「…」＝把平台故障翻译成
  三个点**（members 案，tester 只看到三个点）。规矩：fetch 的 catch 与
  非 JSON 回应一律走 `uploadErrorMessage()`/USER_ERRORS，占位符一个不留
  （全站 grep `?? "…"` 已清零）。
- 💡 **useActionState 的旧 state.error 无法命令式清掉**——要「按下别的
  按钮时隐藏旧表单错误」，记住当时那个 state 物件、按身份比对着隐藏
  （members-form 的 errorHiddenFor）；下次 dispatch 产生新物件自然复显。
  两套互不相识的错误栏会同屏叠两条红框。

### 2026-08-29 凌晨新增（RESPONSIVE 场）

- 🔴 **`backdrop-filter`（还有 `filter`/`transform`）的祖先会变成 fixed 后代的
  包含块**——玻璃顶栏里开的 `fixed inset-0` 弹窗，「全屏」其实是 56px 的
  顶栏，卡片开在视窗顶被切头（J 的截图就是这个）。**修法：弹窗类组件一律
  `createPortal(document.body)`（Modal 与 CommandPalette 已改）；判断方法：
  弹窗位置诡异，先往上找带 filter/transform/backdrop-filter 的祖先。**
  以后在顶栏/AI 面板（motion 有 transform）里新加任何 fixed 组件，先想这条。
- ⚠ **flex-wrap 行里的光杆 `flex-1`（basis 0）永远不会触发换行**——它先把
  自己压成一字一行（/filings 截止日期行在 375 的惨状）。**修法：标题列给
  `min-w-[10rem] flex-1`，右侧的日期/徽章就会整块下折**（clause-book 的
  `min-w-56 flex-1` 是同款正确写法）。
- ⚠ **fullPage 截图会把 fixed 元素（手机底栏、浮动按钮）画在长图中段**——
  那是拼接假象，不是破版。看 375 长图时先想起这条再喊修。
- 💡 **弹窗矮窗保护的正确写法是 `max-h-full`＋`overflow-y-auto`**（相对带
  padding 的 flex 容器量），不是 `max-h-[90vh]`——300px 高的窗 90vh 还是爆。
- 💡 **视口宽的「答案」全在 <main> 的 @container 上**：宽度敏感的格线/分栏
  一律用 @xl:/@3xl:/@4xl:（对照表：sm:→@xl、md:→@3xl、lg:→@4xl）。
  例外只有 bare 路由（/login、legal——没有 @container，viewport 断点照旧）。
  另注意 card-header 自带具名 @container/card-header——别在 CardHeader 里
  用不具名容器变体，会量到卡头不是量到页。

### 2026-08-28 深夜新增（围栏场）

- 🔴 **围栏的失败方向是一张固定的表，别改反**：读「谁被围」失败＝**不围**
  （打嗝不准给付费社团盖水印）；fence_charge 记不了帐＝**不给干净档**（跟 AI
  计量同一条诚实规则）；RPC/表不存在（migration 31 没套）＝**完全照旧**（D8）。
  三个方向各有理由，写在 src/lib/fence.ts 档头——改任何一个先读那段。
- 🔴 **migration 31 没套用时「围栏不挡人」不是 bug**，是「装了没通电」的
  刻意形态（fail-open）。别在 DB 落后时把 fail-open 改成 fail-closed——那会
  把所有 trial org 一夜锁死。
- ⚠ **`onClick={fn}` 会把 MouseEvent 当第一个参数塞给 fn** ——
  `downloadPack(clean?: boolean)` 这种带可选布尔的处理器直接挂上去，event
  会被当成 `clean=true`，免费用户白拿干净档。一律 `onClick={() => fn(false)}`
  （agm-pack-review 两处差点中招，tsc 抓到的）。
- ⚠ **给「文件出口」加新参数时，sample/CONTOH 路要先排除在外**（禁令：示范
  永不挡真用户）。本场三条 PDF 路都是 sample 分支先 return 再进围栏。
- 💡 **「服务器端才是闸，前端只是显示」在围栏上再次生效**：所有 remaining
  数字都是渲染当下的快照，真拒绝只发生在 route/action 里；改 UI 数字骗不过闸。

### 2026-08-28 新增（美术三包那一场）

- 🔴 **品牌 logo 的真相是 `scripts/assets/minit-logo.png`，不要再畫一張**：
  repo 裡曾有一個手繪的向量仿製版，跟正本不一樣（線較細、紫較飽和），結果
  App 和瀏覽器分頁長期顯示兩個不同的 logo。2026-08-28 修這件事時我還一度
  統一到仿製版那邊，被 J 當場抓回來。現在 `BrandLogo` 只是一個 `<img>`，
  仿製版已刪。要換 logo：換那張 PNG → `npm run icons`。
- 🔴 **`body` 和 `.v2-root` 的背景不要改回不透明**：画布渐层是
  `.v2-root::before` 的 `z-index:-1` 层，而负 z-index 子层比 in-flow 区块背景
  **先**画（CSS 2.1 附录 E：第 2 步 vs 第 3 步）。任何一层加回不透明底色，
  渐层就再消失一次——而且它会「看起来像没写」，因为 CSS 全都在、只是被盖住。
  平色底在 `<html>`，那是给 reduced-transparency／强制色彩／壳外路由的后路。
- 🔴 **globals.css 里那些不分层的 class（.v2-pill / .v2-glass）会压过 Tailwind
  utility**：Tailwind v4 的 utility 在 `@layer utilities`，而没写在任何 layer 里的
  规则一律赢过有 layer 的——不看 specificity。所以 `className="v2-pill rounded-full"`
  的圆形按钮一直是圆角方块（J 8/27 指定圆形，做了但没生效，没人发现）。
  以后遇到「明明写了 utility 却没作用」，先看是不是撞到这几个 class。
- **圆角阶名的意义在 2026-08-28 整体上移了一阶**（`rounded-md` 8→12、
  `rounded-sm` 6→8、`rounded-lg` 12→16）。看到旧 commit 或旧文件写「卡片 8px」
  不要照着改回去——现在卡片是 12px，而且五个数字只在 `:root` 的 `--v2-r-*` 写一次。
- **首页状态行的 null 和 0 是两回事，不要合并成 falsy 检查**：null＝读不到→
  整行不画；0＝读得到而且真的没有→写成邀请句。刚成立的社团和坏掉的查询，
  只看 falsy 长得一模一样，而把「你没有记录」讲给查询失败的人听是最不该犯的错。
  `src/lib/home-card-lines.test.ts` 用 13 支测试钉住这条。

### 2026-08-28 晚新增（八条那一场）

- **checkMergedFacts 不要再收紧回「每个中文字都要在」**：第一版连单字量词
  （位/个）都要求出现，结果把「10位 → 10 orang」这种完全正确的马来文合并
  当成掉字打回。现行规则（≥2 字中文词＋数字）是试出来的平衡点——名字和
  班名全 ≥2 字，量词合法被翻译。收紧它 = 合法文件全被打回 = AI 撰写废掉。
- **PhotoLightbox 的缩放重置不要改回 useEffect**：`useEffect(()=>setStep(0),[index])`
  会吃一条 react-hooks/set-state-in-effect（基准外新错）。现行写法是把 zoom
  连同它所属的 index 存成一个 state（`{forIndex, step}`），换页时在 render 里
  派生回 0——无 effect、无额外渲染。
- **「已存档工作区即弃」是拍板（D36），别当 bug 修回去**：restore 看到
  savedToHistory 就清 localStorage 是故意的；「上一场已存好」卡是删除不是丢失。
  补拍同场另一页的路已由成品页「修改」承接。e2e-minutes 对这两个行为有断言。

### 2026-08-28 新增（四答七条那一场）

- ⚠ **Git Bash 会把环境变量里「以 / 开头的清单」当路径改写**：
  `SHOTS_ROUTES="/money,..."` 第一项被 MSYS 变成 `C:/Program Files/Git/money`
  → 截图对着 404 拍。**修法：传 `money`（脚本自己补斜杠）或加
  `MSYS_NO_PATHCONV=1`。判断方法：截图档名里出现 Program-Files-Git 就是它。**
- ⚠ **PostgREST 的 `.or()` 语法用逗号/括号做分隔——用户搜索词里一个逗号就
  400、整页空白。** 进 or() 前把 `,()"` 换成空格（history 搜 title 那步）。
- 💡 **「AI 不准碰名字」和「用户要换名字」不冲突——答案在名册。**
  person_name→name_official 是人对着 IC 打的表，程式替换（roster-names.ts）
  零额度零幻觉。凡「AI 被禁止做的事用户又要」，先找系统里有没有人类已经
  录好的对照表。
- 💡 **可选栏位的「剥离重试」长成清单就抽成梯度循环**：insert/update 前把
  optional 栏位列成数组，错误讯息点名哪个就 delete 哪个再试
  （minutes actions 的 client_id/title/photo_paths）。

### 2026-08-28 新增（两份 review 总攻那一场）

- 🔴 **「远端覆盖本机」的合并规则遇上 forward-only 状态机＝复活 bug。** DB 从没
  听说过交接，每次载入就把 settled 盖回 collected——同一张收据交了两次（J #17）。
  **修法：状态机是 forward-only，合并也要 forward-only（取走得最远的）；而且
  转移必须写回 DB，不是只写批次。判断方法：凡「本机改状态＋远端 hydrate」并存，
  先问远端什么时候学会这个状态。**
- 🔴 **输出上限比页数上限装得下的文件小＝确定性失败，还被包装成「连不上，
  再试」。** 8192 默认上限 vs 50 页章程；两次白烧 RM0.10。**修法：ceiling 跟
  page cap 配对（EXTRACT_OUTPUT_CEILING）；确定性失败用 typed error
  （VendorOutputTruncatedError→413），永不叫人重试。判断方法：任何「上限/配额」
  常数，先问它装不装得下同一路径上其他上限允许的最大件。**
- 💡 **app_errors 只存 hash 也能取证：把候选错误讯息本地 hash 了比对。**
  两笔 #1c0d0970… 直接对上 MAX_TOKENS 讯息——不用猜，不用重现。
- 🔴 **视口断点在「侧栏+dock 吃宽」的壳里说谎。** 1366px 视口开着 640px 面板，
  lg: 还是 4 栏——竹竿卡片。**修法：<main> 挂 @container，宽度敏感格线用
  container variants（@md:/@4xl:）量内容栏本身。新格线一律 container 优先。**
- ⚠ **vi.mock 一个「route 和它的 helper 都 import」的模组，新增导出没跟上=
  整档 500。** extract-minutes 测试 mock 了 provider 只给 getVisionProvider，
  route 新 import 的 EXTRACT_OUTPUT_CEILING 变 undefined——4 测全红（还先
  commit 了才发现，补了一支修正）。**修法：vi.mock 用 importOriginal 展开真
  模组、只盖要假的那个；跑完 vitest 再 commit，绿了才算数。**
- ⚠ **e2e 的「逃生口点击」在产品把逃生口拆掉后会反着断言。** D30 拆了
  「没有记出席」，e2e-minutes 原地改成「先证明稍后补上锁着保存，再真加一个
  出席者」——把新契约测进去，而不是把断言删掉。

### 2026-08-27 深夜新增（20 条那一场）

- 🔴 **大小写敏感的品牌替换在 BM 里会误杀语言本身。** "Minit" 在马来文里就是
  「会议记录」（Minit mesyuarat / Minit baru / Sejarah Minit / Minit AGM /
  Minit belum disahkan…）。**修法：替换脚本带保护清单（这些搭配先换哨兵再
  全局替换）；判断方法：凡「把品牌词全局替换」先问这词在产品语言里是不是
  普通词。**
- 🔴 **把入口从 A 页搬到 B 页，e2e 里按旧按钮文案找门的步骤会全场连锁 FAIL
  ——第一条 FAIL 才是根因。** 打字格搬去 /money 后，e2e 还在 /money/receipts
  点「打字输入整份名单」，后面 10 条全红。**判断方法：e2e 大面积红先看第一
  个失败的「门」，别逐条修尾巴。**
- ⚠ **usePersistentState 的 default 若在 render 里读 localStorage，会 SSR/
  CSR 不一致。** 旧 key 收编（boolean 献供 toggle → 结构化 repeat）要放进
  loaded 之后的 effect，不能放 default 初始值。
- ⚠ **Intl 的非公历（islamic-umalqura）在缺 ICU 的环境会静默退回公历。**
  用一个已知日期探针（2024-03-15＝Ramadan）验一次再信它；验不过就整个隐藏。
- 💡 **「AI 不智能」的单子先问是不是规则性输入。** 「农历每月初一十五」是
  算术不是提取——lunar-parse 在送 AI 之前拦下，零额度、永远对（既有教训
  「能用程式解析的，不要送去 AI」再次生效）。


### 2026-08-27 下午第二场新增（紫色改版＋马来语把关那一场）

- 🔴 **同一天的拍板也会被同一天更晚的拍板覆盖——绿色整套做完 6 小时就被紫色
  换掉。** 改版型的工作先把「可重跑」做进工具（brand-icons.mjs 一条命令重生
  图标、radius codemod、howitworks 重拍脚本），第二次换皮只花第一次的零头。
  **判断方法：凡「换主题/换 logo」类需求，第一问是「下次再换要几步」。**
- 🔴 **「不准出现某语言」的把关，必有合法例外：注册名照印、永不改写。**
  BM 把关第一版把 e2e 的中文机构名当违规，挡了它自己的文件。**修法：
  cjkSnippets 带 allow 清单（机构名/签名人先剔除再验）；判断方法：写任何
  「内容白名单/黑名单」检查前，先列「哪些字符串是这份文件必须原样印的」。**
- ⚠ **规格书是别人量的，也要过自己的底线**：tester 的输入框边框 1.55:1 会
  重演 C-5 的「看不到框」——照抄前把对比自己再算一遍，偏离要写进报告。
- ⚠ **radius 类 codemod 必须单趟查表**（3xl→lg→sm 连锁替换会把 26px 干到
  6px）——规格书自己警告了，照做就对。
- 💡 **e2e 是「组件退役」的探测器**：OrgChip 删了，e2e 的 fresh-session 检查
  立刻红——把它改成测新机制（头像选单里的 org 行），而不是删断言。

### 2026-08-27 下午新增（32 号单那一场）

- 🔴 **本机 Turbopack dev 也会「新代码端旧 CSS」——Vercel build-cache 坑的本机
  双胞胎。** 改完 globals.css 的 token 后起 dev server，「Ready in 352ms」＝它
  还原了旧的 .next 快取，页面上 --v2-primary 还是旧紫。**修法：杀进程 →
  `Remove-Item -Recurse .next` → 重起；判断方法：改了 token 先用
  getComputedStyle 问页面，不要信「档案已存」。** 另注意 `next build` 和
  `next dev` 共用 .next——build 完最好重起 dev。
- ⚠ **e2e 脚本带「直接清理」fallback 时，一个搬走的路由只会印 NOTE 不会红。**
  设置拆页后 e2e 的删机构步骤在 /settings 找不到表单、fallback 用 REST 清掉、
  依然 ALL CHECKS PASSED——flow 其实断了。**判断方法：e2e 输出里的 NOTE 行
  当半个 FAIL 读；有 fallback 的检查，fallback 被走到本身就是消息。**
- ⚠ **preview_start 在本机对 npm/node 一律 EACCES——dev server 用 Bash 背景
  `node node_modules/next/dist/bin/next dev` 绕。** 浏览器面板照常能连
  localhost（preview_start 传 url 即可）；无人值守时截图仍用 headless Chrome
  （§6 既有条目）。
- 💡 **「改一个色系」的真工作量在硬编码，不在 token。** 主色 token 四行改完，
  grep `5b4bd6|6f5ef2|8d80f0|rgba(124` 又扫出 15 处渐层/阴影/hover 硬编码
  （button 默认款都是）。**判断方法：改完 token 必 grep 旧色值到 0 为止。**
- 💡 **白字对比鐵律的实现形状：两个 token。** `--v2-primary`（文字/图标用，
  亮模式深绿、暗模式亮绿）与 `--v2-primary-fill`（白字底，两模式都是 #15803D）
  ——亮绿 #22C55E 压白字只有 2.28:1，永远只做装饰。紫色时代同款结构，换色
  照抄即可。

### 2026-08-27 上午新增（上线日：push 成功但线上还是旧版，连环两个坑）

- 🔴 **Vercel Hobby ＋ private repo 只部署「专案拥有者本人」的 commit。** 这台电脑
  存着两套 GitHub 身份（ifelse3d ＝ Vercel/repo 拥有者；nightmarefairy ＝ J 的另一个
  帐号）。31 号单的 19 支 commit 署名是 nightmarefairy、今早的 push 也用了它的凭证
  → Vercel 状态 **Blocked**（「commit author did not have contributing access」），而且
  被挡那笔上的 Redeploy 按钮直接变成 Upgrade to Pro 付费墙。昨天能上是因为当时
  用对了帐号，不是规则不同。**已修（2026-08-27）：** ① repo 本地
  `user.email = 291105987+ifelse3d@users.noreply.github.com`（以后 commit 都算拥有者）；
  ② remote URL 固定成 `https://ifelse3d@github.com/ifelse3d/MINIT-PROJECT.git`
  （凭证不再看运气抽签，push-cabang.bat 的「跳视窗要选 ifelse3d」警告从此不该再出现）；
  ③ 解当下的封锁＝用 ifelse3d 署名叠一支空 commit 再 push（cbb8609）。
  **判断方法：** Vercel Deployments 列表状态 Blocked ＝ 这个；本机
  `git log -3 --format="%an <%ae>"` 看署名对不对。
- 🔴 **Vercel「Restored build cache」＋ Turbopack ＝ 新 commit 建出旧 CSS。** 解封后的
  部署 Source 明明是新 commit、49 秒 Ready，线上 globals 的 token 却还是旧值
  ——build log 里那行 `Restored build cache from previous deployment` 就是元凶。
  **修法：** 该部署 ⋯ 菜单 → Redeploy → **不勾** 「Use existing Build Cache」。
  **判断方法：** 抓线上 `/_next/static/...css` 搜一个这次改过的字面值（例：`15803d`），
  和本机 `.next` 的 globals css 对比；「部署 Ready」不等于「线上是新的」。
- ⚠️ **status.bat 是当下快照＋少数写死的人眼注记，不是历史记录。** 怀疑时重跑一次，
  再看时间戳。

- ⚠️ **正则从散文里收割「provider:model」清单，会把句号吃进模型名、把 embedding
  模型当成读取候选。** 修法：正则尾锚定字母数字＋按用途黑名单；任何「从文件里
  grep 清单」的工具，先 --dry-run 把收割结果印出来人看一遍。
- ⚠️ **查询线上表之前先确认枚举值的真实拼法。**（ai_usage 里是 `chat_turn` 不是
  `chat`——查询成功、返回 0 行、看起来像没数据，其实问错了问题。）
- ⚠️ **给 heredoc 里的 Python 传中文长文案，内嵌英文双引号会当场炸语法。**
  长中文＋引号混排的批量编辑，用 Write 工具写 .py 档再跑。
- 💡 **示范模式＋无 AI 打字路＝零额度的截图素材生产线。**（32 号单又用了一次：
  导览四格重拍全程零厂商呼叫。钱区示范已删，money 截图改走「真页面空状态＋
  打字路」。）

### 2026-08-28 凌晨新增（31 号单场次 3）

- 🔴 **壳上新增一个全局表单控件，e2e 里所有「抓第一个」的选择器会无声换绑。**
  修法：按内容找控件；壳级 UI 改动后，e2e 挂掉先怀疑选择器换绑，再怀疑产品。
- ⚠️ **无人值守的 session 里 Browser 面板不显示＝截图必挂。** DOM 工具照常能用；
  截图用 headless Chrome 的 `page.screenshot()`（不受此限）。
- ⚠️ **原生 `<select>` 的最小宽度是它最长的那个 option。** flex-wrap 表单里的
  select 要给 `w-full min-w-0`。
- ⚠️ **客户端输入变形（自动大写）会让「后面按原字串查库」的 e2e 全部落空。**
  e2e 固定资料要写成「变形后」的形状。

### 2026-08-28 凌晨新增（31 号单场次 2）

- ⚠️ **`eslint-disable-next-line` 只管字面上的「下一行」。** 理由写上面几行，
  directive 单独一行贴着目标。
- ⚠️ **`react-hooks/set-state-in-effect` 是 error，而本 repo 的 eslint 基准逐字
  冻结（21）——新代码一条都不能加。** ①能推导就推导 ②真要读外部信箱，
  effect 里 `setTimeout(0)` 再 setState。旧代码里既有的别顺手修（会动基准数）。
- ⚠️ **持久化的列表配 module-level key 计数器＝还魂的 key 撞车。** 恢复后先把
  计数器抬到 max(恢复的 key)。
- 🔴 **「不准出现在真实 org」的假数据，grep 字面量最快。** 直接 `grep -rn "Demo"`，
  不要从画面反推。

### 2026-08-28 凌晨新增（31 号单场次 1）

- 🔴 **serverless 函数被平台掐死（maxDuration）之后，你的 catch/finally 一行都不会跑。**
  任何「循环里呼叫外部服务」的 route，先算最坏情况总时长再和平台硬顶比；
  预算从 route 顶上传下去共用，留出收尾时间。
- ⚠️ **测「时间预算」逻辑时，mock 是瞬时的——预算永远不会自然缩小。**
  让投影的 backoff 去吃预算，或操纵时钟。
- ⚠️ **`catch {}`（不绑变量）是搜索「吞错点」的好线索。** AI route 里的厂商失败
  一律走 `vendorFailureResponse()`；退款贴着它要退的那笔 charge。

### 2026-08-27 凌晨新增（27 号单通宵那一轮）

- 🔴 **PowerShell 改档的编码坑：`Get-Content` 读入也要 `-Encoding utf8`，缺一头
  照样把中文搅成乱码。** 批量替换用 `[System.IO.File]::ReadAllText/WriteAllText`
  明示 UTF8，或干脆用 Edit/Write 工具逐档改。
- ⚠️ **e2e 的 Supabase cleanup 段偶发 `fetch failed`（网络瞬断）不是产品坏了。**
  一次失败先重跑再下结论。
- ⚠️ **PDF 内容流是压缩的——别对 `buildXxxPdf()` 的 bytes 做字串断言。**
  「文件上该印什么」抽成纯函数直接测，PDF 本体只验「能 load、页数对」。

### 2026-08-25 深夜新增（session 2，D～W 那一轮）

- 🔴 **同一个事实有两条解析路（server 一条、client 一条），只改一条就会自相矛盾。**
  凡「client 也要显示 server 算出来的东西」，先问 client 是重算还是重用；重算的
  逐条对齐 server 的 fallback 顺序，留一个 fresh session 的测试。
- 🔴 **「每一页都窄」的时候，先查最外层的壳，再查页面。** 版面问题从 DevTools
  由外往内看第一个变窄的元素。
- 🔴 **验证「刻意不持久化」的状态，不能用整页跳转。** full navigation 会把正要
  验证的 React 状态洗掉；像人一样走 SPA 的链接。
- ⚠️ **断言要对准「机制」，不是对准你想像的实现。**（示范唯读的机制是按钮
  根本不渲染。）
- ⚠️ **表单自带的 `window.location.assign()` 会把紧跟着的 `page.goto()` 撞成
  ERR_ABORTED。** 先等重导落定（轮询 url）。

### 2026-08-23 新增（拆页那一轮）

- 🔴 **一个「卡住」的指令，先把它丢去背景跑完，再下结论说它坏了。**
  用一个会改变行为的旗标去验证故障，验出来的是那个旗标的行为，不是故障。
- 🔴 **同一个 localStorage key，两个 `usePersistentState` 不会同步——而且是无声的。**
  「把一页拆成好几页」的第一个问题是「这份状态谁拥有」（layout 里一个 Provider）。
- 🔴 **程式一定会有一段时间比资料库新——PostgREST 被问到不存在的栏位，整个
  query 就失败。** 每支 action 回传结果物件、绝不 throw；select 走退阶
  （每一阶只退「一支 migration」的栏位，退太多会把新栏位一起丢掉——32 号单
  的 SELECT_NO_CREATED 一阶就是为此加的）。
- 🔴 **「写进资料库」不是一个答案，是三个不同的答案。** 先问「这份资料是记录的，
  还是推导的」。
- 🔴 **失败要「说出来」，不能只是退回本机。** 静静地不同步是最坏的一种成功。
- ⚠️ **一个回圈跑不完不会 throw——它会花钱。** 先写停止条件的测试，再写功能。
- ⚠️ **写得出来不等于验得了。** 「一致」不是「验证」，讲清楚。

### 2026-08-20 新增

- 🔴 **画面允许输入的东西，比 schema 和资料库允许的多——中间那一截没人守。**
- 🔴 **「Never leak the cause」是给伺服器故障的，不是给使用者输入错误的。**
- 🔴 **「这一页是空的」先去数资料表，不要先怀疑页面。**
- 🔴 **一份文件写着「刻意还没动」，那件事的时机就会由使用者替你决定。**
- 🔴 **「先讨论，还不要开工」就是不要开工——包括「只是先改一点点」。**
- ⚠️ **一支未批准的 migration 留在 `supabase/migrations/` 可以，但要确认没有任何
  东西指向它。**（现在轮到 28：探针/salin 指向它是「等待套用」，
  不是「已在用」。）

### 关于「事实」怎么腐坏

- 🔴 **一个「有公式」的数字，不等于一个诚实的数字。**
- 🔴 **「我们今天跑的是 X」是一个假设，不是一个事实——除非你让程式去问。**
  （`npm run check:ai`；交接清单上每一条「J 要做的事」，交出去之前先跑一次
  能证明它还没做的指令。）
- 🔴 **「预设分支」是另一个会安静腐坏的事实。**
- 🔴 **一个没人跑的指令，坏了也不会有人知道。**
- 🔴 **报告要印「实际解析到什么」，不要印环境变数。**
- 🔴 **换掉一个预设值，等于让所有量测过的东西悄悄失效。**
- 🔴 **价目表会腐坏。**（`PRICES_CHECKED_ON` 从 unit-economics 导出。）
- 🔴 **一把 key 在画面上找不到，不等于它不存在。**
- 🔴 **「某天跑不通」不等于「坏了」，交接文字会把它冻成永久事实。**
- ⚠️ **要说「eslint 零问题」之前，先跑一次基准。**（现行基准：20 = 19 errors + 1 warning，2026-08-30 起——78 号删旧长页带走一条旧错。）
- 🔴 **一支写好却没有任何呼叫者的 prompt/组件，等于不存在——而旁边的注解会让人
  以为它存在。** grep 呼叫者，不要读注解。（32 号单照此把退役的
  ai-usage-rows.tsx 直接删掉，不留孤儿。）
- 🔴 **模型会安静地漏掉，而且漏掉的时候输出看起来最漂亮。**
- 🔴 **prompt 里让模型自由写散文的地方，就是它会捏造的地方。**
- 🔴 **「不准改名字」是指令，不是保证。**（checkNames。）
- ⚠️ **一道检查如果会误杀正确结果，就不要装上去。**
- ⚠️ **动 prompt 之前先问「这让哪些量测作废了」。**

- 🔴 **只从设定页连过去，等于没有入口。**
- 🔴 **新页面先看一眼真实宽度再说做好了。**
- 🔴 **「加一笔」的表单要放在它要加进去的那张卡里面。**
- ⚠️ **`<Tri>` 印的是字串，不是 Markdown。**
- 🔴 **批次汇入宁可整批拒绝，不要只加一半。**
- 🔴 **给了上传按钮，就要吃使用者手上真的有的档案。**
- 🔴 **能用程式解析的，不要送去 AI。**
- ⚠️ **试算表里的空格是「位置」，不是「没有」。**
- 🔴 **「哪一条路会花钱」要写在按钮上，不是写在说明里。**
- 🔴 **AI 读出来的东西不要直接进资料库。**
- 🔴 **`name_official` 不是翻译，不可以放进词库、更不可以让模型生成。**
- 🔴 **一条合规规矩挂上去之前，先 grep 它要挂的那个东西是不是真的存在。**
- 🔴 **出路要放在失败的地方，而且要吃使用者在那一刻手上真的有的东西。**
- ⚠️ **一个控制项如果不能拿掉，就改它的字。**

### 关于「做完的调查」与「没人用过的画面」

- 🔴 **一份写完没有执行的审查，等於没做过。** 「已写完」「已 commit」「已 push」
  是三个状态，交接文字要分开写。
- 🔴 **只算「文字 vs 底色」的对比度审查，会整类漏掉边框。** WCAG 1.4.11
  （非文字 3:1）要单独算一次。（32 号单绿 tint 上重算过。）
- 🔴 **一个功能「程式写好了」不等於「使用者摸得到」。**
- 🔴 **同一个元件在两个画面待遇不同，没有任何测试会抓到。**
- 🔴 **「改四个地方」这种估算要先 grep 再写。**

### 关于档案

- **档名带日期／`FINAL`／`v2` 的档案永远不会被覆盖，所以只会累积、互相矛盾。**
- **最危险的不是旧档案，是「旧档案占着乾净的名字」。**
- **被 gitignore 的东西，在 repo 里等于不存在。**
- **`.gitignore` 挡不住已经在追踪中的档案。**

### 关于 git 与环境

- **在沙盒／非互动环境不要跑任何会等待输入的指令。**
- **「已 commit」不等于「已 push」。**（本轮：**48 号单的 commit 已全部落地、
  等 J push。**）
- **卡住的 `git push` 会留下僵尸行程与 stale `index.lock`。**
- **沙盒的挂载点删不掉档案。**
- **Windows 上不要用 `| head`；长 commit 讯息写成档案再 `git commit -F <path>`，
  路径不要用引号包。**（本轮又验证一次：here-string 里的内嵌双引号照样炸——
  一律走 -F 档案。）
- 🔴 **PowerShell 批量替换源码档：读和写都要明示 UTF-8。**
- **沙盒连不到 Supabase，也下载不了二进位档。**（本机 Claude Code 连得到——
  e2e、截图脚本都是本机直连跑的。）
- **沙盒不要 `npm install` 进 `node_modules`。**（本机 EACCES 时：
  `node node_modules/typescript/lib/tsc.js`、`node node_modules/tsx/dist/cli.mjs`、
  `node node_modules/next/dist/bin/next`、
  `node node_modules/npm/bin/npm-cli.js install --package-lock-only` 全是能用的绕法。）

### 关于程式码

- **D8 铁律：schema 先，程式码后，migration 一律由 J 手动执行。**
- **加额度只有一条路**：`minit_admin.grant_ai_credits(...)`。
- **`service_role` 被刻意挡在 `minit_admin.*` 外面。**
- ⚠️ **client component 里「存完再送出」，mount 当下的 state 是旧的。**
- **`AI_MODEL_*` 的值没有冒号会被静静忽略。** `npm run check:ai` 抓这个。
- **npm 漏洞剩 2 个（exceljs/uuid）刻意不修。** 等上游。
- **「从来没有程式写入过的表」清单**：剩 `extractions`/`einvois_packs`/
  `paste_packs`/`qa_log`/`reminders`/`rsvps` 仍无写入端。

### 关于两棵树、交接与 commit

- 🔴 **一份 STATE.md，覆盖它。**
- 🔴 **「在哪一棵树上写的」和「哪一棵树真的在跑」是两件事。**
- 🔴 **陈旧的 `.git/index.lock` 会静静挡住所有 commit。** 收工前看一眼是空的。
- **`office_bearers` 是法定申报栏位。**
- **行尾 CRLF/LF 混合**：`git add` 时的警告是正常的。
- **贵的 agent 与便宜的 agent 分工**：碰 prompt／schema／eROSES mapping／钱的逻辑
  一定用贵的。

---

## 7. 分工

| 谁 | 做什么 |
|---|---|
| **J** | 手贴 migration 到 Supabase SQL Editor 按 Run · 开付费帐号与 key · 拍真实手写样本 · **所有 `git push`** · **bench 实跑（双击 bench-models.bat）** |
| **Claude Code（本机）** | 改程式码 · 跑 `tsc` / `vitest` · 真正的 build 与 dev server · e2e/截图脚本 |
| **Cowork（沙盒）** | 读写文件 · 审计 · 产报告 · 小脚本。**不要拿它 build 这个 app** |
| **Cowork + desktop-commander** | 可在本机跑指令验证；仍不要跑会等输入的指令 |

J 手贴 migration 的步骤：记事本开档 → `Ctrl+A` `Ctrl+C` → Supabase SQL Editor 中间程式码区点一下 → `Ctrl+A` `Ctrl+V` → 右上角绿色 **Run** → `Success. No rows returned` 就是成功；红字整段贴给 Claude。
（更省事：双击 `salin-migration.bat`，选 26、再选 27。）

---

## 8. 文件地图

| 位置 | 放什么 |
|---|---|
| 根目录 | `CLAUDE.md`（规则）· `STATE.md`（这份）· `BUILD_PLAN.md` · `PROMPTS.md` · `DEPLOY.md`（⚠ 过期，上线照 `docs/上线与截图-给J的步骤.md`）· `README.md` · `AGENTS.md` |
| `docs/` | `DECISIONS.md`（D1–**D51**；D50=交接状态长在收入记录上、D51=Home＝agent 工作台＋两级改动制）· `agent-soul.md`（SOUL 人话版，与 src/prompts/agent-soul.ts 同改）· `功能盤點-計劃vs實作.md` · `产品缺口盘点.md` · `上线与截图-给J的步骤.md` · `换模型手册.md` · `AI-API-选型与成本.md` · 其余照旧 |
| 品牌 | `src/lib/brand.ts`（BRAND_NAME="MinitAI"，D23）· **紫色**（D24）：logo 原图 `scripts/assets/minit-logo.png`、向量版 `src/components/brand-logo.tsx` · 重生图标：`node scripts/brand-icons.mjs` · tokens 都在 `globals.css` 的 `.v2-root` |
| 定价／毛利 | `src/lib/unit-economics.ts` + `npm run economics`（价目表查证日 `PRICES_CHECKED_ON`） |
| AI 分流设定 | `.env.example` 的 AI 段 + `npm run check:ai` |
| 模型对比 | `npm run bench`（--dry-run / --mock）· `bench-models.bat` · 报告在 `eval/reports/model-bench-<日期>.md` |
| 「到底做了没有」 | `npm run status` / `status.bat` |
| 示范章程（CONTOH） | `public/contoh/undang-undang-tubuh-contoh.pdf`（8 页 BM 完整章程，虚构社团）· 文字版 `docs/contoh-undang-undang-tubuh.md` · 重生 `npm run contoh:constitution`。十条条文与 `src/lib/sample-constitution.ts` **逐字相同**、印出来的页码对得上 `page_ref`，所以拿它测 `/constitution` 上传时**答案是已知的** |
| migration | `supabase/migrations/`（**1–42 已套用；43「ai_jobs 排队慢慢读」只写档等 J 贴**——2026-08-31 深夜 check:migrations 实测 43 是唯一 NOT YET）· `salin-migration.bat` · `npm run check:migrations` |
| 给 J 双击的 `.bat` | `status.bat` · `salin-migration.bat` · `salin-env-vercel.bat` · `push-cabang.bat` · `bench-models.bat`。🔴 `push-to-github.bat` 不能用；⚠ `check-ai.bat` 还指旧资料夹 |
| `competition/` | 顶层＝当前版（**[YOU] 两处还空着**）；`screenshots/` 60 张旧配色（拍板 0-9：只重拍首页主图，未拍——未决 7） |
| `eval/reports/` | 整夹 gitignore；只有 `SUMMARY.md` 例外 |
| `C:\dev\_backups\` | 照旧 |

---

## 9. 重要日期

| 日期 | 什么事 |
|---|---|
| **2026-08-27** | 上午 Vercel 上线 ✅；下午 32 号单（上线日反馈）全部做完 ✅ |
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

## 116 場（2026-08-31 深夜）——兩件擋路的事

- **多場會議偵測整個拿掉**（`other_meetings` 從 prompt/schema/merge/versions/ask-box
  全部移除）。它在 J 的兩張真件上兩戰兩敗，誤判的都是「決議裡的未來日期」
  （18/7/26 的 AGM、17/10/2026 的慈善晚宴），每次誤判都丟掉一條決議。
  取捨已由 J 拍板：真的兩場寫在一張紙上會讀成一份，人在 step 3 看得到改得動。
- **BM 語言關新增 `src/lib/bm-glossary.ts`**：標準社團／會計用語對照表，
  免費按鈕一次填好普通詞語。**表裡沒有名字 ⇒ 結構上碰不到人名**；
  比對前先把名冊名字／機構註冊名／簽名人挖空。
- 🔴 **陷阱：eval 的 `case-04-minutes-mixed` 會飄。** 本場兩次跑：
  第一次 117/126 invented 1（那筆金額被同時寫進 resolutions），
  第二次 117/125 invented 0（＝基準）。看到 case-04 的 invented 先重跑一次再查。
- 🔴 **108 號單仍未執行**：`Tan Kim Loo ditugaskan untuk melantik...`
  （draft-minutes 的三選一標籤逼模型編出施事者）still live。
