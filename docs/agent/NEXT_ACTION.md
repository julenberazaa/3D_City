# NEXT ACTION — never lose the thread

CURRENT MILESTONE: WP-02 static vertical slice
CURRENT WORK PACKAGE: WP-02c (implementer pass DONE — generator, renderer, camera, smoke e2e all green)
CURRENT BLOCKER: none
NEXT SINGLE ACTION: Dispatch ONE fresh reviewer for WP-02c: review src/world/generator.ts, src/render/*, src/main.ts, tests/unit/generator.test.ts, tests/e2e/smoke.spec.ts against the WP-02c spec; validate determinism evidence and the screenshot; record findings in reports/reviews/ and SUBAGENT_LEDGER.md. Fix only if reviewer findings require it. Then commit the verified checkpoint (per Git discipline) and start WP-03 (physics).
WHY IT IS NEXT: WP-02c delivered the full static vertical slice — buildWorld generates deterministic terrain+roads+buildings+water+landcover from the pinned fixture, renderer+camera render it, e2e smoke passes headless WebGL, gates 08/10/14 PASS (harness run 20260810-132940). A fresh reviewer pass is required by the workflow before the checkpoint is committed.
ACCEPTANCE CONDITION: reviewer PASS on WP-02c; `npm run harness:target -Gates "08,10,14"` green; screenshot reports/visual/wp02-slice.png reviewed.
EVIDENCE TO PRODUCE: reviewer log in reports/reviews/, ledger entry, commit of verified checkpoint.
