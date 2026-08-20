# competition/deck

**`Minit-Pitch-Deck-CURRENT.pdf` / `.pptx` 是唯一要拿出去的那一份。**
有人跟你要 deck，给这个。不要再从 `archive/deck/` 里挑。

出新版的做法:**覆盖 `Minit-Pitch-Deck-CURRENT.*`**,把旧的那份丢进
`../archive/deck/` 并在下面的表加一行。**不要再产生 `_v5`。**

---

## 现在这一份是怎么选出来的（2026-08-05 的判定依据）

原本这个资料夹有 **8 份 deck、3 种命名法、2 套版本制**,没有任何线索指出哪份是现在的。
判定是靠比对 PDF 内文,不是靠猜:

| 档案 | 页数 | 内文字数 | 时间 | 判定 |
|---|---|---|---|---|
| `Minit Pitch Deck.pdf` | 7 | 3002 | 07-29 01:00 | 旧版设计（"M I N I T / Photograph the mess"）。**与 `minit-deck.pdf` 内文完全相同**（同一份档案两个名字） |
| `minit-deck.pdf` | 7 | 3002 | 07-29 01:00 | 同上,重复 |
| `Minit-Pitch-Deck-REVISED-2026-07-29.pdf` | 10 | 4942 | 07-29 17:38 | 新版式的第一版 |
| `Minit_Pitch_Deck_v2.pdf` | 10 | 4716 | 07-29 17:38 | 从 REVISED 精简 p7、p9 |
| `Minit_Pitch_Deck_v3.pdf` | 10 | 5030 | 07-29 17:57 | p9 又写长回去 |
| **`Minit_Pitch_Deck_v4.pdf`** | 10 | 4811 | **07-29 17:58** | **← 现行版**。时间最新,而且是唯一**改了数字**的一版 |

**决定性的证据不是时间戳,是 v3 → v4 唯一的那一处改动（第 9 页）:**

> v3:「AI（RM 1–22 per organisation / month）plus shared cloud infrastructure:
> ~85% blended gross margin at 100 organisations」
> **v4:「AI + cloud cost RM 8–29 per organisation / month — ~85% gross margin at scale」**

其余九页一字未改。改一个成本数字是**实质修订**,不是排版微调 —— 所以 v4 在 v3 之后,
而且是刻意的。

---

## 📋 deck 待改清单

> **2026-08-06 更新:第 1 项与第 2 项都改完了,两个档都已覆盖。**
> p9 的 85% 拆掉了(取消资格风险解除),p6 的测试数从 260 改成当天实测的 **291**。
> 底下两节保留全部证据与量测,当作以后改这两页的参考。
> **第 3 项(p7)查证结论是不必改字。所以这份清单目前是空的。**
>
> ~~2026-08-05 决定:deck 暂停修改。J:「PPT 那些先不用管,等最终的再一次性做好。」~~
> 那个决定的前提是「只有 J 开 PowerPoint 才改得动」,而 8/5 已经证明这条前提是错的
> (`python-pptx` + `soffice` 路径,见下一节)。p9 是唯一有取消资格风险的一句,
> 所以 8/6 先把它单独拆掉,其余仍然等最终版一次做完。
>
> 下面这一节是**执行清单,不是讨论**。改的时候照着做,不必重新研究。
> 每一项都已经查证过、措辞已定稿、版面已量过。

### 一次性改版的做法(2026-08-05 验证过可行,不需要 PowerPoint)

之前写「二进位档改不了、只有 J 能开 PowerPoint」—— **那是错的,这条路是通的**:

1. `python-pptx` 直接改 `.pptx` 里那一个 run 的文字(整份档案其余部分不动)
2. `soffice --headless --convert-to pdf` 重新汇出 `.pdf`

**关键证据:现行 `.pdf` 本来就是 LibreOffice Impress 26.2.4.2 汇出的**
(`pdfinfo` 的 Producer 栏),而且拿现行 `.pptx` 原封不动重新汇出一次,
**十页的文字与座标与现行 `.pdf` 完全相同**(逐页 md5 比对)。
**所以重新汇出不会让版面走样** —— 用的是同一支引擎、同一组字型
(Carlito / Caladea,已内嵌)。

### ⚠️ 版面硬限制:**右栏那一块已经没有任何垂直余裕**(2026-08-05 实测)

改字之前必须知道这件事,否则会挤爆版面:

