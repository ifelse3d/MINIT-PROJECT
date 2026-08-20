# 上线与截图 —— 给 J 的步骤

> J 2026-08-20：「2 和 3 我不懂」。这一份就是那两件事，写给没做过的人看。
> 固定档名，下次更新覆盖它，不要另开新档。

**这两件是 12 天内投报率最高的两件，而且都不用写程式。**
做完 = 8 条竞赛证据里的 **第 6 条**（Live URL）＋ **第 2、3、4 条**（截图）。

---

# 第一部分 · Vercel 上线

## 0. 一句话：这是什么

**把你电脑上跑的这个 app，放到一个别人点得开的网址上。**

为什么非做不可：竞赛要一个 public artifact（评审点得开的东西）。现在那一栏的官方状态是 `NO-GO`，因为**没有网址**。有了网址，证据 6 打勾，`NO-GO` 同时解掉。

免费。Vercel Hobby 方案够用，不用信用卡。

---

## 🔴 最大的坑 —— 先看这一条，它会静静地毁掉整件事

**Vercel 预设 deploy 的是 `master` 分支。你的 `master` 停在 8 月 7 号。**

```
origin/master  =  3797c05  "Save 2026-08-07-2204"
你现在的分支   =  codex/r1c-local-closure-20260810   ← 比 master 多 27 支 commit
```

如果照预设按下去，上线的会是**两个星期前的旧版**：没有词库、没有 `/members`、第 3 步还没接 AI、没有无障碍修正、没有汇入两条路。**画面看起来正常，所以你不会发现。**

**所以 import 完的第一件事，是去改 Production Branch。**（下面第 3 步）

不要先去 merge 进 master —— 距离截止 12 天，merge 出事的代价比改一个设定大得多。改设定随时可以改回来。

---

## 1. 先设 Supabase（五分钟）

Supabase Dashboard → **Authentication** → **Sign In / Up**：

| 设定 | 竞赛 demo 要设成 | 为什么 |
|---|---|---|
| Email provider | **ON** | 不开的话没有人登入得了 |
| **Confirm email** | **OFF** | 评审要能在五秒内注册进去看。开着就要等确认信，SMTP 又还没设 |

⚠️ **`Confirm email = OFF` 是一扇开着的门。** 配上「一个帐号可以开无限多个 org」（P0-3 还没做）和每个 org 每月 100 次免费 AI，一个人用键盘就能无限印额度。
**Demo 用假资料可以接受。真的有社团注册的那一天，一定要改回 ON 并设好 SMTP。**

---

## 2. 灌示范资料（可跳过，但建议做）

在你电脑上：

```
cd /d C:\dev\minit
npm run seed:demo
```

它会建一个示范总会 ＋ 两个分会、三个示范帐号（跑完它自己会印出来）、有流水号的示范收据、一份已确认的会议记录。**全部是虚构资料，PDPA 安全。**

**截图一律用这批资料，不要用真人的名字。**

---

## 3. Vercel：import ＋ 改分支

1. 开 **vercel.com** → **Sign Up / Log In** → 选 **Continue with GitHub**
   （用 `ifelse3d` 那个帐号，就是 repo 的拥有者）
2. **Add New… → Project**
3. 清单里找 **`ifelse3d/minit`** → 按 **Import**
4. Framework Preset 它会自己认出 **Next.js**。**Build 设定一个都不要改。**
5. 🔴 **先不要按 Deploy。** 先把环境变数贴进去（下面第 4 步）。
6. 部署完之后**马上**去改分支：
   **Project → Settings → Git → Production Branch**
   把 `master` 改成 **`codex/r1c-local-closure-20260810`** → **Save**
   然后 **Deployments → 右上角 ⋯ → Redeploy**

> 顺序可以反过来（先改分支再 deploy），结果一样。重点是**别让 master 那一版当成成品**。

---

## 4. 环境变数（最容易打错的一步，所以做成一次贴完）

Vercel 的 Environment Variables 那一格**可以一次贴多行**，格式就是 `KEY=VALUE` 一行一个 —— 跟 `.env.local` 一模一样。

**双击这支**：

