@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20.19+ or 22.12+ is required.
  pause
  exit /b 1
)
if not exist node_modules\vite\bin\vite.js (
  call npm.cmd ci --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)
powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200 -and $response.Content -match 'workbench|制作工坊') { exit 0 } } catch {}; exit 1" >nul 2>nul
if not errorlevel 1 (
  call "%~dp0start-hotkeys.cmd"
  start "" "http://127.0.0.1:5173"
  exit /b 0
)
call "%~dp0start-hotkeys.cmd"
call npm.cmd run dev -- --open --host 127.0.0.1 --port 5173 --strictPort
if errorlevel 1 pause
