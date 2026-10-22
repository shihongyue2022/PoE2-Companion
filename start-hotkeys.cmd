@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-workbench.ps1" -NoBrowser -NoHotkeys
if errorlevel 1 (
  echo The local workbench could not start. Run start-workbench.cmd to check dependencies.
  pause
  exit /b 1
)
set "POE2_WORKBENCH_HOTKEYS=%~dp0scripts\workbench-hotkeys.ps1"
if not exist "%POE2_WORKBENCH_HOTKEYS%" (
  echo Hotkey companion script was not found.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$scriptPath = $env:POE2_WORKBENCH_HOTKEYS; $scriptArgument = '-NoProfile -ExecutionPolicy Bypass -STA -File ' + [char]34 + $scriptPath + [char]34; Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -WindowStyle Hidden -ArgumentList $scriptArgument"
if errorlevel 1 pause
