# STYLE ACCEPTANCE — objective gate for the fidelity-recovery branch

A candidate world may NOT merge to main (and the recovery cannot claim success)
unless representative screenshots and objective checks demonstrate ALL of the
following. Evidence = same bboxes before/after
(`reports/visual/style-recovery/before/` vs `after/`), objective fixture tests,
and one Luna visual review comparing candidate screenshots against the PRIMARY
STYLE REFERENCE image `docs/reference/objective_vista.png`
(VISUAL_PRODUCT_SPEC.md) and against the previous public release (2a40ee8).

| # | Criterion | Evidence |
|---|---|---|
| 1 | Roads are clearly readable and correspond to real road topology | after screenshots (all 4 scenarios); junction seal test; ribbon-area gate |
| 2 | Intersections/roundabouts are coherent and recognizable | after screenshots; junction cap unit test (no ribbon overlap at connectors) |
| 3 | Buildings sit correctly relative to roads | B-03 gate (buildings near roads); after screenshots |
| 4 | Buildings visibly preserve real footprint/massing/height/roof info when available | B-04 provenance gate; after screenshots; fixture attribute tests |
| 5 | Special building shapes remain distinguishable | after screenshots (landmark silhouettes, roof forms, parts) |
| 6 | Street names legible without excessive clutter | label unit tests (priority, dedup, density cap); after screenshots |
| 7 | Water exists only where real data supports it | water fixtures + screenshots (no invented water) |
| 8 | Parks/green areas correspond to real data | landcover fixtures + screenshots |
| 9 | Trees are OBSERVED or conservatively DERIVED from real green-area evidence | tree determinism test (seeded, inside green polygons); screenshots |
| 10 | Fountains/monuments/special objects are never fabricated | code audit (no invented features) + Luna review |
| 11 | Car/camera/game feel is readable and enjoyable | elevated camera (code + screenshots), car visibility (screenshots), arcade speed (manual-drive records) |
| 12 | No large invisible collider mismatch or obvious car-inside-building state | B-02 collider-coverage gate; drive e2e (no wedge, R works) |
| 13 | Visually substantially closer to the owner reference (`docs/reference/objective_vista.png`) than the previous public release (2a40ee8) | Luna PREFERRED_VERSION verdict on before/after sets |
| 14 | Performance comfortably above the V1 60 FPS target on the established real-GPU benchmark | short real-GPU sanity run (renderer = real hardware, FPS p50 ≥ 120, p95 frame ≤ ~12 ms, no new repeated stalls, bounded heap) |

## Procedure

1. Run objective gates: typecheck, lint, unit (incl. fidelity + determinism),
   e2e, harness, clean build.
2. Capture after screenshots (identical viewport/driver as before):
   dense urban, normal town, mountain, water-visible place.
3. Short real-GPU benchmark (real Chrome, hardware renderer) — item 14.
4. One Luna review: before vs after vs owner reference; CRITICAL/HIGH must be
   resolved; PREFERRED_VERSION must favor the candidate.
5. Only then: merge to main, CI, deploy, public-URL verification.

## Rejection triggers

- Any CRITICAL/HIGH Luna finding unresolved.
- Any objective gate failing.
- Sustained performance regression >10% vs baseline.
- Fabricated environmental features (policy violation).
