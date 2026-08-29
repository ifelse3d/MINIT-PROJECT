# STATE.md — Minit 的当前状态

> **这是唯一的「现在在哪里」。**
> 每个 session 结束前**覆盖更新这一份**，不要新增带日期的交接档案。
> 规则在 `CLAUDE.md`，阶段在 `BUILD_PLAN.md`，历史在 `docs/archive/`。
> 🔴 **给 J 的东西写进 `C:\dev\_J-要做的事\`，不要写在这里。**

**最后更新：2026-08-30 凌晨（MYT）· Fable 5（69 号 eROSES 重构+名册场：H1–H4 四包全部收工）**
**🔴 本场（69 号）状态一句话：四包全做完（74/75/76/77 号报告）——
H1 名册补完（列内 Edit、email/州、一键起表＋章程对照、Excel 8 欄）；
H2 eROSES flow 重构主菜（入口三张卡、年报九步一步一页、缺值原地填、
每步示意图、/filings 真锁）；H3 onboarding（/orgs/welcome 引导序列）＋
机构上限（旧 3-org 检查拆掉换「免费 1 个总机构」）；H4 收尾（全站删除
确认弹窗 14 处、AGM pack 银行摘录查证非跨 org＋改可勾选、Members &
invites 破版修、草稿收纳＋/minutes/drafts 专页）。四道关全绿（vitest
1087、eslint 21、tsc 0、build ✓）＋三条 e2e＋四支探针（18+51+14+21 项）
全 PASS。**🔴 J 的事：贴 migration 37、38（salin-migration.bat，探针实测
仅这两支 NOT YET）→ push-cabang.bat（4 支 commit）→ 77 号报告的 tester
清单＋75 号 📌 的 flow-COPY 围栏拍板。** 下面是上一场（68 号）的快照：**
**⑦ 品质场四包全做完（70/71/72/73 号报告），
held-out 验收两半都过。J 的道教会样本拍照→确认→BM 文件＝标准 minit
版式、量尺 0 缺陷、**零 AI 费**（结构化确定性组装；翻译才叫模型，
就地措辞逐 index 数＋checkLatinNames 挡发明汉字）。「AI took too long」
真因根治：flash-lite 会「标 missing 却塞值」→契约打回整份→重读爆
50s 预算；现在 parse 前信标签抹值（coerceMissingFieldsEmpty，五条管线
全装），**真机 create-org 传 CONTOH 8 页 33 秒一次过落地**。UX 九件全上
（原图浮窗左下 resize、草稿照片签名 URL 载回=未决 15 结案、Resume
白纸黑字、首页/侧栏未完成草稿提醒、步骤门人话、eROSES 空状态大声、
出席 Next 闸、create-org 失败红卡+原地重试、ganti 换届卡）。
擷取 eval 同 prompt 两轮 95.2%/93.6%、invented=0（对外引区间）；品质
eval 3/3 PASS。累计真额度 ≈US$0.30/1.00。migration **32–36 探针实测已
全部套用**、**origin/main 已在 20c6d52**（J 开工前 push 过 56/64 场——
所以 8/29 晚的 timeout 是在 45s 修已上线的情况下撞的，真因就是
标 missing 塞值那条，本场修掉）。🔴 J 的事：**push-cabang.bat**
（本场 4 支 commit 带着真因修）→ 道教会样本亲手重走 → 叫 tester
（73 号报告清单）。
🔴 J 的事（上一场欠的照旧）：贴 migration 32–36（salin-migration.bat）→
push-cabang.bat → 叫 tester（67 号报告第 4 点；旧清单 60＋55 号）→
eROSES 下载官方 Penyata Kewangan 模板（60 号报告第 5 点）。**

---

## 🌙 现在在哪里（2026-08-29 晚，69 号 eROSES 重构+名册场进行中）

> **已上线**：https://minit-project.vercel.app —— 68 号场 J 已 push
> （开工时 main == origin/main）；**69 号场的 commit 等 J push-cabang.bat**。
> 线上 org：15「J」、58「avocado」、91「TESTING1」。

### 这一场做了什么（69 号场 · 包 H4 ✅，77 号报告——收尾小修）

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

1. **双击 push-cabang.bat（最要紧）**——git 探针：origin/main 停在
   20c6d52（你已把 56/64 场 push 上线了），本场 4 支 commit（ahead 4）
   还没上。里面有「AI took too long」的**真因修**：你 8/29 晚是在 45s 修
   已上线的情况下照样撞，真因是模型「标 missing 却塞值」害整份读取被
   打回重读——本场修掉并真机验证（create-org 传 CONTOH 33 秒落地）。
2. 看 **70 / 71 / 72 / 73** 号报告（各一分钟版在开头；旧场 65–67 照旧）。
   ~~贴 migration 32–36~~——**探针实测五支全部已套用**（你在 68 号单开工前
   就贴好了，本场收尾 check:migrations 证实），一支都不用贴。
3. **用道教会样本重走一遍**（68 号单 §6-5）：拍照→确认→「让 MinitAI 写成
   正式记录」→看 BM 版像不像能交的 minit；中文版也点一下。圈还不满意的。
4. **叫 tester**：73 号报告清单（草稿徽章/Resume 语义/出席闸/create-org
   传章程/敬语 chips——32 已贴，现在就能试）＋建议卡旧清单（67 号第 4 点）。
5. **模型拍板**（72 号报告对比表）：成文/翻译那步 flash-lite 要靠围栏
   打回才对、3.6-flash 一次过还最便宜——要不要换 AI_MODEL_LONG_DOC，
   你跑 bench（bench-models.bat）后定，我没动 env。
6. 旧账照旧：54 号 GUIDE 设 Supabase 邮件；eROSES 下载官方 Penyata
   Kewangan 模板（60 号报告第 5 点）。

### ❓ 未决问题

1. ~~围栏真挡下未实测~~ **大头已结案**（8/29 probe-fence-51 实测：文件第 6 份、
   收据第 21 张、干净下载第 4 次全被挡、讯息对版）。只剩**第 21 页**没撞
   ——要烧 20 页真 AI 读取，不值得脚本烧；等真用户自然撞到或 J 授权。
2. 助手用哪个模型 —— prompt 已解冻（D29），等 J 重跑 bench 后定（J：系统先稳）
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

### ⏭ 下一个 session 从哪开始

**69 号场（eROSES 申报重构＋名册补完）全部做完**（H1=74、H2=75、H3=76、
H4=77 号报告；⑦ 品质场 68 号=70–73 更早已收）。
接下来照 51 号 §5 顺序（J 已点头）：**⑧ 助手＋AI 代办场**（61 号备忘：
聊天面板 upload/手机版/Clear conversation/语言跟人走；未决 2 助手模型等
bench）→ ⑨ 上线后第一批；62 号竞赛材料场待命。
**等 J 反馈的**：migration 37/38 贴上后重跑 probe-h1/h3 的两条 [SKIP]
分支；flow-COPY 围栏拍板（75 号 📌）；77 号 tester 清单；引导文案 vs
真 portal 对版照旧。竞赛 8/31 截止，材料 J 自己定，**不催**。
**等 J 反馈的**：道教会样本亲手重走（68 号 §6-5）；migration 32–36 贴上后
tester 清单（73 号＋67 号报告）；模型拍板（72 号对比表）；引导文案 vs
真 portal 对版照旧。竞赛 8/31 截止，材料 J 自己定，**不催**。
RESPONSIVE：J 若再圈破版，贴 46 号单同段 PROMPT 继续。

---

## 6. 已知陷阱（踩过的，别再踩）

### 2026-08-29 深夜新增（69 号 eROSES 重构场）

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
| migration | `supabase/migrations/`（**37 支：1–36 已套用，37 只写档等 J 贴——2026-08-29 晚 check:migrations 实测 37 是唯一 NOT YET**）· `salin-migration.bat`（37 项）· `npm run check:migrations` |
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
