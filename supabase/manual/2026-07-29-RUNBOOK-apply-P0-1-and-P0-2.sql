-- ###########################################################################
--
--  照著做就好 · 套用 P0-1 + P0-2
--  2026-07-29（當天稍晚修訂：PART 2 和 PART 3 對調，見下面「這一版改了什麼」）
--
--  這是一份「操作手冊」，不是一次貼完的東西。
--  照順序做，一段一段來。每一段都有：要跑什麼 → 該看到什麼 → 出事怎麼還原。
--
--  用哪裡跑：Supabase Dashboard → 左邊選單 SQL Editor → New query
--            貼上 → 右下角按 Run（或 Ctrl+Enter）
--
--  ⚠️ 兩個原則
--
--  1. 一次只做一個 PART。做完看到「該看到的」才做下一個。
--     中間有任何一步結果不對，就停下來，把畫面上的完整訊息貼給我，不要自己猜。
--
--  2. 每個 PART 最後都有「回退」。你是手貼的，沒有工具幫你記做過什麼，
--     回退段就是唯一的保險。真的出事，貼回退段，東西就變回原樣。
--
--
--  ─────────────────────────────────────────────────────────────────────────
--  這一版改了什麼（跟你昨晚看到的那一版比）
--  ─────────────────────────────────────────────────────────────────────────
--
--  A. 【順序對調】原本是「先上鎖（PART 2）→ 再裝後門（PART 3）」，
--     所以中間有一段時間是「鎖上了，但沒有人能加額度」，昨晚只能用
--     「不要停下來過夜」來提醒你。
--
--     現在改成 **先裝後門，再上鎖**。後門那一段完全不依賴鎖，鎖還沒上的
--     時候跑它一點副作用都沒有。這樣「鎖著又沒鑰匙」的空窗期就不存在了，
--     中途真的要停下來也沒關係。
--
--  B. 【多鎖一欄 parent_org_id】昨晚漏了。這一欄決定「誰看得到誰的資料」，
--     而且任何管理員都能從瀏覽器直接改。更糟的是資料庫裡走這棵樹的那個
--     函式沒有防迴圈 —— 只要有人把自己的組織設成自己的上層，**整個資料庫
--     每一次查詢都會無限迴圈**，全站當掉，而且當掉之後畫面上什麼都讀不到，
--     救不回來。程式碼從來不改這一欄，所以鎖起來零成本。
--     防迴圈那一段也一起補了（在 PART 3 的檔案裡）。
--
--  C. 【小修】後門在「資料庫裡一個組織都沒有」的時候會報一句看不懂的錯，
--     現在會直接說「你還沒有任何組織」。扣額度扣到變負數被夾成 0 的時候，
--     也會明講「有幾點沒扣到」，不再默默吞掉。
--
-- ###########################################################################



-- ===========================================================================
--  PART 0 · 先看一眼現在長什麼樣（只有讀，不會改任何東西）
-- ===========================================================================
--
--  為什麼要做：我連不到你的資料庫（沙盒白名單，實測回傳 000）。
--  所以我對資料庫現況的所有判斷都是「從程式碼推測的」。這一段是唯一能讓
--  我們兩個看到同一個事實的方法。做完把結果整段貼給我。
--
--  ↓↓↓ 整段複製貼上、Run ↓↓↓

select
  'donations 有沒有 client_id / source 這兩欄' as "檢查項目",
  coalesce(string_agg(column_name, ', '), '（兩欄都還沒有 → 正常，PART 1 就是要加）') as "結果"
from information_schema.columns
where table_schema = 'public'
  and table_name = 'donations'
  and column_name in ('client_id', 'source')

union all

select
  'orgs / receipts 上面現在有哪些鎖（trigger）',
  coalesce(string_agg(tgname, ', '), '（一個都沒有 → 正常，兩個 migration 都還沒套）')
from pg_trigger
where tgrelid in ('public.orgs'::regclass, 'public.receipts'::regclass)
  and not tgisinternal

union all

select
  'receipts 表的權限政策',
  coalesce(string_agg(policyname, ', '), '（沒有）')
from pg_policies
where schemaname = 'public' and tablename = 'receipts'

union all

select
  'remittance_batches.status 允許哪些值',
  coalesce(string_agg(pg_get_constraintdef(oid), ' | '), '（沒有限制）')
from pg_constraint
where conname = 'remittance_batches_status_check'

union all

