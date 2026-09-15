param([switch]$Toast)
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$testDirectory = Join-Path $env:TEMP ('AgendaNotifier-tests-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testDirectory | Out-Null
$testExe = Join-Path $testDirectory 'SmokeTests.exe'
& $compiler /nologo /codepage:65001 /target:exe /main:AgendaNotifier.SmokeTests /out:$testExe /win32icon:"$PSScriptRoot\Agenda.Notifier.ico" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Security.dll /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll /reference:System.Xml.dll "$PSScriptRoot\Agenda.Notifier.cs" "$PSScriptRoot\Desktop.cs" "$PSScriptRoot\SmokeTests.cs"
if ($LASTEXITCODE -ne 0) { throw 'Test compilation failed.' }
$preview = Join-Path $testDirectory 'kanban.png'
if ($Toast) { & $testExe $preview --toast } else { & $testExe $preview }
if ($LASTEXITCODE -ne 0) { throw 'Notifier tests failed.' }
if ($Toast) {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
    $history = [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('AgendaCorporativa.Notifier')
    $verified = $false
    foreach ($notice in $history) {
        $xml = [xml]$notice.Content.GetXml()
        if ($xml.toast.launch -eq 'https://example.com/agenda/') {
            if ($xml.toast.activationType -ne 'protocol') { throw 'Wrong activation type.' }
            $verified = $true
            [Windows.UI.Notifications.ToastNotificationManager]::History.Remove($notice.Tag, 'deadlines', 'AgendaCorporativa.Notifier')
        }
    }
    if (-not $verified) { throw 'Test notification missing from Windows notification history.' }
    Write-Host 'Native toast verified in Windows history; test entry removed.'
}
Write-Host "Preview: $preview"
