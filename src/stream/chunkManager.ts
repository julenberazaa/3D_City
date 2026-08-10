import { tileOriginX, tileOriginY, tileSizeMeters, worldToTileX, worldToTileY } from "../geo/projection";

export type ChunkState = "unseen" | "queued" | "fetching" | "generating" | "active" | "evicted";

export interface PlayerState {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

export interface ChunkAction {
  key: string;
  action: "load" | "unload";
  state: ChunkState;
}

export interface StreamCounters {
  queued: number;
  fetching: number;
  generating: number;
  active: number;
  evictedTotal: number;
  cancelled: number;
}

export interface ChunkManagerConfig {
  origin: { x: number; y: number };
  physicsRadius: number;
  detailRadius: number;
  prefetchRadius: number;
  maxQueued: number;
  maxConcurrentFetch: number;
  maxConcurrentGenerate: number;
}

const Z15 = 15;
export const DEFAULT_STREAM_CONFIG: Omit<ChunkManagerConfig, "origin"> = {
  physicsRadius: 400,
  detailRadius: 1200,
  prefetchRadius: 2400,
  maxQueued: 24,
  maxConcurrentFetch: 4,
  maxConcurrentGenerate: 1,
};

/** z15 chunk key for a local (origin-relative) position. */
export function chunkKeyOf(origin: { x: number; y: number }, x: number, z: number): string {
  return `${Math.floor(worldToTileX(origin.x + x, Z15))}/${Math.floor(worldToTileY(origin.y + z, Z15))}`;
}

export function chunkCenter(origin: { x: number; y: number }, key: string): { x: number; z: number } {
  const [x, y] = key.split("/").map(Number);
  const size = tileSizeMeters(Z15);
  // Local z = world_y - origin.y and world y DECREASES southward, so the tile
  // center sits at the north edge MINUS half the tile.
  return { x: tileOriginX(x, Z15) - origin.x + size / 2, z: tileOriginY(y, Z15) - origin.y - size / 2 };
}

/**
 * Deterministic chunk priority: nearer and ahead-of-travel chunks load first.
 * priority = -dist + 0.6*forwardProjection + speed bonus.
 */
export function chunkPriority(origin: { x: number; y: number }, key: string, player: PlayerState): number {
  const c = chunkCenter(origin, key);
  const dx = c.x - player.x;
  const dz = c.z - player.z;
  const dist = Math.hypot(dx, dz);
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  const proj = (dx * fx + dz * fz) / Math.max(1, dist);
  return -dist + 0.6 * dist * proj + 0.15 * Math.abs(player.speed) * proj;
}

/**
 * Pure chunk lifecycle manager: computes the desired chunk set around the
 * player, tracks per-chunk state, and returns add/remove actions with a
 * bounded pipeline. The host drives actual work and reports back via
 * setState / markCancelled.
 */
export class ChunkManager {
  private states = new Map<string, ChunkState>();
  private fetching = new Set<string>();
  private generating = new Set<string>();
  private generation = new Map<string, number>();
  private counters: StreamCounters = {
    queued: 0,
    fetching: 0,
    generating: 0,
    active: 0,
    evictedTotal: 0,
    cancelled: 0,
  };

  constructor(public config: ChunkManagerConfig) {}

  state(key: string): ChunkState {
    return this.states.get(key) ?? "unseen";
  }

  countersSnapshot(): StreamCounters {
    return { ...this.counters };
  }

  activeKeys(): string[] {
    return [...this.states.entries()].filter(([, s]) => s === "active").map(([k]) => k);
  }

  /** True if a previously-scheduled job for `key` should be discarded. */
  isStale(key: string, generation: number): boolean {
    return (this.generation.get(key) ?? -1) !== generation || !this.states.has(key);
  }

  /** Host reports progress: (key, from, to). */
  setState(key: string, from: ChunkState, to: ChunkState, generation = 0): void {
    if (this.states.get(key) !== from) return;
    this.states.set(key, to);
    if (from === "queued") this.counters.queued = Math.max(0, this.counters.queued - 1);
    if (to === "queued") this.counters.queued++;
    if (from === "fetching") {
      this.fetching.delete(key);
      this.counters.fetching = this.fetching.size;
    }
    if (to === "fetching") {
      this.fetching.add(key);
      this.counters.fetching = this.fetching.size;
      this.generation.set(key, generation);
    }
    if (from === "generating") {
      this.generating.delete(key);
      this.counters.generating = this.generating.size;
    }
    if (to === "generating") {
      this.generating.add(key);
      this.counters.generating = this.generating.size;
    }
    if (to === "active") this.counters.active++;
    if (from === "active") this.counters.active = Math.max(0, this.counters.active - 1);
  }

