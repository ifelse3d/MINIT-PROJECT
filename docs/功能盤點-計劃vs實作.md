# 功能盤點 — 計劃 vs 實作

> **這一份的檔名是固定的，下次盤點請覆蓋它，不要新增帶日期的版本**（`CLAUDE.md` 文件規則）。
> 最後一次盤點：**2026-08-05**（Cowork 沙盒，以程式碼為準，不採信任何文件的宣稱）。
>
> **這份文件回答的問題**：「還有什麼沒做？」
> **這份文件不回答**：「該怎麼做？」—— 那在 `BUILD_PLAN.md`；「現在該做哪一步？」—— 那在 `STATE.md` 第 2 節。
>
> **方法**：每一項都回到 `src/`、`supabase/migrations/`、`competition/` 的實際內容確認。
> 凡是只在文件裡看到、程式碼裡找不到的，一律歸類為「只有構想」。
> 第 5 節列出這一輪**沒能親自驗證**的事。

---

## 1. 先回答那個點名的問題：語音錄音 → 會議紀錄

**結論：完全沒有做。不是做了一半，是零行程式碼。**

也**不是**已經承諾給評審的東西 —— 所以它是加分項，不是缺口。

### 證據

| 查了什麼 | 結果 |
|---|---|
| 全文搜尋 `src/` `supabase/` `eval/` `scripts/` `public/`：`audio` `voice` `recording` `transcri` `whisper` `speech` `mediarecorder` `getUserMedia` `錄音` `語音` | **零個實作命中**。唯一的 `transcript` 出現在 `src/app/api/chat/route.ts:45` 與 `src/prompts/chat.ts:28`，指的是**對話歷史**，不是錄音逐字稿 |
| API 路由接受的檔案型別 | 全部只收圖片與 PDF。`src/app/api/extract-minutes/route.ts:21` 只允許 `image/jpeg png webp heic heif`（**連 PDF 都不收**）；`intake/route.ts:51`、`extract-ledger/route.ts:23`、`extract-constitution/route.ts:40` 同樣只有圖片 + PDF |
| 資料庫 schema | `supabase/migrations/20260708000000_init.sql` 的 `uploads.kind` 檢查約束只有 `meeting_notes / ledger_page / constitution / attendance_sheet / expense / other` —— **沒有任何音訊類別**。18 張表沒有一張跟音訊有關 |
| 分類器 prompt | `src/prompts/classify.ts:19` 的分類選項與上面那六種相同，沒有音訊分支 |
| UI | 沒有任何錄音按鈕、`MediaRecorder`、麥克風權限請求 |

### 那它出現在哪裡

三個地方，**全部是文字，沒有一個是承諾**：

1. `docs/AI-API-选型与成本.md` §語音 —— 一張**成本比較表**（Gemini audio-in / Whisper / AssemblyAI / Deepgram）。研究，不是計畫。結論寫著「便宜到不構成決策因素」：兩小時會員大會錄音走 Gemini 3.5 Flash-Lite 約 **RM0.29**。
2. `competition/archive/deck-revisions-2026-07-29.md:127` —— 建議在 deck p4 加**一行 roadmap** 文字，明白標註「**選做**」「目前沒有實作」「不要給語音寫任何百分比」。
3. `chat-backup-2026-07-21/16-missing-project-record.md:98` —— 舊對話裡把語音歸到 Phase 8。但 `BUILD_PLAN.md` 的 Phase 8 寫的是「Ops layer（events, RSVP, announcements）+ 10-intent assistant」，**沒有語音**。

### 交件文件裡有沒有講出去

**沒有。** 逐字檢查過現行 deck（`competition/deck/Minit-Pitch-Deck-CURRENT.pptx` 十頁的 XML 內文 + `.pdf` 的 pdftotext 輸出）與 `competition/summary-onepager.md`：**「voice」一個字都沒有**。那行建議的 roadmap 文字**沒有被加進 p4**。

**所以語音沒有任何失實風險** —— 沒講就沒有風險。它純粹是「還沒做的好點子」。

### 如果要做，工程量比想像小

現有管線是 `抽取 → 逐欄確認 → 產 BM 文件`。語音只是換一個**輸入型別**：

