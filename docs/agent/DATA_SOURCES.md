# DATA SOURCES — verified 2026-08-10 (probes today)

| Source | What we use | Format | Access (verified) | License | Attribution | Notes |
|---|---|---|---|---|---|---|
| Overture Maps release 2026-07-22.0 | buildings (height/levels/roof/parts), transportation (class/surface/names), base (water, land_cover), places | PMTiles (MVT) per theme | `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/<theme>.pmtiles` — HTTP 206 + CORS `*` | ODbL | "© OpenStreetMap contributors, Overture Maps Foundation" | buildings.pmtiles ≈179 GB world; range-fetch only needed tiles; monthly releases pinned in code |
| Mapzen/AWS terrain tiles (terrarium) | elevation (EGM96, meters), RGBA-packed | PNG z/x/y | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` — HTTP 206 + CORS `*` | source DEMs SRTM/GMTED2010/ETOPO1/NED (public-domain / US gov); facts not copyrightable; attribution line kept | "Terrain: Mapzen terrain tiles via AWS Open Data" | z15 for gameplay; 1.2 m/px |
| GeoNames cities15000 | settlement gazetteer (name/lat/lon/cc/admin1/pop) | TSV zip (daily) | `https://download.geonames.org/export/dump/cities15000.zip` (3.3 MB) | CC-BY 4.0 | "GeoNames" + data date | bundled sharded JSON built at build time; offline search |
| Open-Meteo Geocoding API | online search fallback | JSON | `https://geocoding-api.open-meteo.com/v1/search` | data CC-BY 4.0; free non-commercial ≤10k req/day, 600/min | Open-Meteo | only used when gazetteer misses; cached; documented policy |
| OSM (via Overture) | building/road semantics | — | — | ODbL | included in Overture attribution | no direct OSM API usage |
| Panoramax | facade hints (P3) | — | deferred | CC-BY 4.0 | — | only after P0/P1 green |

Rules: no scraping proprietary maps (Google/Apple/Bing etc. excluded as extraction
sources); every source pinned by version; attribution shown in app UI (About/credits).