| 量到的东西 | 数值 |
|---|---|
| p9 右栏卡片(圆角矩形)下缘 | y = 329.4 pt |
| **现行**四个 bullet 的文字下缘 | y = **329.7 pt** ← **已经超出卡片 0.3 pt** |
| 文字上缘 vs「How we get paid」标题下缘 | 156.7 vs 153.4 pt ← **只差 3.3 pt** |
| 每行可用宽度 | 约 246 pt ≈ 46 个字元 |

文字框设定是 `anchor="ctr"` 且**没有 autofit**,所以**多一行 = 上下各撑开约 8 pt**:
往上撞进标题、往下掉出卡片。**这不是美观问题,是当场看得出来的破版。**

**结论:那一条 bullet 必须维持在 2 行以内 → 上限约 86 个字元。**
实际渲染验证过的:82 / 84 / 86 字元 → 2 行(版面与现在一模一样);
88 字元 → 3 行,整块文字下缘掉到 y = 337.8,**明显掉出卡片**。

**所以 README 里原本建议的那两句(「Modelled on pessimistic assumptions…」加上
routing 那一句)放不下** —— 那是 155 字元,会变成 4 行。下面的定稿版本是
**量过之后重写的**,请用下面这一版。

---

### 待改项一览

| # | 页 | 严重度 | 状态 |
|---|---|---|---|
| **1** | p9 「AI + cloud cost… ~85% gross margin」 | 🔴 §12 取消资格风险 | ✅ **2026-08-06 已改完** |
| **2** | p6 「260 passing unit tests」 | 🟢 低报自己 | ✅ **2026-08-06 已改成 291** |
| **3** | p7 HQ custody | ⚪ **查证结论:不必改字** | 见下方 |

---

### 1️⃣ ✅ p9 那一句 —— **2026-08-06 已改完**(第 9 页「How we get paid」区块的第三个 bullet)

**改之前印的:**

> AI + cloud cost RM 8–29 per organisation / month — ~85% gross margin at scale.

**现在印的(84 字元,实际渲染验证过是 2 行、版面不变):**

> Modelled, not measured: RM 19.56 cost per organisation / month — 73.4% gross margin.

渲染出来会断成:

```
Modelled, not measured: RM 19.56 cost per
organisation / month — 73.4% gross margin.
```

**用词的出处**:`summary-onepager.md` 英文正文第一句就是
"Our unit economics are **modelled, not measured**",RM19.56 与 73.4% 同样出自那里。
**不要自创措辞,对齐 one-pager 就好。**

#### 2026-08-06 执行纪录(怎么改的、怎么验的)

工具链跟上面预告的一样,而且**沙盒里的 LibreOffice 正好也是 26.2.4.2**(与产出现行 PDF 的同一版)。

**先量基准,再动手** —— 把**未改动**的 `.pptx` 重新汇出一次 PDF,与现行 PDF 比对:
十页文字全部相同,`pdftotext -bbox` 的**座标一个字都没差**,档案大小同为 169,792 bytes。
**先证明汇出这条路本身不走样,才有资格谈改字之后的差异。**

改的方式:`python-pptx` 只改**一个 run** 的 `.text`(slide 9 → `Text 9` → para[2]),
其余部分连碰都没碰。脚本里加了 `assert hits == 1`,改超过一处就中止 ——
顺带确认全份 deck **只有这一处**出现 `85%` / `8–29`。

改完的验证(四项全过):

| 验什么 | 结果 |
|---|---|
| 旧字样是否真的消失 | ✅ 全档搜不到 `85%`、`8–29`、`at scale` |
| 新句是否真的在 | ✅ 在,断行与预测一致(见上面那个方框) |
| 其余九页有没有被波及 | ✅ p1–p8、p10 文字**逐页相同** |
| 版面有没有撑爆 | ✅ 右栏**仍是 15 行,每一行的 y 座标与改前完全相同**,文字下缘 **yMax = 329.7**(与改前同值) |

**两个档都已覆盖**(`.pptx` 44,263 bytes / `.pdf` 169,568 bytes),没有产生 `_v5`。
旧版备份 = `../archive/deck/Minit_Pitch_Deck_v4.*`,**改之前已用 md5 确认它与旧的现行档完全相同**,
所以要退回去只要把 v4 那两个档复制回来盖掉即可。

