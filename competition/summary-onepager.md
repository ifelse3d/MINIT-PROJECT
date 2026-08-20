# Written Summary — FINAL 2026-07-29

**这一份是定稿。取代 `summary-onepager.md` 和先前的 REVISED 版。**
正文可以整段 copy-paste 进 MAIC dashboard 的 Project Summary 栏位。

## 这一版和已提交版本的差别

| 已提交的写法 | 问题 | 定稿写法 |
|---|---|---|
| "our pilot **being** a temple network of more than 20 halls" | **目前完全没有试点**（J 2026-07-29 确认）。条款 §12 把 *Material misrepresentation* 列为取消资格事由 | 拿掉，改成「8 月开始首次导入」 |
| "tens of thousands of registered societies" | 有官方精确数字却不用 | **90,224**（JPPM, Jul 2026） |
| 没有商业模式 | Commercial Viability 占 **25%**，摘要是独立评分的 artifact | 完整定价 + 成本 + 毛利 |
| "RM200 per month for a single society" | 和新的分层定价不一致；也看不出为什么分会要 RM188 | **按用量分层**，并说明 HQ 帐号买到什么 |
| （只字未提成本） | 只讲 AI 成本会被懂的人一眼看穿漏了基础设施 | **AI + cloud RM8–29**，并写明「at a hundred organisations」这个前提 |
| "AI and cloud… **cost** RM8–29… **which is** roughly an 85% gross margin" | 🔴 **2026-08-05 改掉。** 那 85% 是**推算不是量测** —— `ai_usage` 还没有 token／model／cost 栏位（migration 未套用），所以「一间庙一个月花你多少钱」今天算不出来。用现在式陈述一个量不出来的数字，§12 *Material misrepresentation* 是取消资格事由，而 Commercial Viability 占 25% | 独立成一段：**"modelled, not yet measured"**，把 100 组织的换算式**写进英文正文**（营收 7,340／AI 436／云端 667 → 每组织 RM11 → 85%，云端翻倍仍 75%），并说明 RM0.4–4.4 是 AI-only、RM8–29 含云端摊提 |
| "receipts delivered WhatsApp-first" | 实际是产 PDF + 预填 wa.me 连结，人按送出 | 讲清楚「Minit 从不代发」 |
| "58 unit tests" | 旧数 | **260**（J 7/29 实跑：21 档全过） |
| 结尾 "not a demo" | 没有试点的情况下太满 | 换成诚实的现况声明 |

---

## 正文（English only — 比赛规定。整段复制）

**Minit — AI compliance and operating memory for Malaysian societies**

Malaysia has 90,224 active registered societies (JPPM, July 2026). Every one of them must file an eROSES Annual Return, minute its meetings, account for its donations, and — since 1 January 2026 — meet LHDN e-Invois obligations, including an individual e-invoice for every transaction above RM10,000. Almost none of them have paid staff. The work falls to volunteer secretaries and treasurers whose source records are handwritten notes mixing Malay, Chinese and English, paper donation ledgers, and a constitution nobody has opened in years. Get it wrong and the organisation risks deregistration.

Minit flips the effort. Instead of asking people to key data into forms, users photograph their records exactly as they are, and Minit drafts the compliant output. From meeting notes it produces Bahasa Malaysia minutes and a ready-to-paste eROSES Annual Return pack. From a donation ledger it builds a structured register with sequentially numbered, gap-free receipts, tracks custody of cash from collector to HQ, and generates the month-end batch file for the official MyInvois portal. It also assembles AGM packs — notice, agenda, attendance sheet, proxy forms — extracts bank resolutions, and answers constitution questions with the governing clause cited.

Our one design law: effort flows from AI to human, never the reverse. Every screen is a one-tap confirmation of something the AI already proposed, never a blank data-entry form.

