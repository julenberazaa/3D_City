# REQUIREMENTS — normalized

Priority: P0 = playable core (must PASS to ship), P1 = world quality, P2 = polish,
P3 = optional. State: NOT_STARTED / ACTIVE / PASS / FAIL / BLOCKED_EXTERNAL / DEFERRED.
Status updated 2026-08-11 (final release).

| ID | Req | Pri | Acceptance | Test/evidence | State |
|---|---|---|---|---|---|
| R-001 | App boots in browser from static files without paid APIs | P0 | `npm run build` output opens; canvas + UI render | browser smoke (e2e) | PASS |
| R-002 | Location search resolves real settlements worldwide to lat/lon | P0 | search UI returns results with name+coords; works offline with bundled gazetteer | tests/unit/search.test.ts + e2e search (4 tests) | PASS |
| R-003 | Loading state shows truthful stages; cancellation back to search | P0 | stage UI transitions | e2e DOM assertions (#status role=status, spinner) | PASS |
| R-004 | Real terrain elevation rendered (hills/coasts) | P0 | terrain mesh reflects fixture elevation values | terrarium + fixture tests | PASS |
| R-005 | Real road network rendered from source geometry | P0 | roads match fixture polylines within tolerance | fixture tests + bridge-rule test | PASS |
| R-006 | Real building footprints rendered in correct positions | P0 | buildings match fixture footprints within tolerance | fixture tests | PASS |
| R-007 | Upstream reuse audit documents REUSE/ADAPT/REFERENCE/REJECT per candidate with license evidence | P0 | audit doc present, decisions evidence-backed | gate 20 (provenance) | PASS |
| R-008 | Provenance classes (OBSERVED/DERIVED/INFERRED) tracked in pipeline | P0 | debug overlay or pipeline metadata shows classes; no invented truth | HUD provenance counters (e2e smoke) | PASS |
| R-009 | Deterministic generation: same source+version+key → same world | P0 | hash of generated chunk output stable across runs | generator determinism + chunkKey tests | PASS |
| R-010 | Static vertical slice: pinned fixture renders coherent world | P0 | screenshot + geometry assertions | fixture tests + smoke e2e + screenshot | PASS |
| R-011 | Controllable vehicle with physics: accelerate/brake/steer, collisions, terrain contact | P0 | e2e drives car, collides, no NaN | physics.test + drive e2e (causality/ground-truth/R gates) | PASS |
| R-012 | Geo fusion: consistent elevation policy, no seams, floating-origin architecture | P0 | buildings/roads sit on terrain; origin rebase keeps world stable | fusion unit tests | PASS |
| R-013 | Live data pipeline loads real world location from open sources | P0 | live e2e renders one real city | live e2e (network, BLOCKED_EXTERNAL when offline) | PASS |
| R-014 | World chunk streaming: chunks load ahead, unload behind, cancellable, priority | P0 | e2e drives across chunk boundary; queue bounded | chunkManager tests + streamer-race tests + e2e | PASS |
| R-015 | Persistent bounded cache speeds revisits; invalidation/eviction works | P0 | second visit faster (cache hit); size bounded | cache tests (LRU, corruption, self-heal, mutex) + revisit benchmark (100% hits) | PASS |
| R-016 | Safe spawn near searched place (road/terrain, not water/building interior) | P0 | spawn point on/near road, valid terrain, clear run ahead | physics.test (spawn + near) + spawn probe evidence | PASS |
| R-017 | Building height/levels/roof types from source where available; deterministic fallback | P1 | fixture with heights renders correctly; missing data → neutral fallback | fixture + generator tests | PASS |
| R-018 | Water, land cover, vegetation rendered where evidence exists | P1 | coast/water fixture renders; vegetation present in forest areas | fixture tests | PASS |
| R-019 | Bridges/tunnels handled; elevation reconciliation | P1 | bridge spans terrain; no tunneling artifacts | bridge rule (roads over water = decks) + fixture test; tunnels documented as out of scope | PASS (minimal set) |
| R-020 | Walk mode (character controller) after drive stable | P1 | e2e walks, enter/exit vehicle | — | DEFERRED (outside V1 core; car exploration is the product) |
| R-021 | Drive feel polish: camera, controls, mode switching, UI | P2 | usable controls with keyboard; instructions shown | drive e2e + search-hint UI | PASS |
| R-022 | Performance: 60 FPS target on desktop; bounded memory; no long stalls; quality profiles + governor | P0 | measured p95 frame time; memory steady-state during 5+ min traversal | REAL GPU benchmark (reports/performance/hardware-*.json): FPS p50 161-164, p95 7-8.4 ms, 1 stall at startup, heap bounded | PASS |
| R-023 | Visual quality: coherent stylized world, good camera, readable UI; Luna review cycle | P2 | Luna findings resolved; screenshots at milestones | Luna final review: no CRITICAL; loading spinner added | PASS |
| R-024 | Release: reproducible build, CI, provenance, license attribution, deployment | P0 | clean-clone build; CI green on deterministic gates; Pages deploy | clean-clone test (temp worktree), CI workflow, Pages enabled + deployment verified | PASS |
| R-025 | Graceful failure handling: geocoder/data/WebGPU/worker/cache failures degrade, not crash | P0 | fault-injection tests for each failure path | cache corruption tests, tile-miss tolerance, network classification e2e, build-failure slot release | PASS |
| R-026 | Accessibility of UI: keyboard, focus, labels, contrast | P2 | keyboard e2e; axe-style checks on UI shell | search a11y e2e (arrows, aria-selected/activedescendant, live regions, focus styles) | PASS |
| R-027 | Security: no secrets committed; sanitized input; no unsafe dynamic code | P0 | scan gates; dependency audit; input tests | gate 19 (npm audit clean, no secret patterns), bbox validation + 64-chunk cap, no eval | PASS |
| R-028 | Visual product spec: stylized miniature real-world city (blocky/voxel/Crossy-Road-like, elevated readability, recognizable buildings, readable roads+labels, truthful water/greenery, game-first HUD) | P0 | docs/agent/VISUAL_PRODUCT_SPEC.md is the authoritative visual requirement; candidate must satisfy STYLE_ACCEPTANCE items 1-13 | screenshots before/after + Luna review + STYLE_ACCEPTANCE gates | ACTIVE (fidelity-recovery) |
| R-029 | Real-world fidelity policy: every environmental feature is OBSERVED / DERIVED / INFERRED; nothing is fabricated for aesthetics | P0 | docs/agent/REAL_WORLD_FIDELITY_POLICY.md enforced; code audit + tests (spawn class/connectivity, tree placement inside green polygons, road class prominence) | fidelity gates ROAD-01/ROAD-02, tree determinism tests, code audit | ACTIVE (fidelity-recovery) |
| R-030 | Style acceptance gate: candidate merges to main only when the 14 criteria pass (readable roads/intersections, real-footprint buildings, legible labels, truthful water/green, no fabricated objects, game-feel, no collider absurdity, closer to reference, >60 FPS real GPU) | P0 | docs/agent/STYLE_ACCEPTANCE.md all items | after screenshots + objective gates + short real-GPU benchmark + one Luna review | ACTIVE (fidelity-recovery) |

## Global fidelity test matrix (R-013/014 evidence)
- Dense city (Manhattan), normal town (Zurich), mountainous (Zermatt), fixture (SF)
  benchmarked on REAL GPU: reports/performance/hardware-{dense-urban,normal-town,mountain}.json.
- Revisit/leak matrix (A→B→C→A): reports/performance/hardware-revisit.json (100% cache hits, bounded heap).
