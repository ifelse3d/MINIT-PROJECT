# STATE.md — Minit 的当前状态

> **这是唯一的「现在在哪里」。**
> 每个 session 结束前**覆盖更新这一份**，不要新增带日期的交接档案。
> 规则在 `CLAUDE.md`，阶段在 `BUILD_PLAN.md`，历史在 `docs/archive/`。
> 🔴 **给 J 的东西写进 `C:\dev\_J-要做的事\`，不要写在这里。**

**最后更新：2026-08-27 下午（MYT）· Fable 5（32 号单一场做完：P0 快拳＋P1 绿品牌＋P2 记录诚实＋P3 交现金重做＋P4 界面收尾＋P5 tester 小包＋导览四格重拍）**
**🔴 32 号单（`C:\dev\_J-要做的事\32-上線日反饋施工單-20260827.md`）全部 ✅；J 照 `33-報告-20260827.md` §1 走：贴 migration 26＋27 → push → 五分钟验收。**
**31 号单场次 5（D-7/D-8/B-7/G-3，要 J 在场）仍然待开，不在本轮。**

---

## 🌙 现在在哪里（2026-08-27 下午，32 号单收工）

> **已上线**：https://minit-project.vercel.app（Vercel 专案 if-else/minit-project）。
> push 到 main 自动重新部署——**push 是 J 的事**（push-cabang.bat，账号已钉 ifelse3d）。
> 线上资料库两个 org（15「J」、58「avocado」），migration 1–25 APPLIED；
> 🔴 **migration 26（payment_method）与 27（20260905000000 记录时间＋交接批次细节）都已写好、尚未套用**——J 照 33 号报告贴（salin-migration.bat 选 26、再选 27）。
> **未 push 共 8 支 commit**（31 号单那 19 支 J 今早已 push）：
> `1ad3ad4` P0 快拳 · `7b9bca0` P1 绿 logo＋主色 · `cad78fa` P2 记录诚实 ·
> `2a302fb` P3 交现金重做 · `7bf5cc3` P4 界面收尾 · `d14f015` P5 tester 小包 ·
> 导览重拍一支 · 收工文书一支。

### 现场量到的（不是听说的）

- 四道关（每场收尾都跑）：`tsc` **0** · `eslint` **21（与基准逐字同）** ·
  `vitest` **808 全过（64 档；+10＝custody 逐笔批次 7＋timeMytOf 3）** · `build` ✓
- `e2e:money`：P3 后与收工前各一跑，**15/15 全绿、page errors 0**
  （删机构那步已改走 /settings/org——拆页后脚本一度只出 NOTE 不出红，见 §6 新坑）。
- **绿主色对比是算过的**：白字只压 #15803D（5.02:1 AA，亮暗两模式同）；
  #22C55E 只做装饰/深底文字（深页上 8:1）；页面绿 tint 最浅一站 #ECFDF5 上
  --v2-border #888ea0 = 3.12:1（C-5 的 3:1 不退步）。浏览器实测过 token 生效、
  logo 渲染、暗色 fill 仍深绿。
- **导览四格是绿 UI 现拍的**（scripts/howitworks-shots.mjs，零 AI 额度，
  高亮坐标由脚本量出回填；step-3 改对准「加入登记」按钮——示范表已删）。
- ⚠ **没能验证的**：migration 26/27 是否套用（等 J 贴完 status.bat 看探针）；
  交现金新页的真人操作（逻辑有 20 个 custody 测试＋e2e 守着，J 照 32 号单
  §1-6 验收剧本点一遍）；线上部署效果（push 是 J 的手）。

### 这一场做了什么（细节都勾在 32 号单 §1/§2B/§3 各条目里）

- **P0**：BRAND_NAME="MinitAI"（D23）；pdpa-note 三语去「训练」（/privacy 法律文
  没动，等 J 拍板）；必填红星规范 D22（共用 `<Req/>`，全站「可选」尾巴清零，
  收款人空白改报错不再默默补预设名）；财报预设今年到今天＋空期间跳最近月；
  收据历史「未开收据 N 笔」横幅（读 register store）；日历回申报组（§1-9 翻
  拍板 30，nav 测试跟改）。
- **P1**：`scripts/brand-icons.mjs` 从 `scripts/assets/minit-logo.png` 生成
  icon-192/512、brand-logo-96、favicon.ico（PNG 式 ICO）——裁白边＋圆角透明；
  侧栏/手机/登入/重设密码换 logo 图、名字跟 BRAND_NAME；globals.css 主色
  紫→绿（两 token 结构照旧：text accent 亮、fill 深）；全部硬编码紫色渐层/阴影
  扫清（button.tsx 默认款、step-card、ai-panel、ai-dock、ask-box、org-chip、
  history-feed）；manifest 改 MinitAI。
- **P2**：/history、/search 全名（D18 补完）；ActivityRecord.atIso＋timeMytOf；
  收据历史印开出时间；RegisterDonation.createdAtIso 三个创建点盖章＋显示
  「记录于」；feed 深连结逐类指对；demo 戳显示层改标；**migration 27 写好**
  （donations.created_at 先加栏后设 default——旧列诚实 NULL；issue_receipts v7；
  remittance_batches recorded_at/confirmed_at/note＋status 'cancelled'）＋
  salin 选项 27＋check:migrations 两探针；所有 select 有 pre-27 退阶。
- **P3**（拍板 0-6）：lib/custody.ts 纯函数 createRemittanceBatchFromIds／
  updatePendingBatch／cancelRemittanceBatch（作废「记录」不是钱倒流——
  批次留档 'cancelled'，捐款回 collected；settled 永远锁死）；store 的
  handOver 换成 handOverSelected＋updateBatch＋cancelBatch；cash-custody.tsx
  整页重写（逐笔清单列表/卡片可切、彈窗、口径统一）；custody-actions 存读新栏
  ＋退阶（cancelled 在 pre-27 库拒写不静默降级）；共用 `<Modal>` 新建。
- **P4**：页面底绿 tint 渐层（暗模式自己一套，否则会继承亮的）；管理台剩余
  英文清零（grant 卡三语＋说明、配套印名、明细标签、feedback 状态、
  platform_admins 段）；设置拆四页（/settings、/settings/org、/settings/plan
  收编用量分布、/settings/feedback；nav 设置组四行；ai-usage-rows.tsx 退役）；
  钱区示范入口删除＝导览是唯一示范＋「清空这批草稿」钮（只清未开收据）。
- **P5**：登出确认弹窗（signOutToLogin 抽到 v3/sign-out.ts 防循环引用）；
  顶栏 sticky（实底不用 backdrop-blur）；--radius 0.625→0.5rem＋v2-glass
  1rem→0.75rem（avocado 的五级 radius 系统仍属赛后整套）。
- 🔴 **没动的**：prompts 一字未碰；MIN- 字首、RLS、org 15/58 未碰；
  icon rail／分屏登入／Poppins／头像选单／命令面板（§4 明确不做）；
  /privacy 法律文的「训练」句（要人审，见 33 号报告 §4-1）。

### 🔴 J 的事（写在 33 号报告 §1，三步）

1. 贴 migration **26**、再贴 **27**（salin-migration.bat 选号）→ status.bat 看探针。
2. **双击 push-cabang.bat**（本机领先 **8 支**）→ 线上换新（旧样先 Ctrl+Shift+R，
   再想 §6 的 8-27 两个坑）。
3. 照 33 号报告 §3 五分钟验收（重点：交现金逐笔剧本、/history 点交接落地）。
   之后：31 号单**场次 5**（十大观音照片→D-7/D-8、MyInvois 模板→B-7、bench 实跑 G-3）。
   ⚠ **8/31 23:59 竞赛截止（内部 cutoff 18:00）**；one-pager 的 [YOU] 两处还空着。

### ❓ 未决问题

1. 🔴 Vercel/Supabase region 是否同区 —— 等 J 抄来两个值
2. 助手用哪个模型 —— G-2 已印成数字（nano vs luna 3.6×），等 G-3 真手写 bench 后定
3. 法律实体（金流前置，D12），试点前要答
4. 真实手写 eval：92.9% 量的仍是印刷体，等 J 照片（场次 5）
5. Supabase 邮件模板＋Site URL 还停 localhost（J 一分钟改）
6. /privacy 法律文的「不用於訓練」句去不去 —— 拍板 0-2 只动了 App 界面句，
   法律文要人审（33 号报告 §4-1），J 一句话
7. 竞赛首页主图重拍（拍板 0-9）—— 等 push 完用真机构画面拍（scripts/screenshots.mjs）
8. （旧，小）打字格每行的转账不能附截图——真有人要再说
9. （旧，小）MyInvois 官方模板逐栏对齐（B-7 后半）等 J 给原档
10. （旧，小）competition/screenshots 60 张是旧配色（拍板 0-9：接受并存，不重拍）
11. （旧，小）check-ai.bat 还 cd 到旧资料夹 C:\dev\minit——改天一行修

### ⏭ 下一个 session 从哪开始

**31 号单场次 5（J 在场）：D-7 决议归类（J 照片进 golden case→改后处理→
npm run eval 对比过了才上）＋ D-8 正式报告版式 ＋ D-9 四道关＋e2e:minutes ＋
B-7 后半（MyInvois 官方模板逐栏对齐）＋ G-3（J 双击 bench-models.bat 实跑）＋
当日验收修尾。** 32 号单已全勾，不重做；若 J 验收有翻案，另开小场。

---

## 6. 已知陷阱（踩过的，别再踩）

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
  东西指向它。**（26、27 两支都处于此状态：探针/salin 指向它们是「等待套用」，
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
- ⚠️ **要说「eslint 零问题」之前，先跑一次基准。**（现行基准：21 = 20 errors + 1 warning。）
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
- **「已 commit」不等于「已 push」。**（本轮：**全部已 commit、未 push 共 8 支。**）
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
| `docs/` | `DECISIONS.md`（D1–**D23**）· `功能盤點-計劃vs實作.md` · `产品缺口盘点.md` · `上线与截图-给J的步骤.md` · `换模型手册.md` · `AI-API-选型与成本.md` · 其余照旧 |
| 品牌 | `src/lib/brand.ts`（BRAND_NAME="MinitAI"，D23）· logo 原图 `scripts/assets/minit-logo.png` · 重生图标：`node scripts/brand-icons.mjs` |
| 定价／毛利 | `src/lib/unit-economics.ts` + `npm run economics`（价目表查证日 `PRICES_CHECKED_ON`） |
| AI 分流设定 | `.env.example` 的 AI 段 + `npm run check:ai` |
| 模型对比 | `npm run bench`（--dry-run / --mock）· `bench-models.bat` · 报告在 `eval/reports/model-bench-<日期>.md` |
| 「到底做了没有」 | `npm run status` / `status.bat` |
| migration | `supabase/migrations/`（**27 支；26、27 未套用**）· `salin-migration.bat`（27 项）· `npm run check:migrations` |
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
