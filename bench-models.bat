@echo off
setlocal
cd /d "C:\dev\minit-v2"

echo  ============================================
echo   Perbandingan model AI / Model bench
echo   Folder: C:\dev\minit-v2
echo  ============================================
echo.
echo   Ini akan MEMBAYAR panggilan API sebenar.
echo   This will make REAL, PAID API calls.
echo.
echo   Sebelum bermula ia mencetak ANGGARAN KOS dan
echo   menunggu anda tekan Enter. Ctrl+C = batal.
echo   It prints the COST ESTIMATE first and waits
echo   for Enter. Ctrl+C = cancel.
echo.

if not exist ".env.local" (
  echo  [X] .env.local TIDAK DIJUMPAI / NOT FOUND. Tanya Claude. / Ask Claude.
  echo.
  pause
  exit /b 1
)

call npm run bench

echo.
echo  ============================================
echo   SIAP / DONE.
echo   Jadual penuh: eval\reports\model-bench-^<tarikh^>.md
echo   The full table: eval\reports\model-bench-^<date^>.md
echo.
echo   PERINGATAN / REMINDER:
echo   Kes ujian semasa = CETAKAN sintetik. Keputusan
echo   sebenar menunggu kes TULISAN TANGAN (sesi 5 / G-3).
echo   Current cases = synthetic PRINT. The real decision
echo   waits for the HANDWRITTEN cases (session 5 / G-3).
echo  ============================================
echo.
pause
