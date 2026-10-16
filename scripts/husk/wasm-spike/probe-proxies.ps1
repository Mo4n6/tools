#!/usr/bin/env pwsh
# Husk — PowerShell deobfuscation and IOC extraction, fully browser-local.
# SPDX-License-Identifier: PolyForm-Small-Business-1.0.0
# Required Notice: Copyright 2026 Mo4n6 (https://github.com/Mo4n6/tools)
#
# Runs the PowerShell proxies out of Program.cs against a stand-in recorder, so
# a parser can be checked in a second instead of after a three-minute wasm
# rebuild.
#
#   pwsh scripts/husk/wasm-spike/probe-proxies.ps1
#
# The proxies are PowerShell living inside a C# verbatim string. That is awkward
# to test and was therefore not tested: every change to a parser meant a full
# engine build, and the slow loop is why a bug of exactly the kind below shipped
# twice. This lifts the block out, unescapes the doubled quotes, dot-sources it
# and exercises it.
#
# What it found on its first run, which five rebuilds had not: `reg add`
# delegates to the registry provider and falls back to recording directly if
# that fails, but `New-Item` writes a *non-terminating* error. The try/catch
# never saw it, the fallback worked, and the error landed in the error stream -
# where RunFixture reports Error[0] as the sample's own error. A path the
# provider would not take became the error an analyst reads for a sample whose
# run was fine. Every delegated call now carries -ErrorAction Stop.
#
# What this cannot check: anything needing the real host. [HuskHost] is a
# stand-in here, there are no registry drives, and $global:HuskRealNewObject is
# the genuine cmdlet rather than the engine's captured reference - so the
# delegation path always takes its fallback. That is still worth running: the
# fallback is a branch, and it is the branch that must not be noisy.

Set-StrictMode -Off
$ErrorActionPreference = 'Continue'

$programCs = Join-Path $PSScriptRoot 'Program.cs'
if (-not (Test-Path $programCs)) { throw "not found: $programCs" }

# The slice markers. Both are comments in Program.cs rather than anything the
# compiler needs, so a rename here is a silent no-match - hence the throw.
$startMarker = '# ---- Persistence ---'
$endMarker = 'function New-Object {'

$text = Get-Content -Raw -Path $programCs
$start = $text.IndexOf($startMarker)
$end = $text.IndexOf($endMarker, [Math]::Max($start, 0))
if ($start -lt 0 -or $end -lt 0) {
    throw "markers not found in Program.cs - did the proxy block move? ('$startMarker', '$endMarker')"
}

# Inside a C# verbatim string a quote is written twice. Nothing else is escaped.
$block = $text.Substring($start, $end - $start).Replace('""', '"')
$blockFile = Join-Path ([System.IO.Path]::GetTempPath()) 'husk-proxy-block.ps1'
Set-Content -Path $blockFile -Value $block -NoNewline

Add-Type -TypeDefinition @"
using System.Collections.Generic;
public class HuskHost {
    public static List<string> Calls = new List<string>();
    public static void Record(string op, string native, string[] args) {
        Calls.Add(op + " | " + native + " | [" + string.Join(", ", args) + "]");
    }
}
"@

$global:HuskRealNewObject = Get-Command -Name New-Object -CommandType Cmdlet
. $blockFile

$script:failures = 0
$script:checks = 0

# Asserts on the ops recorded, not on their arguments: the arguments carry dates
# and vary by host, and the op is the part a timeline filter depends on. Argument
# shape is checked by eye in the printed output and over the sample corpus.
function Expect($label, [string[]] $wantOps, [scriptblock] $body) {
    [HuskHost]::Calls.Clear()

    # Counts ErrorRecords written to the *error stream*, which is what the
    # engine's RunFixture reports as the sample's error. Not $Error: PowerShell
    # appends an exception to $Error even when a try/catch handles it, so
    # counting that flagged every correctly-caught delegation failure as a leak
    # - which is what this check exists to tell apart.
    $leaked = 0
    try {
        $emitted = & $body 2>&1
        $leaked = @($emitted | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }).Count
    } catch { Write-Host ("  THREW: " + $_.Exception.Message) }

    $gotOps = @([HuskHost]::Calls | ForEach-Object { ($_ -split ' \| ')[0] })
    $ok = ($gotOps -join ',') -eq ($wantOps -join ',')
    $script:checks++

    if ($ok -and $leaked -eq 0) {
        Write-Host "ok   $label"
    } else {
        $script:failures++
        Write-Host "FAIL $label"
        if (-not $ok) {
            Write-Host ("     want ops: [" + ($wantOps -join ', ') + "]")
            Write-Host ("     got  ops: [" + ($gotOps -join ', ') + "]")
        }
        # A proxy that records correctly but writes to the error stream is still
        # a failure: that error is reported as the sample's own.
        if ($leaked -ne 0) { Write-Host "     leaked $leaked error(s) into the error stream" }
    }
    foreach ($c in [HuskHost]::Calls) { Write-Host "       $c" }
}

