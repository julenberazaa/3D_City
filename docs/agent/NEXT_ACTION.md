# NEXT ACTION — never lose the thread

CURRENT MILESTONE: WP-02 static vertical slice
CURRENT WORK PACKAGE: WP-02
CURRENT BLOCKER: none
NEXT SINGLE ACTION: Dispatch ONE implementer to build the WP-02 vertical slice: fixture fetch tool (Overture z15 tiles + terrarium terrain for a small real area → pinned JSON/PNG fixtures), MVT decoder, terrain/roads/buildings generation, three.js renderer, camera; with fixture tests.
WHY IT IS NEXT: vertical-slice rule — see a functioning real-data world end-to-end before generalizing; everything after (physics, streaming, cache) builds on it.
ACCEPTANCE CONDITION: `npm run harness:target 08` (geo fixture) passes; a browser screenshot shows a recognizable real area (terrain+roads+buildings); unit tests green.
EVIDENCE TO PRODUCE: fixture files in fixtures/, screenshot in reports/visual/, gate 08 pass record.
