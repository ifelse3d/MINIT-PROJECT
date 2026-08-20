@echo off
REM ============================================================
REM  SALIN MIGRATION KE CLIPBOARD / COPY MIGRATION TO CLIPBOARD
REM
REM  Klik dua kali. Ia salin fail SQL terus ke clipboard,
REM  jadi anda tak payah cari fail atau buka Notepad.
REM
REM  Double-click. It copies the SQL straight to your clipboard,
REM  so you never have to find the file or open Notepad.
REM
REM  FAIL INI TIDAK MENJALANKAN APA-APA. Ia hanya menyalin.
REM  Anda yang tekan RUN di Supabase.
REM  THIS FILE RUNS NOTHING. It only copies. You are the one who
REM  presses RUN in Supabase.
REM
REM  Guna PowerShell + UTF8 kerana fail ini ada tulisan Cina
REM  dalam komen -- `type | clip` akan rosakkannya.
REM
REM  2026-08-20: dua migration 19 Ogos SUDAH dijalankan (disahkan
REM  terus pada pangkalan data). Fail ini kini menunjuk kepada
REM  yang seterusnya sahaja.
REM  The two 19 August migrations are already applied (checked
REM  against the database itself). This now points at the next
REM  one only.
REM ============================================================
cd /d "%~dp0"
chcp 65001 >nul

echo.
echo   ============================================
echo    20260820000000
echo    jenis mesyuarat + simpan draf
echo    meeting types + save-as-draft
echo   ============================================
echo.
echo    Apa yang ia buat / What it does:
echo      1. Benarkan 6 jenis mesyuarat, bukan 3
echo         (tambah: perancangan, program, lain-lain)
echo         Allows 6 meeting types instead of 3
echo      2. Tambah lajur `extraction` untuk simpan draf
echo         Adds an `extraction` column, for saving drafts
echo.
echo    Selamat dijalankan berulang kali.
echo    Safe to run more than once.
echo.
powershell -NoProfile -Command "Get-Content -Raw -Encoding UTF8 'supabase\migrations\20260820000000_meeting_types_and_minutes_draft.sql' | Set-Clipboard"
if errorlevel 1 goto :fail
echo    SUDAH DISALIN / COPIED.
echo.
echo    Sekarang / Now:
echo      1. Buka Supabase  -^>  SQL Editor
echo      2. Klik dalam kotak kod, tekan Ctrl+A
echo      3. Tekan Ctrl+V
echo      4. Tekan butang hijau RUN
echo      5. Baris terakhir akan memaparkan satu baris hasil --
echo         salin baris itu dan hantar pada Claude.
echo         The last line prints one row of results --
echo         copy that row and send it to Claude.
echo.
echo    Kalau keluar tulisan MERAH, salin semua dan hantar pada Claude.
echo    If you get RED text, copy all of it and send it to Claude.
echo.
echo   ============================================
echo    SIAP DISALIN / COPIED.
echo   ============================================
echo.
pause
exit /b 0

:fail
echo.
echo    GAGAL / FAILED -- fail tidak dijumpai.
echo    File not found. Nothing was changed.
echo.
pause
exit /b 1
