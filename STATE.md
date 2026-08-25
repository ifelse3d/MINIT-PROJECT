# STATE.md — Minit 的当前状态

> **这是唯一的「现在在哪里」。**
> 每个 session 结束前**覆盖更新这一份**，不要新增带日期的交接档案。
> 规则在 `CLAUDE.md`，阶段在 `BUILD_PLAN.md`，历史在 `docs/archive/`。
> 🔴 **给 J 的东西写进 `C:\dev\_J-要做的事\`，不要写在这里。**

**最后更新：2026-08-27 凌晨（MYT）· Fable 5（27 号施工单通宵 session：Stage 0→A→B→C→D→E→F→G→H→I→K→W 全部做完）**
**🔴 27 号施工单（`C:\dev\_J-要做的事\27-最後衝刺施工單-20260826.md`）全部条目已勾完（含就地注记）。**
**给 J 看的这一轮报告：`C:\dev\_J-要做的事\25-大改造進度報告.md`（固定档名，已覆写——明早从那里开始）。**

---

## 🌙 现在在哪里（2026-08-27 凌晨）

> **27 号单整单完成。** 一个通宵 session 做完 12 个 Stage，各自 commit（Stage 0
> `8f023f3` · A `32d8999` · B `68bc62c` · C `3e07f21` · D `663bdf9` · E `146ff17` ·
> F `f22f969` · G `2e55ebd` · H 零改动（早已做好，验证后勾单）· I `41d3cd9` ·
> K `23dcc99` · W 收尾一支），**未 push —— push 是 J 的事**。
> 🔴 **migration 25（`supabase/migrations/20260903000000_final_sprint.sql`）已写好、
> 未套用** —— J 明早贴（salin-migration.bat 第 25 项；check:migrations 已有 7 个新探针）。
> 程式码在 migration 未跑时全部诚实降级（db_behind 一句话，零 throw，实测过）。

### 现场量到的（不是听说的）

- 四道关（每个 Stage 收尾各跑一次）：`tsc` **0** · `eslint` **21（与基准逐字相同）** ·
  `vitest` **766 全过（62 档；本轮 +45 个新测试）** · `build` ✓
- 三支端到端同夜全绿：`e2e:money` **15/15** · `e2e:minutes` **11/11** ·
  `e2e:roles` **13/13（+3：collector 交 claim 的表单在、交出去拿到诚实的
  db_behind 句（migration 后同一脚本自动走真路）、批准钮对 collector 不渲染）**。
- 60 张 competition 截图（360/768/1280 × 浅色深色）**全部重拍**，console errors 0。
  抽查可见：新四卡首页、七组侧栏、/money/expenses、/money/report。
- `npm audit`：10 → **2**（`npm audit fix` 无 --force；剩 exceljs/uuid moderate，
  维持「等上游」）。
- ⚠ **没能验证的**：migration 25 没套用（D8：J 手贴），所以实物收据、claim 流、
  feedback、分人计量、admin 加额度的「真路」今晚只走到诚实降级那一层＋单元/route
  测试；e2e:roles 的 claim 检查在 migration 后第一次跑才是实战。拍照读取（G-2 混合
  输入、新的 extract-expense prompt）没实拍过——烧真额度，等上线后 J 顺手来一轮。

### 这一轮做了什么（细节看各 commit message 与 25-報告）

- **Stage 0 上线门槛**（26 号报告 4 bug＋OrgChip）：存档后工作区生命周期（savedToHistory
  过 reload、「开始新的会议」一键、拍照前「同一场还是新的？」两区都问）；forced-kind
  超页数退款（第一支 API route 测试）；AI 读取中确认不被冲掉（functional update 两区）；
  日历权限拒绝讲真话（"permission" reason＋找谁做文案三处）；OrgChip 孤儿过滤＋4 档 commit。
- **Stage A 四卡首页**：task-cards.tsx（📝📊🧾✨，卡④聚焦聊天框不开新页）；chips 撤。
- **Stage B 侧栏七组**：新 SIDEBAR_NAV（桌面＋/more 同源），组名不可点恒展开；
  手机 4 格原样；menusCoverAllItems 改查两个面。
- **Stage C 配套进场**：开组织三张配套卡（选标准/总部记 orgs.plan＋人工开通说明，
  额度照旧）；新旧社团三问（舊社團 landing 卡改序 ?lama=1）；额度黄/红加「看方案→」；
  语音接进钱区打字格/手动收入/首页聊天框。
- **Stage D 实物捐赠＋收入拍照路**：donations.kind/item_desc/est_value_cents（migration
  25 节①＋issue_receipts v5）；打字格「实物」一型；收据印品项不印钱
  （receiptBoxContent 纯函数直测）；e-Invois/custody 三处排除（各有测试）；手动收入
  七类补「拍单据」入口（人选类型只填空 purpose、标 check）。
- **Stage E 支出与 Claim**：/money/expenses 真页（记开支＋交报销＋待批清单＋我的
  claim 状态）；lib/claims.ts forward-only 状态机（8 测）；decide 带 status 条件防
  并发双赢；新 extract-expense prompt＋route（新 action extract_expense，退款照规矩）。
- **Stage F 财报**：lib/financial-statement.ts（现金制：支出只算 recorded/paid；实物
  另列附表；7 测）；/money/report（本月/上月/今年＋自订期间＋PDF 匯出——瀏覽器只送
  期間，server 從 DB 重算重蓋抬頭）；/filings 加「由财报算出」三行可复制＋来源链接。
- **Stage G 真名单进申报＋CONTOH 禁令**：paste-pack 理事栏改吃 committee_roster
  （含 name_official；缺→挡在申报、点名去成员页；AI 读的 office_bearers 连 fallback
  都不是）；AGM 包/银行摘录真路全部 server 从 DB 建（roster、决议、抬头、PPM——
  浏览器一个字都进不了文件），示範走 ?contoh=1 且用虚构社团自己的名字；/agm-pack
  回选单（申报组）＋去缩写。6 个 route 测试。
- **Stage H**：验证后确认 8/23 已全部做好（member_groups 表已套用、groups-card、
  roster-picker 分组多选）——零改动，migration 25 节③刻意留空。
- **Stage I 小修包**：重拍同页帐问「取代/追加」；多页照片全存（photoPages）；混合
  输入文案与来源不说谎（mixedInput 状态）；分类三键送当下的字；e-Invois 开关失败
  回滚；页数徽章不再缩水（有测试）；PPM 行单一来源（ppmLine＋派生 regex）。
- **Stage K 管理台＋帐务＋品质**：feedback 表单（设置页）＋/admin 收件箱；ai_usage
  分人（recorder 落 uid、失败自动退回不带 user_id——计费永不因分人失败；/admin 与
  设置卡按人小计）；admin_grant_credits 有审计的路（platform_admins fail-closed、
  credit_grants、/admin 卡只在 DB 名单里才现身；4 测）；品质八项（用量条/
  countUnreviewed/cookie 段落各收一份、layout 并行、NUL 转义、量词、nowrap、
  来源卡并印 BM）；audit fix。
- **Stage W**：roles e2e +3 条；60 张截图重拍；one-pager 补全簿记一句＋766 测试数；
  demo script 两格更新；DECISIONS.md **D17**；migration 25 终审（整份可重跑）。

### 🔴 J 的事（这一轮结束时）

1. **明早的六步**在 27 号单第 1 节：看 25-報告 → 双击 salin-migration.bat 选 **25**
   贴进 SQL Editor Run → **再贴一句把自己设成平台管理员**（报告最上面有）→
   `npm run check:migrations`（新 7 个 probe 要 APPLIED）→ 双击 push-cabang.bat
   （本机 main 领先 origin 约 12 支 commit）→ 开新 session 说「上线」
   （`docs/上线与截图-给J的步骤.md`，**先 env 后 deploy**）。
2. （可选）`NEXT_PUBLIC_CONTACT_EMAIL` 配了之后，「检举冒用」与配套卡的联络 email 才现身
3. 老三样：真手写 3～4 张＋答案（eval）；上线在场；eROSES 逐栏核对
4. ⚠ **8/31 23:59 竞赛截止（内部 cutoff 8/31 18:00）——还剩 4 天**

### ❓ 未决问题

1. 🔴 新 Supabase region —— 若隐私告知要写 region，J 在 Dashboard 看一眼填进 legal
2. 助手本身用哪个模型 —— 建议 `openai:gpt-5.6-luna`，等 bench（真实手写样本之后）
3. 法律实体（金流前置，D12），试点前要答
4. 真实手写 eval：92.9% 量的仍是印刷体。J 拍照后重跑 `npm run eval`
5. Supabase 邮件模板（顺延：等网域＋SMTP，文字备好在 `docs/supabase-email-templates.md`）

### ⏭ 下一个 session 从哪开始

**27 号单做完了。** 明早 J 在场：贴 migration 25 → check → push → **Vercel 上线**。
上线后第一批（新 session）：QR 查证页、SMTP、逐角色 RLS 深化、G-2 混合输入实拍、
migration 后重跑 e2e:roles 看 claim 真路。真手写 eval 照旧等 J 的照片。
提交材料终核＝上线拿到正式 URL 后把 one-pager 的 [YOU] 补上，**8/31 23:59 截止**。

---

## 6. 已知陷阱（踩过的，别再踩）

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
