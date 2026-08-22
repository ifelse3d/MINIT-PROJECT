# 计划 — D1（AI 计费）· D2（/health）· D4（原图挂回记录）

> **固定档名，做完覆盖它或移进 `docs/archive/`。**
> 来源：J 对 `docs/UX-问题清单.md` 第 3 节四个决策题的回覆（2026-08-07 深夜）。
> 三个 bug（B1/B2/B3）已经在同一晚修完并验证，不在这份计划里。
>
> **这份文件回答**：这三件事**要怎么做**、**什么顺序**、**哪里会踩到**。
> 每一条都回到 `src/` 与 `supabase/` 核实过，写明档案与行号。

---

## 0. J 的三个决定（原话）

| | J 说 | 判读 |
|---|---|---|
| **D1** | 「之前有讨论过，说如果会用的人，他每一次都写到很长很长的要求 AI 做一大堆事情，不就亏了。或者一次很多照片的。」 | **不要按「次数」计费／限额，要按真实成本。** 而且你记得没错 —— 那次讨论找到了，见 §1.1 |
| **D2** | 「不要给 USER 看，我们自己知道就好。看了等下反而更多麻烦。」 | `/health` 锁起来 |
| **D4** | 「不应该标记在每一个会议记录那边，他们可以看做好的会议记录，然后对比手写或照片那些。」 | 原图**挂回每一份会议记录**，不是当成一个独立选单项 |
| D3 | （没答） | 仍然未决，见 §5 |

---

## 1. D1 — 从「按次数」改成「按真实成本」

### 1.1 你记得的那次讨论 — 找到了

**出处：`chat-backup-2026-07-21/12-amount-suitability-assessment.md`**（2026-07-21）

那一次的两句关键结论，逐字：

> **第 81 行**：「If each question re-sends the whole constitution uncached (~30k tokens),
> 300 questions = 9.6M input tokens — Q&A jumps ~10×. Protections: prompt-cache the
> constitution + org memory (up to 90% off input); keep the fixed-intent router
> (no open chatbot), optionally gate open Q&A to committee members and
> rate-limit per person/day.」

> **第 31 行区块**：「**Three things that would blow this up — control in code:**
> (1) Constitution stuffing — use prompt caching and the "filter by section if >100KB" rule.
> (2) **High-res photos — downscale before sending.** (3) Retry loops — cap them.」

> **同段结尾**：「add a **fair-use ceiling per branch**, set a **per-org monthly cost alert**」

**所以当时讲好的就是「按成本」，不是「按次数」。100 次那个设计是後来自己长出来的，没有回头对过这次讨论。**

### 1.2 为什么「100 次」在数学上是错的度量

一次「AI 操作」可以是：

| 情境 | 大约 input tokens | 算几次 |
|---|---|---|
| 问一句「年度呈报什么时候交」 | ~1k | 1 次 |
| 章程问答，整份章程未快取一起送 | **~30k** | 1 次 |
| 一张 1600px 的笔记照片 | ~1k（图块） | 1 次 |
| **一张 4000×3000 的原图（现在就是这样送）** | **数倍以上** | 1 次 |

**同样扣 1 次，成本可以差 30 倍。** 次数不 bound 成本 —— 这正是你说的「写到很长很长」「一次很多照片」。

### 1.3 🔴 顺手挖到的实际漏洞：**送去 AI 的是原始照片，没有压缩**

`minutes-review.tsx:236` 有一个 `compressPhoto()`，注解写着「Downscale the photo to
≤1400px JPEG **so it fits localStorage**」。它只用在 `:387` 存 localStorage 那一份。

**送去 AI 的那一份是原档**：

```
minutes-review.tsx:381      form.append("photo", file);   ← file 是原始 File
```

五个上传点全都一样：

| 档案 | 行 |
|---|---|
| `app/minutes/minutes-review.tsx` | 381 |
| `app/money/money-review.tsx` | 358 |
| `app/constitution/constitution-review.tsx` | 291 |
| `app/ask-box.tsx` | 156 |
| `app/calendar/events-section.tsx` | 72 |

现在的手机照片 3–12 MB、4000×3000。**这是 2026-07-21 就点名的第 (2) 项「downscale before
sending」，一直没有做。** 而且它同时影响**成本**与**准确率**（模型对超大图会切更多块）。

⚠️ **但不要盲目压** —— 这一格是「读手写」，压太狠会掉准确率，而准确率就是产品本身。
**压缩比例要先跑一次 `npm run eval` 对照**（`STATE.md` 第 3 节 ★ 的同一条规矩）。
建议测 1600 / 2000 / 原图三档。

### 1.4 已经做对的（不要重做）