⚠️ **数字 2026-08-05 晚间再改一次:75.4% → 73.4%,原因不是算错,是发现 75.4% 不老实。**
75.4%(情境 C)把**读手写**那一格也换成了 `gpt-5.6-luna` —— 一个**从来没跑过我们
eval 的模型**,而 `src/lib/ai/openai.ts` 开头就写着「Minit 读的是手写中文,不要只看
价钱换模型」。**等于那个毛利偷偷建立在一个没验证过的准确率假设上。**
73.4%(情境 E)**只把分类和对话换成便宜模型,读手写的那一格留在量过的 Gemini 上**。
少两个百分点,换到一个经得起「你怎么知道?」这一问的数字。
字数几乎一样(84 → 84),**版面结论不变,仍然是 2 行**。

⚠️ **原本这里建议的两句话放不下** —— 「Modelled on pessimistic assumptions… Measured
figures from August.」是 155 字元,会变成 4 行;后面那句 routing(「One model for every
task would be 27%…」)更是完全没有空间。**上面那一版是量过之后重写的。**
routing 那个论点很好,但它属于**口稿和 Q&A**(`qa-drill.md` Q8c 已经写好了),不是这一页。

⚠️ **数字 2026-08-05 从 85% 降到 75.4%**,不是算错,是 J 要求「成本一律往贵的算」之后
重建模型的结果(每个变数取上界)。**降下来的数字要用降下来的,不要为了好看回头调假设。**

~~**改完记得:覆盖两个档,不要产生 `_v5`。**~~ → **2026-08-06 已照做**,见上面的执行纪录。

### 为什么非改不可(三行)

1. `ai_usage` 表没有 token / model / cost 栏位(`20260803000000_ai_usage_cost.sql` **未套用**),
   所以那 85% **是推算不是量测** —— 今天拿不出任何资料支撑它。
2. 条款 **§12 把 Material misrepresentation 列为取消资格事由**,Commercial Viability 占 **25%**。
   「Our gross margin **is** 85%」和「We **model** 85%」在英文里只差一个动词,
   在风险上差一个取消资格。
3. 多一个 "Modelled" 不会扣分。**评审原谅路线图,不原谅编造。**

### 那几个成本数字到底矛盾吗?**不矛盾** —— 换算写在这里

| 数字 | 出处 | 算的是 |
|---|---|---|
| **RM 0.43 – 4.39** / 组织 / 月 | `docs/AI-API-选型与成本.md`(8/3) | **只有 AI token**,中位假设。4.39 = 全部走 Gemini 3.5 Flash;0.43 = nano 分类 + luna 抽取 |
| **RM 4.02** / 组织 / 月(AI) · **RM 19.56**(总成本) | `src/lib/unit-economics.ts` 情境 E(8/5 晚,**现行**) | **保守版**:AI 4.02 落在上面那个区间里,再加云端摊提、金流手续费、20% 重试 = 19.56 |
| ~~RM 2.53 · RM 18.07 · 75.4%~~ | 情境 C | **不要引用** —— 它把读手写换成没跑过 eval 的模型 |
| ~~RM 8 – 29~~ | 旧 deck p9 · 旧 summary | **已被上面那一行取代** |
| ~~RM 17 – 32~~ / 分会 / 月 | `business-model.md`(7/10) | **已过期**。节庆季大分会 + Gemini 2.5 Flash 价格 |

100 组织时:营收 RM7,340(60×39 + 30×99 + 10×188 + 150)、AI RM402、云端 RM1,334、
金流 RM220 → COGS RM1,956 → **每组织 RM19.56,毛利 73.4%**。

**这段换算与完整变数表 8/5 起已经写进 `summary-onepager.md`**(英文正文 + 英文附录)——
评审只读正文,藏在中文笔记区等于没写。

**要重算就跑 `npm run economics`**(模型在 `src/lib/unit-economics.ts`,有 18 个单元测试守着)。
换模型只要改一行单价,毛利自动重算 —— 这也是上台时可以秀的东西。

---

### 2️⃣ ✅ p6「260 passing unit tests」—— **2026-08-06 已改成 291**

**当天 `npm test` 实测:22 档 291 测试全绿**,所以印的是 291,不是抄任何文件里的旧值。
`summary-onepager.md` 那一句也一起改了。
验证:291 在、260 全档消失、其余九页逐页文字相同、p6 文字下缘 yMax 与改前同为 74.766281。

<details>
<summary>原本的执行说明(留着,下次改测试数时照做)</summary>


