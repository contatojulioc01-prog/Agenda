$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'frontend\\public\\downloads'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
if (-not (Test-Path $compiler)) { throw '.NET Framework compiler not found on this computer.' }
& "$PSScriptRoot\\build-icon.ps1"
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
& $compiler /nologo /codepage:65001 /target:winexe /platform:anycpu /optimize+ /out:"$outputDirectory\\Agenda.Notifier.exe" /win32icon:"$PSScriptRoot\\Agenda.Notifier.ico" /win32manifest:"$PSScriptRoot\\app.manifest" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Security.dll /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll "$PSScriptRoot\\Agenda.Notifier.cs" "$PSScriptRoot\\Desktop.cs"
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o Agenda Notifier.' }
Write-Host "Executable: $outputDirectory\\Agenda.Notifier.exe"
