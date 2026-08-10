# UPSTREAM REUSE AUDIT — frozen decisions (2026-08-10)

Research evidence: live HTTP probes (CORS/range), official docs fetched today,
local npm package inspection, recon report ses_014b1af24ffeQLZ1hJ9arMEP1O.

Decision codes: REUSE / ADAPT / REFERENCE ONLY / REJECT / DEFER

| Candidate | Decision | Benefit | Integration cost | Perf implications | License | Evidence |
|---|---|---|---|---|---|---|
| Three.js 0.185 | **REUSE** | mature renderer, instancing/merged geometry, WebGL2 | low | good | MIT | installed; npm ls |
| @dimforge/rapier3d-compat 0.20 | **REUSE** | physics incl. raycast vehicle (raw API in build) | low-med (missing d.ts → local decls) | good (WASM) | Apache-2.0 | local dist/rapier.cjs exports DynamicRayCastVehicleController; rapier_wasm3d.d.ts lines 408-461 |
| pmtiles 4.4.1 (protomaps) | **REUSE** | HTTP-range PMTiles client, cached fetch | low | good | BSD-3-Clause | npm view; official docs |
| pbf 5.1.2 | **REUSE** | protobuf decode primitives | low | good | BSD-3-Clause | npm view |
| @mapbox/vector-tile | **REFERENCE ONLY** | MVT decoding reference | — | — | ISC | writing own compact decoder on pbf; avoids unneeded dep + keeps schema control |
| Overture Maps data (buildings, building_part, transportation, base, places) | **REUSE (data)** | global footprints/heights/roads/water; monthly release 2026-07-22.0; PMTiles per theme with HTTP range + CORS * | medium (schema) | good (range fetch only needed tiles) | ODbL (attribution "© OpenStreetMap contributors, Overture Maps Foundation") | docs.overturemaps.org; S3 probe 206+CORS; STAC latest=2026-07-22.0 |
| Mapzen/AWS terrarium terrain | **REUSE (data)** | global DEM (EGM96 m), PNG range+CORS | low | good | sources incl. SRTM/GMTED (public-domain/non-copied facts); attribution line documented | probe 206+CORS * |
| GeoNames cities15000 | **REUSE (data)** | 26k settlements gazetteer for offline search | low (build-time) | good | CC-BY 4.0 (attribution) | recon Q2; download 3.3 MB |
| Open-Meteo Geocoding API | **REUSE (fallback)** | worldwide online search; free non-commercial ≤10k req/day | low | good | data CC-BY 4.0; usage policy documented | recon Q3 |
| Streets GL (StrandedKitty) | **REFERENCE ONLY** | tile/terrain/LOD architecture ideas | — | — | MIT | recon Q4; separable modules but its own renderer stack not needed |
| OSM2World | **REFERENCE ONLY** | roof/building-part geometry algorithms | — | — | MIT | recon Q5 (Java, not web-native) |
| VoxCity | **REFERENCE ONLY** | semantic fusion/voxelization concepts | — | — | MIT | recon Q6 (Python, not browser) |
| Panoramax imagery | **DEFER (P3)** | facade hints | high | n/a | CC-BY 4.0 | not on critical path |
| protomaps basemaps | **REJECT** | full tile renderer | high | heavy | BSD | our own style pipeline is lighter for a game |

## Why no full-pipeline upstream engine
Streets GL/OSM2World/VoxCity are each strong but none maps onto the game needs
(streaming + deterministic stylized generation + Rapier gameplay) without inheriting
their whole rendering architecture. Their algorithms are adapted/translated where
useful (roofs, fusion), recorded in PROVENANCE.md. Spikes: none needed — primary
facts verified directly (CORS, range, API surface).
