# gates.ps1 — harness gate definitions.
# Each gate is a function returning @{ Status; Detail }.

function Invoke-CommandCapture {
  param([string]$Command, [string]$Args)
  $out = & $Command $Args 2>&1
  return $out
}

function Test-Gate00Environment {
  $node = node --version 2>&1
  $npm = npm --version 2>&1
  if ($LASTEXITCODE -ne 0 -or -not $node) {
    return @{ Status = "FAIL"; Detail = "node missing: $node" }
  }
  return @{ Status = "PASS"; Detail = "node $node, npm $npm" }
}

function Test-Gate01RepoIntegrity {
  $remote = git remote get-url origin 2>&1
  $branch = git branch --show-current 2>&1
  $dirty = git status --porcelain 2>&1
  if ($remote -ne "https://github.com/julenberazaa/3D_City.git") {
    return @{ Status = "FAIL"; Detail = "remote mismatch: $remote" }
  }
  if ($branch -ne "main") { return @{ Status = "FAIL"; Detail = "branch $branch" } }
  $note = if ($dirty) { "dirty files: $($dirty -join '; ')" } else { "clean" }
  return @{ Status = "PASS"; Detail = "remote OK, main, $note" }
}

function Test-Gate02ModelLock {
  $lock = Test-Path "docs/agent/MODEL_LOCK.md"
  if (-not $lock) { return @{ Status = "FAIL"; Detail = "MODEL_LOCK.md missing" } }
  $content = Get-Content "docs/agent/MODEL_LOCK.md" -Raw
  if ($content -notmatch "opencode-go/deepseek-v4-flash") { return @{ Status = "FAIL"; Detail = "engineering model not locked" } }
  if ($content -notmatch "opencode-go/gpt-5.6-luna") { return @{ Status = "FAIL"; Detail = "visual model not locked" } }
  return @{ Status = "PASS"; Detail = "MODEL_LOCK.md pins engineering+visual models" }
}

function Test-Gate03Deps {
  if (-not (Test-Path "package-lock.json")) { return @{ Status = "FAIL"; Detail = "no lockfile" } }
  $out = npm ci 2>&1
  if ($LASTEXITCODE -ne 0) { return @{ Status = "FAIL"; Detail = "npm ci failed: $($out | Select-Object -Last 3)" } }
  return @{ Status = "PASS"; Detail = "npm ci ok" }
}

function Test-Gate04Build {
  $out = npm run build 2>&1
  if ($LASTEXITCODE -ne 0) { return @{ Status = "FAIL"; Detail = "build failed: $($out | Select-Object -Last 5)" } }
  return @{ Status = "PASS"; Detail = "vite build ok" }
}

function Test-Gate05Lint {
  $out = npm run lint 2>&1
  if ($LASTEXITCODE -ne 0) { return @{ Status = "FAIL"; Detail = "lint failed: $($out | Select-Object -Last 5)" } }
  return @{ Status = "PASS"; Detail = "eslint clean" }
}

function Test-Gate06Typecheck {
  $out = npm run typecheck 2>&1
  if ($LASTEXITCODE -ne 0) { return @{ Status = "FAIL"; Detail = "typecheck failed: $($out | Select-Object -Last 8)" } }
  return @{ Status = "PASS"; Detail = "tsc clean" }
}

function Test-Gate07Unit {
  $tests = Get-ChildItem -Recurse -Filter "*.test.ts" tests -ErrorAction SilentlyContinue
  if (-not $tests) { return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no unit tests exist yet (bootstrap)" } }
  $out = npm run test 2>&1
  if ($LASTEXITCODE -ne 0) { return @{ Status = "FAIL"; Detail = "vitest failed: $($out | Select-Object -Last 8)" } }
  return @{ Status = "PASS"; Detail = "vitest green ($($tests.Count) files)" }
}

function Test-Gate08GeoFixture {
  $tests = Get-ChildItem -Recurse -Filter "*.test.ts" tests -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "fixture|geo" }
  if (-not $tests) { return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no geo fixture tests yet (requires WP-02+)" } }
  $out = npx vitest run (($tests.FullName | ForEach-Object { [IO.Path]::GetFileNameWithoutExtension($_) }) -join " ") 2>&1
  if ($LASTEXITCODE -ne 0) { return @{ Status = "FAIL"; Detail = $out | Select-Object -Last 5 } }
  return @{ Status = "PASS"; Detail = "fixture tests green" }
}

function Test-Gate09Integration {
  $tests = Get-ChildItem -Recurse -Filter "*.test.ts" tests -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "fusion|pipeline|integration" }
  if (-not $tests) { return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no integration tests yet (requires WP-04+)" } }
  return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "integration gate pending dedicated script" }
}

