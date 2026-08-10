# run.ps1 — harness orchestrator
# Usage: powershell -File scripts/harness/run.ps1 -Gates all
#        powershell -File scripts/harness/run.ps1 -Gates 00,01,04
param(
  [string]$Gates = "all"
)

$ErrorActionPreference = "Continue"
$here = $PSScriptRoot
. (Join-Path $here "helpers.ps1")
. (Join-Path $here "gates.ps1")

$envNote = ""
if ($Gates -ne "all") { $envNote = "- Run mode: TARGETED (gates: $Gates)" }

$runId = New-HarnessRun
Start-HarnessReport -EnvNote $envNote

$gateMap = [ordered]@{
  "00" = @("environment", "Test-Gate00Environment")
  "01" = @("repo_integrity", "Test-Gate01RepoIntegrity")
  "02" = @("model_lock", "Test-Gate02ModelLock")
  "03" = @("deps", "Test-Gate03Deps")
  "04" = @("build", "Test-Gate04Build")
  "05" = @("lint", "Test-Gate05Lint")
  "06" = @("typecheck", "Test-Gate06Typecheck")
  "07" = @("unit", "Test-Gate07Unit")
  "08" = @("geo_fixture", "Test-Gate08GeoFixture")
  "09" = @("integration", "Test-Gate09Integration")
  "10" = @("browser_smoke", "Test-Gate10BrowserSmoke")
  "11" = @("gameplay_e2e", "Test-Gate11GameplayE2E")
  "12" = @("streaming", "Test-Gate12Streaming")
  "13" = @("determinism_cache", "Test-Gate13DeterminismCache")
  "14" = @("visual_artifacts", "Test-Gate14VisualArtifacts")
  "15" = @("performance_resource", "Test-Gate15PerformanceResource")
  "16" = @("network_degradation", "Test-Gate16NetworkDegradation")
  "17" = @("accessibility", "Test-Gate17Accessibility")
  "18" = @("security_deps", "Test-Gate18SecurityDeps")
  "19" = @("provenance", "Test-Gate19Provenance")
  "20" = @("traceability", "Test-Gate20Traceability")
  "21" = @("placeholder_diff", "Test-Gate21PlaceholderDiff")
  "22" = @("clean_state", "Test-Gate22CleanState")
  "23" = @("final_release", "Test-Gate23FinalRelease")
}

$selected = if ($Gates -eq "all") { $gateMap.Keys } else { $Gates -split "," | ForEach-Object { $_.Trim() } }

foreach ($g in $selected) {
  if (-not $gateMap.Contains($g)) { Write-Host "Unknown gate: $g"; continue }
  $name = $gateMap[$g][0]
  $fn = $gateMap[$g][1]
  Write-Host "== Gate $g $name =="
  $result = & $fn
  $status = $result.Status
  $detail = $result.Detail
  Write-Host "   -> $status : $detail"
  Write-GateResult -GateId $g -Name $name -Status $status -Detail $detail
}

$anyNonPass = Complete-HarnessReport
Write-Host ""
Write-Host "Harness run $runId complete. Report: reports/harness/$runId/summary.md"
if ($anyNonPass) { exit 2 } else { exit 0 }
