@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Zainstaluj Node.js 22 lub nowszy: https://nodejs.org/
  pause
  exit /b 1
)
echo Otworz http://localhost:3000 w przegladarce.
echo Na telefonie w tej samej sieci uzyj http://IP-KOMPUTERA:3000
node server.mjs
pause
