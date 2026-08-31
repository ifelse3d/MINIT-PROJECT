@echo off
REM ============================================================
REM  SALIN MIGRATION KE CLIPBOARD / COPY MIGRATION TO CLIPBOARD
REM
REM  Klik dua kali. Pilih nombor. Ia salin fail SQL itu terus ke
REM  clipboard, jadi anda tak payah cari fail atau buka Notepad.
REM
REM  Double-click. Pick a number. It copies that SQL file straight
REM  to your clipboard, so you never have to find the file or open
REM  Notepad.
REM
REM  FAIL INI TIDAK MENJALANKAN APA-APA. Ia hanya menyalin.
REM  Anda yang tekan RUN di Supabase.
REM  THIS FILE RUNS NOTHING. It only copies. You are the one who
REM  presses RUN in Supabase.
REM
REM  2026-08-21 (minit-v2): dulu fail ini menunjuk kepada SATU
REM  migration sahaja. Pangkalan data baharu bermula kosong, jadi
REM  ke-13 fail perlu dijalankan mengikut turutan nama fail.
REM  Sekarang ia menyenaraikan semua 13.
REM  This used to point at ONE migration. The new database starts
REM  empty, so all 13 must be run in filename order. It now lists
REM  all 13.
REM
REM  2026-08-22: No.14 ditambah (cari_minit) - jumlah 14.
REM  2026-08-22: No.14 added (cari_minit) - 14 in total.
REM  2026-08-23: No.15 ditambah (nombor resit lepas 9999) - jumlah 15.
REM  2026-08-23: No.15 added (receipt numbers past 9999) - 15 in total.
REM ============================================================
cd /d "%~dp0"
chcp 65001 >nul