| 防线 | 状态 | 位置 |
|---|---|---|
| 对话轮数上限 | ✅ `MAX_TURNS = 12` | `api/chat/route.ts:53` |
| 单则问题字数上限 | ✅ **後端 zod 也挡**，不只前端 | `api/chat/route.ts:56,59`（`max(500)`） |
| 先扣後呼叫、拒绝退款 | ✅ | `api/chat/route.ts:126,194` |
| 抽取重试上限 | ✅ 重试一次 | `lib/extraction.ts` |
| `recordTokens()` 函式 | ✅ **程式已经写好** | `lib/ai/usage.ts:180` |

**所以 D1 缺的不是「从零做一套」，是三件事：压图、套 migration 让 recordTokens 有地方写、把额度单位换掉。**

### 1.5 做法 —— 四层，由便宜到贵

#### L0 · 输入端硬上限（不需要 migration，最先做）

- [ ] 抽出一个共用的 `lib/prepare-image.ts`：送 AI 前一律下采样到最长边 ≤ N px、JPEG q≈0.8
- [ ] 五个上传点全部改用它（清单见 §1.3）
- [ ] **先用 `npm run eval` 决定 N**（1600 / 2000 / 原图对照），不要凭感觉挑
- [ ] 单次上传张数上限 + 单档大小上限（後端也要挡，不能只挡前端）
- [ ] 章程问答：确认 `lib/ask-core.ts` 有没有实作 `CLAUDE.md` 那条「>100KB 就 filter by
      section」。**这一轮 grep 没看到分段逻辑，要当成「可能没做」去查证。**

#### L1 · 先量再管（**要 J 手贴 migration**）

- [ ] 套 `supabase/migrations/20260803000000_ai_usage_cost.sql`
      （纯附加 nullable 栏位：`input_tokens` / `output_tokens` / `model` / `provider` / `cost_micros`）
- [ ] 套完 `recordTokens()` 就开始写真实 token 与成本
- [ ] **shadow mode：只记录，不强制。** 跑两周看真实分布
- 🔴 **这是整份计划唯一有物理时间下限的事** —— `STATE.md` 第 9 节的 **8/19**。
      九月初审要拿真实成本数字，今天不开始就来不及

#### L2 · 把额度单位从「次」换成「钱」（**要 L1 的两周数据才能定数字**）

- [ ] `orgs` 加 `monthly_cost_cap_micros`（保留 `monthly_free_quota` 一段时间，双轨）
- [ ] `checkAndRecordUsage()`（`lib/ai/usage.ts:71`）改成先估成本再扣
- [ ] `refundUsage()`（`:136`）对应改 —— ⚠️ **「拒绝不扣额度」是 `CLAUDE.md` 规则 10 的硬要求，不能破**
- [ ] **UI 绝对不要给使用者看 token 或 micros。** 换成人话：
      「这个月大约还可以处理 N 张照片」，或者干脆**只在快到上限时才出现**
      （现在 `/settings` 那个「0 / 100 免费」和 AI 面板的「剩 100」都要重做）

#### L3 · 异常保护

- [ ] per-org 月成本警报 —— **通知你，不是挡使用者**
- [ ] 每人每日 rate limit（2026-07-21 讨论里点名的）
- [ ] prompt caching（章程 + org memory，讨论说可省最多 90% input）

### 1.6 ⚠️ 连动 —— 但**不要提前改**

`src/lib/unit-economics.ts` 的 73.4% 建在「每组织每月 100 次」上。改计费模型 =
毛利要重算，deck p9 / `summary-onepager.md` / `business-model.md` / `qa-drill.md` Q8c 都要跟。

🔴 **等 L2 定案再一次改到底。** 提前改就是又一次「文件跑在事实前面」——
`STATE.md` 第 6 节整整两条教训都在讲这个。

---

## 2. D2 — `/health` 锁起来

### 现况

`src/proxy.ts` 只挡未登入，`/health` 没有额外 gate。**任何登入的使用者**都看得到：
`GEMINI_API_KEY`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、
`NEXT_PUBLIC_SUPABASE_*` 的**变数名称**＋「已设置」＋资料库连线状态。
`app/health/page.tsx:31` 的 `requiredEnvVars()` 还会因为 `AI_PROVIDER` 而露出用的是哪一家。

### 做法

- [ ] `/health` 加角色 gate：只有 `hq_admin`（或一组 env 白名单 email）看得到
- [ ] 其他人回 **404 不是 403** —— 404 连「这一页存在」都不揭露
- [ ] 确认 `components/nav-items.ts` 没有任何 `/health` 选单入口；如果要标 `hidden`，
      记得 `nav-items.test.ts` 有 `menusCoverAllItems()` guard 会跟着断
- [ ] ⚠️ **顺手修那个已知 bug**：`STATE.md` 第 6 节写着「`/health` 在最需要它的时候会
      自己崩掉（缺环境变数 → `org-chip.tsx` → `getSupabaseBrowser()` throw）」。
      既然都动这一页了，一起修

