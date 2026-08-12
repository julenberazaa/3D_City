# REAL-WORLD FIDELITY POLICY — evidence hierarchy for environmental features

Authoritative policy (owner-approved). Every environmental feature in the world
must be classifiable into one of three tiers. The visual appeal of the product
comes from STYLIZING REALITY, never from replacing reality with procedural
decoration. When in doubt, represent less rather than inventing more.

## OBSERVED — present in real source data, represent it where practical

| Feature | Source (pinned release 2026-07-22.0) |
|---|---|
| Roads / road geometry | transportation segments (class, alignment, connectors) |
| Street names | segment `names.primary` |
| Roundabouts | real segments forming the loop (junction caps make them read) |
| Building footprints | building theme rings (largest ring kept; parts linked) |
| Building parts | building_part theme (`building_id`, own height/roof) |
| Heights / levels | `height`, `num_floors` |
| Roof shapes | `roof_shape`, `roof_height`, `roof_orientation` |
| Facade/roof attributes | `facade_color`, `facade_material`, `roof_color`, `roof_material` |
| Water / rivers / sea / coast / lakes / canals | base theme `water` polygons |
| Parks / green areas / plazas | base theme `land_cover` (grass, forest, park…) |
| Bridges | roads over water (bridge rule: deck at water level) |
| Stairs / paths | `steps`, `path`, `footway` classes |
| Fountains / monuments / landmarks | not present in consumed themes; MUST NOT be invented |
| Mapped trees | not present in consumed themes; see DERIVED |

OBSERVED features must never be dropped silently when the pipeline can carry
them (see M1 data-model work on `fidelity-recovery`).

## DERIVED — conservative stylized consequences of real data (allowed)

- Simplified facade floors/window rhythm from real `levels` count.
- Stylized trees inside a real mapped green polygon (forest/grass) when
  individual tree positions are unavailable — seeded, deterministic, cleared
  of roads/buildings/water, density-capped.
- Simplified greenery/hedge tint within actual green polygons.
- Voxelized/blocky massing from real footprint + height + building parts.
- Stylized intersection/junction geometry derived from the real road graph
  (connectors) and class widths.
- Stylized roof forms (gabled/hipped/pyramidal) from real `roof_shape`.
- Facade/roof color from real `facade_material`/`roof_material` semantics.

DERIVED features must be a conservative consequence: same data → same result
(deterministic), and they may not contradict the observed evidence.

## INFERRED — fallback only, must remain conservative

- Neutral facade/roof color when source color/material/subtype is absent
  (deterministic palette, muted).
- Limited plausible vegetation inside an observed green area when the green
  area exists but individual trees are unmapped (already DERIVED-eligible; the
  INFERRED tier covers sparser green areas).
- Minimal architectural detail (e.g., simple floor banding) with no data.
- Generic height fallback when height/levels are missing (low, boxy).

## NEVER allowed (fabrication)

Inventing, merely to improve aesthetics:
- a fountain, a roundabout, water, a monument, a landmark, a park, a plaza,
  a special building, street geometry, street names, or random trees
  throughout the city.

## Verification

- Objective fixture tests (tests/unit/fidelity.test.ts) assert class-dependent
  behavior (spawn on drivable connected roads, road class prominence,
  building-road relations).
- Determinism tests guarantee DERIVED/INFERRED features are stable (same
  source+version+key → same world).
- `STYLE_ACCEPTANCE.md` item 9 (trees) and item 10 (no fabricated objects)
  are judged on screenshots by the visual reviewer (Luna).
