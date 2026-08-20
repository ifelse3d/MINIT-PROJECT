# Judge Q&A Drill — 唯一版本

> **2026-08-05 合并说明。** 这份取代 2026-07-10 那份（现在在
> `archive/qa-drill-2026-07-10-CONTAINS-FALSE-PILOT-CLAIMS.md`）。
> 旧版有 **4 题的答案已经不成立**，其中两题会直接踩到竞赛条款 §12
> *Material misrepresentation*（取消资格事由）。retire 清单在文末。
> 冲突时，**以 2026-08-03 的判断为准**（`narrative-and-moat.md`）。

**规则**：每题先给**一句话的答案**，再给证据。不要先讲背景。
被问到还没做到的事，**先承认，再讲你为什么这样排序** —— 评审原谅路线图，不原谅编造。
每题 ≤30 秒。十月半决赛是**现场**，练到不看稿。

**上台前自检**：这份里每一句现在式的宣称，`evidence-tracker.md` 里都要有对应的
截图／数字／URL。没有的，改成未来式或直接说没有。

---

## 🔴 会痛的六题

### Q1「这些测试案是真实手写的吗？」
> **Not yet.** The current set is typeset synthetic images — they measure whether
> the pipeline is correct, not whether it reads handwriting. The real handwritten
> batch is being measured now and will be published with the artifact before judging.

⚠️ 这是**目前最痛的一题**。`eval/cases/*/input.png` 现在全是 900px 宽的电脑排版图。
八月量完之後答案变成：「Yes — N real handwritten mixed-language pages, X%,
method and cases in the repo.」**那时候这题会从最痛变成最强。** 见 `STATE.md` 3-a。

### Q2「这个别人两个月抄不抄得走？」
> The model part, yes — two weeks. What can't be copied is **the receipt sequence**.
> Once a society's statutory receipt numbers for the year run through our system,
> switching mid-year means two number series in one financial year, and the audit
> won't pass. Add the eROSES field mapping and the accumulated operating memory.
> **Retention is structural.**

⚠️ 旧版答的是「operating memory compounds」—— `narrative-and-moat.md` 第二节判定
**那讲错了地方**。护城河是连号，不是记忆。而且**这句要能讲，收据字号那件事得先做**
（`docs/收据字号与接号-计划.md`，还等你批准）。

### Q3「你们有几个真实使用者？」
> **Zero societies today — and that is deliberate.** Our AI is still on a free tier,
> and free tiers may train on inputs. A temple's donation register is very likely
> sensitive personal data under PDPA, because it discloses religious affiliation.
> We won't trade someone's faith records for a demo number. Moving to a paid API
> with a data-processing agreement is a precondition for our first customer.

🔴 **绝对不要说**「我们正在洽谈一个 20 间庙的网络」除非已经有**书面的东西**。
旧版 Q8 就是这样写的（"design partner and pilot… real donation volume, real filings"）。
§12 把 *Material misrepresentation* 列为取消资格事由。

### Q4「AI 弄错了一份法定文件，谁负责？」
> The user — and our design makes that bearable. Every output is a **draft** until a
> human confirms it; every field carries a source reference and a confidence rating;
> when the AI is unsure it says so and **never guesses**; all money arithmetic is code,
> not the model; and the confirming person's name and date are printed on the
> document's audit line. Clause 3 of our Terms of Use makes this the primary term.

### Q5「LLM 会幻觉，凭什么信任 AI 写的法定会议记录？」
> Minit never invents. Every extracted field carries its source region on the photo
> and a confidence rating; if a fact isn't in the note, the field says **missing** —
> a red badge, not a guess. A human confirms every field before any document is
> generated, and the document records who confirmed it and when.

📌 现场指向 S2b 的琥珀色徽章。这一题答得好，Q1 的伤会小很多。

### Q6「AI 把金额读错了呢？那是别人的捐款。」
> The AI only **reads** amounts — it never **computes** them. Totals, receipt numbers
> and e-Invois consolidation are deterministic, unit-tested TypeScript. Every amount
> shows its source snippet at review, so the treasurer confirms against the actual
> handwriting before a receipt exists.

📌 可以直接秀 `npm run test` 全绿（260 个测试）—— 那是证据 4。

---

## 🟠 一定会问的五题

### Q7「市场多大？」
用 `narrative-and-moat.md` 第一节那两句。**先讲 90,224 间注册社团，再讲 e-Invois 是子集。**
⚠️ 不要把两者混在一句里讲，会被打。

### Q8「怎么收费？」
> Priced by the volume of paperwork and cash an organisation handles, not by its
> legal type: **RM39** small, **RM99** active, **RM188** high-volume, plus **RM150**
> for a network HQ account. Usage is displayed to the user as a **percentage of
> quota**, never a call count — so we can change model or vendor without the user
> feeling it. Internally we record tokens and cost.