- `extract-minutes` 路由的 `ALLOWED_MIME` 加音訊型別
- `src/prompts/extract-meeting-notes.ts` 加一句「輸入是會議錄音」，輸出結構完全不變（`source_ref.location` 從「photo 1, line 3」變成時間碼）
- 供應層已經支援（`src/lib/ai/provider.ts` 的 Gemini 通道本來就吃 audio）
- 確認畫面、BM 文件產生器、稽核行**一行都不用改**

⚠️ 但兩件事先講清楚：

- **只做「語音 → 會議紀錄」，不要碰錢。** 捐款必須留在看得見、可稽核的路徑上。
- **不准引用任何別人的準確率。** 混語（馬來語—中文—英語）語碼轉換的音訊**沒有公開基準**，跟手寫一樣只能自己量。

---

## 2. 四類清單

### A. 已經能用（有程式、有測試、跑得動）

| 功能 | 證據 |
|---|---|
| **一道門 intake**：任何照片自動分類再導到對應抽取器 | `src/app/api/intake/route.ts`（分類 + 抽取兩次計費）· `src/prompts/classify.ts` · `src/lib/intake-handoff.ts` |
| **會議筆記抽取**（逐欄 value/confidence/source_ref，zod 驗證，重試一次） | `src/app/api/extract-minutes/route.ts` · `src/prompts/extract-meeting-notes.ts` · `src/lib/extraction.ts`（schema 本身強制「missing 就不准有值」） |
| **BM 會議紀錄產生 + 稽核行** | `src/lib/minutes-draft.ts` · 確認後**真的寫進資料庫**：`src/app/minutes/actions.ts:109` → `minutes_docs` |
| **eROSES paste-pack** | `src/lib/paste-pack.ts` · `src/prompts/eroses-map.ts` |
| **捐款簿抽取 → 登記冊** | `src/app/api/extract-ledger/route.ts` · `src/prompts/extract-ledger.ts` |
| **收據編號**（每 org 順序、不跳號、資料庫配號 + unique 約束當後盾） | `src/lib/receipts.ts` · `src/app/money/actions.ts`（**寫進 `donations` + `receipts` 兩張表**，逐列插入避免錯配捐款人） |
| **收據 PDF + wa.me 點擊送出** | `src/lib/receipt-pdf.ts` · `src/app/api/receipt-pdf/route.ts` · `src/lib/receipts.ts:170` |
| **e-Invois 月結 + MyInvois Batch Upload .xlsx** | `src/lib/einvois.ts`（004 合併碼 / 007 個別 / RM10k 門檻 / 月結後 7 天期限）· `src/lib/einvois-xlsx.ts` · `src/app/api/einvois-xlsx/route.ts`，**有測試** |
| **章程抽取 + 引條文問答**（無條文支持就拒答） | `src/app/api/extract-constitution/route.ts` · `src/lib/constitution.ts` · `src/lib/ask-core.ts` |
| **對話助理三重上限 + 拒絕退款** | `src/app/api/chat/route.ts`：`MAX_TURNS = 12`（:53）· 先扣後呼叫（:126）· `in_scope: false` 退款（:194） |
| **AI 用量計費與額度** | `src/lib/ai/usage.ts` → `ai_usage` 表（**有在寫**） |
| **登入 + 全站路由保護** | `src/proxy.ts`（Next 16 把 middleware 改名為 proxy）· `src/app/login/page.tsx`。只有 `/login` 是公開的 |
| **HQ／分會組織樹** | `src/app/orgs/` · `orgs.parent_org_id` |
| **刪除組織：連 storage 一起刪** | `src/lib/org-delete.ts`（先掃 storage 物件再刪 org 列，靠 cascade 清 18 張表） |
| **按任務分流的 AI 供應層** | `src/lib/ai/provider.ts` —— **比交件文件宣稱的更完整，見 D3** |
| **字級可調、步驟卡片、雙語標籤** | `src/components/appearance-provider.tsx` · `src/components/step-card.tsx` |

測試：`find src eval -name "*.test.ts"` = **22 個測試檔**。（我數的是**檔案數**；「278 個測試全綠」是 `STATE.md` 記錄的 8/5 本機實測結果，這一輪我沒有跑。）

