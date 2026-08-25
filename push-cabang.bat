@echo off
REM ============================================================
REM  HANTAR main KE GITHUB / PUSH main TO GITHUB (minit-v2)
REM
REM  Fail ini TIDAK commit apa-apa. Ia hanya menghantar commit
REM  yang sudah ada. Kerja yang belum di-commit tidak disentuh.
REM  This file COMMITS NOTHING. It only uploads commits that
REM  already exist. Uncommitted work is left exactly as it is.
REM
REM  Kalau tetingkap GitHub keluar minta pilih akaun:
REM  pilih akaun anda sendiri (ifelse3d), kemudian tunggu.
REM  If a GitHub window pops up asking which account:
REM  pick your own account (ifelse3d), then wait.
REM ============================================================
cd /d "%~dp0"

echo.
echo   ============================================
echo    Apa yang akan dihantar / What will be sent
echo   ============================================
echo.
echo   [ minit-v2 ]  main
git --no-pager log --oneline origin/main..main
echo.
echo   (kosong = sudah sama dengan GitHub / empty = already matches GitHub)
echo.
echo   ============================================
echo    Tekan sebarang kekunci untuk hantar.
echo    Press any key to send. Ctrl+C to stop.
echo   ============================================
pause >nul

echo.
echo   Menghantar / Pushing main ...
git push -u origin main
if errorlevel 1 goto :fail

echo.
echo   ============================================
echo    SIAP / DONE. main sudah di GitHub.
echo    main is now on GitHub.
echo   ============================================
echo.
pause
exit /b 0

:fail
echo.
echo   ============================================
echo    GAGAL / FAILED.
echo.
echo    TIADA APA-APA YANG ROSAK. Commit anda masih
echo    ada di komputer ini.
echo    NOTHING IS BROKEN. Your commits are still
echo    here on this computer.
echo.
echo    Kalau GitHub minta log masuk: log masuk,
echo    kemudian klik fail ini sekali lagi.
echo    If GitHub asked you to sign in: sign in,
echo    then double-click this file again.
echo.
echo    Nota: push boleh ambil BEBERAPA MINIT.
echo    Kalau nampak macam tersangkut, tunggu dulu
echo    5 minit sebelum tutup. (STATE.md 8/23:
echo    "push 只是很慢，不是卡死".)
echo.
echo    Salin tulisan merah di atas dan hantar pada
echo    Claude. / Copy the red text above and send
echo    it to Claude.
echo   ============================================
echo.
pause
exit /b 1
