# STATE.md — Minit 的当前状态

> **这是唯一的「现在在哪里」。**
> 每个 session 结束前**覆盖更新这一份**，不要新增带日期的交接档案。
> 规则在 `CLAUDE.md`，阶段在 `BUILD_PLAN.md`，历史在 `docs/archive/`。
> 🔴 **给 J 的东西写进 `C:\dev\_J-要做的事\`，不要写在这里。**

**最后更新：2026-08-28 凌晨（MYT）· Fable 5（两份 review 总攻：27 晚 33 条＋28 半夜 7 条）**
**🔴 三大严重项已根治：#17 重复交接（D32，含 migration 29）、新用户章程 PDF 必死（我们自己的 8192 输出上限）、会议记录无智能（D29 解冻后第一批：决议分类＋出席门槛 D30）。RESPONSIVE 用 container queries 系统性修掉。J 照 37 号报告 §5 走：贴 migration 29 → push（10 支）→ 清两笔重复交接。**

---

## 🌙 现在在哪里（2026-08-28 凌晨，两份 review 总攻收工）

> **已上线**：https://minit-project.vercel.app —— J 已把 20 条那批 push 上去；
> 本机再领先 **10 支未 push**（本场）。push 是 J 的事（push-cabang.bat）。
> 线上资料库 org：15「J」、58「avocado」、91「TESTING1」（J 的新用户测试）。
> migration 1–28 APPLIED（28 的模板/未开收据交接已出现在 J 的截图里）；
> 🔴 **migration 29（20260907000000 save_register_rows＋issue_receipts v8）
> 已写好、尚未套用**——J 照 37 号报告贴（salin-migration.bat 选 29）。
> 29 未套用时「记录即入库」自动降级为本机草稿并明说，e2e 已验证降级路。

### 这一场做了什么（37 号报告逐条对照；两份 review 共 40 条）

- **D32 钱区根治（J #17 重复交接）**：交接/确认只改 localStorage、DB 的
  custody_status 永远停在开收据那刻、「DB 覆盖本机」合并把已确认的钱复活成
  可交——三处一起修：①记录即入库（migration 29 的 save_register_rows＋
  issue_receipts v8，同支出货不留窗口；29 未套用=诚实降级本机草稿）；
  ②saveRemittanceBatch 同步回写成员行状态（纯 update，任何库龄）；
  ③合并规则 forward-only＋批次推导 self-heal（reconcileCustodyWithBatches，
  J 现有坏资料下次载入自动归正；重复 pending 批次确认会被三语拦截、指去取消）。
  搜寻页同收据双列（this browser 分身）一并修。
- **新用户章程流（28 半夜 #3/#4/#6）**：ground truth 从线上 app_errors hash
  比对得出——两次失败都是 MAX_TOKENS（我们自己的 8192 默认上限，8 页章程逐字
  抄写在 8188 断头，每次白烧 $0.022 还叫人「再试」）。修：EXTRACT_OUTPUT_CEILING
  按页上限配大小（minutes 16k/ledger 32k/constitution 64k）＋типed
  VendorOutputTruncatedError→413「分拆文件，重传不会成功」；四家 vendor 全接。
  三语错误墙：既有 useLocalizedError 补挂到十几个渲染点。章程按钮/文案写明 PDF。
  28#1（注册回登入页，J 提了两次）：email 确认链接绕过 C-3 的洞堵上
  （emailRedirectTo→/login?registered=1＋落地 signOut）。
- **会议记录智能（D29 解冻＋D30）**：extract prompt 给 resolutions 标 kind
  （decision/task/duty/info，坏标签只丢分组不丢行）；review 分组＋人工改标；
  duty 区解释为何不进 eROSES 委员会名单（#32 的正解）。D30：出席 0 不能确认
  保存——逃生口改「稍后补上」，成品页+服务器双重把关。#29 Other 文案+autofocus；
  #28 原稿对照图全屏放大。⚠ prompt 动了：既有 bench/95.2% 作废，J 重测。
- **RESPONSIVE（用户点名+#1）**：根因=视口断点在侧栏(248px)+AI dock(≤640px)
  吃宽后说谎。<main> 挂 @container，宽度敏感格线改 container variants
  （task-cards @md:2/@4xl:4）。1366×768 面板开/关两态截图人眼过。
- **导航去重（#11/#12/#16）**：SectionTabs 贴 top-14（不再滑进顶栏消失）、
  flex-wrap 不横滑、桌面缩一号；money/minutes 的 records/extras 药丸全拆
  （侧栏已有），SectionTabs 的死 props 删除。
- **小件批**：#2 搜索出「页面」结果（三语匹配 nav+settings）；#3 语言一律
  dropdown；#4 「/」提示删；#5 AI 钮圆形+品牌渐变；#6 登出弹窗一行+「是」；
  #7 头像菜单去 Settings；#8 拍照/选档合并一颗（capture 移除，手机 picker 自
  带相机）四处；#9 Word/Excel 两行说明整段删（PdpaNote 留着等 J 拍板）；
  #13 侧栏 label 换行；#14 登入 logo 加大；#15 组标题 13px；#19 已确认交接
  显示最新 5 笔+折叠；#20 报销「谁垫付的」；#22 其他必填明细；#23 待批列表
  改 table；#25 分组占位改真实例子；28#5/#7 章程 PDF 文案+示范成卡。
- **D31 新页 /money/balance**：全记录收入−支出（同财报算法），金额默认
  RM •••••• 眼睛遮、只给 money_write 角色；侧栏钱组新行，nav 覆盖测试更新。

### 现场量到的（不是听说的）

- 四道关（最终态）：`tsc` **0** · `eslint` **21（基准逐字同）** ·
  `vitest` **832 全过（+6 D32 合并、+2 截断/上限路由）** · `build` ✓
- **e2e:money 19/19 全过、page errors 0**——在 29 未套用状态跑，等于把
  降级路也验了。**e2e:minutes 全过**，新增检查：「稍后补上」不能解锁保存（D30）。
- 1366×768 截图 5 张人眼看过（login/home 两态/balance/custody）→
  `eval/reports/shots-20260828/`。
- 线上 DB 取证：app_errors 两笔 #1c0d0970… 与 MAX_TOKENS 讯息 hash 完全吻合；
  ai_usage 显示 in=4885/out=8188/cost 21936 micros/refunded=yes ×2。
- ⚠ **没能验证的**：migration 29 套用后的跨设备记录即入库（只能验降级路）；
  线上部署效果（push 是 J 的手）；64k 输出上限在真章程上的成功读（要花 J 的
  额度，等 J 重测）；决议分类的实际准确率（prompt 刚动，无 eval 数字）。

### 🔴 J 的事（写在 37 号报告 §5/§6）

1. 贴 migration **29**（salin-migration.bat 选 29）→ status.bat 看新探针。
2. **push-cabang.bat**（本机领先 **10 支**）→ 线上旧样先 Ctrl+Shift+R。
3. 交现金页把两笔重复「等待总会确认」按 修改→取消 清掉。
4. 回答 37 号报告 §6 四题（PdpaNote 删不删、#31 范围、#26/#27 指位、bench 重跑时间）。
   之后：31 号单**场次 5**（十大观音照片→D-8、MyInvois 模板→B-7、bench G-3）。
   ⚠ **8/31 23:59 竞赛截止（内部 cutoff 18:00）**；one-pager 的 [YOU] 两处还空着。

### ❓ 未决问题

1. 🔴 Vercel/Supabase region 是否同区 —— 等 J 抄来两个值
2. 助手用哪个模型 —— prompt 已解冻（D29），等 J 重跑 bench 后定
3. 法律实体（金流前置，D12），试点前要答
4. 真实手写 eval：92.9% 量的仍是印刷体，且 prompt 已动、数字作废——等 J 重测
5. Supabase 邮件模板＋Site URL 还停 localhost（J 一分钟改；28#1 的
   emailRedirectTo 已在代码里指对，但 Supabase 后台的 redirect 白名单要含
   正式网址的 /login）
6. /privacy 法律文的「不用於訓練」句去不去 —— 法律文要人审，J 一句话
7. 竞赛首页主图重拍（拍板 0-9）—— 等 push 完用真机构画面拍
8. PdpaNote（🔒 照片只交给 AI 服务商）删/缩/留 —— J 拍板（37 号 §6-1）
9. 配套定价（管理台毛利卡等它）—— 先量成本；bench/真用量之后
10. #31 逐区块 AI 讨论 —— 等 J 定范围与计费口径
11. #26「申报怪怪的」/#27「上面那个 bar」—— 太笼统，等 J 指位
12. （旧，小）MyInvois 官方模板逐栏对齐（B-7 后半）等 J 给原档
13. （旧，小）check-ai.bat 还 cd 到旧资料夹 C:\dev\minit——改天一行修
14. #10 全站按钮统一的长尾扫尾（大头已消）

### ⏭ 下一个 session 从哪开始

**J 验收 37 号报告 → 翻案开小场修；否则：①#31 拍板后做逐区块 AI 讨论、
②#10 按钮长尾、③31 号单场次 5（J 在场）。**
8/31 前还要：竞赛首页主图重拍、one-pager [YOU] 两处。

---

## 6. 已知陷阱（踩过的，别再踩）

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
- **「已 commit」不等于「已 push」。**（本轮：**全部已 commit、未 push 共 10 支。**）
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
| `docs/` | `DECISIONS.md`（D1–**D32**）· `功能盤點-計劃vs實作.md` · `产品缺口盘点.md` · `上线与截图-给J的步骤.md` · `换模型手册.md` · `AI-API-选型与成本.md` · 其余照旧 |
| 品牌 | `src/lib/brand.ts`（BRAND_NAME="MinitAI"，D23）· **紫色**（D24）：logo 原图 `scripts/assets/minit-logo.png`、向量版 `src/components/brand-logo.tsx` · 重生图标：`node scripts/brand-icons.mjs` · tokens 都在 `globals.css` 的 `.v2-root` |
| 定价／毛利 | `src/lib/unit-economics.ts` + `npm run economics`（价目表查证日 `PRICES_CHECKED_ON`） |
| AI 分流设定 | `.env.example` 的 AI 段 + `npm run check:ai` |
| 模型对比 | `npm run bench`（--dry-run / --mock）· `bench-models.bat` · 报告在 `eval/reports/model-bench-<日期>.md` |
| 「到底做了没有」 | `npm run status` / `status.bat` |
| 示范章程（CONTOH） | `public/contoh/undang-undang-tubuh-contoh.pdf`（8 页 BM 完整章程，虚构社团）· 文字版 `docs/contoh-undang-undang-tubuh.md` · 重生 `npm run contoh:constitution`。十条条文与 `src/lib/sample-constitution.ts` **逐字相同**、印出来的页码对得上 `page_ref`，所以拿它测 `/constitution` 上传时**答案是已知的** |
| migration | `supabase/migrations/`（**29 支；29 未套用**）· `salin-migration.bat`（29 项）· `npm run check:migrations`（含 save_register_rows RPC 探针） |
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
