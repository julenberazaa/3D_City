# 3D City

Browser-based 3D game that reconstructs real towns and cities worldwide from open
geographic data into a stylized low-poly miniature world. Search any settlement,
then walk or drive through its real streets, buildings and terrain — streamed around
you as you move.

## What fidelity means

The world is built from real open geodata, not procedural fantasy:

- **Terrain**: real elevation (Mapzen/AWS terrarium DEM tiles, ~30 m resolution).
- **Roads**: real street centerlines and classes from Overture Maps / OpenStreetMap.
- **Buildings**: real footprints; real heights/levels/roof types where the data has
  them, deterministic neutral fallback otherwise (tagged INFERRED internally).
- **Water & land cover**: real polygons.

Data is simplified into a stylized block-built miniature look (vertex colors, low-poly
geometry — no textures). It is **not** a photorealistic reconstruction.

## Architecture

```
Search (bundled GeoNames gazetteer + Open-Meteo fallback)
  → Place → bbox → Live loader (Overture PMTiles + terrarium, HTTP-range)
  → Fixture builder (deterministic, byte-identical contract)
  → Chunk streamer (z15 chunks: priority/cancellation/bounded queues/eviction)
  → Generator (terrain/roads/buildings/water per chunk, vertex colors)
  → three.js (WebGL2) + Rapier (heightfield + box colliders, raycast vehicle)
  → Persistent cache (IndexedDB, LRU, 200 MB budget, versioned keys)
```

All world generation runs in the browser; no paid APIs. Web Workers are used for
tile decode (main-thread decode is the fallback path).

## Data sources & attribution

| Source | Data | License | Attribution |
|---|---|---|---|
| [Overture Maps](https://overturemaps.org) release 2026-07-22.0 | buildings, transportation, base | [ODbL](https://opendatacommons.org/licenses/odbl/) | © OpenStreetMap contributors, Overture Maps Foundation |
| [Mapzen terrain tiles](https://github.com/tilezen/joerd) via AWS Open Data | elevation | public-domain sources (SRTM/GMTED etc.) | Terrain: Mapzen terrain tiles via AWS Open Data |
| [GeoNames](https://www.geonames.org) cities15000 | settlement gazetteer | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) | GeoNames |
| [Open-Meteo Geocoding API](https://open-meteo.com) | search fallback | data CC-BY 4.0; free non-commercial ≤10k req/day | Open-Meteo |

Full ledger: `docs/agent/DATA_SOURCES.md`, `docs/agent/PROVENANCE.md`.

## Install / run / build / test

```sh
npm install        # install dependencies
npm run dev        # dev server (http://localhost:5173)
npm run build      # production build (fixtures copied into dist)
npm run preview    # serve the build
npm run typecheck  # TypeScript strict
npm run lint       # ESLint
npm run test       # Vitest unit/integration tests (deterministic, offline)
npm run e2e        # Playwright: smoke, drive, live-data, search (needs network for live)
npm run harness    # full gate harness → reports/harness/<run-id>/
```

Prerequisites: Node 20+ (Node 24 recommended), npm. Browser: recent Chrome/Edge/Firefox
with WebGL2 (SwiftShader fallback works but is slow).

## Controls

- `W/A/S/D` or arrows — accelerate / steer / brake
- `Space` — handbrake
- `C` — toggle chase/orbit camera
- `H` — toggle HUD
- Search screen — type a place, pick a result (Enter picks the top hit)

## Demo worlds

- `/?bbox=-122.425,37.767,-122.396,37.792` — San Francisco downtown (pinned fixture, offline)
- `/?bbox=w,s,e,n` — any live bbox from the open sources (network required)

## Performance expectations

Target: modern desktop browsers at 60 FPS during ordinary driving. The renderer
adaptively lowers pixel ratio when frames are slow (software rasterizers included).
Memory is bounded: chunks stream in/out around the player and the disk cache is
LRU-capped at 200 MB. Measured budgets: `docs/agent/PERFORMANCE_BUDGET.md`.

## Known limitations

- Building facade detail is stylized; ML-derived footprints (parts of Overture) have
  lower precision in some regions.
- Roof shapes only where Overture provides them; otherwise flat neutral roofs.
- No traffic simulation, no multiplayer, no street imagery yet.
- Walk mode (on foot) is planned but not yet shipped.

## Project status

P0 playable core is complete and verified (see `docs/agent/STATUS.md`): search → live
world → drive → streaming → cache. Full engineering state, requirements traceability
and the agent operating manual live under `docs/agent/`.
