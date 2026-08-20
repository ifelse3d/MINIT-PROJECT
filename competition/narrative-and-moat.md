# 叙事、护城河，与评审问答演练

> 原档名 `2026-08-03-叙事、护城河与评审问答.md`，2026-08-05 更名。
> 第五节的问答已并入 `qa-drill.md`。

**2026-08-03 · 这一份接在 `deck-revisions-2026-07-29.md` 後面，不重复它。**
那一份处理的是「不要讲还没发生的事」（p5/p6/p7/p9），处理得很对。
这一份处理三件它没碰的事，外加把空白的 `qa-drill.md` 填起来。

前提（从 7/29 的修订稿读到的）：**目前没有试点**，准确率只量过打字排版的图。
底下所有建议都是在这个前提下写的 —— 不是叫你装作有。

---

## 一、把 90,224 和 e-Invois 拆开讲（现在放在一起会被打）

`competition/business-model.md` 现在的写法把两个数字并排：
**90,224 间活跃社团** + **e-Invois 义务已经降到最小一级**。
并排就会让人读成「90k 都是 e-Invois 客户」。

**不是。** 我查证了（2026-07 现况，来源在文末）：

- 门槛确实从 RM500k 提高到 **RM1M**，2026-01-01 生效
- Phase 4（RM1M–RM5M）确实从 2026-01-01 起
- 单笔 >RM10,000 确实必须开个别 e-invoice，不能合并
- **但**：宽限期（relaxation period）**延长到 2026-12-31**
- **而且**：90,224 间里绝大多数年收入在 RM1M 以下 = **豁免**

一个懂税务的评审会知道这两件事。被问到「所以 90k 里有几间真的需要 e-Invois」
而答不出来，整张投影片的可信度就没了。

**改成两句话，反而更强：**

> **合规痛点**（Annual Return + AGM 会议记录 + 编号收据）
> = **90,224 间全部**。法律强制，**没有豁免门槛**。
>
> **e-Invois**
> = 其中捐款量大的庙宇网络与联合会。RM1M 门槛，宽限期 2026 年底届满，
> 单笔 RM10,000 以上已经不能合并 —— Minit 已经实作了那条个别开立的路径。

第一句撑**规模**，第二句撑**急迫性**，两句都经得起追问。
而且第二句里的「我们已经实作了 RM10k 那条路径」是**具体的技术领先**，
比「市场很大」有说服力得多。

---

## 二、护城河讲错了地方（Scalability 15% + Commercial 25% 都吃到）

deck 现在的开场是 AI —— 拍照、读手写、产文件。
问题是：**会读手写的 AI，谁都叫得到。** 一个工程师加一个 Gemini key，一个周末做得出 demo。
评审心里那句「这个别人两个月能不能抄走」，现在的 deck 没有回答。

真正难抄的有四层，而**最强的那一层你完全没讲**：

| 层 | 抄袭难度 | deck 现在有讲吗 |
|---|---|---|
| 会读手写的模型 | **低** —— 打 API 就有 | ✅ 讲最多 |
| eROSES 栏位对照表、JPPM 真的会收的 BM 文件模板 | 中 —— 要有人真的送过件 | 部分 |
| 累积的组织记忆（理事名册、章程条文、往年数字） | 中高 —— 要时间长出来 | ❌ |
| **收据连号活在你的系统里** | **最高 —— 这是法律上的锁** | ❌ 完全没讲 |

**为什么第四层最硬**：收据号码必须连号、不可改、无断号。
一间庙今年的收据从 `PSH-2026-0847` 开始在 Minit 里跑，
**它就不能在年中搬去别的系统** —— 搬了就是同一年度两套号码，稽核不过。
这不是「资料迁移很麻烦」那种软性成本，这是**法定凭证的连续性**。

而且它是**自己长出来的**：每开一张收据，锁就深一格。

**建议**：在 Scalability 那一页（或 Business Model 那一页底下）加一行：

> **Why they stay:** a society's receipt series is a legal document chain —
> sequential, non-editable, gap-free. Once it runs in Minit, switching
> mid-year means two parallel number series in one financial year, which no
> auditor will accept. Retention is structural, not a loyalty programme.

（⚠ 讲这句话的前提是**接号功能要先做出来** ——
见 `2026-08-03-收据字号与接号-计划.md`。现在系统硬写 `MIN` 而且只能从 0001 开始，
所以这句话目前**还不能讲**。这也是我把那个计划排在最前面的原因之一。）

---

## 三、ESG / National Impact（15%）现在有一发没用过的子弹