**现在印的字**(第 6 页「Money is code, not AI」那一段):

> Receipt numbering (sequential, gap-free), register totals, cash custody and e-Invois
> consolidation: deterministic TypeScript covered by **260 passing unit tests**.
> The AI only reads; it never calculates.

**改成**:把 `260` 换成改版当天 `npm test` 真正跑出来的数字
(2026-08-05 本机实测是 **278**)。

- **这是低报自己,不是失实**,所以不急 —— 但**三个字元换三个字元,版面零风险**,一次性改版时顺手做掉。
- ⚠️ **改之前一定要先跑一次 `npm test` 看当下的真实数字**,不要照抄这里的 278。
  这一栏的意义就在于「数得出来」,写一个当天对不上的数字反而自伤。
- `summary-onepager.md` 第 32 行也写着同一个「260 passing unit tests」,**要一起改**。

</details>

---

### 3️⃣ ⚪ p7 HQ custody —— **查证结论:不必改字**

2026-08-05 逐字查证过 deck p7 与 one-pager 的实际措辞,并对照 `src/`。
**结论:性质与 p9 不同,不构成 §12 失实陈述,所以这一次不动它。**

**p7 现在印的字**(流程图 + 底下那一段):

> Ledger photo → Confirmed register → Numbered receipts → WhatsApp delivery →
> **HQ custody view** → MyInvois batch file
>
> Custody is where the money leaks: cash passes through several pairs of hands before it
> reaches HQ. Minit gives every donation a state — collected → pending remittance →
> settled — and **surfaces the balance that has not yet reached HQ**.
> **Built for** networks of 20 or more branches.

**程式码实际状况**(查了什么 → 看到什么):

| 查了什么 | 结果 |
|---|---|
| 状态机 | ✅ **真的存在且有测试** —— `src/lib/custody.ts`:`collected → pending_remittance → settled`,`assertTransition` 挡非法转移 |
| 「未到总部的余额」 | ✅ **真的算得出来** —— `collectorBalances()` / `totalUnremittedCents()`,画面上真的显示 |
| 批次存到哪 | ❌ **localStorage** key `minit:money:batches:v1`(`money-review.tsx:257`)。`remittance_batches` 这张表**全 repo 没有任何 insert**,只在 `src/db/activity.ts:80` 被读 |
| 有没有独立的总部画面 | ❌ **没有。** `org_descendants` 在整个 `src/` **零次呼叫**;`hqConfirm()` 是同一个元件里的按钮,`confirmedBy` 写死成 `"HQ Admin (Demo)"` |

**为什么判定「不必改字」**(与 p9 的差别):

1. **p9 是一个具体数字用现在式讲出去**(~85% gross margin),而那个数字**今天量不出来**
   —— 可被查证、可被证伪,这才是 §12 的 material misrepresentation。
2. **p7 讲的是能力,而那些能力真的有程式码在支撑**:状态机存在、未汇余额算得出来、画面上看得到。
   deck **没有说** "across devices"、"real time"、"synced",也没有说总部用自己的帐号登入看得到分会。
   `Built for` 在英文里本来就是**设计意图**,不是已交付宣称。
3. 所以风险不是「取消资格」,是「**现场 demo 被戳破**」—— 这是 `docs/功能盤點-計劃vs實作.md` D2 早就写下的判断,这一轮以程式码复核后**维持原判**。

**⚠️ 但留两个提醒给十月现场:**

- **口稿要主动讲清楚。** 有人问「分会出纳在自己手机上记,HQ 怎么看到?」——
  诚实答案是「**目前是单机 pilot build,跨装置同步是接下来的工作**」。
  主动讲不扣分,被问出来才扣分。**建议补进 `qa-drill.md`。**
- 🟡 **真正贴近边界的其实不是 deck,是 one-pager 第 34 行**:
  「A network adds a single RM150 per month HQ account for **consolidated custody,
  cross-branch reporting** and month-end e-Invois」。
  判定仍是**可以不改**(它在**定价段**,讲的是这个方案卖什么,而不是宣称已交付的画面),
  但它是所有文件里离「宣称跨分会视图已存在」最近的一句。
  **如果十月之前 custody 还没接上 Supabase,这一句建议加个时态上的保险**(例如 `will include`)。

**最省事的解法其实是把它做成真的** —— 见 `STATE.md` 第 4 节 P1-2 与本轮留下的持久化计划。
