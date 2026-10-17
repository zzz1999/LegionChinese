$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskAddon = Join-Path $taskRoot 'AddOns/TauriChinese'
$taskDist = Join-Path $taskRoot 'dist'
New-Item -ItemType Directory -Path $taskDist -Force | Out-Null
$taskZip = Join-Path $taskDist 'TauriChinese-v0.1.0.zip'
Compress-Archive -LiteralPath $taskAddon -DestinationPath $taskZip -Force
Get-FileHash -LiteralPath $taskZip -Algorithm SHA256