---

### B. 做了一半 —— 能跑，但有一個會在 demo 現場咬人的限制

**共同的根：確認前的所有工作狀態都活在瀏覽器的 localStorage 裡，只有「最後確認」那一刻才進資料庫。**

| 功能 | 實際狀況 | 證據 |
|---|---|---|
| **托管 custody（collector → HQ）** | 狀態機是真的、有測試、UI 有；但 **`remittance_batches` 表從來沒有任何程式寫入過** —— 只在 `src/db/activity.ts:80` 被讀。批次只存在那一台瀏覽器裡。**出納的手機和 HQ 的電腦看到的是兩份互不相干的資料。** | `src/lib/custody.ts`（狀態機）· `src/app/money/money-review.tsx:257` `usePersistentState<RemittanceBatch[]>` · `grep remittance_batches` 全 repo 無 insert |
| **捐款登記冊** | 抽取出來的列在 localStorage；**按下「發收據」才進資料庫** | `src/app/money/money-review.tsx:230` |
| **章程** | 條文存在 `localStorage` key `minit.constitution.v1`；`constitutions` 表從未寫入。**換一台裝置 = 這個組織沒有章程** | `src/app/constitution/constitution-review.tsx:53` |
| **會議紀錄草稿** | 草稿（含壓到 1400px 的照片）存 localStorage；只有 confirm 後的 `final_md` 進 DB | `src/app/minutes/minutes-review.tsx:194,236` |
| **日曆／期限** | 全部 localStorage；`deadlines`、`events_meetings` 兩張表只有讀取端（`src/app/api/ask/route.ts:387,404`） | `src/lib/local-events.ts` |
| **AGM 文件包 + 銀行決議書** | 🔴 **整頁寫死在假資料上。** 文件產生器（`src/lib/agm-pack.ts`）是真的、有測試，但**沒有任何路徑能把真實名冊或真實會議紀錄餵進去**。按鈕字面誠實地寫著 "Download the **sample** AGM pack" | `src/app/agm-pack/agm-pack-review.tsx:64` `const p = sampleAgmPackParams`；`:95` 用 `sampleConfirmedMinutes` |
| **eval 準確率** | harness 在（`npm run eval`、`eval/cases/` 十個 case），但 `eval/reports/SUMMARY.md` **數字欄全是空的**。既有的 93.6% 量的是**印刷體合成圖**，不是手寫 | `eval/reports/SUMMARY.md`「現況」表 |

**18 張表裡有 11 張從來沒有任何程式寫入過**（這一輪我自己數過，和 `STATE.md` 第 6 節一致）：
`extractions` `paste_packs` `committee_roster` `remittance_batches` `einvois_packs` `expenses` `qa_log` `events_meetings` `reminders` `rsvps` `deadlines`

有寫入的是七張：`orgs` `members_roles` `uploads` `minutes_docs` `donations` `receipts` `constitutions`（外加後來 migration 加的 `ai_usage`）。

> ⚠️ **這一節本來寫「12 張、含 `constitutions`」。** 那是 2026-08-05 白天盤點時的數字；
> **同一天深夜章程持久化就做完了**（`src/app/constitution/actions.ts`，commit `1d799b7`），
> 所以 `constitutions` 已經有程式在寫。**2026-08-06 更正成 11。**

---

### C. 只有構想 —— 文件講過，程式碼零行

| 項目 | 出處 | 備註 |
|---|---|---|
| **語音錄音 → 會議紀錄** | 見第 1 節 | **沒對評審講過，所以沒有風險** |
| 官方 WhatsApp Business API | `CLAUDE.md` 明訂 Phase 8+ | v1 刻意只做 wa.me 連結 —— 這是**正確的決定**，不是缺口 |
| MyInvois API 直送 | `CLAUDE.md` 明訂 roadmap only | 同上，v1 產 .xlsx 手動上傳是刻意的 |
| Phase 8 ops layer（活動、RSVP、公告） | `BUILD_PLAN.md` Phase 8 | `rsvps` / `reminders` 有表無碼 |
| 成員邀請／申請加入 | `STATE.md` P1-1 | **秘書和財政現在無法在同一個 org 協作** —— 對「賣得出去」而言這比看起來嚴重 |
| 收據字號自訂與跨年接號 | `docs/收据字号与接号-计划.md` | 方案 B，等 J 批准 |
| 自架開源模型（資料主權） | `docs/AI-API-选型与成本.md` | 明寫是 Phase 9 |

