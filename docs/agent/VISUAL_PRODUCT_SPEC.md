# VISUAL PRODUCT SPEC — owner-approved visual target

Authoritative visual requirement for 3D City (fidelity-recovery and beyond).
Together with `NORTH_STAR.md`, `REQUIREMENTS.md` and `REAL_WORLD_FIDELITY_POLICY.md`,
this document defines what the product must look like.

Reference image: the owner-provided style reference (`docs/design/style-reference.png`,
committed with this spec) is the VISUAL BENCHMARK for acceptance. It is a STYLE
REFERENCE — a description of the target look — NOT a geographic source; no
geometry, footprint, name or location may be copied from it. (Engineering model
has no vision; Luna performs the visual comparison against the reference during
acceptance.)

## Target look (owner-approved)

1. **Stylized miniature real-world city.** The world is a small, clean,
   toy-like representation of a real place, not a realistic render.
2. **Blocky / voxel / Crossy-Road-like visual language.** Simple geometry,
   flat shaded facets, low-poly silhouettes, clear material color blocks.
   NOT photorealism, NOT PBR, NOT post-processing stacks.
3. **Elevated / isometric-like readability.** The default view is elevated,
   shows more road ahead than behind, and keeps the player's surroundings
   legible; the player must never feel trapped in a street canyon.
4. **Buildings are recognizable representations of real counterparts.**
   Real footprint, orientation, massing, height/levels, building parts and
   roof form are preserved when the source data has them.
5. **Landmarks stay distinct.** Visually distinct special buildings (churches,
   towers, civic/industrial shapes, unusual footprints) must NOT collapse into
   generic rectangular beige boxes when available data allows a better
   silhouette (roof forms, parts, subtype semantics, facade evidence).
6. **Coherent, clean roads and junctions.** Roads read as roads: coherent
   widths, real alignment, clean intersections/roundabouts, no ribbon
   spaghetti, no footpath dominance, distinct from terrain.
7. **Street names rendered on/along roads** in a map-like, readable style
   (class-prioritized, density-capped, legible, low clutter).
8. **Stylized but truthful water, greenery and environmental features** per
   `REAL_WORLD_FIDELITY_POLICY.md`: water only where real, trees inside real
   green areas, no invented fountains/monuments/roundabouts.
9. **Car clearly readable** at a glance: contrast against buildings, heading
   cue, contact shadow; physics colliders must not visibly disagree with the
   car's shape.
10. **The public view feels like a game, not a debug viewer.** Lightweight HUD
    by default; engineering telemetry behind a toggle.

## Explicit non-goals (repeated from owner briefs)

Photorealism, texture/PBR overhauls, WebGPU, walk mode, traffic, pedestrians,
multiplayer, Panoramax, facade imagery, audio, mobile redesign, random
procedural city generation. The appeal comes from STYLIZING REALITY.

## How this spec is enforced

- `STYLE_ACCEPTANCE.md` defines the objective acceptance gate for merging.
- Every environmental feature must be classifiable as
  OBSERVED / DERIVED / INFERRED per `REAL_WORLD_FIDELITY_POLICY.md`.
- Acceptance is demonstrated with before/after screenshots (same bboxes) and
  one Luna visual review per recovery cycle.
