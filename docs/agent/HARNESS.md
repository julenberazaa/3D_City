# HARNESS — gates and structure

`npm run harness` runs all gates in order. Each gate returns one of:
**PASS / FAIL / BLOCKED_ENVIRONMENT / BLOCKED_EXTERNAL / N/A_WITH_JUSTIFICATION**
(N/A is never "not implemented" — it needs a recorded reason).

Reports go to `reports/harness/<run-id>/` (run-id = UTC timestamp). A later green run
never overwrites an earlier failed run. `npm run harness:target <name>` runs one gate.

## Gates

| # | Gate | What | Deterministic? |
|---|---|---|---|
| 00 | environment | node/npm/git versions present | yes |
| 01 | repo_integrity | git remote = julenberazaa/3D_City, on main, no uncommitted junk | yes |
| 02 | model_lock | docs/agent/MODEL_LOCK.md present + models match catalogue | yes (static) |
| 03 | deps | `npm ci` succeeds (lockfile present) | yes |
| 04 | build | `npm run build` succeeds | yes |
| 05 | lint | `npm run lint` clean | yes |
| 06 | typecheck | `npm run typecheck` clean | yes |
| 07 | unit | `npm run test` (Vitest) green | yes |
| 08 | geo_fixture | deterministic pinned-geography tests | yes |
| 09 | integration | geo fusion / pipeline tests | yes |
| 10 | browser_smoke | Playwright: app boots, canvas present | mostly (local) |
| 11 | gameplay_e2e | Playwright: search → world → drive | mostly (local) |
| 12 | streaming | chunk lifecycle/cancellation tests | yes (unit) |
| 13 | determinism_cache | determinism + cache behavior tests | yes |
| 14 | visual_artifacts | screenshots captured to reports/visual | mostly |
| 15 | performance_resource | deterministic resource counters (FPS gate = env-limited) | partial |
| 16 | network_degradation | fault-injection failure handling | yes |
| 17 | accessibility | keyboard/a11y assertions on UI shell | mostly |
| 18 | security_deps | `npm audit` + secret scan | mostly |
| 19 | provenance | PROVENANCE/DATA_SOURCES present + consistent | yes |
| 20 | traceability | every R-xxx maps to code+test+evidence | yes (script) |
| 21 | placeholder_diff | grep for TODO/FIXME/stub/hack in src (only justified allowed) | yes |
| 22 | clean_state | fresh `npm ci` + build from clean state | yes (slow) |
| 23 | final_release | all P0 gates PASS + report bundle | yes |

## Hardware/GPU honesty
If CI/host GPU cannot represent real hardware: the FPS part of gate 15 is marked
BLOCKED_ENVIRONMENT with counters only, never faked PASS. Live-network gates
(13-live, 10-…) are marked BLOCKED_EXTERNAL on outage with evidence, never FAIL
for code regressions they are not.

## Script layout
- `scripts/harness/run.ps1` — orchestrator (run-id, gate order, report).
- `scripts/harness/gates/*.ps1` — one file per gate.
- `scripts/harness/helpers.ps1` — shared reporting functions.
