# NEXT ACTION — never lose the thread

CURRENT MILESTONE: WP-07 persistent cache + WP-08 place search
CURRENT WORK PACKAGE: WP-07 (then WP-08)
CURRENT BLOCKER: none
NEXT SINGLE ACTION: Implement the persistent cache: IndexedDB store for live-fixture chunk data keyed by the versioned chunk key (R-009/R-015), size accounting + eviction + corruption handling; then the place search (bundled GeoNames gazetteer + Open-Meteo fallback) + safe spawn integration.
WHY IT IS NEXT: streaming works; caching makes revisits fast (P0: returning to an area is deterministic AND fast); search is the last P0 user-facing piece.
ACCEPTANCE CONDITION: cache unit tests (hit/miss/eviction/corruption) green; search unit tests green (gazetteer resolve + fallback policy); live e2e uses cache on second visit.
EVIDENCE TO PRODUCE: tests/unit/cache.test.ts + tests/unit/search.test.ts green; second-visit cache-hit evidence.
