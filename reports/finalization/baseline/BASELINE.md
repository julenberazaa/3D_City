# FINALIZATION BASELINE

BASELINE_COMMIT: ee46b7ec307295b732a54d13487b4f7b75783fea
BASELINE_BRANCH: main (checkpoint verified clean)
HARDENING_BRANCH: final-hardening (created from ee46b7e)

## Environment
- OS: Windows, PowerShell 5.1
- node v24.13.0, npm 11.6.2, git 2.52.0.windows.1
- Playwright chromium with `--use-angle=swiftshader` (software rendering, deterministic CI/e2e only)

## Test counts (all PASS at baseline)
- Unit/integration: 67 tests / 11 files (projection, mvt, terrarium, fixture, generator,
  fusion, physics, chunkManager, cache, chunkKey, search)
- E2E: 6 passed (smoke fixture, drive, perf, search x2, live incl. cache-hit)
- Full harness: all applicable gates PASS (Gate01 modified to accept final-hardening branch)

## Build
- dist total: 18,871,351 B (11 files, incl. sourcemaps + offline fixtures)
- Largest: index JS 3,443,517 B (+ 6,088,120 B map), buildings.json 3,758,947 B,
  gazetteer.json 3,575,455 B, roads.json 1,892,846 B
- KNOWN_WARNINGS: chunk size warning (limit 900 KB); rolldown code-splitting suggestion

## KNOWN_FAILURES
- None at baseline.

## KNOWN_ENVIRONMENT_LIMITATIONS
- All Playwright runs use SwiftShader -> previous FPS evidence is NOT hardware evidence.
- FPS-target gate must be BLOCKED_ENVIRONMENT until a real GPU session is measured.
- CI `verify` job runs smoke+drive e2e on Ubuntu chromium (software GL).
- Live-data e2e requires internet; skips as BLOCKED_EXTERNAL when offline.

## Baseline runtime evidence (software renderer, informational only)
- perf.spec drive session: FPS p50 18.9, p95 68.7 (SwiftShader), heap ~87 MB after warm-up.
- drive-session.json: heap ≤ 51 MB during drive capture.
