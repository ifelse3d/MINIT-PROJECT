# STATE.md — Minit 的当前状态

> **这是唯一的「现在在哪里」。**
> 每个 session 结束前**覆盖更新这一份**，不要新增带日期的交接档案。
> 规则在 `CLAUDE.md`，阶段在 `BUILD_PLAN.md`，历史在 `docs/archive/`。
> 🔴 **给 J 的东西写进 `C:\dev\_J-要做的事\`，不要写在这里。**

**最后更新：2026-08-29 清晨（MYT）· Fable 5（51 号过夜施工场收工：包 A ✅ 包 B ✅ 小修包 ✅）**
**🔴 本场状态一句话：51 号总单三包全部做完（52/53/55 号报告＋54 号 GUIDE）。
两支新 migration 只写档等 J 贴：32（roster note/honorific）与 33（云端草稿），
fail-open 都实测过。四道关全绿（eslint 还从 22 降到 21）、三条 e2e 全过
（roles 修好后首次）、围栏三面墙实测全挡。J 早上：贴 32 → 贴 33 →
push-cabang.bat → 叫 tester（清单在 55 号报告末尾）。C-14① 两表合并
留给下一场（凌晨不动钱区最敏感的表，如实记）。**

---

## 🌙 现在在哪里（2026-08-29 凌晨，过夜场进行中）

> **已上线**：https://minit-project.vercel.app —— 截至 0ca62e7 已 push；
> 过夜的 commit 等 J 早上 push-cabang.bat。
> 线上 org：15「J」、58「avocado」、91「TESTING1」。

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

- 章程常 20–40 页 > 免费 20 页 ⇒ 免费版基本传不完一本完整章程。要开口子等 J。
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

### 🔴 J 的事

1. 看 52 / 53 / 55 号报告（各一分钟版在开头）。
2. **贴两支 migration**：salin-migration.bat 选 **32** → Supabase SQL Editor
   贴上 → Run；再选 **33** → 贴上 → Run（没贴之前系统照常，fail-open 已实测）。
3. 双击 **push-cabang.bat**。
4. **叫 tester 重试**（总清单在 55 号报告末尾）：PPT/Word/大 PDF 直传、多张
   照片；加理事试同名、分组、词库；模板弹窗、云端草稿、日历假期。
5. 有空照 **54 号 GUIDE** 设 Supabase 邮件（五分钟）；用 iPhone 看副历的
   伊斯兰历＋新假期栏。
6. bench 那个视窗：你有空就跑（双击 bench-models.bat）。

### ❓ 未决问题

1. ~~围栏真挡下未实测~~ **大头已结案**（8/29 probe-fence-51 实测：文件第 6 份、
   收据第 21 张、干净下载第 4 次全被挡、讯息对版）。只剩**第 21 页**没撞
   ——要烧 20 页真 AI 读取，不值得脚本烧；等真用户自然撞到或 J 授权。
2. 助手用哪个模型 —— prompt 已解冻（D29），等 J 重跑 bench 后定（J：系统先稳）
3. 法律实体（金流前置，D12），试点前要答
4. 真实手写 eval：92.9% 量的仍是印刷体，且 prompt 已动、数字作废——等 J 重测
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
14. **C-14① 两套钱录入合并**（打字名单 vs 手动添加收入）——小修包只做了 ②
    （每行 Purpose 下拉）；合并要处理手动表独有的转账凭证/收入类型，
    留给下一场专门做（51 号拍板 9① 还欠这半）
15. 云端草稿的跨装置照片预览：draft 只存 storage 路径，换装置续写时缩图是
    占位符（原图还在 uploads bucket，要看得走签名 URL——之后要不要补，
    看真用户反应）

### ⏭ 下一个 session 从哪开始

**51 号过夜单已全部做完**（包 A=52 号、包 B=53 号、小修包=55 号报告）。
接下来照 51 号 §5 的场次顺序（J 已点头）：
**⑤ eROSES 大改版**（A2 整包＋「存好问要不要呈报→图文引导＋每值 COPY」；
教材＝`C:\Users\User\Desktop\Penyata Kewangan screenshot` 那 17 张截图，
九步清单抄在 51 号 §5；系统现缺四个洞：钱区科目↔1.1–2.4 对照、Juruaudit
概念、银行户口＋会员数/投票权数栏、活动报告生成）→
⑥ AI 智能建议场 → ⑦ 品质场 → ⑧ 助手＋AI 代办 → ⑨ 上线后第一批。
**顺路补**：C-14① 两表合并（未决 14）适合塞进 ⑤ 前后的钱区场。
竞赛材料 J 自己定 30/31 交，**不催**。
RESPONSIVE：J 若再圈破版，贴 46 号单同段 PROMPT 继续。

---

## 6. 已知陷阱（踩过的，别再踩）

### 2026-08-29 凌晨新增（51 号过夜场）

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
| `docs/` | `DECISIONS.md`（D1–**D44**）· `功能盤點-計劃vs實作.md` · `产品缺口盘点.md` · `上线与截图-给J的步骤.md` · `换模型手册.md` · `AI-API-选型与成本.md` · 其余照旧 |
| 品牌 | `src/lib/brand.ts`（BRAND_NAME="MinitAI"，D23）· **紫色**（D24）：logo 原图 `scripts/assets/minit-logo.png`、向量版 `src/components/brand-logo.tsx` · 重生图标：`node scripts/brand-icons.mjs` · tokens 都在 `globals.css` 的 `.v2-root` |
| 定价／毛利 | `src/lib/unit-economics.ts` + `npm run economics`（价目表查证日 `PRICES_CHECKED_ON`） |
| AI 分流设定 | `.env.example` 的 AI 段 + `npm run check:ai` |
| 模型对比 | `npm run bench`（--dry-run / --mock）· `bench-models.bat` · 报告在 `eval/reports/model-bench-<日期>.md` |
| 「到底做了没有」 | `npm run status` / `status.bat` |
| 示范章程（CONTOH） | `public/contoh/undang-undang-tubuh-contoh.pdf`（8 页 BM 完整章程，虚构社团）· 文字版 `docs/contoh-undang-undang-tubuh.md` · 重生 `npm run contoh:constitution`。十条条文与 `src/lib/sample-constitution.ts` **逐字相同**、印出来的页码对得上 `page_ref`，所以拿它测 `/constitution` 上传时**答案是已知的** |
| migration | `supabase/migrations/`（**33 支；1–31 已套用（2026-08-29 探针实测）；32（roster note/honorific）与 33（云端草稿）只写档，等 J 贴**）· `salin-migration.bat`（33 项）· `npm run check:migrations`（含 32/33 列探针） |
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