:menu
cls
echo.
echo   ==============================================================
echo    MIGRATION - salin satu, satu / copy one at a time
echo   ==============================================================
echo.
echo    Jalankan MENGIKUT TURUTAN. Tunggu "Success" sebelum yang
echo    seterusnya. Run IN ORDER. Wait for "Success" before the next.
echo.
echo     1.  20260708000000  init - semua jadual asas / all base tables
echo     2.  20260719000000  auth + RLS (pengasingan pertubuhan)
echo     3.  20260719150000  kuota AI / AI quota
echo     4.  20260726000000  kunci resit / receipt lock  (P0-2)
echo     5.  20260728000000  kunci lajur org / lock org columns  (P0-1)
echo     6.  20260729000000  admin grant AI credits
echo     7.  20260730000000  nombor siri resit / receipt series
echo     8.  20260803000000  kos AI / AI cost columns
echo     9.  20260819000000  glosari / org glossary
echo    10.  20260819010000  nama rasmi AJK / committee name_official
echo    11.  20260820000000  jenis mesyuarat + simpan draf
echo    12.  20260821000000  ai_usage.refunded_at
echo    13.  20260822000000  carian minit + pgvector
echo         ^^^ SEBELUM No.13: buka extension "vector" dahulu
echo             BEFORE No.13: enable the "vector" extension first
echo             (Dashboard - Database - Extensions - cari "vector")
echo    14.  20260823000000  cari_minit() - fungsi carian / the search function
echo         ^^^ 2026-08-22: No.13 buat JADUAL sahaja. Tanpa No.14 tiada
echo             pintu masuk - kod tak boleh panggil jadual itu langsung.
echo             No.13 makes the TABLE only. Without No.14 there is no door:
echo             the code cannot call that table at all.
echo    15.  20260824000000  nombor resit lepas 9999 / receipt numbers past 9999
echo    16.  20260825000000  kalendar + serahan tunai + tanda siap
echo         calendar + cash hand-over + tick a deadline done
echo    17.  20260826000000  kumpulan ahli / member groups
echo    18.  20260827000000  nama pemungut pada derma / collector name on donations
echo    19.  20260828000000  kunci anti-duplikasi minit / minutes anti-duplicate key
echo    20.  20260829000000  suis e-Invois pilihan / optional e-Invois switch
echo    21.  20260830000000  pelan langganan / subscription plan column
echo    22.  20260831000000  jadual ralat / error log table
echo    23.  20260901000000  kuota percubaan 15 / trial quota 15 per month
echo         ^^^ Dalam fail itu ada bahagian PILIHAN (dikomen) untuk org lama.
echo             The file has an OPTIONAL commented section for existing orgs.
echo    24.  20260902000000  kod jemputan + jenis pertubuhan / invites + org type
echo    25.  20260903000000  FINAL SPRINT - derma barangan + claim + feedback
echo         + ai_usage.user_id + platform_admins (semua dalam SATU fail)
echo         in-kind donations + claims + feedback + per-user usage
echo         + platform admins (all in ONE file)
echo    26.  20260904000000  cara bayaran tunai/pindahan + bukti pindahan
echo         payment method cash/transfer + transfer proof column
echo    27.  20260905000000  masa rekod + butiran batch serahan tunai
echo         record times + cash hand-over batch details (32 号单)
echo    28.  20260906000000  link batch-derma + glosari 3 bahasa + templat
echo         hand-over row links + trilingual glossary + templates
echo    29.  20260907000000  rekod terus masuk DB + resit v8 (baiki serahan berganda)
echo         record-to-DB + receipts v8 (fixes the double hand-over bug)
echo    30.  20260908000000  nama minit + log pindaan + gambar asal
echo         minutes title + edit log + source-photo links (28/8 review)
echo    31.  20260909000000  pagar pelan percuma / the free fence (D44)
echo         5 dokumen, 20 resit, 20 muka surat, 3 muat turun bersih
echo         + org 15/58/91 jadi Standard (org anda sendiri / your own orgs)
echo    32.  20260910000000  nota + gelaran AJK / roster note + honorific (51 B-6/B-7)
echo         bezakan dua orang sama nama + rekod gelaran (讲师, Dato', Ustaz...)
echo    33.  20260911000000  draf minit di awan / cloud minutes drafts (51 C-13)
echo         beberapa draf serentak, ikut ke peranti lain / 多份草稿并存、跨装置
echo    34.  20260912000000  senarai Juruaudit / the auditors roster (56 D2-1)
echo         eROSES langkah 4 - nama, e-mel, tarikh lantik, status
echo    35.  20260913000000  Maklumat Am + akaun bank / eROSES step-2 fields (56 D2-2)
echo         telefon, tahun kewangan, bilangan ahli, akaun bank pertubuhan
echo    36.  20260914000000  jejak cadangan AI / AI suggestion marks (64 E3)
echo         kad cadangan: sahkan/abaikan direkod, tak ganggu dua kali
echo    37.  20260915000000  roster e-mel + negeri / roster email + state (69 H1)
echo         eROSES langkah AJK minta e-mel dan negeri setiap pemegang jawatan
echo    38.  20260916000000  orgs.created_by / siapa buka pertubuhan (69 H3)
echo         peraturan baru: akaun percuma buka SATU pertubuhan induk sahaja
echo    39.  20260917000000  RLS ikut peranan / role-aware RLS (87 nombor 2)
echo         PENTING: baca kepala fail dulu - lepas Run, jalankan probe-rls-87
echo    40.  20260918000000  resit kedai pada perbelanjaan (97 nombor 5)
echo         gambar resit / "tiada resit" pada setiap baris perbelanjaan
echo    41.  20260919000000  jejak ubahan agent + telefon AJK (100 nombor 0-4)
echo         agent boleh ubah telefon/e-mel AJK - setiap ubahan ada rekod + undo
echo    42.  20260920000000  kolam kuota setiap pelan + pelan Plus (102 nombor 0-6)
echo         J tetapkan kuota Trial/Standard/Plus/HQ dari konsol - tiada SQL lagi
echo    43.  20260921000000  ai_jobs - baca dokumen panjang sedikit demi sedikit (105 nombor 1)
echo    44.  20260922000000  betulkan Tukar pelan dalam konsol - ia tidak pernah berjaya (116)
echo         TANPA INI: fail lebih 10 muka surat masih tak boleh dibaca (macam sebelum ini)
echo.
echo     0.  Keluar / Quit
echo.
set /p pick=   Nombor / Number:

if "%pick%"=="0" exit /b 0
if "%pick%"=="1"  set f=20260708000000_init.sql& goto copy
if "%pick%"=="2"  set f=20260719000000_phase7_auth_rls.sql& goto copy
if "%pick%"=="3"  set f=20260719150000_phase75_ai_usage.sql& goto copy
if "%pick%"=="4"  set f=20260726000000_client_id_and_receipt_lock.sql& goto copy
if "%pick%"=="5"  set f=20260728000000_lock_org_privileged_columns.sql& goto copy
if "%pick%"=="6"  set f=20260729000000_admin_grant_ai_credits.sql& goto copy
if "%pick%"=="7"  set f=20260730000000_receipt_series.sql& goto copy
if "%pick%"=="8"  set f=20260803000000_ai_usage_cost.sql& goto copy
if "%pick%"=="9"  set f=20260819000000_org_glossary.sql& goto copy
if "%pick%"=="10" set f=20260819010000_committee_official_name.sql& goto copy
if "%pick%"=="11" set f=20260820000000_meeting_types_and_minutes_draft.sql& goto copy
if "%pick%"=="12" set f=20260821000000_ai_usage_refunded_at.sql& goto copy
if "%pick%"=="13" set f=20260822000000_minutes_search.sql& goto copy
if "%pick%"=="14" set f=20260823000000_cari_minit_rpc.sql& goto copy
if "%pick%"=="15" set f=20260824000000_receipt_no_past_9999.sql& goto copy
if "%pick%"=="16" set f=20260825000000_events_deadlines_custody_writable.sql& goto copy
if "%pick%"=="17" set f=20260826000000_member_groups.sql& goto copy
if "%pick%"=="18" set f=20260827000000_donations_collector_name.sql& goto copy
if "%pick%"=="19" set f=20260828000000_minutes_docs_client_id.sql& goto copy
if "%pick%"=="20" set f=20260829000000_orgs_needs_einvois.sql& goto copy
if "%pick%"=="21" set f=20260830000000_orgs_plan.sql& goto copy
if "%pick%"=="22" set f=20260831000000_app_errors.sql& goto copy
if "%pick%"=="23" set f=20260901000000_trial_quota_15.sql& goto copy
if "%pick%"=="24" set f=20260902000000_invites_and_org_type.sql& goto copy
if "%pick%"=="25" set f=20260903000000_final_sprint.sql& goto copy
if "%pick%"=="26" set f=20260904000000_payment_method.sql& goto copy
if "%pick%"=="27" set f=20260905000000_record_times_and_custody_batches.sql& goto copy
if "%pick%"=="28" set f=20260906000000_custody_ids_glossary_langs_templates.sql& goto copy
if "%pick%"=="29" set f=20260907000000_register_rows_and_receipts_v8.sql& goto copy
if "%pick%"=="30" set f=20260908000000_minutes_title_edits_photos.sql& goto copy
if "%pick%"=="31" set f=20260909000000_free_fence.sql& goto copy
if "%pick%"=="32" set f=20260910000000_roster_note_honorific.sql& goto copy
if "%pick%"=="33" set f=20260911000000_minutes_drafts.sql& goto copy
if "%pick%"=="34" set f=20260912000000_auditors.sql& goto copy
if "%pick%"=="35" set f=20260913000000_org_maklumat_am.sql& goto copy
if "%pick%"=="36" set f=20260914000000_suggestion_marks.sql& goto copy
if "%pick%"=="37" set f=20260915000000_roster_email_state.sql& goto copy
if "%pick%"=="38" set f=20260916000000_orgs_created_by.sql& goto copy
if "%pick%"=="39" set f=20260917000000_role_rls.sql& goto copy
if "%pick%"=="40" set f=20260918000000_expense_receipt.sql& goto copy
if "%pick%"=="41" set f=20260919000000_agent_changes.sql& goto copy
if "%pick%"=="42" set f=20260920000000_plan_quotas.sql& goto copy
if "%pick%"=="43" set f=20260921000000_ai_jobs.sql& goto copy
if "%pick%"=="44" set f=20260922000000_fix_set_org_plan.sql& goto copy

echo.
echo    Nombor tak sah / not a valid number.
timeout /t 2 >nul
goto menu

:copy
if not exist "supabase\migrations\%f%" goto fail

REM PowerShell + UTF8 kerana fail ini ada tulisan Cina dalam komen --
REM `type ^| clip` akan rosakkannya.
REM PowerShell + UTF8 because these files have Chinese in the comments;
REM `type ^| clip` mangles it.
powershell -NoProfile -Command "Get-Content -Raw -Encoding UTF8 'supabase\migrations\%f%' | Set-Clipboard"
if errorlevel 1 goto fail

echo.
echo   ==============================================================
echo    SIAP DISALIN / COPIED:  %f%
echo   ==============================================================
echo.
echo    1. Supabase - SQL Editor - New query
echo    2. Klik dalam kotak kod, tekan Ctrl+A, kemudian Ctrl+V
echo       Click in the code box, press Ctrl+A, then Ctrl+V
echo    3. Tekan butang hijau RUN
echo    4. "Success. No rows returned" = jadi / it worked
echo.
echo    Kalau keluar tulisan MERAH, salin semua dan hantar pada Claude.
echo    If you get RED text, copy all of it and send it to Claude.
echo.
pause
goto menu

:fail
echo.
echo    GAGAL / FAILED -- fail tidak dijumpai / file not found:
echo    supabase\migrations\%f%
echo    Tiada apa-apa yang diubah / Nothing was changed.
echo.
pause
goto menu
