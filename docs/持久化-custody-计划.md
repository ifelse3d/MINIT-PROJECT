# 托管（custody）持久化 —— 实作计划，等 J 批准

> **状态：未实作。这是计划，不是纪录。** 写于 2026-08-05（Cowork 沙盒）。
> 章程持久化同一轮**已经做完并 commit**（`src/app/constitution/actions.ts`）；
> 托管**刻意没做**，原因在第 1 节。
> 档名固定，之后更新覆盖它，不要新增带日期的版本（`CLAUDE.md` 文件规则）。

---

## 1. 为什么这一块当时没有顺手做掉

托管是**更值得做**的一块 —— deck p7 画着 "HQ custody view"，one-pager 也写
"tracks custody of cash from collector to HQ"。把它接上 Supabase，deck 的宣称就变成真的。

**但它做不到「今天写完、今天能跑」，因为它卡在两个 schema 问题上：**

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| **1** | **`remittance_batches.status` 的 check 约束对不上程式码** | init migration 写的是 `check (status in ('pending','confirmed'))`；`src/lib/custody.ts` 用的是 `pending` / `settled` | **写 `settled` 会被资料库挡下来。** 修正在 `20260726000000_client_id_and_receipt_lock.sql`（第 106–112 行），但那支 migration **就是 STATE.md 第 4 节的 P0-2，还没套用** |
| **2** | **收款人的型别对不上，而且没有栏位可放** | 表上是 `collector_member_id bigint references members_roles(id)`；TS 的 `RemittanceBatch.collector` 是**自由文字的人名**（来自捐款簿照片或登入者） | 一个从照片读出来的收款人名字**没有 `members_roles` 列可以指向**。需要**一支还不存在的 migration** 加 `collector_name text` |

再加上两条硬规矩：

- **D8：migration 一律由 J 手动执行**，Claude 只跑验证段。
- **沙盒连不到 Supabase**，所以「资料库现在到底套到第几个 migration」我**只能读你的报告，不是看到的**。

**结论：现在把程式码写下去，等于交出一段「看起来做完了、实际上一定失败」的功能。**
这正是这个专案一再警告的那种陷阱，所以停在这里，写成计划交给你。

---

## 2. 做之前必须先确认的两件事（只有 J 能做）

**这两件没确认之前，不要开始写程式。**

1. **`20260726000000_client_id_and_receipt_lock.sql` 到底套用了没有？**
   在 Supabase SQL Editor 跑这段（纯查询，不改任何东西）：

   ```sql
   select pg_get_constraintdef(oid) as def
   from pg_constraint
   where conname = 'remittance_batches_status_check';
   ```

   - 回 `CHECK (status = ANY (ARRAY['pending','settled']))` → **已套用**，第 3 节的第 1 步可以跳过
   - 回 `...'pending','confirmed'...` → **未套用**，必须先套
   - 回空 → 约束不存在，把结果贴给 Claude 再判断

   ⚠️ **`DEPLOY.md` 的 #5 必须在 #6 之前** —— 套这支之前先确认顺序。

2. **分会是各自一套收据号码，还是共用总部的？**（`STATE.md` 第 5 节第 2 题，仍未决）
   这题会决定托管批次是挂在分会 `org_id` 还是 root org 上。**事后改很痛**，
   所以在写 `handOverToHq()` 之前就要有答案。

---

## 3. 实作顺序（照这个顺序，不要跳）

### 第 1 步 · schema（J 手动执行，Claude 不碰）

先套 `20260726000000_client_id_and_receipt_lock.sql`（若第 2 节确认为未套用）。

再新增一支 migration，**内容只有加栏位，纯附加、可重跑**：