那一格现在写的是「audit-able donations, PDPA by design, compliance inclusion」——
方向对，但每一队都会写类似的话。

**你有一个别人讲不出来的东西：**

PDPA 第 4 条把**宗教信仰**列为敏感个资。
一份庙宇的捐款人名册 —— 姓名、电话、身分证号、捐给哪一场法会 ——
合理推论就是**揭露了这些人的宗教信仰**。敏感个资需要**明示同意**。

所以：

> 「我们把庙宇的捐款名册当作**敏感个资**处理，因为它揭露宗教信仰。
> 这就是为什么我们在切换到有资料处理协议的付费 AI 之前，**不接受任何真实资料**。
> 我们宁可慢，也不拿别人的信仰纪录去换一个 demo。」

这句话同时做到四件事：
1. 证明你们**真的懂**这个领域的法律，不是套 SaaS 模板
2. 把「还没有试点」从**弱点**翻成**刻意的选择**
3. 打中 ESG 那 15% 的核心（治理，不是环保）
4. 而且**它是真的** —— 你们 D4 早就写下这条纪律了，只是没讲出来

细节和法律来源在 `legal/PDPA-合规说明.md`。
⚠ 上台前请律师确认「捐款给宗教组织是否构成揭露宗教信仰」这个判断。

---

## 四、Commercial Viability（25%，你自己标注的最弱项）

`competition-facts.md` 自己写着「**Weakest spot**」。它弱在一个具体的地方：

**你现在算不出毛利。** `ai_usage` 表只有 `org_id` + `action` + `created_at`。
没有 token、没有 model、没有成本。所以「一间庙一个月花你多少钱」——
这个数字**今天不存在**，而它是 unit economics 那一页的全部内容。

好消息：**资料一直都在**。Gemini 的回应里就有 `usageMetadata`
（`promptTokenCount` / `candidatesTokenCount`），`gemini.ts` 现在直接丢掉了。
加两个栏位 + 存下来，跑两周就有真实数字。

这件事在你的清单里排第 4（`2026-07-29-交接与设计决策.md` 第 6 节）。
**建议提前到前两名** —— 它不是优化，它是评审 25% 那一格的**原料**。
而且改动很小（见 `2026-08-03-补充审计-新发现.md` 第 3、15 条，同一个档案一次改完）。

跑两周之後，那一页可以从「我们打算收 RM X」变成：

> 「一间 20 间分会的庙宇网络，一个月的真实 AI 成本是 RM __。
> 我们收 RM __。毛利 __%，而且随着模型降价还会往上。」

**这才是 25% 那一格要的东西。**

---

## 五、Judge Q&A Drill → 已经搬走

这一节原本的 12 题已经**合并进 `qa-drill.md`**（2026-08-05），
跟 7/10 那份旧的 12 题合成一份，并且标出旧版有哪 4 题不能再用。

**练问答只看 `qa-drill.md`。** 这里不再保留第二份，避免又出现两份互相矛盾的答案。

## 六、建议动手顺序（只讲跟竞赛有关的）

| | 做什么 | 打到哪一格 | 成本 |
|---|---|---|---|
| 1 | 真实手写 eval + **报告提交进 repo** | Technical 25% · 证据 1/3/5 | 半天 |
| 2 | `ai_usage` 加 token / cost，跑两周 | **Commercial 25%（最弱项）** | 半天 + 等两周 |
| 3 | 收据字号与接号 | 让第二节那句护城河**可以讲** | 见计划书 |
| 4 | 上线 `/privacy` + `/terms` | ESG 15% · Q8 有实体可指 | 填空 + 律师 |
| 5 | p2/p3 的 e-Invois 拆句 | Industry 20% | 十分钟 |
| 6 | 把这份 Q&A 练到不用看稿 | 十月半决赛是**现场** | — |

第 2 项要等两周，所以**今天就开始**。其余照顺序。

---

**查证来源（第一节）**
- [e-Invoicing in Malaysia 2026: Guidelines, Requirements and Exemption — ClearTax](https://www.cleartax.com/my/en/e-invoicing-malaysia)
- [e-Invoice Implementation Phases and Timelines — ClearTax](https://www.cleartax.com/my/en/different-phases-implementation-timelines-einvoicing-malaysia)
- [Malaysia's New RM1 Million e-Invoicing Threshold — RTC Suite](https://rtcsuite.com/malaysias-new-rm1-million-e-invoicing-threshold-a-focused-update/)

*2026-08-03 · 接续 `deck-revisions-2026-07-29.md`*