select
  '組織的上下層關係現在有沒有迴圈',
  coalesce(
    (select string_agg(id::text, ', ') from orgs where parent_org_id = id),
    '（沒有自己指向自己的 → 正常）')

union all

select
  '目前有幾個組織 / 幾張收據 / 幾筆捐款',
  (select count(*)::text from orgs) || ' 個組織, ' ||
  (select count(*)::text from receipts) || ' 張收據, ' ||
  (select count(*)::text from donations) || ' 筆捐款';


--  該看到什麼：六列。如果
--    · 「有沒有 client_id」顯示「兩欄都還沒有」
--    · 「有哪些鎖」顯示「一個都沒有」
--    · 「有沒有迴圈」顯示「正常」
--  就跟我推測的一樣，繼續 PART 1。
--
--  如果不一樣（例如已經有 trigger 了、或者查出迴圈）→ 停下來先告訴我。
--  表示有人套過一部分、或者資料已經壞了，我要重新判斷。
--
--  ⚠️ 如果「幾個組織」是 0：PART 1、2、3 都還是照跑，只是 PART 2 和 PART 3
--     裡面那幾個「拿第一個組織來試」的測試會告訴你「沒有組織可以測」。
--     那是正常的，不是失敗。等你建了第一個組織再回來補跑那幾段。
--
--  回退：不用。這段沒有改任何東西。



-- ===========================================================================
--  PART 1 · 收據鎖（P0-2）
-- ===========================================================================
--
--  這一段修什麼（白話）：
--    · 加 donations.client_id —— 讓「開收據」按第二次時，資料庫認得出
--      這些是同一批，不會開出第二套號碼、不會重複算錢
--    · 加 donations.source —— 標記這筆是 AI 從照片讀的、還是人手打的（給稽核看）
--    · 收據號碼從此改不動、刪不掉（CLAUDE.md 硬規則 2）
--    · 現金交接的狀態允許 'settled' —— 不修的話第一次真的交接會當掉
--
--  這一段全部是「加東西」，不刪任何資料。已經有資料的資料庫跑起來是安全的。
--
--  怎麼做：
--    1. 用記事本打開這個檔案：
--         C:\dev\minit\supabase\migrations\20260726000000_client_id_and_receipt_lock.sql
--    2. Ctrl+A 全選 → Ctrl+C
--    3. 貼進 SQL Editor 的 New query → Run
--
--    ⚠️ 一定要「整個檔案」一起貼。裡面有 do $$ ... $$; 區塊，
--       拆開貼會壞掉。
--
--  跑完之後，貼下面這段驗證：
--
--  ↓↓↓ 驗證 PART 1 ↓↓↓

select
  '1. client_id 和 source 兩欄都在嗎' as "檢查",
  case when count(*) = 2 then '✅ 通過（' || string_agg(column_name, ', ') || '）'
       else '❌ 失敗 —— 只找到 ' || count(*)::text || ' 欄，應該要 2 欄' end as "結果"
from information_schema.columns
where table_schema = 'public' and table_name = 'donations'
  and column_name in ('client_id', 'source')

union all

select
  '2. 三個規則都建好了嗎',
  case when count(*) = 3 then '✅ 通過'
       else '❌ 失敗 —— 只找到 ' || count(*)::text || ' 個，應該要 3 個：'
            || coalesce(string_agg(conname, ', '), '（無）') end
from pg_constraint
where conname in ('donations_org_client_uniq', 'donations_source_check',
                  'remittance_batches_status_check')

union all

select
  '3. 收據號碼鎖住了嗎',
  case when count(*) = 1 then '✅ 通過'
       else '❌ 失敗 —— 找不到 receipts_identity_immutable 這個鎖' end
from pg_trigger
where tgrelid = 'public.receipts'::regclass
  and tgname = 'receipts_identity_immutable'

union all

select
  '4. 刪收據的權限拿掉了嗎',
  case when count(*) filter (where policyname = 'receipts_delete') = 0
       then '✅ 通過（剩下：' || string_agg(policyname, ', ') || '）'
       else '❌ 失敗 —— receipts_delete 還在，收據還是刪得掉' end
from pg_policies
where schemaname = 'public' and tablename = 'receipts';


