@echo off
setlocal
cd /d "%~dp0"

echo  ============================================
echo   Menyemak laluan AI / Checking AI routing
echo   Folder: %~dp0
echo  ============================================
echo.

if not exist ".env.local" (
  echo  [X] .env.local TIDAK DIJUMPAI / NOT FOUND.
  echo      Tanya Claude. / Ask Claude.
  echo.
  pause
  exit /b 1
)

rem /B = mesti di awal baris, supaya baris komen tidak tersilap padan.
rem /B = must be at start of line, so a comment line cannot false-match.
findstr /B /C:"OPENAI_API_KEY=sk-proj-PASTE_YOUR_KEY_HERE" ".env.local" >nul
if %errorlevel%==0 (
  echo  [X] Kunci OpenAI belum ditampal.
  echo      OpenAI key not pasted yet.
  echo.
  echo      Buka .env.local, cari baris ini:
  echo      Open .env.local, find this line:
  echo.
  echo        OPENAI_API_KEY=sk-proj-PASTE_YOUR_KEY_HERE
  echo.
  echo      Ganti bahagian PASTE... dengan kunci sebenar.
  echo      Replace the PASTE... part with the real key.
  echo      Simpan, kemudian klik dua kali fail ini semula.
  echo      Save, then double-click this file again.
  echo.
  pause
  exit /b 1
)

echo  [1/1] Menjalankan / Running: npm run check:ai
echo.
call npm run check:ai

echo.
echo  ============================================
echo   SIAP / DONE.
echo   Baris bertanda hijau di atas ialah jawapan sebenar.
echo   The green-ticked lines above are the real answer.
echo   Lima baris di bawah hanya gambaran 9 Sep 2026 (130 nombor 18, dijalankan
echo   sebenar) - kalau lain sikit, ikut yang di atas.
echo   The five lines below are only the 9 Sep 2026 snapshot (130 no. 18, a real
echo   run) - if they differ, the lines above win.
echo     AI_MODEL_CLASSIFY  -^> openai:gpt-5-nano
echo     AI_MODEL_CHAT      -^> openai:gpt-5.6-luna
echo     AI_MODEL_EXTRACT   -^> gemini:gemini-3.5-flash-lite
echo     AI_MODEL_LONG_DOC  -^> gemini:gemini-3.5-flash-lite
echo     AI_MODEL_WRITE     -^> (tidak ditetapkan / not set) ikut LONG_DOC
echo   Skrip ini TIDAK memanggil vendor - tiada kos / this script calls NO vendor - costs nothing.
echo.
echo   Kalau ada yang tertulis gemini untuk classify/chat,
echo   If classify/chat still say gemini,
echo   maknanya ada baris yang salah taip - beritahu Claude.
echo   a line has a typo - tell Claude.
echo  ============================================
echo.
pause
