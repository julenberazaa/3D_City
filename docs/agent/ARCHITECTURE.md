# ARCHITECTURE — frozen 2026-08-10 (evidence: UPSTREAM_REUSE_AUDIT.md, reports/research/)

## Stack
- Vite 8 + TypeScript 6 (strict), Vitest 4, Playwright, ESLint flat config.
- **Three.js 0.185** — REUSE. **WebGL2 renderer is the primary path** (D-004): mature,
  universal, sufficient for the stylized low-poly target; code is renderer-agnostic
  (render facade), so WebGPU can be adopted later without rewrites.
- **@dimforge/rapier3d-compat 0.20.0** — REUSE (Apache-2.0). Vehicle via
  `DynamicRayCastVehicleController` raw API + project-local `.d.ts` (typings shipped
  with the package are incomplete). Terrain via heightfield colliders; buildings via
  simplified box colliders (physics ≠ visual).
- **pmtiles 4.4.1** (protomaps) — REUSE (BSD-3). HTTP-range PMTiles client.
- **pbf 5.1.2** — REUSE (BSD-3). Protobuf decode for our own compact MVT decoder.

## Data pipeline (live, static-hosted sources, CORS verified)
- **Overture release 2026-07-22.0** (ODbL, attribution "© OpenStreetMap contributors,
  Overture Maps Foundation"), PMTiles per theme:
  `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/{buildings,transportation,base,places}.pmtiles`
  (verified: HTTP 206 + CORS `*`; buildings ~179 GB world file, range-streamed).
- **Terrain**: Mapzen/AWS terrarium PNG
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
  (verified: HTTP 206 + CORS `*`; EGM96 meters, terrarium RGBA encoding).
- **Search**: bundled GeoNames-derived gazetteer (CC-BY 4.0, attribution) primary +
  Open-Meteo geocoding fallback (free non-commercial, ≤10k req/day, CC-BY 4.0 data).

## Coordinate system
- Web Mercator (EPSG:3857) meters as the geographic space; local world = world
  coordinates − floating origin. **Origin rebase** when |local position| > 2048 m:
  shift origin to player chunk; no visible jump (all geometry translated by delta).
- Elevation: terrain heights are EGM96 orthometric meters from terrarium. Buildings/roads
  placed on terrain surface (base elevation = terrain sample at centroid/vertices).
  Bridge/tunnel via `level_rules`/`road_flags` (layer info) — P1.
- Deterministic chunk key: `{dataRelease, chunkId(z15,x,y), generatorVersion, artVersion}`.

## Chunking / streaming
- Chunk = one z15 tile ≈ 1223 m at the equator (40075016.686 / 2^15). Data zoom: Overture
  PMTiles maxZoom is 14 (buildings/transportation) and 13 (base) → **overzoom**: fetch
  z14/z13 tiles and bucket features into the z15 chunk grid (verified by probe during
  WP-02b; SF fixture = 16 z15 chunks). Terrain (terrarium) is real z15, sampled 33×33.
  State machine: UNSEEN → QUEUED → FETCHING → GENERATING → ACTIVE → EVICTED; all stages
  cancellable.
- Priority: distance + heading/velocity projection (chunkPriority). Radii (code truth):
  physics 400 m / detail 1200 m / prefetch 2400 m, maxQueued 24, maxConcurrentFetch 4.
- Generation is ASYNC BATCHED on the main thread: buildChunkPieces is a generator with
  control points; the streamer steps it with a ~14 ms frame budget, yielding via rAF
  between batches, and cancellation discards partial work (identity-guarded, see
  streamer-race tests). Ring decimation (≤64 verts) bounds single-polygon cost.
  Web Workers are the documented future step (OPTIMIZATION_LOG O-05); async batching
  meets the acceptance with no serialization/race surface.

## Generation rules (stylized low-poly)
- Buildings: real footprint polygon extruded; height = max(height, levels×3 m) from
  source (OBSERVED); roof type from source (OBSERVED) else neutral (INFERRED, flat);
  facade/roof color deterministic hash → style palette (INFERRED); building_parts
  overridden onto parent footprint. Floor bands derived from levels (DERIVED).
- Roads: centerline → ribbon mesh on terrain + simplified surface; lanes from class.
  **Bridge rule (R-019 minimal)**: road vertices inside a water polygon are decked at
  WATER_LEVEL + 0.3 (point-in-polygon vs decimated water rings) so roads never dive
  into the river/bay bed.
- Terrain: heightfield mesh per chunk with vertex colors (grass/rock/sand by slope);
  water level from Overture water polygons (flatten terrain below water — visual only,
  documented).
- All per-chunk render geometry merged into few BufferGeometry batches, vertex colors,
  2–4 shared materials, no per-building materials, no naive voxel cubes.

## Provenance
- Every feature carries {value, provenance: OBSERVED|DERIVED|INFERRED}. Debug overlay
  can colorize by class. Never present INFERRED as observed truth.

## Physics
- Rapier world per physics region; terrain heightfield (downsampled); buildings = box
  colliders from footprint+height (friction 0.35 — slides along walls, arcade feel),
  within the physics radius; vehicle = raycast vehicle; collider lifecycle tied to
  chunk activation/eviction. The spawn chunk's colliders are pre-created before the
  car spawns (no fall-through). Vehicle recovery: R teleports to the nearest safe
  road point (findSpawnPoint near) and recreates the vehicle controller (clears stale
  wheel state). Walking = KinematicCharacterController (P1, deferred).

## UI
- Plain DOM UI (no framework): search, loading stages, HUD, settings, debug overlay.
- Keyboard-first controls; instructions visible.

## Failure handling
- Geocoder fail → offline gazetteer; data tile missing → neighbor/fallback + warning;
  chunk build fail → slot released + re-queued (no black hole); stale build results →
  identity-guarded (no zombie chunks); cache corrupt → drop + self-healing accounting;
  WebGL2 absent → error screen with requirements (WebGPU not required).

## Deployment
- Static build, base "./", GitHub Pages workflow (pinned build) once paths stable.
