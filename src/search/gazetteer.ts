export interface GazetteerEntry {
  n: string;
  /** search aliases from GeoNames alternate names */
  al?: string[];
  c: string;
  a: string;
  p: number;
  la: number;
  lo: number;
}

export interface GazetteerIndex {
  /** normalized name → entry indices */
  index: Map<string, Array<{ id: number; alias: boolean }>>;
  entries: GazetteerEntry[];
}

const normalize = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** German-style digraph form: ä→ae, ö→oe, ü→ue, ß→ss (matches GeoNames ASCII names). */
const normalizeDigraph = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Build a search index over the bundled GeoNames-derived gazetteer.
 * Deterministic: same JSON → same index. Each name is indexed under both the
 * plain and digraph-normalized forms so "zurich" finds "Zuerich".
 */
export function buildGazetteerIndex(entries: GazetteerEntry[]): GazetteerIndex {
  const index = new Map<string, Array<{ id: number; alias: boolean }>>();
  entries.forEach((e, i) => {
    const keys = new Set<string>();
    const names = [e.n, ...(e.al ?? [])];
    names.forEach((name, k) => {
      const plain = normalize(name);
      if (plain) keys.add(plain);
      const digraph = normalizeDigraph(name);
      if (digraph && digraph !== plain) keys.add(digraph);
      const alias = k > 0;
      for (const key of keys) {
        const list = index.get(key);
        if (list) list.push({ id: i, alias });
        else index.set(key, [{ id: i, alias }]);
      }
      keys.clear();
    });
  });
  return { index, entries };
}

export interface SearchResult {
  name: string;
  country: string;
  admin1: string;
  population: number;
  lat: number;
  lon: number;
}

/**
 * Prefix search over the gazetteer: matches names starting with the query
 * (plus exact/word matches), ranked by population. Deterministic.
 */
export function searchGazetteer(index: GazetteerIndex, query: string, limit = 8): SearchResult[] {
  const qForms = [normalize(query), normalizeDigraph(query)];
  if (qForms[0]!.length < 2) return [];
  // Per-entry best score: primary-name prefix > alias prefix > name contains >
  // alias contains. Entries never accumulate (multiple alias hits ≠ stronger).
  const results = new Map<number, number>();
  for (const [key, refs] of index.index) {
    for (const q of qForms) {
      let hit = -1;
      if (key.startsWith(q)) hit = 3;
      else if (key.includes(" " + q)) hit = 1;
      if (hit < 0) continue;
      for (const ref of refs) {
        const score = ref.alias ? hit - 1 : hit;
        const prev = results.get(ref.id) ?? 0;
        if (score > prev) results.set(ref.id, score);
      }
    }
  }
  const ranked = [...results.entries()]
    .map(([id, score]) => ({ id, score, entry: index.entries[id]! }))
    .sort((a, b) => b.score - a.score || b.entry.p - a.entry.p);
  return ranked.slice(0, limit).map(({ entry }) => ({
    name: entry.n,
    country: entry.c,
    admin1: entry.a,
    population: entry.p,
    lat: entry.la,
    lon: entry.lo,
  }));
}
