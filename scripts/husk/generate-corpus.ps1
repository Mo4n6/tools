<#
.SYNOPSIS
  Generates Husk's deobfuscation regression corpus using Invoke-Obfuscation.

.DESCRIPTION
  Applies every Invoke-Obfuscation transform to a set of known-plaintext
  payloads and writes (obfuscated, expected) pairs as JSON fixtures.

  The point is ground truth we did not author: each variant must deobfuscate
  back to the payload it was generated from, and the transform combinations
  come from the tool rather than from our own assumptions about what
  obfuscators emit.

  Payloads are deliberately benign - no malware is committed to this repo.

.PARAMETER InvokeObfuscationPath
  Path to a clone of https://github.com/danielbohannon/Invoke-Obfuscation

.PARAMETER OutFile
  Destination JSON file.

.EXAMPLE
  pwsh -File scripts/husk/generate-corpus.ps1 -InvokeObfuscationPath /tmp/io
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$InvokeObfuscationPath,
  [string]$OutFile = 'src/features/husk/corpus/fixtures/invoke-obfuscation.json'
)

$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $InvokeObfuscationPath 'Invoke-Obfuscation.psd1') -Force

# Benign payloads chosen to exercise the shapes real droppers use: a bare
# command, a string literal, a variable round-trip, and a pipeline.
# Payload choice matters more than it looks. Out-ObfuscatedTokenCommand only
# transforms the token type it is asked for, so a payload containing no member
# access produces byte-identical output for -TokenTypeToObfuscate Member. Such
# a fixture is worse than useless: a deobfuscator that did nothing would pass
# it and inflate the coverage number. 'all-token-types' exists so that every
# token type has something to work on.
$payloads = [ordered]@{
  'write-host'      = 'Write-Host "hello husk"'
  'string-var'      = '$a = "husk"; Write-Host $a'
  'pipeline'        = "'a','b','c' | ForEach-Object { `$_.ToUpper() }"
  'nested-call'     = '$x = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("husk")); Write-Host $x'
  'all-token-types' = @'
# leading comment
$target = "husk"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($target.ToUpper())
Write-Output -InputObject ([System.Convert]::ToBase64String($bytes)) <# trailing #>
'@
}

# Whole-command encoders. Each takes a scriptblock and returns a launcher
# string that reconstitutes and runs the original.
$encoders = @(
  'Out-EncodedAsciiCommand'
  'Out-EncodedHexCommand'
  'Out-EncodedOctalCommand'
  'Out-EncodedBinaryCommand'
  'Out-EncodedBXORCommand'
  'Out-EncodedWhitespaceCommand'
  'Out-EncodedSpecialCharOnlyCommand'
  'Out-CompressedCommand'
  'Out-SecureStringCommand'
)

# Read the supported token types straight off the cmdlet's ValidateSet.
$script:TokenTypes = (Get-Command Out-ObfuscatedTokenCommand).Parameters['TokenTypeToObfuscate'].Attributes |
  Where-Object { $_ -is [System.Management.Automation.ValidateSetAttribute] } |
  Select-Object -First 1 -ExpandProperty ValidValues

if (-not $script:TokenTypes) { throw 'could not read the TokenTypeToObfuscate ValidateSet' }

$fixtures = [System.Collections.Generic.List[object]]::new()
$failures = [System.Collections.Generic.List[string]]::new()

$skipped = [System.Collections.Generic.List[string]]::new()

function Add-Fixture {
  param($Id, $Transform, $Level, $Payload, $Expected, $Obfuscated)

  if ([string]::IsNullOrWhiteSpace($Obfuscated)) {
    $failures.Add("$Id : produced empty output"); return
  }

  # A transform that had nothing to do returns its input unchanged. Keeping
  # those would pad the corpus with fixtures any no-op deobfuscator passes.
  if ($Obfuscated.Trim() -ceq $Expected.Trim()) {
    $skipped.Add("$Id : no-op, payload contains no such token"); return
  }
  $fixtures.Add([ordered]@{
    id         = $Id
    transform  = $Transform
    level      = $Level
    payload    = $Payload
    expected   = $Expected
    obfuscated = $Obfuscated
  })
}

foreach ($name in $payloads.Keys) {
  $expected = $payloads[$name]
  $block = [ScriptBlock]::Create($expected)

  foreach ($encoder in $encoders) {
    try {
      Add-Fixture -Id "$name/$encoder" -Transform $encoder -Level 1 `
        -Payload $name -Expected $expected -Obfuscated (& $encoder -ScriptBlock $block)
    } catch {
      $failures.Add("$name/$encoder : $($_.Exception.Message)")
    }
  }

  # Token-level obfuscation: the string/concat/backtick/case layer that makes
  # up the bulk of commodity samples.
  #
  # The valid token types are read from the cmdlet's own ValidateSet rather
  # than hardcoded, so this cannot drift from the tool. Levels are probed
  # upward until the cmdlet rejects one, for the same reason: each token type
  # supports a different number and we do not want to assume them.
  foreach ($tokenType in $script:TokenTypes) {
    for ($level = 1; $level -le 8; $level++) {
      try {
        $out = Out-ObfuscatedTokenCommand -ScriptBlock $block -TokenTypeToObfuscate $tokenType -ObfuscationLevel $level
      } catch {
        break  # level out of range for this token type
      }
      Add-Fixture -Id "$name/token-$tokenType-$level" -Transform "Out-ObfuscatedTokenCommand/$tokenType" `
        -Level $level -Payload $name -Expected $expected -Obfuscated $out
    }
  }

  # Whole-string obfuscation (reverse, format operator, replace).
  foreach ($level in 1..3) {
    try {
      $out = Out-ObfuscatedStringCommand -ScriptBlock $block -ObfuscationLevel $level
      Add-Fixture -Id "$name/string-$level" -Transform 'Out-ObfuscatedStringCommand' `
        -Level $level -Payload $name -Expected $expected -Obfuscated $out
    } catch {
      $failures.Add("$name/string-$level : $($_.Exception.Message)")
    }
  }
}

$result = [ordered]@{
  '$comment'   = 'GENERATED by scripts/husk/generate-corpus.ps1 - do not edit by hand.'
  generator    = 'Invoke-Obfuscation'
  generatedFor = 'commodity IR corpus (docs/husk-spec.md section 9)'
  payloads     = $payloads
  fixtures     = $fixtures
}

$dir = Split-Path -Parent $OutFile
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$result | ConvertTo-Json -Depth 10 | Set-Content -Path $OutFile -Encoding utf8

"wrote $OutFile"
"  fixtures: $($fixtures.Count)"
"  payloads: $($payloads.Count)"
if ($skipped.Count -gt 0) {
  "  skipped as no-ops: $($skipped.Count)"
}
if ($failures.Count -gt 0) {
  "  transforms that did not produce output: $($failures.Count)"
  $failures | ForEach-Object { "    $_" }
}
