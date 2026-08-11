# FINAL RELEASE AUDIT — Phase A truth table

Audit date: 2026-08-10 (final hardening phase). Branch: final-hardening @ ee46b7e.
Evidence: harness run (all applicable PASS), vitest 67/67, playwright 6/6, code inspection, build.

Legend: CLAIMED = previous docs; ACTUAL_CODE = inspected source; ACTUAL_TEST = automated
test file; RUNTIME = observed runtime evidence; REAL = reconciled truth; ACTION = required work.

## Requirements R-001..R-027

| ITEM | CLAIMED | ACTUAL_CODE | ACTUAL_TEST | RUNTIME | REAL | ACTION |
|---|---|---|---|---|---|---|
| R-001 boot static | NOT_STARTED | src/main.ts, renderer, vite base "./" | e2e smoke | boots, canvas renders fixture | PASS | none |
| R-002 search | NOT_STARTED | src/search/gazetteer.ts + openMeteo.ts | search.test.ts + e2e search x2 | live+offline hits | PASS | search hardening (duplicates, accents) — PHASE E |
| R-003 loading stages | NOT_STARTED | main.ts stage UI + cancel | e2e asserts #status | stage transitions visible | PASS (partial cancel e2e) | verify cancel path in deployed smoke |
| R-004 terrain | NOT_STARTED | generator + terrarium | terrarium.test + fixture tests | sampled heights match | PASS | none |
| R-005 roads | NOT_STARTED | generator roads | fixture geometry tests | polylines match | PASS | none |
| R-006 buildings | NOT_STARTED | generator buildings | fixture tests | footprints match | PASS | none |
| R-007 reuse audit | NOT_STARTED | UPSTREAM_REUSE_AUDIT.md | gate | doc present | PASS | none |
| R-008 provenance | NOT_STARTED | provenance classes in generator | unit | debug overlay | PASS (partial) | confirm overlay presence |
| R-009 determinism | NOT_STARTED | deterministic builder + chunk keys | generator + chunkKey tests | byte-identical oracle | PASS | none |
| R-010 static slice | NOT_STARTED | fixture builder + renderer | fixture.test + smoke | SF renders | PASS | none |
| R-011 vehicle physics | NOT_STARTED | physics/world.ts + vehicle.ts | physics.test + drive e2e | real drive + collisions | PASS | vehicle recovery (R) — PHASE E |
| R-012 geo fusion | NOT_STARTED | geo/fusion.ts | fusion.test | seams 0 | PASS | none |
| R-013 live pipeline | NOT_STARTED | data/live.ts | live e2e | San Jose live renders | PASS | none |
| R-014 streaming | NOT_STARTED | stream/chunkManager.ts + streamer.ts | chunkManager.test + e2e | lifecycle bounded | PASS | stress traversal — PHASE F |
| R-015 cache | NOT_STARTED | cache/store.ts + indexedDb.ts | cache.test + e2e cache-hit | second visit faster | PASS | hardened already (true LRU) |
| R-016 safe spawn | NOT_STARTED | physics/world.ts findSpawnPoint | physics.test | road/terrain checks | PASS | none |
| R-017 heights/roofs | PARTIAL | generator roof rules | generator tests | heights honored | PASS | none |
| R-018 water/landcover | PARTIAL | generator water/landcover | generator tests | present | PASS (coast polish optional) | water/coast coherence — PHASE E |
| R-019 bridges/tunnels | PARTIAL | partial level handling | none dedicated | not verified | PARTIAL | bridge/tunnel rule set — PHASE E |
| R-020 walk mode | NOT_STARTED | — | — | — | DEFERRED (P1, outside V1 core) | document as deferred |
| R-021 drive feel | PARTIAL | camera.ts + controls | drive e2e | responsive | PASS | tuning pass during stress |
| R-022 performance | BLOCKED_ENVIRONMENT | adaptive DPR governor | perf e2e (SwiftShader) | software only | UNVERIFIED on HW | PHASES B/D/F |
| R-023 visual | ACTIVE | — | Luna cycles | previous cycles done | PASS (pending final Luna) | PHASE G |
| R-024 release/deploy | ACTIVE | CI + Pages workflow | config exists | NOT deployed | PARTIAL | PHASE H deploy+verify |
| R-025 graceful failure | PARTIAL | tile-miss tolerance, network classification | live e2e, cache.test | missing tile ok | PASS (more paths desirable) | network hardening tests — PHASE C |
| R-026 accessibility | NOT_STARTED | keyboard search e2e | search.spec | keyboard enter works | PARTIAL | a11y pass — PHASE E/G |
| R-027 security | NOT_STARTED | no secrets, no eval | gate + audit | npm audit clean | PASS | final scan — PHASE I |