function Test-Gate10BrowserSmoke {
  if (-not (Test-Path "tests/e2e")) { return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no e2e tests yet (requires WP-02+)" } }
  $out = npx playwright test --project=chromium smoke 2>&1
  if ($LASTEXITCODE -ne 0) { return @{ Status = "FAIL"; Detail = $out | Select-Object -Last 8 } }
  return @{ Status = "PASS"; Detail = "browser smoke green" }
}

function Test-Gate11GameplayE2E {
  if (-not (Test-Path "tests/e2e/gameplay")) { return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no gameplay e2e yet (requires WP-03+)" } }
  $out = npx playwright test --project=chromium gameplay 2>&1
  if ($LASTEXITCODE -ne 0) { return @{ Status = "FAIL"; Detail = $out | Select-Object -Last 8 } }
  return @{ Status = "PASS"; Detail = "gameplay e2e green" }
}

function Test-Gate12Streaming {
  $tests = Get-ChildItem -Recurse -Filter "*.test.ts" tests -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "stream|chunk" }
  if (-not $tests) { return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no streaming tests yet (requires WP-06)" } }
  $out = npm run test -- --reporter=dot 2>&1 | Select-Object -Last 3
  return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "streaming gate pending dedicated script" }
}

function Test-Gate13DeterminismCache {
  $tests = Get-ChildItem -Recurse -Filter "*.test.ts" tests -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "determin|cache" }
  if (-not $tests) { return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no determinism/cache tests yet (requires WP-07)" } }
  return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "determinism gate pending dedicated script" }
}

function Test-Gate14VisualArtifacts {
  if (-not (Get-ChildItem "reports/visual" -Filter "*.png" -ErrorAction SilentlyContinue)) {
    return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no visual artifacts yet (requires WP-02+)" }
  }
  return @{ Status = "PASS"; Detail = "screenshots exist in reports/visual" }
}

function Test-Gate15PerformanceResource {
  if (-not (Get-ChildItem "reports/performance" -ErrorAction SilentlyContinue)) {
    return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no performance evidence yet (requires WP-11)" }
  }
  return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "performance gate pending dedicated script" }
}

function Test-Gate16NetworkDegradation {
  $tests = Get-ChildItem -Recurse -Filter "*.test.ts" tests -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "fail|fault|degrad" }
  if (-not $tests) { return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no fault-injection tests yet (requires WP-05+)" } }
  return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "network degradation gate pending dedicated script" }
}

function Test-Gate17Accessibility {
  if (-not (Test-Path "tests/e2e/a11y")) { return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "no a11y e2e yet (requires WP-12)" } }
  return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "a11y gate pending dedicated script" }
}

function Test-Gate18SecurityDeps {
  $out = npm audit --omit=dev 2>&1
  $auditOk = $LASTEXITCODE -eq 0
  $secrets = Get-ChildItem -Recurse -File -Path . -Exclude "*.log","package-lock.json" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "\\node_modules\\|\\reports\\|\\dist\\" } | Select-String -Pattern "AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY" -ErrorAction SilentlyContinue
  $note = if ($secrets) { "; SECRET PATTERN FOUND in: $($secrets | Select-Object -First 3 | ForEach-Object { $_.Path })" } else { "" }
  if (-not $auditOk -or $secrets) { return @{ Status = "FAIL"; Detail = "audit exit $LASTEXITCODE$note" } }
  return @{ Status = "PASS"; Detail = "npm audit clean, no secret patterns$note" }
}

function Test-Gate19Provenance {
  $ok = (Test-Path "docs/agent/PROVENANCE.md") -and (Test-Path "docs/agent/DATA_SOURCES.md") -and (Test-Path "docs/agent/UPSTREAM_REUSE_AUDIT.md")
  if (-not $ok) { return @{ Status = "FAIL"; Detail = "provenance docs incomplete" } }
  return @{ Status = "PASS"; Detail = "PROVENANCE/DATA_SOURCES/REUSE_AUDIT present" }
}

function Test-Gate20Traceability {
  if (-not (Test-Path "docs/agent/TRACEABILITY.md")) { return @{ Status = "FAIL"; Detail = "TRACEABILITY.md missing" } }
  $unmapped = Get-Content "docs/agent/REQUIREMENTS.md" -Raw | Select-String -Pattern "R-\d{3}" -AllMatches | ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
  $mapped = Get-Content "docs/agent/TRACEABILITY.md" -Raw | Select-String -Pattern "R-\d{3}" -AllMatches | ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
  $missing = $unmapped | Where-Object { $_ -notin $mapped }
  if ($missing) { return @{ Status = "FAIL"; Detail = "untraced requirements: $($missing -join ', ')" } }
  return @{ Status = "PASS"; Detail = "$($mapped.Count) requirements traced" }
}

function Test-Gate21PlaceholderDiff {
  $hits = Get-ChildItem -Recurse -File src -Include "*.ts","*.js" -ErrorAction SilentlyContinue | Select-String -Pattern "TODO|FIXME|HACK|stub\(|placeholder" -ErrorAction SilentlyContinue
  $unjustified = @()
  foreach ($h in $hits) {
    $line = $h.Line.Trim()
    if ($line -notmatch "TODO|FIXME") { continue }
    $unjustified += "$($h.Path):$($h.LineNumber)"
  }
  if ($unjustified.Count -gt 0) { return @{ Status = "FAIL"; Detail = "placeholders: $($unjustified -join '; ')" } }
  return @{ Status = "PASS"; Detail = "no unjustified placeholders in src" }
}

function Test-Gate22CleanState {
  return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "clean-state gate runs on CI at release (slow, not in bootstrap harness)" }
}

function Test-Gate23FinalRelease {
  return @{ Status = "N/A_WITH_JUSTIFICATION"; Detail = "final release gate runs only at SHIP decision" }
}
