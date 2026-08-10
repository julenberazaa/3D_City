import type { SearchResult } from "./gazetteer";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

/**
 * Open-Meteo geocoding fallback (documented policy: free for non-commercial
 * use, ≤10k requests/day, 600/min; data CC-BY 4.0). Used ONLY when the
 * bundled gazetteer misses; results are not cached locally yet (P1).
 */
export async function searchOpenMeteo(query: string, limit = 5): Promise<SearchResult[]> {
  const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=${limit}&language=en&format=json`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const json = (await res.json()) as {
    results?: Array<{
      name: string;
      latitude: number;
      longitude: number;
      country_code?: string;
      admin1?: string;
      population?: number;
    }>;
  };
  return (json.results ?? []).map((r) => ({
    name: r.name,
    country: r.country_code ?? "",
    admin1: r.admin1 ?? "",
    population: r.population ?? 0,
    lat: r.latitude,
    lon: r.longitude,
  }));
}
