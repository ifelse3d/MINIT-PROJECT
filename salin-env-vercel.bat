@echo off
REM ============================================================
REM  SALIN .env.local UNTUK VERCEL / COPY .env.local FOR VERCEL
REM
REM  Klik dua kali. Ia salin 12 baris tetapan terus ke clipboard
REM  dalam bentuk yang kotak "Environment Variables" Vercel terima.
REM
REM  Double-click. It copies your settings to the clipboard in the
REM  shape Vercel's "Environment Variables" box accepts, so it is
REM  one paste instead of twelve.
REM
REM  Kunci TIDAK dicetak di skrin. Keys are never printed.
REM ============================================================
cd /d "%~dp0"
chcp 65001 >nul
node scripts\copy-env-for-vercel.mjs
echo.
echo   ============================================
echo    Sekarang / Now:
echo      1. vercel.com  -^>  projek anda  -^>  Settings
echo      2. Environment Variables
echo      3. Klik dalam kotak besar, tekan Ctrl+V
echo      4. Tanda Production + Preview + Development
echo      5. Save
echo.
echo    ^>^> LEPAS TU, SALIN APA-APA SAHAJA UNTUK TIMPA CLIPBOARD.
echo    ^>^> AFTERWARDS, COPY ANYTHING ELSE TO WIPE THE CLIPBOARD.
echo       (SUPABASE_SERVICE_ROLE_KEY ada di dalamnya /
echo        the service_role key is in there)
echo   ============================================
echo.
pause
