@echo off
title Minit
rem ============================================================
rem  BUKA MINIT — double-click to start the app and open it.
rem  Keep the small server window open while you use the app.
rem ============================================================
cd /d "%~dp0"

rem Already running? Then just open the browser.
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul 2>&1
if %errorlevel%==0 goto open

echo Memulakan Minit / Starting Minit...
start "Minit server (jangan tutup / do not close)" cmd /k "npm run dev"

set tries=0
:waitloop
set /a tries+=1
if %tries% gtr 60 goto failed
timeout /t 2 /nobreak >nul
netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul 2>&1
if not %errorlevel%==0 goto waitloop

:open
start "" "http://localhost:3000"
exit /b 0

:failed
echo.
echo Gagal memulakan pelayan / The server did not start.
echo Buka PowerShell di folder ini dan jalankan: npm run dev
echo Lihat mesej ralat dalam tetingkap pelayan / read the error in the server window.
pause