Write-Host '--- schtasks ---'
# The first two are real corpus lines. The third spells /create out of a $windir
# substring, which is why the parser keys on /tn and /tr rather than the verb.
Expect 'create, corpus line' @('persistence.scheduled-task') {
    schtasks.exe /Create /SC MINUTE /TN 'Update service for Windows Service' /TR 'PowerShell.exe -enc QQBB' /MO 30 /F
}
Expect '/mo before /sc' @('persistence.scheduled-task') { schtasks /create /mo 4 /sc minute /tn 'A' /tr 'x.vbs' }
Expect 'obfuscated verb' @('persistence.scheduled-task') { schtasks /F '/%windir:~0,1%reate' /sc minute /mo 4 /TN 'S' /TR 'o.exe' }
Expect 'create without /tr' @('persistence.scheduled-task') { schtasks /create /tn OnlyName /xml t.xml }
Expect '/change supplying a command' @('persistence.scheduled-task') { schtasks /change /tn Forced /tr 'new.exe' }
# Removing, disabling and listing establish nothing. They are still a process.
Expect '/delete is not persistence' @('process.start') { schtasks /delete /tn det /f }
Expect '/query is not persistence' @('process.start') { schtasks /query /FO CSV /v }
Expect '/change /disable is not persistence' @('process.start') { schtasks /change /tn Forced /disable }

Write-Host '--- reg ---'
Expect 'add' @('registry.write') { reg add 'HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' /v 1 /d 'C:\e.exe' }
Expect 'add, short hive' @('registry.write') { reg.exe add 'HKLM\SYSTEM\CurrentControlSet\Services\U' /v ImagePath /d 'C:\e.exe' /f }
Expect 'add /ve default value' @('registry.write') { reg add 'HKCU\Software\Classes\CLSID\{abc}' /ve /t REG_SZ /d 'C:\x.dll' /f }
Expect 'delete' @('registry.delete') { reg delete 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' /v Updater /f }
Expect 'query' @('registry.read') { reg query 'HKCU\Software\Microsoft\Windows\CurrentVersion\Run' }
Expect 'unmapped hive still records' @('registry.write') { reg add 'NOTAHIVE\Foo' /v a /d b }
Expect 'no arguments records nothing' @() { reg }

Write-Host '--- the ScheduledTasks cmdlet family ---'
Expect 'Once with a repetition interval' @('persistence.scheduled-task') {
    $t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 2)
    Register-ScheduledTask -TaskName 'G' -Action (New-ScheduledTaskAction -Execute 'C:\d.vbs') -Trigger $t
}
# -RandomDelay and -Force arrive in $args the same way -Once does. Taking the
# last switch as the trigger kind reported this task's trigger as 'force'.
Expect 'trailing -Force does not become the trigger kind' @('persistence.scheduled-task') {
    $t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RandomDelay (New-TimeSpan -Minutes 1)
    $p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
    Register-ScheduledTask -TaskName 'Forced' -Trigger $t -Action (New-ScheduledTaskAction -Execute 'C:\z.exe') -Principal $p -Force
}
Expect 'AtStartup, action carrying -Argument' @('persistence.scheduled-task') {
    $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-WindowStyle hidden -File C:\K.ps1'
    Register-ScheduledTask -TaskName 'KDOT' -Trigger (New-ScheduledTaskTrigger -AtStartup) -Action $a -RunLevel Highest -Force
}
Expect 'a whole task through -InputObject' @('persistence.scheduled-task') {
    $task = New-ScheduledTask -Action (New-ScheduledTaskAction -Execute 'C:\x.exe' -Argument '/q') -Trigger (New-ScheduledTaskTrigger -AtLogon)
    Register-ScheduledTask -TaskName 'Inner' -InputObject $task
}
# The XML form puts the command inside the document instead of in -Action, and
# is recorded whole rather than parsed for <Command>.
Expect 'the -Xml form' @('persistence.scheduled-task') {
    Register-ScheduledTask -TaskName 'FromXml' -Xml '<Task><Actions><Exec><Command>C:\x.exe</Command></Exec></Actions></Task>'
}
Expect 'Set-ScheduledTask' @('persistence.scheduled-task') {
    Set-ScheduledTask -TaskName 'Forced' -Action (New-ScheduledTaskAction -Execute 'C:\z.exe')
}
# Everything empty must not throw on the way to an empty string[].
Expect 'Register with no arguments' @('persistence.scheduled-task') { Register-ScheduledTask }
# host/ops.ts has no term for removing or listing a task, and a wrong category
# costs more than a missing record.
Expect 'Unregister and Get record nothing' @() {
    Unregister-ScheduledTask -TaskName 'Other'
    Get-ScheduledTask -TaskName 'Inner'
}

Write-Host ''
if ($script:failures -eq 0) {
    Write-Host "$($script:checks) checks passed"
    exit 0
}
Write-Host "$($script:failures) of $($script:checks) checks FAILED"
exit 1
