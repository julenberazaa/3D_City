# helpers.ps1 — shared harness functions

$script:RunId = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$script:ReportDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path "reports\harness\$($script:RunId)"

function New-HarnessRun {
  if (-not (Test-Path $script:ReportDir)) { New-Item -ItemType Directory -Force -Path $script:ReportDir | Out-Null }
  return $script:RunId
}

function Write-GateResult {
  param(
    [string]$GateId,
    [string]$Name,
    [string]$Status,   # PASS | FAIL | BLOCKED_ENVIRONMENT | BLOCKED_EXTERNAL | N/A_WITH_JUSTIFICATION
    [string]$Detail
  )
  $line = "| $GateId | $Name | $Status | $Detail |"
  Add-Content -Path (Join-Path $script:ReportDir "summary.md") -Value $line
  Add-Content -Path (Join-Path $script:ReportDir "gates\$GateId.log") -Value "$Status - $Detail"
  if ($Status -ne "PASS") { $script:AnyNonPass = $true }
}

function Start-HarnessReport {
  param([string]$EnvNote)
  $lines = @(
    "# Harness run $($script:RunId)",
    "",
    "## Environment",
    "- Node: $(node --version)",
    "- npm: $(npm --version)",
    "- OS: $([System.Environment]::OSVersion.VersionString)",
    "- Repo HEAD: $(git rev-parse HEAD 2>$null)",
    "- Branch: $(git branch --show-current 2>$null)",
    $EnvNote,
    "",
    "## Gates",
    "",
    "| Gate | Name | Status | Detail |"
  )
  New-Item -ItemType Directory -Force -Path (Join-Path $script:ReportDir "gates") | Out-Null
  $lines | Set-Content -Path (Join-Path $script:ReportDir "summary.md")
  $script:AnyNonPass = $false
}

function Complete-HarnessReport {
  $summary = Get-Content (Join-Path $script:ReportDir "summary.md")
  $passCount = ($summary | Select-String "\| PASS \|").Count
  $nonPass = ($summary | Select-String "FAIL|BLOCKED|N/A").Count
  $footer = @(
    "",
    "## Result",
    "- PASS gates: $passCount",
    "- Non-PASS gates: $nonPass",
    "- Overall: $(if ($script:AnyNonPass) { "NON-PASS (inspect gates)" } else { "PASS" })",
    "",
    "Report dir: reports/harness/$($script:RunId)/"
  )
  Add-Content -Path (Join-Path $script:ReportDir "summary.md") -Value $footer
  return $script:AnyNonPass
}