**估计：半小时。三件事里最小的一件，建议先做。**

---

## 3. D4 — 原图挂回每一份会议记录

### 好消息：FK 已经存在，只是没人填

`supabase/migrations/20260708000000_init.sql:91`

```sql
create table minutes_docs (
  ...
  upload_id bigint references uploads (id) on delete set null,   ← 已经有
```

但 `src/app/minutes/actions.ts:109` 的 insert **没有带 `upload_id`**。
所以每一份存下来的会议记录，都断掉了通往原始照片的线。

### 要接的链路（五段）

| # | 档案 | 改什么 |
|---|---|---|
| 1 | `src/lib/record-upload.ts:22` | 现在 `Promise<void>` → 改成回传新 upload 的 `id`（`.insert().select("id").single()`）。⚠️ **保持 best-effort**：拿不到 id 不能让抽取失败 |
| 2 | `src/app/api/extract-minutes/route.ts` | 把那个 id 一起回给前端 |
| 3 | `src/app/minutes/minutes-review.tsx` | 存进 state，并一起进 `MINUTES_STORE_KEY` 的 localStorage（不然重整就掉了） |
| 4 | `src/app/minutes/actions.ts:109` | insert 补上 `upload_id` |
| 5 | `src/app/minutes/history/page.tsx` | 每一列加「看原图 · Lihat gambar asal」。签 URL 的写法直接抄 `app/inbox/page.tsx:65-68` 的 `createSignedUrl(path, 3600)` |

**做成并排最好**：左边 `final_md`，右边原图 —— 那正是 J 说的「看做好的会议记录，然后对比手写」。

### 然後才动选单

- [ ] `components/nav-items.ts` 把「上传记录 · Uploads」从 Documents 群组拿掉或改名
- 🔴 **一定要 1–5 做完才拿掉。** `nav-items.ts` 有一段 2026-07-28 的注解说明它当初为什么
      被加进选单：**那是看原始照片的唯一入口，而原始照片是每个抽取栏位的证据。**
      先拿掉选单再接链路，中间那段时间等於没有任何地方看得到原图

### ⚠️ 只对新记录有效

已经存在的 `minutes_docs` 列 `upload_id` 是 null，UI 要能优雅处理（不显示按钮，而不是坏掉）。

### 同样的模式之後可以套到

`/money`（捐款列 → 账页原图）、`/constitution`（条文 → 章程扫描件）。
**这一轮先只做会议记录，做对了再复制。**

---

## 4. 顺序

| | 做什么 | 卡在谁 | 大概 |
|---|---|---|---|
| **1** | **D2 · `/health` 上锁 + 修它自己会崩那个 bug** | 无 | 半小时 |
| **2** | **D4 · 原图链路（五段）+ 选单调整** | 无 | 半天 |
| **3** | **D1-L0 · 压图（含 eval 对照）+ 输入端上限** | 无 | 半天，其中 eval 要跑 |
| **4** | **D1-L1 · 套 `ai_usage_cost` migration，shadow mode 记录** | 🔴 **J 手贴 migration** | 十分钟＋**等两周** |
| **5** | D1-L2/L3 · 换成本额度、警报、caching | 🔴 **要 L1 的真实数据** | 之後 |

**1–3 我一个人就能做完，不需要你做任何事。第 4 步只有你能做，而且它有 8/19 的死线。**

---

## 5. 还没答的：D3 — 注册开放还是邀请制

现在 `app/login/page.tsx:74` 是**完全开放自助注册**（直接 `supabase.auth.signUp`）。

**不管你最後选哪个，P0-3 都得先做**：`createOrg` 现在没有数量上限，
一个帐号开 10 个 org = 每月 1000 次免费 AI。开放注册的话这是可以被刷的。

---

## 6. 新 session 开场白（直接贴这段）

> 读 `CLAUDE.md`、`STATE.md`、`docs/DECISIONS.md`、`docs/UX-问题清单.md`、
> 以及这一份 `docs/UX决策-D1D2D4-计划.md`。
>
> 从第 4 节的顺序第 1 项开始做（D2 · `/health` 上锁），不要跳步。动手前先跟我确认计划。
>
> 注意：
> - **不要替我跑 `git push`** —— 网路认证操作留给我本机的终端机（我双击 `push-to-github.bat`）
> - **migration 一律我手贴**，你只跑验证段
> - D1 的成本上限数字**在累积两周真实资料之前不要定**，也**不要提前去改 deck 或
>   `unit-economics.ts`
> - 压图比例**要先跑 `npm run eval` 对照**才能定，那一格是读手写，准确率就是产品本身
> - 改完跑 `tsc --noEmit` / `npm test` / `npm run build`，并对 eslint 基准
>   （**26 problems = 21 errors + 5 warnings**，与 2026-08-07 相同即为零回归）
