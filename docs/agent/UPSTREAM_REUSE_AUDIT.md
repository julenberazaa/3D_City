# UPSTREAM REUSE AUDIT — reuse decisions

Status: AUDIT IN PROGRESS (WP-01). Final decisions recorded with evidence by 2026-08-10.

Decision codes: **REUSE** / **ADAPT** / **REFERENCE ONLY** / **REJECT**

| Candidate | Decision | Benefit | Integration cost | Perf implications | License | Architecture coupling | Evidence | Notes |
|---|---|---|---|---|---|---|---|---|
| Three.js | (pending) | mature renderer | low | good | MIT | core renderer | | |
| Rapier3D | (pending) | physics | low | good (WASM) | Apache-2.0 | core physics | | |
| PMTiles client (protomaps) | (pending) | HTTP-range tiles | low | good | BSD-3 | data layer | | |
| Overture Maps data | (pending) | global building/road evidence | medium (schema) | tile-size dependent | ODbL | data layer | | |
| Mapzen terrain tiles | (pending) | global elevation | low | good | see research | data layer | | |
| Streets GL | (pending) | tile/terrain/streaming ideas | high | heavy | ISC? verify | would couple renderer | | |
| OSM2World | (pending) | semantic OSM→3D | high (not web-native) | poor in browser | LGPL? verify | generator | | |
| VoxCity | (pending) | data fusion/voxelization ideas | medium | n/a (research) | Apache-2.0? verify | none (reference) | | |
| @mapbox/vector-tile | (pending) | MVT decoding | low | good | ISC | data layer | | |
| pbf | REUSE | protobuf decoding | low | good | BSD-3-Clause (verified via npm) | data layer | npm view pbf license | |
| protomaps basemaps | (pending) | full renderer | high | heavy | BSD | would couple | | |
| GeoNames | (pending) | gazetteer | medium (dump) | good | CC-BY 4.0 | search | | |
| Open-Meteo Geocoding | (pending) | search fallback | low | good | CC-BY 4.0 data, fair-use policy | search | | |
| Panoramax | (pending, P3) | facade hints | high | n/a | CC-BY 4.0 | enrichment | | |

## Methodology
Current official docs/repos inspected (not random summaries); licenses verified where
possible at install time; any unclear license → REFERENCE ONLY + documented + safer route.
