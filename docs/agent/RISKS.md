# RISKS — register

| # | Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| RS-001 | Overture PMTiles endpoint/CORS changes or goes away | Medium | High | Pin source version; fixture tests first; cache raw bytes; fallback sources documented | OPEN |
| RS-002 | Terrain tile service (AWS terrarium) availability/license drift | Medium | High | Pin version; deterministic fallback terrain (flat + inferred) with warning | OPEN |
| RS-003 | Live-network tests flaky in CI | High | Medium | Two-layer tests: pinned fixtures (CI) vs live (manual/labeled) | OPEN |
| RS-004 | WebGPU renderer instability | Medium | Medium | WebGL2 primary; renderer-agnostic world code | OPEN |
| RS-005 | Rapier WASM init/perf in browser | Low-Med | Medium | rapier3d-compat; worker init; profiles | OPEN |
| RS-006 | Memory growth during long traversal | Low | High | Bounded cache, chunk eviction, geometry disposal, perf gates | MITIGATED — 63-140 MB bounded across 4-city revisit matrix (reports/performance/hardware-revisit.json) |
| RS-007 | MVT decoder correctness vs upstream schema drift | Medium | Medium | Schema pinned by data version; fixture tests; live drift tests | OPEN |
| RS-008 | Floating-origin precision bugs | Medium | High | Dedicated rebase path with tests; geographic cache keys | OPEN |
| RS-009 | Building height data sparse → ugly fallback world | Medium | Low | Deterministic neutral fallbacks; heights from Overture where present | OPEN |
| RS-010 | GitHub Pages path/base issues for SPA | Low | Medium | base "./" config; deployed site verified (smoke against public URL) | MITIGATED — https://julenberazaa.github.io/3D_City/ serves and boots |
| RS-011 | Luna unavailable at review time | Low | Medium | Record VISUAL_MODEL_UNAVAILABLE; DOM/geometry assertions; continue | OPEN |
| RS-012 | S3/Overture burst throttling during rapid benchmark loads | Medium | Low | Single-session loads verified; capture tool isolates scenes per browser | OBSERVED (transient hangs during back-to-back loads); not a product defect |

Blockers are recorded separately per classification (CODE/HARNESS/ENVIRONMENT/EXTERNAL).