## Work packages WP-00..WP-14

| WP | CLAIMED | REAL | ACTION |
|---|---|---|---|
| WP-00 env+harness | ACTIVE (stale) | PASS | fix STATUS |
| WP-01 reuse audit | PASS | PASS | — |
| WP-02 static slice | ACTIVE (stale) | PASS | fix STATUS |
| WP-03 physics | PASS | PASS | vehicle recovery addition |
| WP-04 fusion | PASS | PASS | — |
| WP-05 live pipeline | PASS | PASS | — |
| WP-06 streamer | PASS | PASS | stress + worker decision |
| WP-07 cache | PASS | PASS | — |
| WP-08 search | PASS | PASS | duplicates disambiguation |
| WP-09 fidelity | PASS (partial bridges) | PARTIAL | bridge/tunnel rules |
| WP-10 walk | DEFERRED | DEFERRED (outside V1) | document |
| WP-11 perf | PASS (env-limited) | UNVERIFIED on HW | real GPU benchmark |
| WP-12 visual | ACTIVE (stale) | PASS | final Luna |
| WP-13 imagery | DEFERRED | DEFERRED | — |
| WP-14 release | ACTIVE (stale) | PARTIAL (not deployed) | deploy + verify |

## Known doc/implementation mismatches found (hypotheses)

1. REQUIREMENTS.md: all rows NOT_STARTED -> stale (correct with evidence above).
2. TRACEABILITY.md: references nonexistent modules (src/vehicle/, src/spawn/, src/character/,
   src/perf/, src/ui/, src/geo/provenance.ts, src/geo/bridgeTunnel.ts) -> rewrite.
3. STATUS.md: WP-00/WP-02/WP-12/WP-14 ACTIVE -> stale; baseline block says HEAD 7c699ad -> stale.
4. NEXT_ACTION.md: describes pre-hardening final-review milestone -> update to current phase.
5. ARCHITECTURE.md: claims "Decode/fuse/generate in Web Workers" -> FALSE, no Worker in src/
   (main-thread). Radii 120/300/900 -> code uses 400/1200/2400 m. Correct docs (code wins).
6. PERFORMANCE_BUDGET.md: radii + "hypotheses to validate" -> align with code + new evidence.
7. z15 chunk size: code `tileSizeMeters(15)` = 40075016.686/2^15 = 1223.03 m equator. Docs
   "≈1223 m" consistent; no sub-bucketing. CONFIRMED correct; no code change needed.
8. Playwright always forces SwiftShader -> ALL prior perf evidence is software-rendered.
   Requires real-GPU session (PHASE B).
9. Chunk generation is synchronous on the main thread (decode+fusion+mesh) -> PHASE D
   profiling target; workers are the leading candidate.
10. GitHub Pages workflow exists; no public deployment verified -> PHASE H.
11. Bridge/tunnel handling partial, no dedicated tests -> PHASE E.
12. Walk mode deferred (documented) — acceptable, outside V1 core.

## Baseline record
See reports/finalization/baseline/BASELINE.md (commit, tests 67+6, build sizes, warnings).

## Final reconciliation (post-review, 2026-08-11)
- All R-001..R-027 final states: PASS except R-020 (walk, DEFERRED outside V1 core) �
  see REQUIREMENTS.md (rewritten with evidence per row) and TRACEABILITY.md.
- Review B findings F-01..F-05 fixed + regression tests (mutation-verified for F-01):
  see OPTIMIZATION_LOG.md.
- Reviewer A retry returned empty twice (interrupted / no result): Director took
  ownership of scope A (functional/requirements/geo/gameplay/deployment) � all
  evidenced PASS in this audit + harness.
- Luna final visual review: no CRITICAL; HIGH-1 (blank loading) fixed with spinner;
  HIGH-2/3 and MEDIUMs = content truth or stylization (documented in ledger).
- Clean-clone test PASS (fresh worktree: npm ci, typecheck, lint, 77 tests, build,
  browser smoke). Real-GPU benchmarks PASS targets (FPS p50 161-164, p95 =8.4 ms,
  1 startup stall, bounded memory, 100% cache hits on revisit).
- Deployment: GitHub Pages ENABLED (API, build_type=workflow) ?
  https://julenberazaa.github.io/3D_City/ ; deployed-site smoke executed after final
  main push (�57).