---

### D. 文件講了，但程式碼不是那樣 —— 失實風險

> 判準：`competition/` 底下**要交出去的當前版**（不含 `archive/`）講給評審聽的東西，
> 對不對得上 `src/`。比賽條款 §12 把 *material misrepresentation* 列為取消資格事由。

#### 🔴 D1 — deck p9「~85% gross margin at scale」（唯一真正的取消資格風險）

- **現行 deck 兩個檔都還印著這句**：`.pptx` slide9 XML 與 `.pdf` 第 209 行，我逐字確認過。
- **所有文字檔已經改完**：`summary-onepager.md` 正文與附錄明講 "modelled, not measured"；`qa-drill.md` 加了 Q8b/Q8c；`business-model.md`、`ai-usage-disclosure.md` 同步。<br>⚠️ **2026-08-05 晚數字再修一次：75.4% → 73.4%**，因為 75.4% 把讀手寫那一格換成了沒跑過 eval 的模型。所有文字檔已同步。
- **只剩 deck 沒改，因為它是二進位檔，只有 J 能開 PowerPoint 改。** 逐字稿已經備好在 `competition/deck/README.md` 開頭。
- 為什麼是紅的：Commercial Viability 佔 **25%**，而這是**用現在式陳述一個量不出來的數字**。`ai_usage` 還沒有 token/model/cost 欄位（migration 未套用），所以「一間庙一個月花你多少錢」**今天算不出來**。
- **五分鐘的事，且 `.pptx` 和 `.pdf` 兩個檔都要覆蓋。**

#### 🟡 D2 — deck p7「HQ custody view」／「Built for networks of 20 or more branches」

- deck 畫的流程是 `Ledger photo → Confirmed register → Numbered receipts → WhatsApp delivery → HQ custody view → MyInvois batch file`，並寫「Minit gives every donation a state… and surfaces the balance that has not yet reached HQ」。
- **實際上托管批次只在 localStorage**（B 表第一列）。**跨裝置的 HQ 視圖不存在。**
- 文字本身沒有說謊（"built for" 是設計意圖），但**十月半決賽是現場 demo** —— 只要有人用兩台裝置驗證，或問一句「分會的出納在自己手機上記，HQ 怎麼看到」，當場穿幫。
- 兩條路，選一條：**接上 Supabase**（1–2 天，順便解掉 P1-2 的一部分），或**改口稿**講成「per-device pilot build，跨裝置同步是 8 月的工作」。

#### 🟢 D3 — one-pager 說 per-task routing「planned, not yet shipped」—— **低估了自己，而且 `STATE.md` 這一條是錯的**

- one-pager 寫：「Our provider layer was built for per-task routing, but that routing is **planned, not yet shipped**」。
- **程式碼裡已經上了。** `src/lib/ai/provider.ts:155` `getVisionProvider(task)` 依任務解析模型，而且**呼叫端已經在傳任務名**：
  - `src/app/api/intake/route.ts:110-111` → `"classify"` + `"extract"`
  - `src/app/api/chat/route.ts:151`、`src/app/api/ask/route.ts:104` → `"chat"`
  - `src/app/api/extract-constitution/route.ts:83` → `"long_doc"`
- **缺的只是設定**：`.env.example:33-36` 那四行 `AI_MODEL_CLASSIFY / EXTRACT / CHAT / LONG_DOC` 全被註解掉，所以四個任務目前一起落到 legacy 的 `AI_PROVIDER=gemini` + `GEMINI_MODEL`。
- 也就是說：**這不是「還沒做」，是「做好了沒開」。開它是改環境變數，不是寫程式。**
- ⚠️ **順帶更正**：`STATE.md` 第 1 節寫「`getVisionProvider()` 現在是全域單例，所以我們跑的是 27% 那一檔」—— **前半句是錯的**，`provider.ts` 每次呼叫都新建一個 provider，沒有任何模組層快取。後半句（實際跑在單一模型上）**結論仍然正確**，但原因是**環境變數沒設**，不是程式碼寫死。差別很重要：前者要改架構，後者要改一行設定。
- 這個方向是安全的（低報自己不會被取消資格），但**Commercial Viability 佔 25%**，把「planned」變成「shipped」幾乎零成本。

