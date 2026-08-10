# NEXT ACTION — never lose the thread

CURRENT MILESTONE: WP-02 static vertical slice
CURRENT WORK PACKAGE: WP-02b (WP-02a geo foundation is DONE)
CURRENT BLOCKER: none
NEXT SINGLE ACTION: Dispatch ONE implementer for WP-02b: fixture fetch tool (Overture z15 tiles + terrarium terrain for a small real area → pinned JSON/PNG fixtures using src/geo/{projection,mvt,terrarium}), terrain/roads/buildings generation, three.js renderer, camera; with fixture tests.
WHY IT IS NEXT: WP-02a delivered the pure geo foundation (mercator, MVT decoder, terrarium decode, world types) with 11 passing unit tests; vertical-slice rule — see a functioning real-data world end-to-end before generalizing.
ACCEPTANCE CONDITION: `npm run harness:target 08` (geo fixture) passes; a browser screenshot shows a recognizable real area (terrain+roads+buildings); unit tests green.
EVIDENCE TO PRODUCE: fixture files in fixtures/, screenshot in reports/visual/, gate 08 pass record.
