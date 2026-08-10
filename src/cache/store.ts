export interface CacheEntry {
  key: string;
  bytes: ArrayBuffer;
  size: number;
  storedAt: number;
}

export interface CacheRecord {
  bytes: ArrayBuffer;
  size: number;
  storedAt: number;
}

export interface CacheBackend {
  get(key: string): Promise<CacheRecord | undefined>;
  put(key: string, record: CacheRecord): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  sizeBytes: number;
  entries: number;
  evicted: number;
}

/**
 * Bounded LRU byte cache with corruption tolerance, usable in browser
 * (IndexedDB backend) and tests (in-memory backend). Keyed by the versioned
 * deterministic chunk key (R-009/R-015).
 */
export class ChunkCache {
  private stats: CacheStats = { hits: 0, misses: 0, sizeBytes: 0, entries: 0, evicted: 0 };

  constructor(
    private backend: CacheBackend,
    private maxBytes: number,
  ) {}

  statsSnapshot(): CacheStats {
    return { ...this.stats };
  }

  async get(key: string): Promise<ArrayBuffer | undefined> {
    try {
      const rec = await this.backend.get(key);
      if (rec) {
        this.stats.hits++;
        return rec.bytes;
      }
    } catch {
      // corrupted read: drop and count as miss
      await this.backend.delete(key).catch(() => undefined);
    }
    this.stats.misses++;
    return undefined;
  }

  async put(key: string, bytes: ArrayBuffer): Promise<void> {
    const size = bytes.byteLength;
    try {
      const existing = await this.backend.get(key);
      const existingSize = existing?.size ?? 0;
      await this.backend.put(key, { bytes, size, storedAt: Date.now() });
      this.stats.sizeBytes += size - existingSize;
      if (existingSize === 0) this.stats.entries++;
    } catch {
      this.stats.evicted++;
      return;
    }
    await this.enforceBudget();
  }

  private async enforceBudget(): Promise<void> {
    if (this.stats.sizeBytes <= this.maxBytes) return;
    let keys: string[];
    try {
      keys = await this.backend.keys();
    } catch {
      return;
    }
    const meta: Array<{ key: string; size: number; at: number }> = [];
    for (const k of keys) {
      try {
        const rec = await this.backend.get(k);
        meta.push({ key: k, size: rec?.size ?? 0, at: rec?.storedAt ?? 0 });
      } catch {
        meta.push({ key: k, size: 0, at: 0 });
      }
    }
    meta.sort((a, b) => a.at - b.at);
    let total = meta.reduce((s, m) => s + m.size, 0);
    for (const m of meta) {
      if (total <= this.maxBytes) break;
      await this.backend.delete(m.key).catch(() => undefined);
      total -= m.size;
      this.stats.evicted++;
      this.stats.entries = Math.max(0, this.stats.entries - 1);
      this.stats.sizeBytes = Math.max(0, this.stats.sizeBytes - m.size);
    }
  }
}
