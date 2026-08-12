# STYLE RECOVERY AUDIT — from "beige extrusion world" to readable miniature city

Date: 2026-08-12 · Branch: `fidelity-recovery` · Baseline: `2a40ee8` (deployed)
Scope: what the current pipeline produces, why it misses the owner's miniature-city
reference family (elevated/isometric readability, Crossy-Road-like blocky style,
Google-Maps-like street labels, stylized trees, distinct water), and the minimal
change set to get there. Companion doc: `FIDELITY_RECOVERY_AUDIT.md` (geometry/physics
forensics). Reference image could not be inspected by the engineering model (no
vision); the style description below comes from the owner's textual brief. Luna
performs the final visual verdict against the reference once the image is added to
the repo.

---

## 1. Building attributes preserved vs discarded (current pipeline)

OBSERVED FACTS (from `src/data/fixtureBuilder.ts` + real pinned tile dump,
Manhattan z14 4823/6158, release 2026-07-22.0):

| Source attribute | Preserved? | Where | Coverage in tile |
|---|---|---|---|
| footprint (ring) | yes | feature.ring | 100% |
| height | yes | height_m | 99% |
| num_floors | yes | levels | 12% |
| roof_shape | yes | roof | 12% |
| building_id (parts link) | yes | partOf | parts layer |
| subtype / class | **M1: yes** | subtype | 15% |
| facade_color | **M1: yes** | facadeColor | 11% |
| facade_material | **M1: yes** | facadeMaterial | 10% |
| roof_color | **M1: yes** | roofColor | 4% |
| roof_material | **M1: yes** | roofMaterial | — |
| roof_height | **M1: yes** | roofHeight | 0.2% |
| roof_orientation | **M1: yes** | roofOrientation | — |
| names (primary) | **M1: yes** | name | 5% (buildings), ~70% (roads) |
| min_height / level | **M1: yes** | minHeight / level | sparse |
| multi-ring (holes) | fixed (largest ring) | live+fetch | 13/1643 |

M1 (committed on this branch) closed the provenance hole: the fixture model now
carries every useful Overture building attribute. Before M1, zero style attributes
survived (sf-downtown fixture: 0/14004).

INFERENCE: data availability is the constraint — facade_color 11%, roof_shape 12%,
subtype 15% are minority signals; the DERIVED (subtype→style) and INFERRED
(deterministic palette) tiers carry most of the visual load. Names exist for ~5% of
buildings (landmark labels possible) and for the large majority of named roads.

## 2. Roads: current generation

OBSERVED FACTS (`generator.ts` `buildRoadChunkMesh`, `fixtureBuilder.ts`):
- Widths: static class table `ROAD_WIDTHS` (motorway 14 … path 2); no junction logic.
- Each polyline → independent ribbon (per-vertex smoothed direction within the
  polyline only). Intersections = two ribbons drawn over each other; T-junctions =
  seam where the third leg overlaps the through road edge.
- Connector topology (`connectors`, present on 100% of real segments) discarded
  (fixed in M1: now preserved in the feature model, not yet consumed by the mesh).
- Class filtering: `ROAD_CLASSES` includes footway/path/steps/pedestrian/cycleway →
  62.3% of the sf-downtown road network is non-vehicular; Manhattan z14 tile: 67%
  of segments are footways.
- Dual carriageways: Overture stores each direction as its own segment; motorway
  ribbons render 14+14=28 m with an ugly seam (should read as one road).
- No curbs/sidewalk language; road color = flat gray with ±3% class jitter.
- No street-name rendering anywhere (names were discarded pre-M1; still not drawn).

INFERENCE: the road layer is the single worst readability offender: ribbon
spaghetti, footpath dominance, no intersections, no labels. Roads are THE skeleton
of the miniature-city look; this is priority B.

## 3. Water, landcover, greenery

OBSERVED FACTS:
- Water (`buildWaterChunkMesh`): flat blue polygons at `WATER_LEVEL - 0.05`,
  opacity 0.7, no shoreline edge, no variation; water rings from base layer.
- Landcover (`buildLandcoverChunkMesh`): flat tinted polygons (grass green,
  forest dark green) at terrain+0.05; no vegetation objects, no hedge/grove
  structure, flat color only.
- Trees: **none** — zero vegetation meshes in the entire pipeline.

INFERENCE: greenery contributes nothing to spatial readability today. Overture base
land_cover gives grass/forest polygons (fixture sf-downtown: 4 landcover features,
water 45) — enough for deterministic stylized tree placement inside green polygons
(+ park/waterfront hints). Tree placement from real data is NOT available as
per-tree features in this pipeline; deterministic seeded placement within real
green polygons is the correct, truthful approach.

## 4. Building physics colliders vs visible shape

OBSERVED FACTS (`physics/world.ts` `buildingBoxFor`): one AABB cuboid per building
from the footprint bbox. Fixture metrics: median box/ring area ratio 0.67, 58% of
boxes cover <70% of the visual footprint → invisible collision corners overhanging
streets and inside building notches (the "trapped near buildings" feel).