```
C:\dev\minit\salin-env-vercel.bat
```

它会把 `.env.local` 里那 12 行（去掉注解和空行）**原样复制到剪贴簿**，然后你在 Vercel 那一格 `Ctrl+V`，三个环境（Production / Preview / Development）都勾起来，按 **Save**。

⚠️ **贴完之后，随便复制别的东西把剪贴簿盖掉。** 那上面有 `SUPABASE_SERVICE_ROLE_KEY`。

### 会贴进去的东西（12 行）

| 变数 | 秘密？ | 是什么 |
|---|---|---|
| `AI_PROVIDER` | 否 | `gemini` |
| `GEMINI_API_KEY` | **是** | 读手写用的。**现在是 Tier 1 付费层**，不再是免费层 |
| `OPENAI_API_KEY` | **是** | 分类＋问答用的 |
| `OPENAI_IMAGE_DETAIL` | 否 | `high`，**不要动**（`original` 实测更差） |
| `SUPABASE_URL` | 否 | 专案网址（伺服器端） |
| `SUPABASE_SERVICE_ROLE_KEY` | **是！！** | **绕过 RLS。绝对不能进 `NEXT_PUBLIC_*`** |
| `NEXT_PUBLIC_SUPABASE_URL` | 否 | 同一个网址，给浏览器 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 否 | 公开的 anon key（安全：RLS 挡资料） |
| `AI_MODEL_CLASSIFY` | 否 | `openai:gpt-5-nano` |
| `AI_MODEL_CHAT` | 否 | `openai:gpt-5-nano` |
| `AI_MODEL_EXTRACT` | 否 | `gemini:gemini-3.5-flash-lite` ← **读手写那一格，量到 95.2% 的就是它** |
| `AI_MODEL_LONG_DOC` | 否 | `gemini:gemini-3.5-flash-lite` |

⚠️ **`AI_MODEL_*` 的值没有冒号会被安静忽略**，然后整个掉回 Gemini，而你以为分流开着。上线后跑一次 `npm run check:ai` 看本机的；Vercel 上的就看 `/health`。

---

## 5. 验收（五分钟，做完才算上线）

| 开哪一页 | 要看到什么 |
|---|---|
| `https://你的网址.vercel.app/health` | **每一项都绿**。有红的 → 看下面「出事了怎么办」 |
| `https://你的网址.vercel.app` | 自己跳到 **`/login`**（代表 proxy 有在跑） |
| 用 `npm run seed:demo` 印出来的示范帐号登入 | 总会 ＋ 两个分会都看得到 |
| 用示范的**分会**帐号登入 | **只**看得到那一个分会 |
| 用示范的**审计**帐号登入 | 看得到，但存不了、开不了收据 |

**全部过了 → 那个网址就是竞赛的 artifact link。** 贴进报名表单，**证据 6 打勾，`NO-GO` 解除。**

## 出事了怎么办

| 症状 | 原因 | 怎么修 |
|---|---|---|
| 登入一直跳回 `/login` | Vercel 少了 `NEXT_PUBLIC_SUPABASE_*` | 回第 4 步补上，Redeploy |
| `/health` 说 table missing | 有 migration 没套 | 看 `DEPLOY.md` 第 1 节的清单 |
| 画面是旧版（没有 `/glossary`、没有 `/members`） | **Production Branch 还是 `master`** | 回第 3 步第 6 点 |
| build 失败，讲 Google Fonts | build 当下连不到 `fonts.googleapis.com` | Redeploy 一次。8/05 实测过：那是网路，不是程式 |

---

# 第二部分 · 截图

## 0. 一句话：这是什么

**deck 要用、demo 影片要用、评审要看的画面证据。** 现在 `competition/screenshots/` 里**只有一份 README，一张图都没有**。

**这一件便宜的 agent 就能做**（第 7 节分工），但要有人先把画面开出来。

## 🟢 先拿最便宜的那一张 —— 现在就能拿，不用等任何东西

**证据 4（deterministic money）**：

```
cd /d C:\dev\minit
npm test
```

跑完会印 `Test Files 39 passed (39)` / `Tests 568 passed (568)`。
**把整个视窗截图**，存成 `competition\screenshots\s0-tests-green.png`。

