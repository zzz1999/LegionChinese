param(
    [ValidatePattern('^[0-9A-Za-z][0-9A-Za-z.+-]*$')]
    [string]$Version,
    [ValidatePattern('^[0-9A-Za-z][0-9A-Za-z._+-]*\.zip$')]
    [string]$ArchiveName,
    [string]$ReleaseNotesPath
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskAddon = Join-Path $taskRoot 'AddOns/LegionChinese'
$taskDist = Join-Path $taskRoot 'dist'
if (-not $Version) {
    $Version = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
}
if (-not $ArchiveName) { $ArchiveName = "LegionChinese-$Version.zip" }
# Resolve actual-version notes before touching an existing archive. An automatic
# version bump must supply the same notes that will appear on GitHub.
$taskNoteArgs = @((Join-Path $PSScriptRoot 'changelog.mjs'), '--package', $Version)
if ($ReleaseNotesPath) { $taskNoteArgs += $ReleaseNotesPath }
$taskNotes = & node @taskNoteArgs
if ($LASTEXITCODE -ne 0) { throw "Could not generate release notes for $Version." }
$taskNotes = ($taskNotes -join "`n") + "`n"
New-Item -ItemType Directory -Path $taskDist -Force | Out-Null
$taskZip = Join-Path $taskDist $ArchiveName
$taskStage = Join-Path $taskDist ('.package-' + [guid]::NewGuid().ToString('N'))
try {
    & node (Join-Path $PSScriptRoot 'package-layout.mjs') $taskRoot $taskStage $Version
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the single-addon data initializers.' }
    $taskFolders = @(Get-ChildItem -LiteralPath $taskStage -Directory | ForEach-Object FullName)
    Compress-Archive -LiteralPath $taskFolders -DestinationPath $taskZip -Force
} finally {
    $taskResolvedStage = [System.IO.Path]::GetFullPath($taskStage)
    if ([System.IO.Path]::GetDirectoryName($taskResolvedStage) -ne [System.IO.Path]::GetFullPath($taskDist)) {
        throw 'Unsafe package staging cleanup path.'
    }
    if (Test-Path -LiteralPath $taskResolvedStage) { Remove-Item -LiteralPath $taskResolvedStage -Recurse -Force }
}

# Stamp both packaged files; the tracked addon stays unchanged.
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
    $taskNotesEntry = $taskArchive.GetEntry('LegionChinese/Changelog.lua')
    if (-not $taskNotesEntry) { throw 'The archive is missing LegionChinese/Changelog.lua.' }
    $taskNotesEntry.Delete()
    $taskNotesEntry = $taskArchive.CreateEntry('LegionChinese/Changelog.lua')
    $taskWriter = [System.IO.StreamWriter]::new($taskNotesEntry.Open(), [System.Text.UTF8Encoding]::new($false))
    try { $taskWriter.Write($taskNotes) } finally { $taskWriter.Dispose() }
} finally {
    $taskArchive.Dispose()
}

$taskHash = (Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText("$taskZip.sha256", "$taskHash  $ArchiveName`n", [System.Text.UTF8Encoding]::new($false))
[pscustomobject]@{ Path = $taskZip; Version = $Version; SHA256 = $taskHash }