--  該看到什麼：四列全部 ✅。
--  任何一列 ❌ → 停下來，整個結果貼給我。
--
--
--  ↓↓↓ PART 1 的回退（只有出事才跑）↓↓↓
--
--  注意：回退只拿掉「鎖」，不刪 client_id / source 這兩欄。
--  刪欄位會連同裡面的資料一起消失，而多兩個空欄位完全無害。
--
--     drop trigger if exists receipts_identity_immutable on public.receipts;
--     drop function if exists public.receipts_identity_is_immutable();
--     alter table donations drop constraint if exists donations_org_client_uniq;
--
--  （被刪掉的 receipts_delete 政策要救回來的話告訴我，那要看原本的定義。
--    但你八成不需要 —— 程式碼裡沒有任何地方會刪收據，我確認過了。）



-- ===========================================================================
--  PART 2 · 先把你的後門裝好（原本的 PART 3）
-- ===========================================================================
--
--  ⚠️ 這一段以前排在鎖的後面。現在排在前面，這是刻意的：
--     **先配鑰匙，再換鎖。** 這樣就不會有「換好鎖才發現鑰匙沒配」的那段空窗。
--     這一段跑完，鎖還沒上，一切照舊 —— 你隨時可以停下來去睡覺。
--
--  為什麼一定要有：
--    PART 3 跑完，SQL Editor 是用 postgres 身分執行的，不是 service role，
--    所以連你自己都改不動額度。現在又還沒有管理後台。
--    結果就是：客戶付錢了，沒有人有辦法幫他加額度。
--    這一段就是把那扇門正式留給你，而且只留給你。
--
--  它做了什麼：
--    · 建一個 minit_admin 的專用區域。Supabase 不會把這個區域對外開放，
--      所以瀏覽器連知道它存在都做不到
--    · 兩個函式：加額度、設稅務狀態
--    · 把執行權限從「所有人」收回來 —— 這一步才是真正的保護。
--      Postgres 預設會把新函式的執行權開給所有人，不收回的話等於白鎖
--
--  怎麼做：
--    1. 記事本打開：
--         C:\dev\minit\supabase\migrations\20260729000000_admin_grant_ai_credits.sql
--    2. Ctrl+A → Ctrl+C → 貼進 SQL Editor → Run
--
--  ↓↓↓ 驗證 PART 2 ↓↓↓

select
  '1. 兩個管理函式都在嗎' as "檢查",
  case when count(*) = 2 then '✅ 通過（' || string_agg(proname, ', ') || '）'
       else '❌ 失敗 —— 只找到 ' || count(*)::text || ' 個' end as "結果"
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'minit_admin'

union all

select
  '2. 一般使用者叫不動它們吧',
  case when not has_function_privilege('authenticated',
              'minit_admin.grant_ai_credits(bigint,integer)', 'execute')
        and not has_function_privilege('anon',
              'minit_admin.grant_ai_credits(bigint,integer)', 'execute')
       then '✅ 通過（登入使用者和訪客都叫不動）'
       else '❌ 失敗 —— 有人叫得動，這是嚴重漏洞，立刻告訴 Claude' end;


--  ↓↓↓ 驗證 PART 2 · 第三項：後門真的打得開嗎 ↓↓↓
--
--  這是你提的那一項，也是整份手冊最重要的一次驗證：
--  「我本人透過 SQL Editor 還是能加額度」。
--  下面加 10 點，再減 10 點，所以跑完額度跟原本一模一樣。
--
--  ⚠️ 現在鎖還沒上，所以這一段「本來就會過」—— 它證明的是**函式本身能用**。
--     真正的考驗在 PART 3 跑完之後，那時候要**再跑一次這兩行**。
--     手冊在 PART 3 的最後會叫你回來跑。

select * from minit_admin.grant_ai_credits((select min(id) from orgs), 10);
select * from minit_admin.grant_ai_credits((select min(id) from orgs), -10);


--  該看到什麼：兩個結果表格。
--    第一個：credits_before = X，credits_after = X + 10
--    第二個：credits_before = X + 10，credits_after = X
--  額度回到原點。
--
--    如果報「org_id is NULL —— 你還沒有任何組織」→ 正常，不是失敗。
--    先去 /orgs 建一個組織，或者直接繼續 PART 3，等有組織了再回來跑。
--
--    如果報別的錯 → 停下來，訊息貼給我。**先不要跑 PART 3。**
--    現在停下來是安全的，鎖還沒上，什麼都沒變。
--
--
--  ↓↓↓ PART 2 的回退 ↓↓↓
--
--     drop function if exists minit_admin.grant_ai_credits(bigint, integer);
--     drop function if exists minit_admin.set_tax_exempt_status(bigint, text);
--     drop schema if exists minit_admin;
--
--  ⚠️ PART 3 跑過之後就不要單獨退這一段了 —— 那會變成「鎖著又沒鑰匙」。
--     那個狀況要退就兩段一起退。



