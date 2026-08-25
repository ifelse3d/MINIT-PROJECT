# STATE.md — Minit 的当前状态

> **这是唯一的「现在在哪里」。**
> 每个 session 结束前**覆盖更新这一份**，不要新增带日期的交接档案。
> 规则在 `CLAUDE.md`，阶段在 `BUILD_PLAN.md`，历史在 `docs/archive/`。
> 🔴 **给 J 的东西写进 `C:\dev\_J-要做的事\`，不要写在这里。**

**最后更新：2026-08-26 晚（MYT）· Fable 5（讨论 session：J 走完系统给了 5 条反馈，全部拍板定案——零代码改动）**
**🔴 现行工作单：`C:\dev\_J-要做的事\27-最後衝刺施工單-20260826.md`（今晚无人值守通宵做，明天 8/27 J 在场才上线；Stage 顺序＝优先序，0 是上线门槛）。**
**24 号施工单已全部勾完；26 号检查报告的 4 个 bug＋OrgChip 收尾＝27 号单 Stage 0。**
**给 J 看的这一轮报告：`C:\dev\_J-要做的事\25-大改造進度報告.md`（固定档名，每轮覆写）。**

---

## 🌙 现在在哪里（2026-08-25 深夜）

> **24 号施工单全部完成。** session 1（傍晚）做完 0/A/B/C；session 2（深夜）做完
> **D → E → F → G → W**，各自 commit（D `d3ea399` · E `b4861e5` · F `11e11c6` ·
> G `64f7238` · W `aab5f68`，加 STATE 覆写共 6 支，**未 push** — push 是 J 的事）。
> ✅ migration 23、24 **J 已跑**：24 由 `npm run check:migrations` 机器实测 APPLIED
>（invites/org_type/ppm_no 三个 probe 全过）；23 只改 column DEFAULT、PostgREST
> 看不到，但截图实证新 org 显示 **0 / 15** —— 生效了。session 1 的 5 支 commit
> 也已在远端（main == origin/main 当时）。**本轮零新 migration。**

### 现场量到的（不是听说的）

- 四道关（每个 Stage 收尾各跑一次，最后一次在 Stage W 后）：`tsc` **0** ·
  `eslint` **21（20 errors/1 warning，与基准逐字相同）** · `vitest` **721 全过（55 档；
  本轮 +24 个新测试）** · `build` ✓
- 端到端三支同日全绿：`e2e:money`（14）＋ `e2e:minutes`（11）＋ **新的 `e2e:roles`（10，
  走完整邀请码路：产码→兑换→collector 被 server 拒开收据→receipts 表零写入；
  示范唯读三道断言）**。
- Stage F 的版面是**亲眼看的**：临时脚本建帐号＋种 9 笔捐款，1280＋1920 两档
  九个页面全页截图逐张看过，并程式量测 scrollWidth==viewport 全过（无横向溢出）。
- W-2 的 60 张 competition 截图重拍完（360/768/1280 × 浅深色，console errors 0），
  抽查图上可见新的 3 环步骤条＋独立「历史」入口＋瘦身侧栏。
- ⚠ **G-2 合并（打字后再拍照）只有单元测试守着**：拍照要打真 AI、烧真额度，
  这轮没实拍过整圈。J 下次拍第 2 页（或打了字再拍）就是第一次实战。

### 这一轮（session 2）做了什么（细节看 5 支 commit message 与 25-報告）

- **Stage D 会议记录正式文件**：正式模板全由 compose 层程式拼（页首 PPM＋
  `Bil.: ____ / 年`——期数留白不捏造、出席表精确同名才注职位、Perbincangan/Keputusan/
  Tindakan 成文段落、Penutup、签名栏）；模型唯一多做的事＝每 item 标 `kind`，
  **坏 kind 只被丢弃、永不让文件失败**；checkCoverage/checkNames 一行没动（D-3）；
  zh/EN 成品页首印「翻译本 —— 非呈报用 / Terjemahan」（D-2）；打字模式＝填写格在先、
  预览有内容才出现、「没读到」改「请再填 N 项」（D-4）；eROSES mapping 零 diff（D-5）。
  顺手补了 Stage C 漏洞：**不按 AI 钮直接保存的 plain 路径原本没过 stampIdentity、
  没印 PPM**，现在两条保存路同一个盖章。定案记进 **DECISIONS D16**。
- **Stage E 导航与历史**：历史移出编号步骤——`SectionTabs` 新独立 `records` 入口
  （不编号、永不挂锁、虚线靠右）；侧栏与步骤条解镜像：NavItem 加 `railOnly`
  （出席者/做好的文件/开收据/交现金**仍在群组里**——群组开灯与 menusCoverAllItems
  守卫不变——但选单不再渲染），过滤集中 `visibleGroupChildren()`（侧栏与 /more 共用）；
  锁的解释补完（E-3：blockedReason 一律「为什么锁＋做什么会解」）。
- **Stage F 版面总检**：**总根源是 shell 的 `<main>` 全站锁 max-w-4xl（896px）**，
  钱区 5xl、日历 7xl 全被外层盖掉——shell 放宽为 7xl 外界，各页自己的容器决定实宽；
  收据历史 4xl→5xl、会议记录历史 3xl→5xl；日历格 md:min-h-28、日期字 md:text-xl、
  农历 md:text-base（手机不动）；/settings/plan 加用量 bar＋N/M＋%（与设置卡同源
  computeUsageState，仍无价格无假金流）；步骤条药丸 36px→44px 触控底线。
- **Stage G 钱区与混合输入**：钱第 1 步第三键「没有纸张——自己打字」→
  /money/receipts?taip=1 打字格自动展开；**混合输入**（新 `src/lib/extraction-merge.ts`，
  10 测试）：页面已有内容再拍照＝追加——人确认过的栏位（含「笔记里没写」断言）
  模型盖不掉、清单追加、出席者按名去重、帐本第 2 页接在第 1 页后（addedRows 标记
  照旧有效）；示范永远整页替换。「Tambah nama sendiri」→「Tambah nama lain／
  自己补一个名字」；公文词汇并印 BM（新 `meetingTypeUiLabelTri()`：「常年大会 ·
  Mesyuarat Agung Tahunan (AGM)」进四个 UI 位点，**文件面的 meetingTypeLabel 一字
  未动、有测试钉着**；钱步骤条带 Lejar/Resit/Serah Wang）；「手动添加收入」三行
  说明压成一句。
- **Stage W 收尾**：DECISIONS **D16**；60 张截图重拍；新 `npm run e2e:roles`；
  competition 材料核过（唯一过期事实 291→721 unit tests 已改）。

### 🔴 J 的事（这一轮结束时）

1. **明早的六步**在 27 号单第 1 节：看报告 → 贴 migration 25（＋platform_admins 那句）
   → `npm run check:migrations` → **push**（本机 main 领先 6 支 commit＋今晚新增的）
   → 跟 Claude 上线（先 env 后 deploy）。
2. （可选）`NEXT_PUBLIC_CONTACT_EMAIL` 配了之后，「检举冒用」入口才会出现（C-2）
3. 老三样不变：真手写 3～4 张＋答案（eval 用）；Vercel 上线那天要在场；eROSES 逐栏抄录
4. ⚠ 距离 **8/31 23:59 竞赛截止只剩 5 天**（内部 cutoff 建议 8/31 18:00）

### ❓ 未决问题（+1 观察；旧的照旧）

1. 🔴 新 Supabase region —— 若隐私告知要写 region，J 在 Dashboard 看一眼填进 legal
2. 助手本身用哪个模型 —— 建议 `openai:gpt-5.6-luna`，等 bench（真实手写样本之后）
3. 法律实体（金流前置，D12），试点前要答
4. 真实手写 eval：**92.9% 量的仍是印刷体**。J 拍 3～4 张真手写＋答案后重跑 `npm run eval`
5. Supabase 邮件模板（顺延中：等网域＋SMTP，文字备好在 `docs/supabase-email-templates.md`）
6. ✅ **已修（2026-08-25 深夜小修 session）** OrgChip fresh-login 不一致：
   `useActiveOrg()`（`src/components/v3/org-chip.tsx`）原本只读 `minit_active_org`
   cookie，fresh session 没 cookie 就回 null；现在补上与 server `getActiveOrg()`
   相同的两层解析（cookie 指到的 org 查不到 → 第一个 direct membership），
   两边的「第一个 membership」都加了 `order by org_id` 钉死同一个答案。
   `e2e:money` 新增第 14 条检查（全新 incognito session 登入既有帐号，OrgChip
   必须印机构名）——**实测过拿掉修正它会红**。tsc 0 · vitest 721 全过 ·
   e2e:money 15/15。改动在工作树（3 档），未 commit。

### ⏭ 下一个 session 从哪开始

**照 `C:\dev\_J-要做的事\27-最後衝刺施工單-20260826.md` 做，从第一个没打勾的条目开始。**
开场 prompt 是 28 号（J 每轮贴同一段）。J 2026-08-26 的拍板全部记在 27 号单第 0 节
（四卡首页、钱区全簿记＋claim 完整批准流、实物捐赠收据、侧栏七组、配套进场、
CONTOH 禁令、「能做的都做，不要说等赛后」——原赛后项改「上线后第一批」）。

今晚做系统；明早 J：贴 migration 25 → check → push → **Vercel 上线（J 在场，
`docs/上线与截图-给J的步骤.md`，先 env 后 deploy）**。上线后第一批：QR 查证页、
SMTP、RLS 深化、G-2 混合输入实拍。真手写 eval 照旧等 J 的照片。
提交材料终核＝27 号单 W-4，**8/31 23:59 截止（内部 cutoff 8/31 18:00）**。

---

## 6. 已知陷阱（踩过的，别再踩）

### 2026-08-25 深夜新增（session 2，D～W 那一轮）

- 🔴 **同一个事实有两条解析路（server 一条、client 一条），只改一条就会自相矛盾——
  而且没有测试会抓到，因为两条各自都「对」。** active org 的解析 server 端是
  cookie → 第一个 membership → null（`getActiveOrg()`），client 端原本只有 cookie
  → null（`useActiveOrg()`）——fresh session 没 cookie 时页首印机构名、侧栏却叫人
  「填写您的机构名称」。修法是把 fallback 复制到 client 并在两边都 `order by org_id`
  钉死「第一个」是同一个；防再犯靠 e2e 的 fresh-session 检查（拿掉修正实测会红）。
  **判断方法：凡是「client 也要显示 server 算出来的东西」，先问 client 是重算还是
  重用——重算的就要逐条对齐 server 的 fallback 顺序，并留一个 fresh session 的测试。**

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
- 🆕 **PowerShell 的 `Get-Content -Raw` + `-replace` + `Set-Content` 会把 UTF-8 源码档读成 ANSI 再写坏**：em-dash 变 `â€”`、中文注解全成乱码、再送一个 BOM 进档案头。8/25 对六支 route 档批量替换时踩到，diff 行数异常膨胀才发现，`git checkout` 回滚后改用逐档 Edit。**批量文字替换不要用 PowerShell 管源码档；真要用就 `-Encoding utf8` 进出都指定，改完先看一眼 diff 再 commit。**
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
