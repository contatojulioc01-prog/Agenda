$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'frontend\\public\\downloads'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
if (-not (Test-Path $compiler)) { throw '.NET Framework 4.8 não foi encontrado neste computador.' }
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /out:"$outputDirectory\\Agenda.Notifier.exe" /win32manifest:"$PSScriptRoot\\app.manifest" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Security.dll /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll "$PSScriptRoot\\Agenda.Notifier.cs"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o Agenda Notifier.' }
Write-Host "Executável criado em $outputDirectory\\Agenda.Notifier.exe"
