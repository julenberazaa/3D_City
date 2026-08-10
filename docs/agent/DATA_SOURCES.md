# DATA SOURCES — geodata sources + licenses

Audit in progress (WP-01). Skeleton below; final entries with verified URLs/versions after research.

| Source | What we use | Format | License | Attribution | Status |
|---|---|---|---|---|---|
| Overture Maps (buildings, transportation, water, land_cover, places) | building footprints/heights/roofs, roads, water polygons, land cover | PMTiles (MVT) | ODbL | Overture Maps attribution required | VERIFYING |
| Mapzen/AWS terrain tiles (terrarium) | terrain elevation (EGM96) | PNG (terrarium encoding) | CC0/ODbL components | see verified docs | VERIFYING |
| GeoNames (cities15000) | gazetteer for offline search | TSV dump | CC-BY 4.0 | GeoNames attribution | VERIFYING |
| Open-Meteo Geocoding API | online search fallback (documented policy) | JSON | CC-BY 4.0 data; usage policy | per policy | VERIFYING |
| OSM (via Overture) | semantics enriched | — | ODbL | — | VERIFYING |
| Panoramax | optional P3 facade hints | — | CC-BY 4.0 | per terms | DEFERRED |

Rules: no scraping proprietary maps; no Google/Apple/Bing extraction; any unclear
license → reference-only + documented + safer route.
