# STATUS — Executive Engineering State

Updated: 2026-08-11 (final release — SHIP)

States: NOT_STARTED / ACTIVE / PASS / FAIL / BLOCKED_EXTERNAL / DEFERRED_NONCRITICAL

| ID | SCOPE | STATE | REQUIREMENTS | TESTS | EVIDENCE |
|---|---|---|---|---|---|
| WP-00 | Env + harness + docs + model lock | PASS | R-001, R-027 | harness gates | harness run (final round) |
| WP-01 | Upstream reuse audit + architecture freeze | PASS | R-007 | audit doc | docs/agent/UPSTREAM_REUSE_AUDIT.md |
| WP-02 | Static slice (fixtures SF, generator, renderer, smoke) | PASS | R-004..R-006, R-010 | fixture + generator + smoke | reports/visual/final/02-fixture-world.png |
| WP-03 | Physics slice (terrain/buildings colliders, raycast car, controls, safe spawn, recovery R) | PASS | R-011, R-016, R-021 | 12 physics tests + drive e2e | drive e2e (causality/ground-truth/R gates) |
| WP-04 | Geo fusion (geo↔local, seams, stitching) | PASS | R-012 | fusion tests | tests/unit/fusion.test.ts |
| WP-05 | Live data pipeline (Overture + terrarium, ?bbox=) | PASS | R-009, R-013 | live e2e | reports/visual/final/05-dense-city.png |
| WP-06 | Chunk streamer (async batched generation, cancellable, bounded) | PASS | R-014, R-025 | chunkManager + streamer-race tests | stress benchmarks (45+ chunks) |
| WP-07 | Persistent cache (LRU 200 MB, corruption, self-heal) | PASS | R-015 | cache tests | hardware-revisit.json (100% hits) |
| WP-08 | Place search (gazetteer 34k + Open-Meteo fallback, a11y) | PASS | R-002, R-026 | search unit + 4 e2e | search e2e suite |
| WP-09 | World fidelity (roofs, parts, water, landcover, stitching, bridge rule) | PASS | R-017..R-019 | fixture tests incl. bridge | bridge-rule fixture test |
| WP-10 | Walk mode | DEFERRED_NONCRITICAL | R-020 | — | documented; outside V1 core |
| WP-11 | Performance hardening (async generation, decimation, governor, real-GPU benchmark) | PASS | R-022 | render-quality tests + hardware benchmarks | FPS p50 161-164, p95 ≤8.4 ms, stalls 1, heap bounded |
| WP-12 | UX/visual + Luna final review | PASS | R-023 | Luna 2 cycles | reports/visual/final/*.png |
| WP-13 | Optional imagery (Panoramax) | DEFERRED_NONCRITICAL | (P3) | — | documented |
| WP-14 | Release/deploy (README, CI, Pages enabled + verified) | PASS | R-024 | clean-clone test, CI, Pages | https://julenberazaa.github.io/3D_City/ |

## Baseline (original, 2026-08-10)
- Repo: `julenberazaa/3D_City`, branch `main`, HEAD `7c699ad` at bootstrap; final `main` HEAD: see CONTINUATION.md.
- Node v24.13.0, npm 11.6.2, Windows, Playwright chromium (SwiftShader for CI), real Chrome 151 for hardware benchmarks.
