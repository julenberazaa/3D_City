# PROVENANCE — provenance classes and policy

## Classes
- **OBSERVED**: directly present in an authoritative/open dataset (footprint, height,
  road geometry, roof shape, surface, terrain elevation).
- **DERIVED**: deterministically calculated from observed data (e.g., facade floor bands
  from known floor count).
- **INFERRED**: deterministic fallback because source evidence is missing (e.g., neutral
  roof type when no roof type exists).

## Policy
1. Pipeline attributes carry a provenance tag; never present INFERRED as OBSERVED.
2. Debug overlay may show per-feature provenance/confidence.
3. Deterministic hash-based procedural variation is allowed but tagged INFERRED.
4. This file also tracks every reusable code source entering the product:
   project name, canonical URL, version/commit, license, attribution, what we use,
   copied/adapted/translated/referenced, compatibility, limitations.

## Code/asset provenance ledger

| Component | Source | URL/version | License | Use mode | Notes |
|---|---|---|---|---|---|
| three | npm registry | three@0.185.1 | MIT | copied (dependency) | installed via npm, lockfile-pinned |
| @dimforge/rapier3d-compat | npm registry | 0.20.0 | Apache-2.0 | copied (dependency) | vehicle controller raw API + local .d.ts |
| pmtiles | npm registry | 4.4.1 | BSD-3-Clause | copied (dependency) | protomaps client |
| pbf | npm registry | 5.1.2 | BSD-3-Clause | copied (dependency) | protobuf primitives |
| MVT decoder | own implementation; @mapbox/vector-tile as reference | — | ours (MIT) | adapted algorithm (reference only) | compact decoder on pbf; schema pinned to Overture release |
| Roof/building-part geometry | own implementation; OSM2World as algorithmic reference | MIT | ours (MIT) | adapted algorithm (reference only) | pitched/flat/skillion roofs from footprint+attrs |
| Chunk fusion concepts | VoxCity as reference | MIT | ours (MIT) | reference only | per-chunk layer fusion, not voxel grid |
| Streaming/LOD concepts | Streets GL as reference | MIT | ours (MIT) | reference only | tile priority/LOD rings architecture ideas |

Data provenance is tracked at feature level in code (see ARCHITECTURE §provenance).