**这一张不需要 app 跑起来、不需要资料、不需要上线。** 现在就能打勾。

---

## 1. 拍之前先设好浏览器

| 设定 | 值 |
|---|---|
| 视窗大小 | **1920 × 1080** |
| 缩放 | **100%**（`Ctrl+0` 归位） |
| 书签列 | **收起来**（`Ctrl+Shift+B`） |
| 主题 | 浅色（深色那一版另外拍，见下面 S9） |
| 资料 | **只用示范资料**。真人名字一律不行（PDPA · Hard Rule 5） |

Windows 截图：`Win + Shift + S` 圈范围，或 `Alt + PrtScn` 抓整个视窗。

---

## 2. 要拍哪几张

全部存进 `C:\dev\minit\competition\screenshots\`，**档名照抄**。

| # | 档名 | 去哪一页 | 画面上要有什么 | 打勾哪一条证据 |
|---|---|---|---|---|
| **S0** | `s0-tests-green.png` | 终端机 | `39 passed` / `568 passed` | **证据 4** |
| **S1** | `s1-original-note.png` | `/inbox` | **真的手写、混语言的那张原图**。乱才是重点，不要摆一张漂亮的 | 证据 1 |
| **S2** | `s2-review-badges.png` | `/minutes` 第 2 步 | 核对画面，**绿／琥珀／红三种徽章同时出现**，旁边有原文出处 | **证据 2** |
| **S2b** | `s2b-amber-detail.png` | 同上，放大一格 | **一格琥珀「不确定」** ＋ 它的原文出处 | **证据 3** |
| **S3** | `s3-bm-minutes.png` | `/minutes` 第 3 步 | 生成的马来文会议记录，**底下那行审计行要看得到** | 证据 2 |
| **S4** | `s4-paste-pack.png` | `/filings` | eROSES 粘贴包的表（字段 → 值 → 出处） | 证据 2 |
| **S5** | `s5-members.png` | `/members` | 理事名单 ＋ 顶上那条「⚠ N 人还没填身份证上的名字」 | 加分（合规故事） |
| **S6** | `s6-glossary.png` | `/glossary` | 填了几个词的词库 | 加分（「社团教系统认自己的用词」） |
| **S7** | `s7-import-two-roads.png` | `/members` 汇入面板 | **两颗大按钮**：Excel「程式读的，免费」／照片「会用掉 1 次 AI 额度」 | 加分（成本诚实） |
| **S8** | `s8-receipt-pdf.png` | `/money` | 有流水号的收据 PDF | 加分 |
| **S9** | `s9-darkmode.png` | 任何一页，切深色 | 卡片和按钮**看得到边**（8/19 那支 `85c04b1` 修的） | 加分（无障碍） |

### 三条不能破的规矩

1. **S1 那张手写笔记要是真的乱的。** 摆一张工整的等于把自己的卖点删掉 —— 「乱」才是我们在解决的问题。
2. **徽章颜色要混。** 全绿的画面看起来像假的。要在**有绿、有琥珀、至少一个红「缺漏」**的那一刻按下去 —— 那正是「它会告诉你它不确定」这句话的证据。
3. **名字和金额一律用虚构的**（PDPA）。示范资料本来就是虚构的，用它就好。

---

## 3. 拍完之后

1. 打开 `competition\evidence-tracker.md`，把拍到的那几行 `☐` 改成 `☑`，旁边写档名。
2. `git add competition/screenshots/ competition/evidence-tracker.md`
3. commit，然后双击 `push-cabang.bat`。

> **规矩：deck 或台上讲的每一句话，都要有对应的证据档案存在这个资料夹里。**
> 没有的东西就写「进行中」「八月量」—— **评审原谅路线图，不原谅编造。**

---

## 顺序建议

```
S0（现在，两分钟）
  → 第一部分整个做完，拿到网址（证据 6）
    → 灌示范资料 → S2 S2b S3 S4 S5 S6 S7 S8 S9
      → S1 等你有一张真的手写笔记（那也是真实手写 eval 的材料，一次拍两用）
```