### Q8b「毛利多少？」← **这一题会问，而且是 25% 那一格**

> **We model 73%, on assumptions chosen to be pessimistic — and I'd rather show
> you the arithmetic than assert a number.** At a hundred organisations that is
> RM7,340 of monthly revenue against RM402 of AI, RM1,334 of cloud and RM220 of
> payment fees: **RM19.56 of cost per organisation, a 73% gross margin.** Every
> variable takes its expensive side — our busiest workload profile, token counts
> at the top of their range, a weak ringgit, cloud at twice our estimate, a 20%
> retry allowance. **It is a model, not a measurement:** our usage table does not
> yet record tokens or cost, so nothing is invoice-checked. The migration is
> written; we will publish measured figures before judging.

### Q8c 🔴「那你们的成本会不会随 AI 涨价爆掉？」← **这题答好会加分，因为答案反直觉**

> **It would, if we ran an expensive model for everything.** Same formula: today
> we run one cheap vision model for every task and that prices at **66.6%**;
> the routing we quote takes it to **73.4%**. Run one *mid-tier* model everywhere
> instead and it drops to **27%**; a frontier model at its post-promotion list
> price is **negative**. The reason is workload shape:
> **83% of our calls are classification and short assistant turns**, and none of
> them need the capability that reads handwriting. We route per task — a cheap
> model for classification and chat, a good one only for extraction. That is why
> the vendor sits behind an interface instead of in the feature code: **model
> choice, not scale, is what makes this business work.**

⚠️ **诚实附注（被追问才讲，但一定要讲得出来）**：**按任务分流还没开。**
更正一个旧说法：`getVisionProvider()` **不是**全域单例 —— `provider.ts` 每次呼叫都新建，
而且呼叫端**早就在传任务名**了。**缺的只是 `.env` 那四行 `AI_MODEL_*` 没设**，
所以四个任务一起落到同一个模型。要讲成
「the provider layer routes per task already; what we have not done is set the four
variables that switch it on」，**不要讲成已经在跑，也不要讲成还没写**。
（细节：`.env.example` 的 `--- AI: which model does which job ---` 那一段。）

🔴 **还有一件必须自己先讲的**：C 方案(75.4%)**需要 OpenAI 帐号，而我们还没开**，
**而且它把读手写那一格也换成了没跑过 eval 的模型**。所以我们**publish 的是 73.4%**
（只把分类和对话换便宜模型，读手写留在量过的 Gemini 上）。
被问「为什么不用更便宜的抽取模型」就答:
> **Because we have not measured it on our own eval set, and accuracy is the
> product. Two points of margin is a cheap price for a number I can defend.**

📌 **两句话的差别就是取消资格的差别**：
「Our gross margin **is** 73%」= 宣称已量测（拿不出资料）；
「We **model** 73%」= 诚实且可验证。**永远用后者，直到 `ai_usage` 累积出真数字。**

📌 **可以当场秀**：`npm run economics` —— 变数表 + **五种**分流的毛利，一个指令跑出来，
模型在 `src/lib/unit-economics.ts` 而且有单元测试。**「我们的定价有原始码」比任何一张投影片有力。**
（那支程式自己会印「DO NOT quote scenario C」并说明理由 —— 现场秀出来反而加分。）

🔴 如果被追问「你技术文件写 RM 0.4–4.4，这里写 RM19.56，哪个是真的？」——
**都是，切法不同，不要慌**：RM0.4–4.4 = **只算 AI token 的中位假设**；
本模型的 **AI 是每组织 RM4.02**（落在那个区间里），**RM19.56 是再加上云端摊提、金流手续费与重试**。
**同一个模型的三种切法。**

⚠️ **数字改过两次，两次都要能解释（主动讲比被抓到好一百倍）**：
- **85% → 75.4%（8/5 上午）**：把假设全部换成保守值的结果，不是发现算错。
- **75.4% → 73.4%（8/5 晚上）**：发现 75.4% 把**读手写**那一格也换成了没跑过 eval 的
  `gpt-5.6-luna`。**等于毛利偷偷依赖一个没验证的准确率假设。**
  改成只换分类和对话，读手写留在量过的模型上。
  这样讲：**"We found our own number was leaning on an untested assumption, so we
  lowered it."** —— 这是加分的答案，不是扣分的。

### Q9「PDPA 怎么处理？」
> Donor data is masked by default in every list view; IC numbers stored masked;
> document contents and names never appear in logs; all data scoped per organisation
> with row-level security down the org tree; deleting an organisation removes rows
> **and** stored files. Receipts never claim tax-deductibility unless the org's
> s.44(6) status is explicitly set. We know the 2024 amendment's 72-hour breach
> notification and DPO threshold, and where they trigger for us.

