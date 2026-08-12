# NORTH STAR — 3D City

## PRODUCT
An open-source browser 3D game that reconstructs real towns and cities worldwide from
open geographic data into a stylized low-poly miniature world (Crossy-Road-like art
direction, block-built architecture, isometric readability). NOT photorealistic.

## CORE EXPERIENCE
Search real place → load actual geography → enter stylized 3D world → walk or drive →
world streams around the player. Returning to an area reproduces the same world.

## NON-NEGOTIABLES
- Global real-world geographic basis (real roads, footprints, terrain elevation).
- Browser runtime, static deployable web app.
- Strong desktop performance (60 FPS target, no multi-hundred-ms stalls).
- Drivable vehicle (free movement, collisions, terrain contact).
- Terrain, roads, buildings from real evidence.
- Streaming world chunks around the player (not municipal-boundary loading).
- Deterministic generation (same source data + generator = same world).
- Open-source/legal data only (ODbL/CC0/etc.); documented provenance.
- No paid API dependency for the core experience.
- Evidence-backed fidelity: OBSERVED / DERIVED / INFERRED classes, never fake truth.
- Usable UI: keyboard controls, readable labels, loading states, failure handling.
- Owner visual spec (R-028/R-029/R-030): stylized miniature readability per
  docs/agent/VISUAL_PRODUCT_SPEC.md + REAL_WORLD_FIDELITY_POLICY.md, gated by
  docs/agent/STYLE_ACCEPTANCE.md. Appeal comes from stylizing real evidence,
  never from fabricated decoration.

## NOT THE GOAL
- Photorealism or exact reconstruction of every window worldwide.
- Full traffic simulation, multiplayer, MMO backend.
- Generative AI creating world content at runtime.
- Perfect street imagery coverage.
- Rebuilding every GIS algorithm from scratch when a license-compatible
  mature implementation exists.
- P3 imagery enrichment before P0/P1 are demonstrably green.
