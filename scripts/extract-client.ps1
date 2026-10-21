param(
    [Parameter(Mandatory=$true)][string]$ClientPath,
    [string]$OutputDirectory,
    [string]$Tables = '',
    [ValidateSet('zhCN','zhTW','enUS')][string]$Locale = 'zhCN'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$clientRoot = (Resolve-Path -LiteralPath $ClientPath).Path.TrimEnd([char[]]@('\','/'))
$dependencyRoot = Join-Path $projectRoot '.cache/client-extract-tools'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot '.cache/client-735' }
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if ($outputRoot.Equals($clientRoot,[StringComparison]::OrdinalIgnoreCase) -or
    $outputRoot.StartsWith($clientRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'Extraction output must be outside the game client directory.'
}
if (-not (Test-Path -LiteralPath (Join-Path $clientRoot '.build.info'))) { throw 'Missing client .build.info.' }
New-Item -ItemType Directory -Path $dependencyRoot -Force | Out-Null
$readerSources = @(
    @{Name='CascLib';Repository='WoW-Tools/CascLib';Commit='3f8be478177802de4ae7ebae24fb25ab860ef104'},
    @{Name='DBCD';Repository='wowdev/DBCD';Commit='e732093f8864240fc5884bd1bba6b02f3dfc0d56'},
    @{Name='WoWDBDefs';Repository='wowdev/WoWDBDefs';Commit='77582e12f6f61c7647635bc31c152b119b9dd7f9'}
)
foreach ($reader in $readerSources) {
    $readerPath = Join-Path $dependencyRoot $reader.Name
    if (-not (Test-Path -LiteralPath $readerPath)) {
        & git clone --depth 1 --no-checkout ('https://github.com/'+$reader.Repository+'.git') $readerPath
        if ($LASTEXITCODE -ne 0) { throw ('Cannot clone '+$reader.Name) }
        & git -c "safe.directory=$readerPath" -C $readerPath fetch --depth 1 origin $reader.Commit
        if ($LASTEXITCODE -ne 0) { throw ('Cannot fetch pinned '+$reader.Name+' source') }
        & git -c "safe.directory=$readerPath" -C $readerPath checkout --detach $reader.Commit
        if ($LASTEXITCODE -ne 0) { throw ('Cannot select pinned '+$reader.Name+' source') }
    }
    $actual = & git -c "safe.directory=$readerPath" -C $readerPath rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $actual -ne $reader.Commit) { throw ('Unexpected '+$reader.Name+' revision; use a fresh dependency cache.') }
}
# Upstream config loading used FileMode.Open's read/write default, although it
# only reads these files. Restrict access in the cached tool, never in the game.
foreach ($name in @('CASCConfig.cs','CASCGame.cs')) {
    $file = Join-Path $dependencyRoot ('CascLib/CascLib/'+$name)
    $source = [IO.File]::ReadAllText($file)
    $source = [regex]::Replace($source,'new FileStream\((\w+), FileMode.Open\)','new FileStream($1, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)')
    [IO.File]::WriteAllText($file,$source,[Text.UTF8Encoding]::new($false))
}
# Missing local content must fail and be recorded, rather than silently fetching
# a different payload from the old CDN. The exported text is from this client.
$baseFile = Join-Path $dependencyRoot 'CascLib/CascLib/CASCHandlerBase.cs'
$baseSource = [IO.File]::ReadAllText($baseFile)
$baseSource = [regex]::Replace($baseSource,'(catch//[^\r\n]*\r?\n\s*\{\s*)return OpenFileOnline\(tempEKey\);',
    ('$1if (!Config.OnlineMode) throw;' + [Environment]::NewLine + '                return OpenFileOnline(tempEKey);'))
if (-not $baseSource.Contains('if (!Config.OnlineMode) throw;')) { throw 'Offline fallback patch did not match pinned source.' }
[IO.File]::WriteAllText($baseFile,$baseSource,[Text.UTF8Encoding]::new($false))
$extractProject = Join-Path $projectRoot 'tools/ClientDataExtractor/ClientDataExtractor.csproj'
& dotnet build $extractProject -c Release '-p:TargetFrameworks=net8.0' '-p:GeneratePackageOnBuild=false' "-p:ClientExtractDeps=$dependencyRoot" --nologo
if ($LASTEXITCODE -ne 0) { throw 'Client extractor build failed.' }
$extractBinary = Join-Path $projectRoot 'tools/ClientDataExtractor/bin/Release/net8.0/ClientDataExtractor.dll'
& dotnet $extractBinary $clientRoot (Join-Path $dependencyRoot 'WoWDBDefs/definitions') $outputRoot $Tables $Locale
if ($LASTEXITCODE -ne 0) { throw 'Client extraction failed.' }
[PSCustomObject]@{
    Sources=$readerSources
    ProgramSha256=(Get-FileHash -LiteralPath (Join-Path $projectRoot 'tools/ClientDataExtractor/Program.cs')).Hash.ToLowerInvariant()
    ReadOnly=$true
    NetworkFallback=$false
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputRoot 'reader-tools.json') -Encoding utf8
Write-Output ('Extraction audit: '+(Join-Path $outputRoot 'extraction-audit.json'))