Trust is engineered, not asserted. The AI never invents — anything absent from the source document is marked "missing", and every extracted field carries its source region on the photo and a confidence badge for human review. All money arithmetic (receipt numbering, register totals, custody state, e-Invois consolidation) runs in deterministic TypeScript covered by 291 passing unit tests — never in the language model. Receipts never imply tax-deductibility unless the organisation holds approved s.44(6) status. Receipts are issued as PDFs with a prepared WhatsApp send link; Minit never sends on anyone's behalf. Every generated document names the person who confirmed it and when. Document contents and donor details are never written to logs, all data is scoped per organisation, donor names are masked by default, and deleting an organisation removes both its database rows and its stored files.

Minit is built around an HQ-and-branches structure, because networks — temples, clan associations, unions — are where both the paperwork and the cash concentrate. Pricing follows the volume of paperwork and cash an organisation actually handles, not its legal type: RM39 per month for a small society that meets once a month, RM99 for an active one issuing receipts, and RM188 for a high-volume organisation such as a temple branch in festival season. A network adds a single RM150 per month HQ account for consolidated custody, cross-branch reporting and month-end e-Invois, so one decision at headquarters covers every branch. Audit and secretarial firms resell Minit to the societies they already serve.

Our unit economics are modelled, not measured, so we publish the formula rather than a number. Modelled at a hundred organisations — 60 small, 30 active, 10 high-volume, one HQ account — on deliberately pessimistic inputs: the busiest workload profile we have documented, every token count taken at the top of its range, a weak ringgit at RM4.70 to the dollar, cloud infrastructure at twice our estimate, a 20% retry allowance and a 3% payment take rate. On those assumptions monthly revenue is RM7,340 against RM402 of AI usage, RM1,334 of cloud and RM220 of payment fees — RM19.56 of cost per organisation per month, and a **73% gross margin**. We have deliberately not modelled the things that would improve it: prompt caching, batch pricing, and the fact that a constitution is read once rather than monthly.

That margin depends on routing each task to the model it needs. Classification and assistant turns are 83% of our call volume and require none of the capability that reads handwriting, so model choice — not scale — is what decides whether this clears a software margin. Today we run one cheap vision model for every task, which the same formula prices at 66.6%; the routing we quote moves only classification and assistant turns to a cheaper model still, and leaves extraction where it is. Running one mid-tier model everywhere would give 27%, and one frontier model at its post-promotion list price is negative. A cheaper extractor models two points better, at 75%, but we do not quote it: we have not run our eval against that model, and we will not publish a margin that depends on an accuracy substitution we have not tested. Our provider layer was built for per-task routing and every call site already declares its task; the four lines of configuration that switch it on are not yet set, so the 66.6% row is the honest description of today. The model lives in our repository as `src/lib/unit-economics.ts`, is covered by unit tests, and recomputes from one command when a vendor changes a price. Per-organisation token and cost recording is being instrumented now; we will replace the model with measured figures before judging.

Where we are, stated plainly: the workflows above are built and the deterministic logic is tested. Our extraction eval currently scores 95.2% of fields across 10 pages with 0 invented values, on `gemini-3.5-flash-lite` — but those pages are synthetic typeset documents, so that figure measures reading print, not the handwritten mixed-language notes the product is for. We publish it with that limitation attached rather than let it be mistaken for a handwriting result. Our first deployments with real societies begin in August 2026, and a measured per-field accuracy figure on genuinely handwritten, mixed-language documents will be published with our artifact before judging. We would rather show judges a real number in September than an impressive claim today.

Team: Khor Jia Yi (Team Leader), Tan Shi Hui
Contact: [YOU]

---

## Appendix — the unit-economics model (English; attach or paste if the form allows)

> 这一段**也是英文的**，因为它是给评审看的。表单有空间就一起贴，没有就当附件／
> 上台时的备用页。**不要只交结论那两段** —— 让人看得到变数，才是「可验证」而不是「宣称」。

**Everything here is a model, not a measurement.** Our usage table does not yet
record tokens, model or cost, so nothing below has been reconciled against an
invoice. Where a variable could go either way we take the expensive side, so the
margin is a floor rather than a target.

