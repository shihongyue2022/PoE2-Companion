$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'workbench-hotkeys.ps1') -ValidateOnly
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fixtures = Get-Content -LiteralPath (Join-Path $root 'src\workbench\fixtures\tradeItems.ts') -Raw -Encoding UTF8
foreach ($name in @('CURRENCY_SAMPLE', 'WAYSTONE_SAMPLE', 'GEM_SAMPLE')) {
    $matched = [regex]::Match($fixtures, 'export const ' + $name + ' = `([\s\S]*?)`;')
    if (-not $matched.Success -or -not [PoE2WorkbenchHotkeys.Program]::IsEquipmentText($matched.Groups[1].Value)) {
        throw ('Native clipboard validation rejected ' + $name)
    }
}
foreach ($invalid in @('', 'ordinary chat message', "Rarity: Currency`n--------", "Item Class: Maps`nWaystone")) {
    if ([PoE2WorkbenchHotkeys.Program]::IsEquipmentText($invalid)) { throw 'Native validation accepted incomplete item text.' }
}
Write-Output 'PASS native helper accepts maps, gems and currency without item level; incomplete text stays rejected.'
