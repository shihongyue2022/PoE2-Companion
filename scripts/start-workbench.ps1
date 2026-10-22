param(
    [string]$BaseUrl = 'http://127.0.0.1:5173',
    [switch]$NoBrowser,
    [switch]$NoHotkeys
)

$ErrorActionPreference = 'Stop'
$workbenchAddress = [Uri]$BaseUrl
if ($workbenchAddress.Scheme -ne 'http' -or $workbenchAddress.Host -ne '127.0.0.1' -or
    $workbenchAddress.AbsolutePath -ne '/' -or $workbenchAddress.Query -or $workbenchAddress.UserInfo) {
    throw 'Only an http://127.0.0.1:port local workbench address is supported.'
}
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$serviceOrigin = $workbenchAddress.GetLeftPart([UriPartial]::Authority)
$startupMutex = [Threading.Mutex]::new($false, ('Local\PoE2CraftWorkbenchStartup' + $workbenchAddress.Port))
$hasStartupLock = $false
function Test-WorkbenchReady {
    try {
        $health = Invoke-RestMethod -Uri ($serviceOrigin + '/api/workbench/health') -TimeoutSec 2
        return $health.ok -eq $true -and $health.app -eq 'poe2-craft-workbench'
    } catch { return $false }
}
try {
    try { $hasStartupLock = $startupMutex.WaitOne(20000) }
    catch [Threading.AbandonedMutexException] { $hasStartupLock = $true }
    if (-not $hasStartupLock) { throw 'Another startup is still running. Please try again shortly.' }
    if (-not (Test-WorkbenchReady)) {
        $portProbe = [Net.Sockets.TcpClient]::new()
        try {
            $connection = $portProbe.BeginConnect('127.0.0.1', $workbenchAddress.Port, $null, $null)
            if ($connection.AsyncWaitHandle.WaitOne(300) -and $portProbe.Connected) {
                throw ('Port ' + $workbenchAddress.Port + ' is in use, but its service is not a ready PoE2 workbench. Please check that process before retrying.')
            }
        } finally { $portProbe.Dispose() }
        $viteEntry = Join-Path $projectDirectory 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $viteEntry)) { throw 'Dependencies are missing. Run start-workbench.cmd first.' }
        $nodePath = (Get-Command node -ErrorAction Stop).Source
        $logDirectory = Join-Path $projectDirectory 'logs'
        $logStem = if ($workbenchAddress.Port -eq 5173) { 'workbench-server' } else { 'workbench-server-' + $workbenchAddress.Port }
        [void][IO.Directory]::CreateDirectory($logDirectory)
        $nodeArguments = '"' + $viteEntry + '" --host 127.0.0.1 --port ' + $workbenchAddress.Port + ' --strictPort'
        $serviceProcess = Start-Process -FilePath $nodePath -ArgumentList $nodeArguments -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logDirectory ($logStem + '.log')) -RedirectStandardError (Join-Path $logDirectory ($logStem + '.error.log'))
        $pidRecord = @{ pid = $serviceProcess.Id; viteEntry = $viteEntry; port = $workbenchAddress.Port } | ConvertTo-Json -Compress
        [IO.File]::WriteAllText((Join-Path $logDirectory ($logStem + '.json')), $pidRecord)
        $readyDeadline = [DateTime]::UtcNow.AddSeconds(25)
        while (-not (Test-WorkbenchReady)) {
            if ($serviceProcess.HasExited -or [DateTime]::UtcNow -gt $readyDeadline) {
                throw ('The workbench did not start. See ' + (Join-Path $logDirectory ($logStem + '.error.log')))
            }
            Start-Sleep -Milliseconds 250
        }
    }
} finally {
    if ($hasStartupLock) { $startupMutex.ReleaseMutex() }
    $startupMutex.Dispose()
}
if (-not $NoHotkeys) {
    $helperPath = Join-Path $PSScriptRoot 'workbench-hotkeys.ps1'
    $helperArguments = '-NoProfile -ExecutionPolicy Bypass -STA -File "' + $helperPath + '" -BaseUrl "' + $serviceOrigin + '"'
    Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -WindowStyle Hidden -ArgumentList $helperArguments
}
if (-not $NoBrowser) { Start-Process ($serviceOrigin + '/?companion=1') }
Write-Output ('PoE2 workbench is ready: ' + $serviceOrigin)
