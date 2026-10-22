param([ValidateRange(1,65535)][int]$Port = 5173)
$ErrorActionPreference = 'Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logStem = if ($Port -eq 5173) { 'workbench-server' } else { 'workbench-server-' + $Port }
$pidFile = Join-Path $projectDirectory ('logs\' + $logStem + '.json')
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No background workbench was recorded.'; exit 0 }
$record = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
$expectedEntry = [IO.Path]::GetFullPath((Join-Path $projectDirectory 'node_modules\vite\bin\vite.js'))
if (-not ($record.pid -is [int]) -or $record.pid -le 0 -or $record.viteEntry -ne $expectedEntry -or $record.port -ne $Port) { throw 'Invalid local workbench process record.' }
$serviceProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $record.pid)
if ($serviceProcess) {
    if ($serviceProcess.Name -ne 'node.exe' -or $serviceProcess.CommandLine -notmatch [regex]::Escape($expectedEntry) -or
        $serviceProcess.CommandLine -notmatch ('--port\s+' + [regex]::Escape([string]$record.port) + '(?:\s|$)')) {
        throw 'The recorded PID belongs to another process; nothing was stopped.'
    }
    Stop-Process -Id $record.pid -ErrorAction Stop
}
Remove-Item -LiteralPath $pidFile
Write-Output 'The background workbench has stopped. The tray menu closes the separate hotkey helper.'