#### ✅ D4 — deck p6「260 passing unit tests」 —— **2026-08-06 已改成 291**

當時是 22 個測試檔、278 個測試；8/6 實測是 **22 檔 291 個測試**，deck 與 one-pager 都已同步。

#### 🟡 D5 — summary 說「every extracted field carries its **source region on the photo**」

`src/lib/extraction.ts:22` 的 `sourceRefSchema` 存的是 `location: string`（例如 `"photo 1, line 3"`）加上**原文片段**，**不是座標框**。畫面上不會有框。文字沒說謊，但評審聽到 "source region on the photo" 很可能期待看到框選 —— demo 時要主動講清楚是「文字定位 + 原文引用」。

#### ✅ 查過沒問題的

- 現行 deck **沒有** pilot／traction 投影片（十頁：封面／問題／why now／解法／how it works／trust／money trail／團隊／市場商模／結尾）。舊版那句 "our pilot being a temple network of more than 20 halls" **已經拿掉了**，含不實陳述的舊檔也已退到 `competition/archive/` 並改名。
- p5 的準確率寫法是誠實的：「is being measured… ships with our artifact before judging」。
- AGM 頁面按鈕自己寫著 "**sample**"。
- `ai-usage-disclosure.md` 誠實說明目前用 Gemini、且「free tier 可能訓練 → 只用假資料」。

---

## 3. 優先順序（距離九月初審約四週）

**排序原則：先堵會被評審當場戳破的，再補會被扣分的，最後才是加分項。**

| # | 做什麼 | 花多久 | 為什麼是這個順位 |
|---|---|---|---|
| **1** | 🔴 **改 deck p9 那一行**（`.pptx` + `.pdf` 兩個檔都覆蓋） | 5 分鐘 | **唯一的取消資格風險。** 逐字稿在 `competition/deck/README.md`。只有 J 能做 |
| **2** | 🟢 **設那四個 `AI_MODEL_*` 環境變數** | 10 分鐘 | 把分流從「planned」變成「shipped」。Commercial Viability 佔 25%，而這是改設定不是寫程式（見 D3）。<br>⚠️ **2026-08-05 晚兩項更正**：①「貼四行就有 75.4%」**是錯的** —— 那個情境四個任務全是 OpenAI 模型，而 **OpenAI key 還沒開**；②**對外的數字已改成 73.4%**，因為 75.4% 把讀手寫那一格也換成了沒跑過 eval 的模型。**只用現有 Gemini key 能開到的是 66.6%。** 貼哪一段見 `.env.example` 與 `STATE.md` 第 3 節 ★ |
| **3** | 🔴 **Gemini 換付費帳號 + 設 spend limit** | 10 分鐘 | **總阻塞。** 免費層會拿輸入去訓練 → 一筆真實捐款人資料都不能進 → 沒有試點、沒有真實手寫樣本、八條證據一條都拿不到 |
| **4** | 🔴 **套 `20260803000000_ai_usage_cost.sql`** | 5 分鐘 | **整份清單裡唯一有物理時間下限的事** —— 要累積約兩週才有真數字。8/19 前不套，九月初審還是只能講「modelled」 |
| **5** | 拍 10 張真實手寫樣本 → `npm run eval` → 填 `eval/reports/SUMMARY.md` | 半天 | 一次打勾證據 1、3、5。現在那 93.6% 量的是印刷體，評審問一句「這些是真實手寫嗎」，數字連同 deck 一起沒了。前置是第 3 項 + 書面同意 |
| **6** | **決定 custody 的講法**：接 Supabase，或改口稿 | 半小時決定／1–2 天實作 | 見 D2。十月是現場 demo，這是最可能被當場問倒的一題 |
| **7** | 補 `competition/screenshots/`（現在整個資料夾只有一份 README） | 2 小時 | deck 和 demo 影片都要用。證據 4（deterministic money）**現在就能打勾** —— 跑 `npm test` 截圖即可 |
| **8** | AGM pack 接上真實資料 | 1 天 | 四大功能裡**唯一完全靠假資料**的一塊。若評審點名要看 AGM 流程，現在只能給 sample |
| **9** | 成員邀請／加入（P1-1） | 1 天 | 秘書和財政無法在同一個 org 協作 = 方案其實沒東西可賣 |
| **10** | 🎤 **語音 → 會議紀錄** | 1–2 天 | **加分項，不是缺口。** 排在證據之後：證據缺席會扣分，語音缺席不會 |

