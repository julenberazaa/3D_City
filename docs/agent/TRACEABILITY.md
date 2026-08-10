# TRACEABILITY — requirement → code → test → evidence

| Req | Module(s) | Test(s) | Runtime evidence | State |
|---|---|---|---|---|
| R-004 (pre) | src/geo/terrarium.ts | terrarium.test.ts | vitest 2 green | WP-02a PARTIAL |
| R-005 (pre) | src/geo/mvt.ts | mvt.test.ts | vitest 3 green | WP-02a PARTIAL |
| R-010 (pre) | src/geo/projection.ts, src/world/types.ts | projection.test.ts | vitest 6 green | WP-02a PARTIAL |
| R-001 | src/main.ts, src/render/renderer.ts, vite.config.ts | tests/e2e/smoke.spec.ts | e2e 1 passed; screenshot reports/visual/wp02-slice.png | WP-02c PASS |
| R-002 | src/search/ | search unit tests | e2e | NOT_STARTED |
| R-003 | src/main.ts (stage UI, fetch errors) | e2e DOM (#status stages) | e2e asserts #status "Ready" | WP-02c PARTIAL |
| R-004 | src/world/generator.ts (terrain) | generator.test.ts (vertex count, y-range) | e2e screenshot | WP-02c PASS |
| R-005 | src/world/generator.ts (roads) | generator.test.ts (determinism) | e2e screenshot | WP-02c PASS |
| R-006 | src/world/generator.ts (buildings) | generator.test.ts (counts, y-range) | e2e screenshot | WP-02c PASS |
| R-007 | docs/agent/UPSTREAM_REUSE_AUDIT.md | gate 19 | audit doc | PASS (WP-01) |
| R-008 | src/geo/provenance.ts | provenance unit test | debug overlay | NOT_STARTED |
| R-009 | src/world/generator.ts (FNV-1a, no random) | generator.test.ts determinism | identical geometry across 2 builds | WP-02c PASS |
| R-010 | WP-02 slice | fixture tests + smoke e2e | screenshot reports/visual/wp02-slice.png | WP-02c PASS |
| R-011 | src/physics/, src/vehicle/ | physics unit + e2e | e2e drive | NOT_STARTED |
| R-012 | src/geo/fusion.ts | fusion unit tests | e2e seams check | NOT_STARTED |
| R-013 | src/data/ | live e2e | live render screenshot | NOT_STARTED |
| R-014 | src/stream/ | streaming unit tests | e2e traversal | NOT_STARTED |
| R-015 | src/cache/ | cache unit tests | e2e revisit timing | NOT_STARTED |
| R-016 | src/spawn/ | spawn unit tests | e2e spawn check | NOT_STARTED |
| R-017 | src/world/generator.ts (height/roof) | fixture tests | screenshot | WP-02c PARTIAL |
| R-018 | src/world/generator.ts (water, landcover) | generator sanity | screenshot | WP-02c PARTIAL |
| R-019 | src/geo/bridgeTunnel.ts | fixture tests | screenshot | NOT_STARTED |
| R-020 | src/character/ | e2e | walk e2e | NOT_STARTED |
| R-021 | src/render/camera.ts | e2e | screenshots | WP-02c PARTIAL |
| R-022 | src/perf/ | perf harness | reports/performance | NOT_STARTED |
| R-023 | whole | Luna review cycles | reports/visual | WP-02c PARTIAL |
| R-024 | CI + docs | final harness | run report | NOT_STARTED |
| R-025 | src/main.ts (fetch error path) | e2e | #status error text | WP-02c PARTIAL |
| R-026 | src/ui/ | a11y e2e | gate 17 | NOT_STARTED |
| R-027 | global | gate 18 | audit | NOT_STARTED |

Update this table every time a requirement changes state.