**Formula.** For each kind of AI call:

```
call cost (USD)      = (input tokens × input price + output tokens × output price) ÷ 1,000,000
AI per org per month = Σ (calls per month × call cost) × (1 + retry buffer)
COGS                 = AI per org × FX × organisations + cloud + revenue × payment fee rate
gross margin         = (revenue − COGS) ÷ revenue
```

**Variables** — change one and the margin recomputes:

| Variable | Value used | Why this value |
|---|---|---|
| Organisations | 100 (60 × RM39, 30 × RM99, 10 × RM188) + 1 HQ × RM150 | Mix weighted to the cheapest tier; revenue RM7,340/month |
| Intake classifications | 100 / org / month | One per uploaded document |
| Meeting-note pages | 20 / org / month | Higher of our two workload profiles |
| Donation-ledger pages | 60 / org / month | Festival-season branch, our busiest profile |
| Constitution ingest | 1 / org / month, 63,300 in | Charged monthly though realistically once, ever |
| Constitution Q&A | 50 / org / month, 25,000 in / 800 out | Input at the pre-filter context ceiling |
| Assistant turns | 250 / org / month, 2,000 in / 500 out | Capped conversation; token size is an estimate |
| Vision call size | 3,100 in / 2,200 out | Top of the documented range, applied to every page |
| Retry buffer | +20% | Failed calls and schema-retry |
| FX | RM4.70 / USD | The weaker of our two documented rates |
| Cloud | RM1,334 / month at 100 orgs | Twice our estimate |
| Payment fees | 3% of revenue | Malaysian gateway take rate |
| Model prices | Vendor list prices, checked 2026-08-03 | Claude Sonnet 5 priced after its promotion ends |

**Result, same formula, five routing choices:**

| Routing | AI / org / month | Cost / org / month | Gross margin |
|---|---|---|---|
| One frontier model for every task (post-promotion list price) | RM70.00 | RM85.55 | **−16.5%** |
| One mid-tier model for every task (`gemini-3.5-flash`) | RM37.99 | RM53.53 | **27.1%** |
| **One cheap model for every task, single vendor — what we run today** | **RM8.99** | **RM24.53** | **66.6%** |
| **Per-task routing, measured model still reads the handwriting — what we quote** | **RM4.02** | **RM19.56** | **73.4%** |
| Per-task routing with a cheaper extractor too (not quoted — extractor unmeasured) | RM2.53 | RM18.07 | 75.4% |

The point of the table is the gap between the rows: 83% of our calls are
classification and chat, which need none of the capability that reads
handwriting. Model choice, not scale, is what makes this business work — which is
why the vendor sits behind an interface rather than in the feature code.

We quote the fourth row, not the fifth. The difference between them is which
model reads the handwriting, and that is the one substitution we are not willing
to assume: accuracy is the product, so the extractor does not move until our eval
says it may. The third row is the floor we could switch on today without opening
any new vendor account.

Reproduce it: `npm run economics` (model in `src/lib/unit-economics.ts`, unit-tested).

---

## 定稿前的两个 [YOU]

1. **团队那两行各补一句可信度**（学校/科系/相关经验）。如果任何一位有**社团或庙宇理事会的实际经验，那一句一定要写** —— 那是你们比其他队伍更懂这个痛点的唯一证明。
2. **联络方式**填上。

## 被追问时的答案（先想好）

> ⚠️ **2026-08-05 数字改了两次：85% → 75.4% → 73.4%。两次都要能解释。**
> 第一次是 J 要求「成本一律往贵的算」，**每一个变数都取上界**（用量取最忙的档案、
> token 取范围顶端、汇率取弱的 4.70、云端取两倍、加 20% 重试、加 3% 金流手续费）。
> **第二次是发现 75.4% 自己不老实**：它把**读手写**那一格也换成了 `gpt-5.6-luna`，
> 一个**从来没跑过我们 eval 的模型**。等于毛利偷偷依赖一个没验证的准确率假设。
> 改成只把分类和对话换便宜模型，**读手写留在量过的 Gemini 上 → 73.4%**。
> 数字掉下来了，就用掉下来的数字 —— **一个只会被超越的毛利是安全的，需要辩护的不是。**
> 算式与变数表**已经放进英文正文与附录**，跑 `npm run economics` 可重算。

