# REQUIREMENTS — normalized

Priority: P0 = playable core (must PASS to ship), P1 = world quality, P2 = polish,
P3 = optional. State: NOT_STARTED / ACTIVE / PASS / FAIL / BLOCKED_EXTERNAL / DEFERRED.

| ID | Req | Pri | Acceptance | Test/evidence | State |
|---|---|---|---|---|---|
| R-001 | App boots in browser from static files without paid APIs | P0 | `npm run build` output opens; canvas + UI render | browser smoke | NOT_STARTED |
| R-002 | Location search resolves real settlements worldwide to lat/lon | P0 | search UI returns results with name+coords; works offline with bundled gazetteer | search unit tests + e2e | NOT_STARTED |
| R-003 | Loading state shows truthful stages; cancellation back to search | P0 | stage UI transitions; cancel works | e2e + DOM assertions | NOT_STARTED |
| R-004 | Real terrain elevation rendered (hills/coasts) | P0 | terrain mesh reflects fixture elevation values | fixture test (sampled heights) | NOT_STARTED |
| R-005 | Real road network rendered from source geometry | P0 | roads match fixture polylines within tolerance | fixture test (geometry compare) | NOT_STARTED |
| R-006 | Real building footprints rendered in correct positions | P0 | buildings match fixture footprints within tolerance | fixture test | NOT_STARTED |
| R-007 | Upstream reuse audit documents REUSE/ADAPT/REFERENCE/REJECT per candidate with license evidence | P0 | audit doc present, decisions evidence-backed | gate 20 (provenance) | NOT_STARTED |
| R-008 | Provenance classes (OBSERVED/DERIVED/INFERRED) tracked in pipeline | P0 | debug overlay or pipeline metadata shows classes; no invented truth | unit tests on pipeline | NOT_STARTED |
| R-009 | Deterministic generation: same source+version+key → same world | P0 | hash of generated chunk output stable across runs | determinism test | NOT_STARTED |
| R-010 | Static vertical slice: pinned fixture renders coherent world (terrain+roads+buildings) | P0 | screenshot + geometry assertions | fixture tests + screenshot | NOT_STARTED |
| R-011 | Controllable vehicle with physics: accelerate/brake/steer, collisions, terrain contact | P0 | e2e drives car, collides, no NaN | physics + e2e tests | NOT_STARTED |
| R-012 | Geo fusion: consistent elevation policy, no seams, floating-origin architecture | P0 | buildings/roads sit on terrain; origin rebase keeps world stable | fusion unit tests + e2e | NOT_STARTED |
| R-013 | Live data pipeline loads real world location from open sources | P0 | live e2e renders one real city | live e2e (network) | NOT_STARTED |
| R-014 | World chunk streaming: chunks load ahead, unload behind, cancellable, priority | P0 | e2e drives across chunk boundary; queue bounded | streaming tests + e2e | NOT_STARTED |
| R-015 | Persistent bounded cache speeds revisits; invalidation/eviction works | P0 | second visit faster (cache hit); size bounded | cache unit tests + e2e | NOT_STARTED |
| R-016 | Safe spawn near searched place (road/terrain, not water/building interior) | P0 | spawn point on/near road, valid terrain | spawn unit tests | NOT_STARTED |
| R-017 | Building height/levels/roof types from source where available; deterministic fallback | P1 | fixture with heights renders correctly; missing data → neutral fallback | fixture tests | NOT_STARTED |
| R-018 | Water, land cover, vegetation rendered where evidence exists | P1 | coast/water fixture renders; vegetation present in forest areas | fixture tests | NOT_STARTED |
| R-019 | Bridges/tunnels handled; elevation reconciliation | P1 | bridge spans terrain; no tunneling artifacts | fixture tests | NOT_STARTED |
| R-020 | Walk mode (character controller) after drive stable | P1 | e2e walks, enter/exit vehicle | e2e | NOT_STARTED |
| R-021 | Drive feel polish: camera, controls, mode switching, UI | P2 | usable controls with keyboard; instructions shown | e2e + DOM | NOT_STARTED |
| R-022 | Performance: 60 FPS target on desktop; bounded memory; no long stalls; quality profiles + governor | P0 | measured p95 frame time; memory steady-state during 5+ min traversal | perf harness (env-limited GPU note) | NOT_STARTED |
| R-023 | Visual quality: coherent stylized world, good camera, readable UI; Luna review cycle | P2 | Luna findings resolved; screenshots at milestones | reports/visual + ledger | NOT_STARTED |
| R-024 | Release: reproducible build, CI, provenance, license attribution, deployment | P0 | clean-clone build; CI green on deterministic gates; Pages deploy config | final harness | NOT_STARTED |
| R-025 | Graceful failure handling: geocoder/data/WebGPU/worker/cache failures degrade, not crash | P0 | fault-injection tests for each failure path | unit + e2e tests | NOT_STARTED |
| R-026 | Accessibility of UI: keyboard, focus, labels, contrast | P2 | keyboard e2e; axe-style checks on UI shell | e2e + a11y assertions | NOT_STARTED |
| R-027 | Security: no secrets committed; sanitized input; no unsafe dynamic code | P0 | scan gates; dependency audit; input tests | gate 19 | NOT_STARTED |

## Global fidelity test matrix (R-013/014 evidence)
- Dense city (Manhattan-style), normal town, small settlement, mountainous area, coast,
  flat region, data-rich, data-poor. Selected during WP-05/06 with recorded rationale.
