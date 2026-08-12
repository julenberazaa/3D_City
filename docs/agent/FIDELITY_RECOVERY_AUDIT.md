# FIDELITY RECOVERY AUDIT — release-blocking geometry/gameplay defects

Date: 2026-08-12 · Branch: `fidelity-recovery` · Rollback baseline: `2a40ee8` (origin/main, deployed)
Audit method: code reading + real pinned-release tile schema dump + objective fixture metrics. No subjective screenshot claims (model has no vision; final visual verdict belongs to Luna).

---

## 0. Executive summary

The V1 SHIP verdict was too optimistic: the world IS deterministically generated and fast,
but it does not meet the core product requirement — *recognizable real city structure*.
Roads are independent ribbons with overlapping/incorrect junctions; buildings are beige
hash-colored extrusions; physics colliders are coarse AABBs that disagree with footprints;
spawn ignores road class/connectivity; and 62% of the rendered "road" network in the
fixture is footpaths/steps that read as visual spaghetti. All of this is fixable with
bounded, MIT-compatible changes to the data model, mesh generation, physics shapes and
spawn policy. No rendering-architecture change is needed.

---

## 1. Forensic findings (with evidence)

### 1.1 Overture building attributes: decoded vs discarded — SEVERE

Real tile schema, pinned release `2026-07-22.0`, Manhattan z14 `4823/6158`
(fetched from `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/buildings.pmtiles`, decoded with our own `src/geo/mvt.ts`):

```
BUILDING keys: @geometry_source, @height_source, @name, class, facade_color,
  facade_material, has_parts, height, id, is_underground, level, min_height,
  names, num_floors, num_floors_underground, roof_color, roof_height,
  roof_material, roof_orientation, roof_shape, sources, subtype, version
BUILDING_PART keys: building_id, facade_color, facade_material, height,
  min_floor, min_height, names, num_floors, roof_color, roof_direction,
  roof_height, roof_material, roof_orientation, roof_shape, ...
```

Coverage in that tile (n=1643): `height` 99% (1622), `subtype` 15% (249:
residential=172, commercial=36, civic/education/transportation/religious/industrial…),
`num_floors` 12%, `facade_color` 11%, `facade_material` 10%, `roof_shape` 12%,
`roof_color` 4%, `names` 5%, `roof_height` 0% (3), multi-ring features 13.

**Answer to the audit question: YES, Overture provides facade_color, facade_material,
roof_color, roof_material, roof_shape, roof_height, subtype, names, building parts —
in the pinned release.** It is all present in the raw tile.

What our pipeline keeps (`src/data/fixtureBuilder.ts` `toFeature`, buildings):
`id`, `height_m` (from `height`), `levels` (from `num_floors`/`levels`),
`roof` (from `roof_shape`), `partOf` (from `building_id`). Fixture `sf-downtown`
feature keys today: `id, ring, height_m` only.

**Discarded**: `class`, `subtype`, `facade_color`, `facade_material`, `roof_color`,
`roof_material`, `roof_height`, `roof_orientation`, `names`, `min_height`, `level`,
`has_parts`. The MVT decoder keeps everything (`src/geo/mvt.ts`); loss happens in
`toFeature` (fixture path) — the live path goes through the same `buildFixture`.

Secondary data-model defect (`src/data/live.ts:127`): a building feature with
multiple rings is truncated to `f.geometry[0]` — 13/1643 features in ONE Manhattan
tile carry >1 ring (holes/disjoint parts) and are silently cut.

### 1.2 Transportation → road meshes — SEVERE

Real segment schema (same tile): `class, subtype, connectors, road_surface,
names, width_rules, speed_limits, access_restrictions, level_rules, rail_flags,
road_flags, prohibited_transitions, …`.

Segment class distribution (n=1553): footway=1042 (67%), residential=178, steps=114,
service=93, secondary=40, trunk=31, primary=10, cycleway=11, `?`=9, subway=6,
pedestrian=5, path=5, unknown=4, unclassified=3, tertiary=2.
`connectors` present on **100%** of segments; `road_surface` 58%; `width_rules` 1%.

Our pipeline (`fixtureBuilder.ts` roads `toFeature`) keeps: `id`, `cls`, `surface`.
**Discarded: `connectors` (junction topology!), `subtype`, `names`, `width_rules`.**