- **「毛利怎么算的？」** 100 组织时营收 RM7,340；AI RM402、云端 RM1,334、金流 RM220
  → COGS RM1,956 → **每组织 RM19.56／月，毛利 73.4%**。全部取保守值。
- **「为什么会掉到 73%？之前不是 85%？」**（会问，老实答）
  之前那版取的是中位假设。现在这版**每一格都取最贵的**：最忙的用量档案、token 取上界、
  汇率 4.70、云端翻倍、+20% 重试、+3% 金流。**我们宁可讲一个守得住的下限。**
- 🔴 **「为什么不用更便宜的抽取模型？那样不是 75.4% 吗？」**（这题一定要答得出来）
  **因为那个模型我们没在自己的 eval 上量过，而准确率就是产品本身。**
  英文这样讲：*"Two points of margin is a cheap price for a number I can defend."*
  ⚠️ 另外 75.4% 与 73.4% **都需要 OpenAI 帐号，而帐号还没开**。
  **只用现有 Gemini key 能开到的是 66.6%**（全部 gemini-3.5-flash-lite）。
- 🔴 **「你们只用一个模型的话呢？」——「不划算，而这正是重点」**（这题答好会加分）
  同一条算式：**我们今天实际在跑的（全部 gemini-3.5-flash-lite）= 66.6%；全部换成 gemini-3.5-flash = 27.1%；全部用 claude-sonnet-5 促销结束後的价 = −16.5%（亏钱）。**
  ⚠️ **2026-08-06 更正**：这一行以前写「今天跑的是 27.1%」。那是错的 —— `GEMINI_DEFAULT_MODEL`
  在 2026-08-04 就从 flash 换成 flash-lite 了，只是没人回头看。**分流能拿到的是 66.6% → 73.4%
  （+6.8 点），不是 27% → 73%。** 用 `npm run check:ai` 可以当场复验今天跑的是哪一档。
  为什么：**分类和对话占了 83% 的呼叫量（400/481），但它们完全不需要读手写的能力。**
  所以**按任务分流不是优化，是商业前提** —— 这也是为什么供应商藏在介面後面而不是写死在功能里。
  ⚠️ **诚实附注：分流「做好了没开」。** 更正旧说法 —— `getVisionProvider()` **不是**全域单例，
  `provider.ts` 每次呼叫都新建，呼叫端也早就在传任务名了。**缺的只是 `.env` 那四行 `AI_MODEL_*` 没设。**
  要讲成「the layer routes per task already; we have not set the four variables that switch it on」。
- **「RM 0.4–4.4 和这些数字对得上吗？」** 对得上。`docs/AI-API-选型与成本.md` 的 RM0.4–4.4
  是**只算 AI token 的中位假设**；这里的 **AI RM4.02／组织**落在那个区间里，
  而 RM19.56 是**再加上云端摊提、金流与重试**。**同一个模型的不同切法，不是互相矛盾的估计。**
- **「这些量过吗？」** **没有，全部是模型推算。** `ai_usage` 现在只有 `org_id`／`action`／`created_at`，
  没有 token、model、cost。`20260803000000_ai_usage_cost.sql` 已写好、待套用，累积约两周才有真数字。
  **永远说「我们建模算出 73%」，不要说「我们的毛利是 73%」。**
- **「现在几个客户？」** 0。8 月开始第一批导入。固定成本目前由团队自付。
- **「为什么分会 RM188 比独立社团 RM99 贵？」** 定价看的是文件量和现金量，不是组织类型。大庙分会在节庆季的收据量是小社团的几十倍。