-- ===========================================================================
--  PART 3 · 額度、稅務狀態、上下層關係的鎖（P0-1）（原本的 PART 2）
-- ===========================================================================
--
--  這一段修什麼（白話）：
--
--    (1) 現在任何一個組織的管理員，可以把自己的 AI 額度改成 999999，
--        或把自己標成免稅（於是每張收據都印上抵稅字樣）。
--
--    (2) 【昨晚漏掉的】他也可以改「我的上層是誰」這一欄。這個更嚴重：
--        這一欄決定誰看得到誰的資料，而且只要有人把自己設成自己的上層，
--        資料庫走這棵樹的時候就會無限繞圈 —— **每一次查詢都會，整個 app
--        直接停擺**，而且停擺之後畫面上讀不到任何東西，只能進資料庫手改。
--        這一段把這一欄也鎖起來，同時把走樹的那個函式換成會自己踩煞車的版本。
--
--    把畫面上的輸入框拿掉沒有用 —— 瀏覽器可以直接打資料庫。
--    這一段在「資料庫那一層」擋住，那才是真的擋住。
--
--  怎麼做：
--    1. 記事本打開：
--         C:\dev\minit\supabase\migrations\20260728000000_lock_org_privileged_columns.sql
--    2. Ctrl+A → Ctrl+C → 貼進 SQL Editor → Run
--
--    （這個檔案我改過兩次：H1/H2/H3 是原本補的三個問題，H4/H5 是今天補的
--      parent_org_id 和防迴圈。檔案開頭都有說明。）
--
--  ↓↓↓ 驗證 PART 3 · 第一、二項 ↓↓↓

select
  '1. 鎖建立了嗎' as "檢查",
  case when count(*) = 1 then '✅ 通過'
       else '❌ 失敗 —— 找不到 orgs_privileged_columns_immutable' end as "結果"
from pg_trigger
where tgrelid = 'public.orgs'::regclass
  and tgname = 'orgs_privileged_columns_immutable'

union all

select
  '2. 走樹的函式換成防迴圈版本了嗎',
  case when (select p.prosrc
               from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'org_descendants'
              limit 1) like '%walked%'
       then '✅ 通過'
       else '❌ 失敗 —— 還是舊版，迴圈會把資料庫卡死' end;


--  ↓↓↓ 驗證 PART 3 · 第三項：鎖真的會咬人嗎 ↓↓↓
--
--  這段「應該要失敗」。看到 ✅ 才是對的。
--  整段包在 do $$ ... $$ 裡面，所以它會自己抓住錯誤、印出白話結果，
--  不會真的改到你的資料。

do $$
declare
  v_id bigint;
  v_credits_ok boolean := false;
  v_parent_ok boolean := false;
begin
  select min(id) into v_id from orgs;
  if v_id is null then
    raise notice '⚠️ 資料庫裡一個組織都沒有，這兩項測不了。先去 /orgs 建一個再回來。';
    return;
  end if;

  -- (a) 自助加額度
  begin
    update orgs set extra_credits = extra_credits + 99999 where id = v_id;
  exception when others then
    v_credits_ok := true;
    raise notice '✅ 通過 —— 資料庫擋下了自助加額度。它說：%', sqlerrm;
  end;
  if not v_credits_ok then
    raise notice '❌ 失敗 —— 額度被改掉了，鎖沒有生效。不要繼續，先告訴 Claude。';
  end if;

  -- (b) 把自己設成自己的上層（就是那個會把資料庫卡死的動作）
  begin
    update orgs set parent_org_id = v_id where id = v_id;
  exception when others then
    v_parent_ok := true;
    raise notice '✅ 通過 —— 資料庫擋下了改上下層關係。它說：%', sqlerrm;
  end;
  if not v_parent_ok then
    raise notice '❌ 失敗 —— parent_org_id 還改得動，資料庫還是能被卡死。告訴 Claude。';
  end if;

  -- 不論結果如何都還原，這個 do 區塊不會留下任何改動。
  raise exception using message = '（測試結束，以上改動已全部取消）';
exception when others then
  if sqlerrm <> '（測試結束，以上改動已全部取消）' then raise; end if;
end;
$$;