Mesh generation (`src/world/generator.ts` `buildRoadChunkMesh`):
- each polyline is extruded **independently** into a ribbon of static class width
  (`ROAD_WIDTHS`);
- **no junction handling at all**: where two ribbons cross, both are drawn on top of
  each other (overlap); at T-junctions the third leg overlaps the through-road's edge
  (visible seam/step); at sharp polyline bends the quad strip self-overlaps (no
  miter/bevel);
- per-vertex direction is smoothed within the single polyline only — never across
  connecting segments;
- elevation = terrain+0.06 per vertex (coherent with terrain, but junction surfaces
  are not bridged).

Fixture evidence (sf-downtown, 12890 road features): footway=7375, service=1686,
residential=1012, secondary=1004, tertiary=672, steps=502, primary=212, motorway=93,
trunk=86, unclassified=80, pedestrian=66, cycleway=65, path=20, living_street=17 →
**non-vehicular share 62.3% (8028/12890)**. The street grid is visually buried under
footpaths, steps and cycleways.

Widths: static per class (`motorway: 14, trunk: 11, primary: 9 …`). Overture splits
dual carriageways into two parallel segments, so a motorway renders 14+14=28 m of
dark ribbon with a seam between the carriageways — wrong visually (should read as
one road with a median).

Road continuity metric (fixture, rounded endpoints): **57% of endpoint nodes are
degree-1** (7594/13398) — fragmentation from OSM split-ways plus genuine cul-de-sacs;
the metric is inflated by junction splits (the true gap measure needs exact-endpoint
+ junction-aware analysis, see test plan).

### 1.3 Building-road spatial relations — objective test results (fixture)

| Metric | Result | Verdict |
|---|---|---|
| non-drivable road share | 62.3% | FAIL (target <35%) |
| dangling endpoint rate | 57% | FAIL (target <40%) |
| buildings buried >1.5 m into terrain | 2662/14004 = 19% | FAIL (target <10%) |
| collider box footprint coverage <0.7 | 8055/14004 = 58% | FAIL (target <15%) |
| buildings >60 m from nearest road | 41/14004 | PASS |
| height provenance | observed 94%, inferred 4.6% | PASS |
| buildings with style attributes in fixture | 0/14004 | FAIL (provenance hole) |
| spawn road class (sf-downtown) | residential | PASS (lucky sample) |

Buildings DO sit on the road network (B-03 PASS). The spatial relationship problem
is the opposite direction: AABB collider boxes overhang the streets (B-02) and
building bases bury into slopes (B-01).

### 1.4 Elevation coherence

- Roads: terrain + 0.06 m per vertex (bridge decks at WATER_LEVEL+0.3 over water).
- Buildings (`generator.ts`): `baseY = sampleTerrain(terrain, centroid) - 0.15`.
  Physics (`physics/world.ts` `buildingBoxFor`): `baseY = max(sampleTerrain over ring)`.
  → **visual base and physics base use DIFFERENT policies** (centroid vs max). On
  slopes the visual base sinks 1.5 m+ into the terrain (19% buried) while the
  physics box sits at max-terrain: visual/physics disagreement baked in.

### 1.5 Visual footprint vs physics collider — SEVERE

`buildingBoxFor` builds a single **axis-aligned cuboid from the footprint bbox**
(full ring). For irregular/L/U/diagonal footprints the box covers empty air:
median box/ring area ratio 0.67, p10 0.42; 58% of boxes cover <70% of their visual
footprint. Consequences: (a) invisible collision regions the car hits (trapped
against corners); (b) box corners overhanging the street create invisible walls at
building fronts — the "car wedged near buildings" behavior. Rapier supports convex
hulls natively; collider count stays 1 per building.

### 1.6 Spawn — MEDIUM/SEVERE

`findSpawnPoint` (`physics/world.ts`): candidates = **start point of every road
feature**, all classes included (footways/paths/steps/pedestrian/cycleway are 62% of
fixture roads). It ranks by clear-run + distance only — **no class check, no
connectivity check, no junction awareness**; heading = `line[1]-line[0]` even when
the candidate point is a dangling stub or at the bbox edge. In Manhattan the manual
drive needed 20 R-recoveries in ~400 s (footway stubs + dead ends dominate), while
Zermatt (wide, sparse) needed 1. The fixture sample happened to land on a
residential road — not representative.

### 1.7 Camera — MEDIUM