```sql
-- 20260806000000_remittance_collector_name.sql
-- 收款人目前是从捐款簿照片读出来的自由文字人名，不一定对应到任何 members_roles 列。
-- 保留 collector_member_id（将来成员制度做起来之后用），另外加一个文字栏位放现在真正有的东西。
alter table remittance_batches
  add column if not exists collector_name text;

-- 批次是「谁在什么时候交了多少钱给总部」，查询一定按 org + 时间。
create index if not exists idx_remittance_batches_org_handed
  on remittance_batches (org_id, handed_over_at desc);
```

⚠️ **`receipt_ids` 那一栏的既有规矩不要动**：init migration 的注解写明
「Postgres 不能对阵列元素做外键，所以 `custody.ts` 必须是这一栏**唯一的写入者**，
而且 `total_cents` **一定要从活的 receipt 列重新算**，不可以只信存下来的阵列」。
新的 server action 必须继续遵守这一条。

### 第 2 步 · server actions（Claude 可以做）

新增 `src/app/money/custody-actions.ts`，**照 `src/app/constitution/actions.ts` 已经建立的样板**
（session user → active org → `auditor_readonly` 挡下 → server 端验型别 → 写入）：

- `handOverToHq({ collector })`
  → 用 `createRemittanceBatch()`（纯函式，已有测试）算出批次
  → insert `remittance_batches`（`status='pending'`、`collector_name`、`handed_over_at`）
  → update 那批 `donations.custody_status = 'pending_remittance'`
- `confirmRemittanceReceived({ batchId })`
  → 用 `confirmRemittanceBatch()`
  → update batch `status='settled'`、`confirmed_by_hq`（**用 `getDocumentIdentity()` 取真人名，
    不要再用现在写死的 `"HQ Admin (Demo)"`** —— Hard Rule 8）
  → update donations → `settled`
- `loadCustodyBatches()` → 读回该 org 的批次

⚠️ **`total_cents` 必须在 server 端从 `receipts` 重新算**，不要接受浏览器送来的金额（Hard Rule 2）。

### 第 3 步 · 接线（Claude 可以做）

`src/app/money/money-review.tsx`：`batches` 目前是
`usePersistentState<RemittanceBatch[]>("minit:money:batches:v1", [])`（第 257 行）。
**照章程那一块的作法**：server 读回来当 seed 传进去，localStorage 留着当本机快取，
确认动作走 server action。

⚠️ **`commitCustody()` / `donationsRef` / `batchesRef` 那一套双击防护不要拆**
（第 587–626 行的注解写了为什么：两次快点会让 HQ 看到两倍的钱）。
server action 要**另外**自己挡一次重复送出 —— ref 只挡得住同一个浏览器。

### 第 4 步 · 测试

- `custody.ts` 的纯函式已经有测试，不用重写
- 新增：金额从 receipt 列重算、重复 hand-over 只产生一个批次、`auditor_readonly` 被挡下
- `npm test` 与 `npm run build` 要全绿

---

## 4. 风险

| 风险 | 说明 |
|---|---|
| 🔴 **这一块碰的是钱** | 章程写坏只是资料不见；托管写坏会让**帐目对不上**。这是唯一一块建议先在 staging org 跑过再上的 |
| 🟡 **两个写入者** | 迁移期间 localStorage 和资料库同时存在，**冲突时以资料库为准**，而且要能解释「为什么我手机上看到的跟总部不一样」 |
| 🟡 **既有的 localStorage 批次怎么办** | 已经在用的装置上有旧批次。要嘛开机时往上补（像章程那样），要嘛明讲不搬。**不要默默丢掉** |
| 🟢 时程 | 扣掉 migration 等待，程式大约 1 天 |

---

## 5. 做完之后可以改的宣称

接上之后，`competition/deck/README.md` 里 p7 那一条**待改清单可以直接删掉**，
口稿也不必再讲「per-device pilot build」——
**「分会出纳在自己手机上记，总部在自己电脑上看得到」当场就能 demo。**

十月半决赛是现场的，这是最可能被当场问倒的一题（见 `docs/功能盤點-計劃vs實作.md` D2）。
