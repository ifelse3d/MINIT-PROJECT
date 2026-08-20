# AI Usage Disclosure — REVISED 2026-07-29

**🔴 这一份取代 `ai-usage-disclosure.md`。原版有一句不实陈述，必须换掉。**

## 为什么非改不可

原版第 1 段写：

> "It uses **Anthropic's Claude models via the official API**, server-side only"

但程式里 `src/lib/ai/` 只有 `gemini.ts`；`provider.ts:40` 明写 `supported: gemini`。**实际用的是 Google Gemini，而且是免费层。**

条款 §12 把 *Material misrepresentation in the application* 列为取消资格事由（我 7/29 亲自向 maicnexus.com 核实）。而且这一届的主题就是 AI 使用的透明度 —— 在**揭露文件**里写错供应商，被发现不是扣分问题。

另外原版写「58 unit tests as of 10 July 2026」，J 於 7/29 实跑 `npm run test`：**21 个档案、260 个测试全部通过**。

**改完之後这一段其实更强** —— 它展示的是架构判断力和资料治理的自觉，而不是「随便挑了一家最有名的」。

---

## 正文（English only — 直接 copy-paste）

**Project:** Minit — AI compliance and operating-memory assistant for Malaysian registered societies and NGOs.

**1. AI in the product itself.**
Minit is an AI-native application. All model calls are server-side only, behind a single provider abstraction (`src/lib/ai/provider.ts`) selected by an environment variable, so the underlying vendor can be changed without touching feature code. Our current development and pilot provider is **Google Gemini**; **Anthropic Claude is our intended production provider**, and the migration is gated on one deliberate decision: free and evaluation tiers may retain or train on submitted content, which is incompatible with the PDPA commitments we make to donors, so no real personal data is processed until a paid tier with suitable data-handling terms is configured. Until then Minit is exercised on sample and fictional records only.

A vision-capable model reads photographed handwritten documents — mixed Malay, Chinese and English meeting notes, donation ledgers, constitutions — and drafts Bahasa Malaysia documents; the same model classifies uploads and routes them to the correct extractor.

Three design rules govern all AI use:

(a) **The AI never invents.** Every extracted field carries a source reference to the region of the photograph it came from and a confidence rating (confirmed / check / missing); facts absent from the source are marked missing rather than guessed.

(b) **No financial arithmetic is performed by a language model.** Receipt numbering, register totals, cash-custody state and e-Invois consolidation are deterministic TypeScript covered by automated tests. The model extracts quantities; code computes money.

(c) **A named human confirms every AI output** before any official document is generated, and each document carries an audit line recording who confirmed it and when. Draft outputs are watermarked.

**2. AI in building the product.**
The codebase is developed with AI pair-programming assistance (Anthropic's Claude Code) under human direction and review. The team defines the specification, plan and acceptance criteria — kept in the repository as `CLAUDE.md` and `BUILD_PLAN.md` — approves each change, and tests every feature manually. Deterministic logic is covered by automated tests: **260 unit tests across 21 files, all passing as of 29 July 2026**.

**3. AI in competition materials.**
The pitch deck structure, written summary and supporting documents were drafted with AI assistance and reviewed, corrected and approved by the team. Factual claims about accuracy, deployments and outcomes originate from the team's own measurements, not from a model. Where a figure has not yet been measured, the materials say so rather than estimating: our accuracy figure to date was measured on typeset synthetic documents and is labelled as such until the handwritten set is measured, and our unit economics and gross margin are presented as a model with its assumptions shown, because per-organisation token and cost recording is still being instrumented. We would rather publish a smaller verified number than a larger unverifiable one.

**4. Data handling.**
Documents photographed by users are processed under Malaysia's Personal Data Protection Act 2010. Document contents and donor personal data are never written to application logs; personal data is masked by default in the interface; all queries and stored files are scoped per organisation; and deleting an organisation removes both its database rows and its stored files. Donor receipts never claim tax-deductible status unless the organisation's approved s.44(6) status is explicitly configured, and that setting carries a warning explaining its legal meaning.

---

## 定稿前的一个 [YOU]

如果表单有字数上限，从 §1 第二段（vision model 那段）开始删 —— **第一段不能删**，那是这次修正的重点。
