# NEXT ACTION — never lose the thread

CURRENT MILESTONE: WP-05 live data pipeline
CURRENT WORK PACKAGE: WP-05
CURRENT BLOCKER: none
NEXT SINGLE ACTION: Dispatch ONE implementer for WP-05: live data pipeline — fetch Overture PMTiles (buildings/transportation/base) + terrarium terrain for an arbitrary bbox in the BROWSER (pmtiles range client + our MVT decoder in a worker), chunked per z15, using the same fixture-format contracts; a live "demo location" UI path that builds a WorldFixture in-browser and boots the existing generator/physics.
WHY IT IS NEXT: P0 requires loading any real place (R-013); WP-02-04 are static; WP-05 turns them live.
ACCEPTANCE CONDITION: live e2e renders a real non-fixture location from live sources (tagged live, network); fixture tests unchanged; deterministic chunk keys (release+chunk+version) introduced.
EVIDENCE TO PRODUCE: live render screenshot, live e2e pass (BLOCKED_EXTERNAL-tolerant), chunk key unit test.