--  該看到什麼：訊息區（Messages / Notices）出現兩個 ✅。
--  最後那句「（測試結束，以上改動已全部取消）」是正常的，不是錯誤。
--
--
--  ↓↓↓ 驗證 PART 3 · 第四項：後門還打得開嗎（🔴 這一項最重要）↓↓↓
--
--  鎖上了之後，你本人還加不加得動額度。跑不過就代表你被關在門外了。

select * from minit_admin.grant_ai_credits((select min(id) from orgs), 10);
select * from minit_admin.grant_ai_credits((select min(id) from orgs), -10);


--  該看到什麼：跟 PART 2 一樣，加 10 再減 10，額度回到原點。
--
--    如果這裡報錯（而 PART 2 的時候是好的）→ 是鎖和後門互相打架。
--    立刻跑下面 PART 3 的回退把鎖拿掉，然後把錯誤訊息貼給我。
--    不要留在「鎖著又進不去」的狀態過夜。
--
--
--  ↓↓↓ PART 3 的回退 ↓↓↓
--
--     drop trigger if exists orgs_privileged_columns_immutable on public.orgs;
--     drop function if exists public.orgs_privileged_columns_immutable();
--
--  跑完之後回到「任何管理員都能改自己額度」的狀態，也就是現在的狀態。
--  這是刻意的取捨：不能用的 app 比一個你知道、而且在盯著的漏洞更糟。
--  原因查清楚就趕快套回去。
--
--  ⚠️ 防迴圈那個函式（org_descendants）**不要退**。它跟舊版的行為一模一樣，
--     只是多了「不要無限繞圈」。退掉它沒有任何好處。



-- ===========================================================================
--  PART 4 · 以後要加額度，照抄這一段
-- ===========================================================================
--
--  存起來。這是全部做完之後，你唯一需要記得的東西。
--
--  第一步：查出組織的 id（id 是數字，不是名字）

select id, name, is_demo, monthly_free_quota, extra_credits, tax_exempt_status
from orgs
order by id;


--  第二步：加額度。把下面那兩個數字換掉就好。
--
--     select * from minit_admin.grant_ai_credits(7, 500);
--                                                ↑   ↑
--                                                │   └─ 要「加」多少點
--                                                │      （是增減，不是新總數）
--                                                │      減的話寫負數：-50
--                                                └───── 上面查到的組織 id
--
--  跑完會回一個表格，告訴你「加之前是多少、加之後是多少」。
--  看那個表格確認，不要憑感覺。
--
--  減額度減過頭（例如餘額只有 5 卻打 -500）不會報錯，會停在 0，
--  但訊息區會出現一行 ⚠️ 告訴你有幾點沒扣到。看到那行就代表你少扣了。
--
--
--  ⚠️ 為什麼是「增減」不是「設定新總數」：
--     你查到餘額 100，想給他 500，於是打「設成 600」。
--     但你查完到你按 Run 之間，他跑了 3 次 AI，餘額其實是 97。
--     設成 600 = 你不知不覺送了他 3 點。金額小，但帳就是從這種地方開始爛的。
--     寫「+500」永遠不會有這個問題。
--
--
--  第三步（很少用）：設稅務狀態
--
--     select * from minit_admin.set_tax_exempt_status(7, 's44_6');
--
--     可以填的值只有三個：'none'、's44_6'、'pure_religious'
--
--  🛑 設成 's44_6' 之前先讀 CLAUDE.md 硬規則 3。
--     這會讓那個組織「每一張」收據都印上所得稅可扣除的字樣。
--     那是一句關於馬來西亞稅法的聲明，必須有你親眼看過、而且存檔的
--     核准信作為依據。填錯的後果不是 bug，是那個社團拿一疊法律上
--     不成立的收據去給捐款人報稅。
--
--
--  第四步（以後真的要調整分會的上下層關係時）：
--
--     PART 3 之後 parent_org_id 也鎖住了，所以要在一個交易裡開後門：
--
--       begin;
--         select set_config('minit.allow_privileged_org_update', 'on', true);
--         update orgs set parent_org_id = <新的上層 id> where id = <要搬的 id>;
--         -- 搬完先確認沒有繞回自己身上（應該要秒回，不能卡住）：
--         select public.org_descendants(<最上層的 id>);
--       commit;
--
--     ⚠️ 搬之前先確定新的上層**不是**這個組織自己的下層，否則會做出一個圈。
--        函式現在不會卡死了，但那棵樹的權限關係還是會錯。
--
-- ###########################################################################
--  手冊結束
-- ###########################################################################
