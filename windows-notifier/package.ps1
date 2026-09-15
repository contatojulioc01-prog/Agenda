$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseDirectory = Join-Path $projectRoot 'release'
$sourceExe = Join-Path $projectRoot 'frontend\public\downloads\Agenda.Notifier.exe'
$publishedExe = Join-Path $projectRoot 'backend\public\downloads\Agenda.Notifier.exe'
if ((Get-FileHash -LiteralPath $sourceExe).Hash -ne (Get-FileHash -LiteralPath $publishedExe).Hash) {
    throw 'Build the notifier, then run npm run build before packaging.'
}
$staging = Join-Path $env:TEMP ('Agenda-release-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $staging 'backend') -Force | Out-Null
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$backendSource = Join-Path $projectRoot 'backend'
Get-ChildItem -LiteralPath $backendSource -File | Where-Object { $_.Extension -eq '.js' -or $_.Name -in @('package.json', 'package-lock.json', 'ecosystem.config.cjs') } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $staging 'backend')
}
foreach ($folder in @('routes', 'public')) {
    Copy-Item -LiteralPath (Join-Path $backendSource $folder) -Destination (Join-Path $staging 'backend') -Recurse
}
foreach ($file in @('package.json', 'production-start.js', 'BUILD.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $staging
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs\REVISAO-NOTIFICACOES-V4.md') -Destination (Join-Path $staging 'ATUALIZACAO.md')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination (Join-Path $staging 'NOTIFICADOR.md')
$zipPath = Join-Path $releaseDirectory 'Agenda-Servidor-v4-20260915.zip'
if (Test-Path -LiteralPath $zipPath) { throw "Release already exists: $zipPath" }
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -CompressionLevel Optimal
$checksums = @(
    ((Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash + '  Agenda.Notifier.exe'),
    ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash + '  Agenda-Servidor-v4-20260915.zip')
)
[System.IO.File]::WriteAllLines((Join-Path $releaseDirectory 'SHA256SUMS.txt'), $checksums, [System.Text.UTF8Encoding]::new($false))
Write-Host "Release: $zipPath"
Write-Host "Staging: $staging"
