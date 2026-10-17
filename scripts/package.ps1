param(
    [ValidatePattern('^[0-9A-Za-z][0-9A-Za-z.+-]*$')]
    [string]$Version,
    [ValidatePattern('^[0-9A-Za-z][0-9A-Za-z._+-]*\.zip$')]
    [string]$ArchiveName
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskAddon = Join-Path $taskRoot 'AddOns/LegionChinese'
$taskDist = Join-Path $taskRoot 'dist'
if (-not $Version) {
    $Version = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
}
if (-not $ArchiveName) { $ArchiveName = "LegionChinese-v$Version.zip" }
New-Item -ItemType Directory -Path $taskDist -Force | Out-Null
$taskZip = Join-Path $taskDist $ArchiveName
Compress-Archive -LiteralPath $taskAddon -DestinationPath $taskZip -Force

# Stamp the packaged TOC only; the tracked addon stays unchanged.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskArchive = [System.IO.Compression.ZipFile]::Open($taskZip, [System.IO.Compression.ZipArchiveMode]::Update)
try {
    $taskEntry = $taskArchive.GetEntry('LegionChinese/LegionChinese.toc')
    if (-not $taskEntry) { throw 'The archive is missing LegionChinese/LegionChinese.toc.' }
    $taskReader = [System.IO.StreamReader]::new($taskEntry.Open())
    try { $taskToc = $taskReader.ReadToEnd() } finally { $taskReader.Dispose() }
    if ([regex]::Matches($taskToc, '(?m)^## Version:.*$').Count -ne 1) {
        throw 'Expected exactly one TOC version line.'
    }
    $taskToc = [regex]::Replace($taskToc, '(?m)^## Version:[^\r\n]*', "## Version: $Version")
    $taskEntry.Delete()
    $taskEntry = $taskArchive.CreateEntry('LegionChinese/LegionChinese.toc')
    $taskWriter = [System.IO.StreamWriter]::new($taskEntry.Open(), [System.Text.UTF8Encoding]::new($false))
    try { $taskWriter.Write($taskToc) } finally { $taskWriter.Dispose() }
} finally {
    $taskArchive.Dispose()
}

$taskHash = (Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText("$taskZip.sha256", "$taskHash  $ArchiveName`n", [System.Text.UTF8Encoding]::new($false))
[pscustomobject]@{ Path = $taskZip; Version = $Version; SHA256 = $taskHash }
