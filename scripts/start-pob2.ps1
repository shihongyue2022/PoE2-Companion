param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$pobProject = Split-Path -Parent $PSScriptRoot
$pobTools = Join-Path $pobProject '.local-tools'
$pobVersion = 'v0.23.1'
$pobInstall = Join-Path $pobTools ('pob2-' + $pobVersion)
$pobExe = Join-Path $pobInstall 'Path of Building-PoE2.exe'
if (-not (Test-Path -LiteralPath $pobExe)) {
    New-Item -ItemType Directory -Path $pobTools -Force | Out-Null
    $pobZip = Join-Path $pobTools ('pob2-' + $pobVersion + '.zip.partial')
    $pobExpected = '7e190d3b66191b09416a9cd4d12394d37df374d6d6e59ab4f2366f3d9e81baf7'
    $pobUrl = 'https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/releases/download/' + $pobVersion + '/PathOfBuildingCommunity-PoE2-Portable.zip'
    if (-not (Test-Path -LiteralPath $pobZip)) {
        Write-Host 'Downloading the official PoB2 portable release (about 383 MB)...'
        & curl.exe --fail --location --retry 2 --connect-timeout 20 --output $pobZip $pobUrl
        if ($LASTEXITCODE -ne 0) { throw 'PoB2 download failed. Retry after checking the network.' }
    }
    if ((Get-FileHash -LiteralPath $pobZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pobExpected) {
        throw 'PoB2 archive checksum mismatch. No files were installed. Move the incomplete archive out of .local-tools and retry.'
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $pobArchive = [System.IO.Compression.ZipFile]::OpenRead($pobZip)
    try {
        # Validate every entry before extracting this official, hash-verified archive.
        $pobPrefix = [IO.Path]::GetFullPath($pobInstall).TrimEnd('\') + '\'
        foreach ($pobEntry in $pobArchive.Entries) {
            $pobDestination = [IO.Path]::GetFullPath((Join-Path $pobInstall $pobEntry.FullName))
            if (-not $pobDestination.StartsWith($pobPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected archive path.' }
        }
    } finally { $pobArchive.Dispose() }
    if (Test-Path -LiteralPath $pobInstall) { throw 'The PoB2 destination already exists. No existing files were overwritten.' }
    [System.IO.Compression.ZipFile]::ExtractToDirectory($pobZip, $pobInstall)
}
New-Item -ItemType Directory -Path (Join-Path $pobInstall 'Builds') -Force | Out-Null
Write-Host ('PoB2 ready: ' + $pobExe)
if (-not $NoLaunch) {
    # This is the interactive app the user needs for official login and character selection.
    Start-Process -FilePath $pobExe -WorkingDirectory $pobInstall
}