### 關於語音的判斷

**該做，但不是現在做。** 理由：

- **成本不構成阻礙** —— 兩小時會員大會錄音約 RM0.29（`docs/AI-API-选型与成本.md`）
- **工程量小** —— 既有管線加一個輸入型別，確認畫面與文件產生器一行都不用改
- **打中賽道標籤** —— T5 是 `MULTILINGUAL LLMS · CITIZEN AGENTS · CIVIC TECH`，而且直接服務 ESG 那 15% 的「合規包容性」：很多理事講得出流利的馬來語／華語／福建話／坦米爾語，但寫不出正式的 Bahasa Malaysia
- **十月半決賽是現場的** —— 當著評審的面對手機講一段混語會議內容，當場產出正式馬來文會議紀錄，那個畫面比任何投影片有力

但它**現在排第 10**，因為：交件文件從沒承諾過它（沒有失實風險），而前九項每一項都在堵一個**已經存在**的漏洞。

⚠️ 真的要做的時候守兩條線：**只做語音 → 會議紀錄，不碰錢**；**不准引用任何別人的語音準確率**（混語語碼轉換音訊沒有公開基準，跟手寫一樣只能自己量）。

---

## 4. 一句話總結

**能用的是「照片 → 抽取 → 確認 → BM 文件／收據／e-Invois .xlsx」這條主幹，而且錢的部分是真的寫進資料庫的。**
**最大的系統性缺口不是缺功能，是缺持久化** —— 11 張表沒有任何程式寫過，托管、日曆、登記冊都只活在一台瀏覽器裡（**章程 8/5 深夜已補上，是第一塊**）。
~~**最大的單一風險是 deck p9 那一行 85%**~~ → ✅ **2026-08-06 已改掉**，見 `competition/deck/README.md`。
**語音是還沒做的好點子，不是欠評審的債。**

---

## 5. 這一輪我沒能驗證的

`CLAUDE.md` 要求把「我看到的」和「我讀到的」分開寫。以下全部屬於**讀到的**：

- **migration 實際套用到第幾個** —— 沙盒連不到 Supabase。`STATE.md` 說 `20260730000000_receipt_series` 和 `20260803000000_ai_usage_cost` 還沒套；我只能確認**檔案存在**，不能確認**資料庫的狀態**。
- **eval 真正跑出什麼** —— 我讀的是 `eval/reports/SUMMARY.md` 的敘述，沒有跑 `npm run eval`。
- **測試與 build 現在還綠不綠** —— 我數到 22 個測試檔，但**沒有執行**。「278 測試全綠 / build 結束碼 0」是 `STATE.md` 記錄的 8/5 本機實測。
- **`AI_MODEL_*` 到底有沒有設** —— `.env.local` 依規定不可開啟。我看到的是 `.env.example` 裡那四行被註解掉；J 的 `.env.local` 或 Vercel 環境變數裡有沒有設，**只有 J 知道**。D3 的結論若要成立，請先自己確認一眼。
- **deck 的視覺呈現** —— 我讀的是 `.pptx` 的 XML 文字與 `.pdf` 的 pdftotext 輸出，沒有看到版面。

另：這一輪在沙盒裡 `git status` 產生了一個**無法刪除的 `.git/index.lock`**（mount 權限問題，`rm` 回 `Operation not permitted`）。若下次 commit 遇到 `Unable to create index.lock`，那是這個原因，不是卡住的 push —— 在本機終端機刪掉即可。