INFERENCE: cheapest materially-better collider = convex hull (1 collider per
building, footprint points decimated ≤48 + extruded base/top). AABB is only
materially wrong for irregular footprints; hull fixes the street-overhang and
notch artifacts without exploding collider count.

## 5. Why the current result looks poor vs the reference

OBSERVED FACTS (code constants + baseline screenshots + manual-drive records):
- Camera: rigid snap chase at distance 26 / height 12 / look-ahead 16 — street
  canyon level, walls dominate, little road ahead, no smoothing (micro-jitter).
- Car: 3.0×0.7×4.4 m red box + dark cabin, no windshield facet, no contact shadow,
  no contrast vs beige palette; engine force −650/−400 → ~40 km/h top with slow
  accel (manual-drive records: 0.5–1.0 km in 1.5–7 min with many recoveries).
- Buildings: 6-color beige hash palette, flat roofs mostly, no facade rhythm, no
  landmark differentiation — "generic brown extrusions" (M2 now fixes palette +
  bands + roof forms, on this branch).
- Roads: as per §2 — the dominant visual noise.
- HUD: full 6-line engineering telemetry visible by default to public users.
- Labels/trees: absent.

INFERENCES:
- The look misses on four axes: (1) viewpoint (camera too low/close/snappy),
  (2) scale & speed (car small/slow), (3) color/material language (flat gray roads,
  beige hash buildings, no trees, low-contrast water), (4) information design
  (no street names, footpath noise, no landmark hierarchy).
- The M1+M2 commits already address (3) for buildings. The remaining gap is roads
  (junctions, widths, curbs, labels), greenery/water, camera/car/HUD, and physics
  coherence.

## 6. Trees: real data vs deterministic placement

OBSERVED FACT: no tree features in the Overture themes we consume (buildings,
transportation, base); land_cover provides green polygons.
INFERENCE: deterministic stylized placement (seeded by chunk+index, density by
landcover class, kept clear of roads/buildings via interior-grid sampling) is the
correct, truthful approach; documented as DERIVED in PROVENANCE.md. Trees must be
cheap (cone+trunk ~20-30 tris), density-capped per chunk, deterministic for tests.

---

## PROPOSED CHANGE SET (minimal, bounded)

A. **Camera + game feel**: elevated high-follow (distance ~24, height ~16, look-ahead
   ~22 + speed extension, exponential smoothing, reset on spawn/R), car visual
   readability (scale +10% render-only, brighter body, windshield facet, blob
   shadow), arcade speed (force +30%, drag-capped ~90 km/h), mini HUD default
   (speed/place/controls; `H` = full debug; benchmark mode keeps full HUD).
B. **Roads**: consume `connectors` → junction caps (ribbons trimmed to junction
   radius + cap polygon), miter joins on sharp bends, carriageway-correct widths
   (motorway 7.5, trunk 6.5), footway/path/steps de-emphasis (≤2 m, low contrast),
   curb language via two-tone vehicular ribbons (dark edge + lighter surface),
   street-name labels (class-prioritized, density-capped, follow-road placement,
   dedup).
C. **Buildings**: M2 (done) + landmark names label (only named/important buildings,
   density-capped) — optional low priority.
D. **Greenery/water**: deterministic seeded trees in forest/grass polygons
   (density-capped, clear of roads/buildings), green-block variation, deeper
   water + shoreline ring.
E. **Physics/spawn**: convex-hull colliders (≤48-pt rings, 1 collider/building,
   AABB fallback), spawn restricted to vehicular classes with connector
   connectivity (degree ≥2), fallback ladder intact.
F. **Labels module**: `src/render/labels.ts` (canvas-text sprites, deterministic
   placement/dedup, class/zoom-based clutter control).

## RISKS
- Road geometry change → determinism tests must pass (pure functions, seeded).
- Roads×2 tris (curbs) + trees + labels → real-GPU benchmark gate (reject >10%
  sustained regression; reduce tree density/curb pass if needed).
- Labels could clutter → density caps + class priority + distance fade.
- Camera tuning could harm a scenario → same-location before/after, revert if so.
- Convex hull build cost → only on chunk activation, ≤48 pts, async batched.

## TEST PLAN
- Existing gates: fidelity ROAD-01/02 (road class/dangling), B-02 (collider
  coverage), B-01 (terrain hug) + determinism + full suites after each batch.
- New: label generation/dedup/clutter (unit), tree determinism (unit, seeded),
  junction seal (unit: no ribbon overlap at connectors), spawn class/connectivity
  on 4 bboxes, collider-hull coverage ≥0.9 mean.
- Evidence: before/after screenshots (dense/normal/mountain/water) at
  `reports/visual/style-recovery/`, real-GPU short benchmark, then one Luna review.
