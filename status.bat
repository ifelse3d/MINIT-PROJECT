@echo off
REM ============================================================
REM  APA YANG SUDAH SIAP / WHAT IS ACTUALLY DONE
REM
REM  Klik dua kali bila-bila masa anda ragu-ragu sama ada
REM  sesuatu sudah dibuat atau belum.
REM
REM  Double-click this any time you are unsure whether
REM  something has already been done.
REM
REM  Ia TIDAK ubah apa-apa. Ia cuma bertanya kepada sistem.
REM  It changes NOTHING. It only asks the system.
REM ============================================================
cd /d "%~dp0"
chcp 65001 >nul
node scripts\status.mjs
echo.
pause
