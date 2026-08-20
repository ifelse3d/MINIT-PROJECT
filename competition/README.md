# Competition Pack — MAIC Nexus Challenge 2026, Track T5

**更新於 2026-08-05。** 上一版是為 7/14 目標寫的,那個日期和 RM150 早鳥都已經過了。

**[YOU]** = 需要人做的(帳號、付款、決定、找人)。
有來源的已驗證事實在 `competition-facts.md`。

---

## ✅ 報名:已完成

**J 於 2026-08-05 確認已報名。** 這一項不再是阻塞事項。

費用級距留作記錄(以及萬一要補繳／補件時對照):

| 日期 | 費用 |
|---|---|
| ~~7/15 前~~ | ~~RM 150~~ 已過 |
| **到 8/8 為止** | **RM 250** |
| **8/9 起** | **RM 500** |
| **8/31 23:59 MYT** | **硬截止**,且 300 隊額滿即止 |

⚠️ 檔案裡看不出來、要你自己確認的兩件:**報名費是否已繳**(繳費時間點決定費率,不是報名時間點),
以及**隊伍名單是否已交**。

---

## 必交的東西(portal: maicnexus.com/en/application)

| # | 交什麼 | 必要? | 這個資料夾裡的來源 |
|---|---|---|---|
| 1 | Pitch deck(**PDF**,英文) | ✅ 申請時 | **`deck/Minit-Pitch-Deck-CURRENT.pdf`** ← 只有這一份 |
| 2 | Written project summary(英文) | ✅ 申請時 | `summary-onepager.md` |
| 3 | **AI usage disclosure** | ✅ 申請時 | `ai-usage-disclosure.md` |
| 4 | Demo video URL | 可選,評審前都能補 | `demo-video-script.md`(八月錄) |
| 5 | Artifact link(live URL / repo) | 可選,評審前都能補 | Phase 7 Vercel。評審期間必須**公開可存取**;repo 要 ≥3 commits 跨 ≥2 天(已滿足) |

⚠️ **第 1–3 項現在指的都是修正後的版本。** 2026-08-05 之前,`ai-usage-disclosure.md`
和 `qa-drill.md` 這兩個乾淨檔名底下放的是**含不實陳述的舊版**,修正版反而叫
`-REVISED-2026-07-29.md`。已經對調,舊版在 `archive/` 並且改了名。
**§12 把 Material misrepresentation 列為取消資格事由** —— 交件前確認你拿的是上層的檔案,不是 archive 裡的。

沒有公佈頁數／字數／影片長度上限 —— **[YOU]** 寄信問 support@maicnexus.com。

---

## Only-you checklist [YOU]

**報名相關**

- [x] maicnexus.com 開帳號 —— 已報名(J 確認,2026-08-05)
- [ ] **繳報名費(8/8 前 RM 250,之後 RM 500)** —— 若報名時已一併繳清,自行勾掉
- [ ] 隊伍名單:1–5 人,**至少一位 MyKad 持有者**,沒有人同時在別隊
- [ ] 隊員姓名、角色、照片 + LinkedIn(選填,但很便宜的可信度)
- [ ] 寄信問 deck／summary／video 的長度上限

**上台前必須有答案**

- [ ] **法律實體是誰**(個人 or Sdn Bhd)—— `legal/` 要填,也決定責任歸屬
- [ ] **定價方案定案** —— Commercial Viability 佔 25%,不能是 placeholder。
      ⚠️ `business-model.md` 的價格表(RM200/社團)是**過期的**,和 deck／summary 的
      RM39/99/188 對不上。以 `summary-onepager.md` 為準,那張表要不要留由你決定
- [ ] 🔴 **改 deck p9 那一行**(五分鐘,只有你能做)—— 把「~85% gross margin」改成
      **「Modelled … 85% … Measured figures from August」**。所有文字檔 8/5 已經改完,
      **deck 是二進位檔改不了**。逐字稿在 `deck/README.md` 開頭,直接照抄
- [ ] **Q17「你們團隊為什麼做得起來」** —— 有社團／廟宇理事會經驗的話,那句是全場最重要的一句
- [ ] 試點若要具名,拿到**書面**同意;沒有就照 `qa-drill.md` Q3 誠實講「目前 0 個」

**證據(見 `evidence-tracker.md`,8 條現在 0 條打勾)**

- [ ] 真實手寫混語筆記照片(2–3 張)
- [ ] `screenshot-shotlist.md` 全部拍完進 `screenshots/`(現在是空的)
- [ ] `npm run eval` 的**摘要**報告進 repo(`eval/reports/SUMMARY.md`,只放聚合數字)
- [ ] Vercel 公開 URL
- [ ] AI 供應商 spend limit

---

## 之後的時程

- **9 月** — 線上初審
- **10 月** — 半決賽 Demo Day(前 10 名,KL,**現場**)→ `qa-drill.md` 要練到不看稿
- **11 月** — 總決賽,KL

---

## 資料夾地圖

| 檔案／資料夾 | 是什麼 |
|---|---|
| `competition-facts.md` | 已驗證的規則、評分表、獎金、日期(附來源) |
| `deck/` | **`Minit-Pitch-Deck-CURRENT.pdf`/`.pptx` 是唯一要交的那份**。`deck/README.md` 記錄了怎麼判定的 |
| `deck-outline.md` | 逐頁 deck 規劃,對應評分表 |
| `summary-onepager.md` | 書面摘要(定稿版) |
| `ai-usage-disclosure.md` | 必交的 AI 使用聲明(修正版) |
| `qa-drill.md` | **唯一一份**評審問答演練,17 題 |
| `narrative-and-moat.md` | 敘事、護城河、ESG、Commercial 四段分析 |
| `evidence-tracker.md` | 8 條 champion-grade 證據與狀態 |
| `screenshot-shotlist.md` + `screenshots/` | deck／demo 圖 |
| `demo-video-script.md` | 八月影片腳本 |
| `business-model.md` | 商業模式 |
| `archive/` | 舊版本。**不要從這裡拿東西交件** —— 有兩份含不實陳述 |

**規則:一個用途一個固定檔名,舊的進 `archive/`。不要再產生 `_v5`、`-FINAL`、`-REVISED`。**