  /** Host reports a job that was discarded (cancelled/evicted mid-flight). */
  markCancelled(key: string, generation: number): void {
    const cur = this.states.get(key);
    const live =
      this.generation.get(key) === generation &&
      (cur === "queued" || cur === "fetching" || cur === "generating");
    if (live) this.counters.cancelled++;
    this.generation.delete(key);
    if (this.fetching.has(key)) {
      this.fetching.delete(key);
      this.counters.fetching = this.fetching.size;
    }
    if (this.generating.has(key)) {
      this.generating.delete(key);
      this.counters.generating = this.generating.size;
    }
    if (cur === "queued" || cur === "fetching" || cur === "generating") this.counters.queued = Math.max(0, this.counters.queued - 1);
    this.states.delete(key);
  }

  /**
   * Recompute the world around the player. Returns actions for the host.
   */
  update(player: PlayerState): ChunkAction[] {
    const actions: ChunkAction[] = [];
    const contained = chunkKeyOf(this.config.origin, player.x, player.z);
    const desired = new Set<string>();
    desired.add(contained);

    const { prefetchRadius, maxQueued } = this.config;
    void this.config.physicsRadius;
    void this.config.detailRadius;
    const keys = this.keysWithin(player, prefetchRadius);
    for (const key of keys) desired.add(key);

    // Evict chunks that left the prefetch radius (plus margin).
    for (const [key, state] of [...this.states]) {
      if (!desired.has(key)) {
        const c = chunkCenter(this.config.origin, key);
        const dist = Math.hypot(c.x - player.x, c.z - player.z);
        if (dist > prefetchRadius * 1.1) {
          if (state === "queued" || state === "fetching" || state === "generating") {
            this.markCancelled(key, this.generation.get(key) ?? 0);
          } else if (state === "active") {
            this.states.set(key, "evicted");
            this.counters.active = Math.max(0, this.counters.active - 1);
            this.counters.evictedTotal++;
          }
          actions.push({ key, action: "unload", state: "evicted" });
        }
      }
    }

    // Queue new chunks by priority (bounded).
    const missing = [...desired].filter((k) => !this.states.has(k) || this.states.get(k) === "evicted");
    missing.sort((a, b) => chunkPriority(this.config.origin, b, player) - chunkPriority(this.config.origin, a, player));
    const queueRoom = maxQueued - this.counters.queued;
    let added = 0;
    for (const key of missing) {
      if (added >= queueRoom) break;
      this.states.set(key, "queued");
      this.counters.queued++;
      this.generation.set(key, (this.generation.get(key) ?? 0) + 1);
      actions.push({ key, action: "load", state: "queued" });
      added++;
    }

    // Promote queued → fetching (bounded concurrency). The HOST drives the
    // fetching → generating → active transitions once the work is ready.
    const fetchSlots = this.config.maxConcurrentFetch - this.fetching.size;
    for (const key of missing.filter((k) => this.states.get(k) === "queued")) {
      if (fetchSlots <= 0) break;
      this.setState(key, "queued", "fetching", this.generation.get(key) ?? 0);
    }
    return actions;
  }

  private keysWithin(player: PlayerState, radius: number): string[] {
    const size = tileSizeMeters(Z15);
    const steps = Math.ceil(radius / size) + 1;
    const center = chunkKeyOf(this.config.origin, player.x, player.z);
    const [cx, cy] = center.split("/").map(Number);
    const out: string[] = [];
    for (let dy = -steps; dy <= steps; dy++) {
      for (let dx = -steps; dx <= steps; dx++) {
        const key = `${cx + dx}/${cy + dy}`;
        const c = chunkCenter(this.config.origin, key);
        if (Math.hypot(c.x - player.x, c.z - player.z) <= radius) out.push(key);
      }
    }
    return out;
  }
}
