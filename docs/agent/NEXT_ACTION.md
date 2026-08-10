# NEXT ACTION — never lose the thread

CURRENT MILESTONE: WP-04 geo fusion
CURRENT WORK PACKAGE: WP-04
CURRENT BLOCKER: none
NEXT SINGLE ACTION: Dispatch ONE implementer for WP-04: GeoFusionPipeline — formalize coordinate/origin module (projection + fixture-local + floating-origin rebase architecture), elevation policy module (sampleTerrain shared by render/physics/spawn), chunk-boundary seam verification test, and origin-rebase groundwork with tests.
WHY IT IS NEXT: The world+physics slice works; WP-04 makes the geo elevation/origin policy explicit and tested before streaming (WP-06) depends on it.
ACCEPTANCE CONDITION: fusion unit tests (elevation policy consistency, seam continuity across adjacent chunks, origin abstraction) green; harness gates pass.
EVIDENCE TO PRODUCE: tests/unit/fusion.test.ts green; docs note.
