param([string]$SevenZip = 'C:\Program Files\7-Zip\7z.exe')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskCache = Join-Path $taskRoot '.cache'
$taskManifest = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'sources.json') | ConvertFrom-Json
New-Item -ItemType Directory -Path $taskCache -Force | Out-Null

function Test-Checksum([string]$Path, [string]$Sha) {
    return (Test-Path -LiteralPath $Path) -and ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -eq $Sha)
}
function Get-VerifiedFile([string]$Url, [string]$Path, [string]$Sha) {
    if (Test-Checksum $Path $Sha) { return }
    $taskPart = $Path + '.part'
    Invoke-WebRequest -Uri $Url -OutFile $taskPart
    if (-not (Test-Checksum $taskPart $Sha)) { throw "下载校验失败：$Url" }
    Move-Item -LiteralPath $taskPart -Destination $Path -Force
}

foreach ($taskSource in $taskManifest.sql) {
    if ([IO.Path]::GetFileName($taskSource.file) -ne $taskSource.file) { throw '无效的数据文件名' }
    $taskTarget = Join-Path $taskCache $taskSource.file
    if (Test-Checksum $taskTarget $taskSource.sha256) { continue }
    if ($taskSource.member) {
        if (-not (Test-Path -LiteralPath $SevenZip)) { throw '请安装 7-Zip，或通过 -SevenZip 指定 7z.exe。' }
        $taskArchive = Join-Path $taskCache 'TDB_full_735.00_2018_02_19.7z'
        Get-VerifiedFile $taskManifest.archive.url $taskArchive $taskManifest.archive.sha256
        & $SevenZip e $taskArchive ('-o' + $taskCache) $taskSource.member -y | Out-Host
        if ($LASTEXITCODE -ne 0 -or -not (Test-Checksum $taskTarget $taskSource.sha256)) { throw "解压校验失败：$($taskSource.file)" }
    } else {
        Get-VerifiedFile $taskSource.url $taskTarget $taskSource.sha256
    }
}
$taskMedia = Join-Path $taskRoot 'AddOns/TauriChinese/Media'
New-Item -ItemType Directory -Path $taskMedia -Force | Out-Null
Get-VerifiedFile $taskManifest.font.url (Join-Path $taskMedia 'LXGWWenKaiLite-Regular.ttf') $taskManifest.font.sha256
Get-VerifiedFile $taskManifest.font.licenseUrl (Join-Path $taskMedia 'OFL.txt') $taskManifest.font.licenseSha256
Write-Output '数据与字体已校验。运行 npm run build 生成中文资源。'
