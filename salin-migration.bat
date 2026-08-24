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