⚠️ 有一个已知缺口不要主动讲、但被追问要老实说：**一半的资料还在 localStorage**
（捐款登记册含捐款人全名），删除组织清不掉每台浏览器里的那份。这是 P1-2。

### Q10「怎么扩到 90,000 间？」
> The HQ-plus-branches tree and its row-level security are already running; the same
> rails serve every society type; the marginal cost of growth is AI tokens, and that
> curve goes down over time. The bottleneck is onboarding — login, PPM verification —
> not infrastructure.

### Q11「为什么用 Gemini 不用本地模型／为什么不自己训练？」
> Because we're not selling a model. Our provider layer is an interface — swapping
> vendors is a 40-line file, no feature code changes. When data sovereignty becomes a
> real customer requirement, the same interface takes a local model. Training our own
> today would spend the budget on the part that gets cheaper by itself.

📌 这一题可以顺势展示 `docs/换模型手册.md` —— 「换供应商是有手册的五步流程」比嘴上讲有力。

---

## 🟡 加分题（准备了会显得很不一样）

### Q12「如果庙里的人根本不开电脑呢？」
> That's the real drop-off point, not the AI. Receipts already go out over WhatsApp.
> The next step is **intake** over WhatsApp too — the photo is already there. We will
> only use the official Business Platform; the unofficial WhatsApp automation
> libraries get numbers banned, which for a temple is a disaster. So it's Phase 8,
> not today.

### Q13「这跟找个公司秘书代办有什么不同？」
> A company secretary takes the work away — a few hundred ringgit a year, and the
> records still end up in a volunteer's drawer. Minit keeps the record with the
> society: auditable, handover-ready. Committees are re-elected every year, and the
> drawer loses something every year.

### Q14「e-Invois 你们跟 MyInvois 串了吗？」
> Today we generate the official MyInvois Portal batch-upload file — the treasurer
> uploads it in one click, which is exactly how LHDN expects small organisations to
> comply. Direct API submission needs an organisation digital certificate; it's on
> the roadmap, **not faked in the demo**.

### Q15「收据用 WhatsApp 送,合规吗？」
> V1 uses official click-to-send links — the collector's own WhatsApp sends the PDF.
> No automation, nothing against WhatsApp's terms. The official Business API comes
> when volume justifies it. We deliberately refuse the unofficial libraries.

### Q16「AI 整个挂掉的时候呢？」
> The upload is marked failed and a human does it the old way — nothing blocks.
> Failure is visible, never silent: no batch crashes; every item lands in done or
> failed, with a reason.

---

## ❗ 这一题只有你答得了

### Q17「你们团队为什么做得起来？」
**⚠️ 这一句我写不了。**
如果队上任何一位有**社团或庙宇理事会的实际经验** —— 当过秘书、财政、理事，
或者帮家里的庙报过 eROSES —— **那一句是全场最重要的一句话**，
比任何技术细节都重。7/29 的修订稿 p8 也是这样判断的。

出发前把这句写下来，不要临场想。

---

## 已 retire 的旧答案（为什么）

| 旧版 | 问题 | 现在看哪一题 |
|---|---|---|
| Q8「Who's actually using this?」→ "A temple network of 20+ halls is our design partner and pilot… real donation volume, real filings. The first real Annual Return goes through Minit this month." | 🔴 **不实**。7/29 J 确认试点是 **0**。§12 取消资格风险 | **Q3** |
| Q11「Malay AND Chinese handwriting?」→ "that's the pilot's reality and our demo shows it live" | 🔴 同上，宣称有试点 | Q1 + 现场 demo |
| Q4「What's your accuracy?」→ "building the benchmark from the founder's own past government-accepted filings — real documents, not synthetic tests" | 🔴 **相反**。现在的 golden case 就是合成排版图 | **Q1** |
| Q3「Why won't ChatGPT do this?」→ "there is deliberately no open-ended chatbot in the product" | 🟠 **已过期**。`CLAUDE.md` 规则 10 在 2026-07-28 解除了这个禁令 —— 现在**有**对话功能，只是有三重上限 | 讲三重上限（一轮一动作、每对话轮数上限、月配额），不要讲「我们没有 chatbot」 |
| Q10「What's the moat?」→ "operating memory compounds" | 🟠 讲错重点（`narrative-and-moat.md` 第二节） | **Q2**（连号） |
| Q9「Business model?」→ `[YOU]` 空白 | 未填 | **Q8** + `STATE.md` 第 5 节第 9 题 |