Follow-cam (`src/main.ts`): fixed `pos = car - fwd*26, y +12`, `lookAt = car + fwd*16`.
No smoothing, no speed look-ahead, no initial framing (first frame snaps from spawn
already, but after `R` recovery the camera re-snaps). In dense urban (block-long
20–40 m buildings) a 26 m chase at 12 m height keeps the camera inside the street
canyon and the car close to walls; the occluder is the building itself — a taller,
closer, slightly wider FOV framing (height ~10 m, distance ~20–22 m, look-ahead
18–20 m + speed extension) reduces wall-hugging feel. This is a tuning pass on the
existing camera, NOT a collision system.

### 1.8 Game feel — MEDIUM

- Car visual: 3.0×0.7×4.4 m red box + dark cabin; no windshield facet, no contact
  cue — low readability against beige buildings (render-only improvements: contrast,
  windshield, blob shadow; physics collider untouched).
- Speed: engine force front −650 / rear −400 (empirical), no speed cap → manual
  runs averaged ~35–45 km/h with slow acceleration; arcade target ~80–110 km/h
  needs force + drag retune with a speed limit.
- Physics friction: terrain 1.0, building 0.35 — keep.

---

## 2. ROOT CAUSES (ranked)

1. **Data model discards the evidence**: `fixtureBuilder.ts` `toFeature` narrows
   Overture's rich schema to 4 building fields and 3 road fields before rendering
   can use it (colors, materials, subtype, names, roof_height, connectors).
2. **No road graph**: connectors (100% present) are dropped; ribbons are drawn per
   polyline; junctions are never constructed.
3. **Class-blind rendering and spawn**: footways/steps/paths render at street
   prominence and are valid spawn candidates.
4. **AABB physics**: bbox cuboids disagree with footprints (58% poor coverage).
5. **Divergent elevation policies**: visual base (centroid−0.15) vs physics base
   (max ring) — burial + mismatch.
6. **Untuned game feel**: fixed 26 m snap camera, slow car, low-contrast car visual.
7. Multi-ring building truncation in the live path (`geometry[0]` only).

---

## 3. FILES/MODULES RESPONSIBLE

| Module | Responsibility |
|---|---|
| `src/data/fixtureBuilder.ts` | `toFeature` narrowing (buildings/roads), ROAD_CLASSES |
| `src/world/generator.ts` | `buildRoadChunkMesh` (ribbons), `buildBuildingChunkPieces` (styling), `resolveBuilding` (base policy), ROAD_WIDTHS, FACADE_PALETTE |
| `src/physics/world.ts` | `buildingBoxFor` (AABB), `findSpawnPoint` (class-blind candidates) |
| `src/data/live.ts` | multi-ring truncation (`geometry[0]`) |
| `src/render/car.ts` | car visual readability |
| `src/main.ts` | follow-camera constants + no smoothing; HUD default state |
| `src/physics/vehicle.ts` | engine force/drag (arcade speed) |
| `tools/fetch-fixture.mjs` | offline fixture fetch (must be updated to preserve new fields) |
| `tests/unit/fidelity.test.ts` | NEW objective regression gates (5/8 failing today) |

---

## 4. Re-evaluation of Streets GL / OSM2World

