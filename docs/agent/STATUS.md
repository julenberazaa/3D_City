# STATUS — Executive Engineering State

Updated: 2026-08-10 (WP-02c static slice green)

States: NOT_STARTED / ACTIVE / PASS / FAIL / BLOCKED_EXTERNAL / DEFERRED_NONCRITICAL

| ID | SCOPE | STATE | REQUIREMENTS | TESTS | EVIDENCE | NEXT |
|---|---|---|---|---|---|---|
| WP-00 | Env + harness + docs + model lock | ACTIVE | R-001..R-006 | harness smoke | run-id pending | finish harness + baseline |
| WP-01 | Upstream reuse audit + architecture freeze | PASS | R-007 | audit doc + probes | reports/research + audits 2026-08-10 | WP-02 |
| WP-02 | Static vertical slice — WP-02a geo foundation DONE, WP-02b fixtures DONE (SF downtown: 14,948 buildings, 12,890 roads, 16 terrain chunks), WP-02c generator+renderer+camera+smoke DONE (buildWorld determinism verified; 26 unit tests green; e2e smoke green; screenshot exists) | ACTIVE | R-004..R-006, R-010 | 26 unit tests + smoke e2e | fixtures/sf-downtown/, reports/visual/wp02-slice.png, harness 20260810-132940 | reviewer pass on WP-02c, then WP-03 |
| WP-03 | Physics vertical slice — Rapier world (16 terrain heightfields + 14,004 building boxes), raycast vehicle (calibrated), keyboard controls, camera follow, safe spawn (building clearance), adaptive pixel ratio; drive e2e GREEN | PASS | R-011, R-016 (partial) | 37 unit tests + 2 e2e | reports/visual/wp03-drive.png, harness run 20260810-1913xx | WP-04 |
| WP-04 | Geo fusion — GeoFusionPipeline (geo↔local, unified elevation policy, deterministic terrain edge stitching ≤1.64m→0, floating-origin rebase groundwork) wired into render+physics | PASS | R-012, R-008 (policy) | 43 unit tests + 2 e2e | tests/unit/fusion.test.ts | WP-05 |
| WP-05 | Live data pipeline | NOT_STARTED | R-013 | live+fixture tests | pending | implement |
| WP-06 | Chunk streamer | NOT_STARTED | R-014 | streaming tests | pending | implement |
| WP-07 | Persistent cache | NOT_STARTED | R-015 | cache tests | pending | implement |
| WP-08 | Place search + spawn | NOT_STARTED | R-016 | search tests | pending | implement |
| WP-09 | World fidelity | NOT_STARTED | R-017..R-020 | fidelity tests | pending | implement |
| WP-10 | Walk/drive experience | NOT_STARTED | R-011, R-021 | e2e | pending | implement |
| WP-11 | Performance hardening | NOT_STARTED | R-022 | perf gates | pending | implement |
| WP-12 | UX/visual polish | NOT_STARTED | R-023 | screenshots + Luna | pending | implement |
| WP-13 | Optional imagery | NOT_STARTED | (P3) | — | — | deferred until P0/P1 green |
| WP-14 | Release/deploy/CI | NOT_STARTED | R-024 | final harness | pending | implement |

## Baseline (2026-08-10)
- Repo: `julenberazaa/3D_City`, branch `main`, HEAD `7c699ad` ("Initial commit"), dirty (WP-02c uncommitted).
- Node v24.13.0, npm 11.6.2, git 2.52.0.windows.1, Windows, OpenCode 1.17.9.
- Model lock resolved (see MODEL_LOCK.md). Luna available in catalogue.