**Streets GL** (`github.com/StrandedKitty/streets-gl`, TS, WebGL2, OSM tiles,
**MIT license**, module-separable: "separable modules without external dependencies
that can be used in other projects with minimal modifications").
- Building geometry per the **Simple 3D Buildings** de-facto schema (roof shapes,
  building parts, heights) — directly our domain; its
  `src/lib` geometry-generation approach (road casing + building extrusion) is the
  reference for D/A-C below. MIT → can adapt algorithms/code with attribution.
- It renders OSM raster→tiles via a modified Planetiler; we already have Overture
  tiles — only the *geometry algorithms* are reusable, not its data pipeline.

**OSM2World** (`github.com/tordanik/OSM2World`, Java, **LGPL-3**) — the classic
junction-creation + building-style reference. LGPL-3 in a bundled TS app is
relinkable but the Java code is not portable; use it as algorithmic reading
material only (junction polygon construction, roof styling rules). Not a code source.

**Decision**: adapt MIT Streets GL techniques + standard OSM junction practice
(miter joins, junction caps, width-from-class), implemented natively in our
generator. No new runtime dependency.

---

## 5. PROPOSED MINIMAL CHANGES (minimum architecture to meet the requirement)

Data-model first, geometry second, physics third, game-feel last — each step keeps
the world deterministic and the gates green.

**M1 — Extend the internal feature model (A).** `fixtureBuilder.ts` `toFeature`
buildings keep: `subtype`, `facadeColor`, `facadeMaterial`, `roofColor`,
`roofMaterial`, `roofHeight`, `roofOrientation`, `name` (primary), `minHeight`,
`level`, `hasParts` (when present, else omitted — fixture JSON stays lean for
attribute-poor areas). Roads keep: `connectors` (parsed [{id, at}]), `subtype`,
`names`, `widthRules` (presence only). `tools/fetch-fixture.mjs` updated to the same
field set. `GEN_VERSION` bump (g2→g3) invalidates stale cached fixtures.
Multi-ring fix in `live.ts`: keep the **largest-area ring** as the footprint
(instead of ring[0]).

**M2 — Evidence-hierarchy building styling (B+C).**
- Facade/roof color resolution: OBSERVED `facade_color`/`roof_color` (hex, validated)
  → OBSERVED `facade_material`/`roof_material` (fixed material→color map: brick,
  concrete, glass, metal, wood, plaster…) → DERIVED subtype→style map (residential
  warm, commercial cool, industrial gray, religious dark… using source subtype) →
  INFERRED deterministic palette (existing FNV hash) only when nothing else exists.
- Height stays observed-first (height_m → levels×3 → hash), but **`roof_height`
  drives the apex** when present (gabled/hipped/pyramidal), replacing the fixed
  0.25·height heuristic; `roof_shape` gains pyramidal/dome approximations (cheap).
- Cheap facade rhythm: when `levels` is known and ≤24, horizontal floor bands
  (slightly darker/lighter per level on the wall strips) — vertex trick only, no
  textures; banding disabled when levels unknown.
- Base policy unified: `baseY = max(sampleTerrain over ring)` (matches physics),
  killing burial.

**M3 — Topology-aware road mesh (D).**
- Build the road graph from **`connectors`** (present 100%): segment →
  {fromConnector, toConnector}, junction = connector node with incident segments.
- Class policy: vehicular classes keep street prominence; footway/path/steps/
  cycleway/pedestrian render at **reduced width (2–1.5 m) and reduced contrast**
  (subtle path tint) so the drivable grid reads first; `subtype: rail` excluded
  from roads (present as 8/1553; currently dropped via class filter only when the
  class is `rail` — keep that). Non-vehicular classes are also excluded from spawn.
- Junction caps: for each junction, trim every incident ribbon at the junction
  radius R (= max half-width of incident roads), then emit one junction polygon
  (smooth cap approximating the crossing) at terrain height → no overlapping
  ribbons, no T-junction seams, coherent crossings.
- Miter joins on sharp bends of a single polyline (extend corners to the
  intersection of adjacent edges; clamp by max miter length).
- Dual-carriageway widths: motorway 14→7.5, trunk 11→6.5 (Overture stores each
  direction as its own segment); other widths stay class-based (no width data in
  source — `width_rules` only 1%).
- New objective gates: junction-ribbon overlap ≈ 0, junction coverage (every
  connector with ≥2 incident ribbons is sealed), road continuity via exact
  endpoints (dangling stubs <10%, excluding bbox-edge and connector-sealed ends).

**M4 — Physics: convex hulls (E).**
`buildingBoxFor` → `ColliderDesc.convexHull` over the footprint ring (decimated
≤48 pts) extruded to [baseY, baseY+height] (two copies of the 2D ring at base and
top + implicit hull). One collider per building (count unchanged). Invisible
collision area drops to hull-scale; street-overhang disappears. Deterministic per
input (same fixture → same hull). Guard: features whose decimated ring has <3
points or hull fails fall back to the current AABB.

**M5 — Safe spawn (F).**
- Candidates restricted to **vehicular classes** (motorway…living_street,
  unclassified, service, residential, tertiary, secondary, primary, trunk,
  motorway, road) — footways/paths/steps/pedestrian/cycleway/track excluded.
- Connectivity: candidate must lie on a segment whose connectors have degree ≥2
  (a real junction through-road) — from the road graph; fallback to the current
  clear-run scoring when the graph is unavailable (fixture without connectors).
- Heading from connector order (from→to) so the car faces along the road, not a
  dangling stub.

**M6 — Game feel (G, only after M1–M5 are green).**
- Camera: distance 26→20, height 12→9.5, look-ahead 16→20 + speed-proportional
  extension (≤+10 m), exponential smoothing (pos+target), re-init smoothing state
  on spawn and after `R` recovery.
- Car visual: slightly larger visual body (render-only), brighter body color,
  dark windshield facet, blob contact shadow under the car.
- Arcade speed: raise engine force (~+30%), add drag-based speed limit targeting
  ~80–110 km/h top speed; re-run manual-drive before/after.
- HUD: default small HUD (speed, place, controls, `H` for diagnostics) — debug HUD
  stays behind `H` (benchmark mode keeps full HUD).

---

## 6. RISKS

| Risk | Mitigation |
|---|---|
| Junction caps change byte-deterministic geometry | All generators remain pure over the fixture; determinism tests re-run; `GEN_VERSION` bump invalidates caches once |
| Convex-hull colliders slower to build | Build only on chunk activation (already async-batched); ≤48-pt rings; count unchanged; benchmark gate (p95 frame, FPS) re-run |
| Motorway width halving changes look in existing screenshots | Evidence-backed (dual carriageways); before/after screenshots + Luna |
| Footway prominence reduction hurts path-rich places (Zermatt) | Footways remain visible (1.5–2 m, lighter tint); mountain pass roads are vehicular |
| Spawn rule too strict → no spawn | Fallback ladder: strict → clear-run scoring → nearest road point (current) |
| Camera tuning harms one scenario | Same-location before/after validation; revert on any regression |
| Speed retune breaks drive e2e timing | e2e gates assert behavior not exact speed; run full e2e |
| Fixture regeneration (fetch) changes sf-downtown | Keep old fixture as `sf-downtown` (compatible), regenerate only if required by tests; new fixture `sf-downtown-f1` used for attribute tests |

---

## 7. TEST PLAN

Objective gates (per the brief) — implemented as `tests/unit/fidelity.test.ts`
(current baseline in parentheses, 5/8 failing):

1. Building vs road overlap: B-03 buildings within 60 m of a road (PASS today);
   NEW: count buildings whose *visual ring* intersects a road ribbon — target <1%
   of buildings (should be ~0; any intersection = data or mesh bug).
2. Junction geometry: NEW junction-ribbon overlap metric — area of pairwise ribbon
   overlap at shared connectors → target ≈ 0 after M3; junction seal coverage 100%
   of connectors with ≥2 incident segments.
3. Collider vs visual footprint: B-02 box/ring coverage (58% FAIL → target <15%);
   NEW hull/ring coverage ≥0.95 mean after M4; NEW street-overhang count (boxes
   within 0.5 m of a road line while ring is >1 m away) → 0.
4. Spawn road class/access/connectivity: SPAWN-01 extends to assert class ∈
   vehicular set and connector degree ≥2 on all three validation bboxes
   (Manhattan/Zürich/Zermatt + fixture).
5. Building height/roof/color provenance: B-04 (PASS) + NEW attribute-presence
   tests on a synthetic fixture with full props (unit) + real-tile schema test
   (extended scratch → kept as `tests/unit/overture-schema.test.ts`, network-skipped
   in CI when offline).
6. Road continuity: ROAD-02 exact-endpoint dangling-stub metric (stubs <10%
   excluding bbox edge).

Regression gates after each batch: typecheck → lint → unit → e2e → harness →
build; real-GPU short sanity (real Chrome, hardware renderer) with rejection
threshold: sustained >10% perf cost → revert.

Before/after evidence: identical bboxes (Manhattan `-74.015,40.700,-73.960,40.735`,
Zürich `8.49,47.34,8.55,47.39`, Zermatt `7.73,45.99,7.78,46.03`, fixture
sf-downtown) via `scripts/perf/manual-drive.mjs` (BEFORE already captured at
`reports/visual/final-ux/before/` on 2a40ee8) → `reports/visual/final-ux/after/`.
Final visual verdict: one Luna call comparing before/after (CRITICAL/HIGH/MEDIUM/
LOW + PREFERRED_VERSION). No push to main until gates + Luna pass.

## 8. Rollback

`2a40ee8` untouched on origin/main. All work on `fidelity-recovery`. Revert = drop
branch; deployed site unaffected. Cache invalidation via `GEN_VERSION` bump means
clients re-fetch fixtures once; old caches never poison the new world.
