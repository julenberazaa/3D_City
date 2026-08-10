import { describe, expect, it } from "vitest";
import {
  EARTH_CIRCUMFERENCE,
  TILE_SIZE,
  mercatorXToLon,
  mercatorYToLat,
  tileBounds,
  tileOriginX,
  tileOriginY,
  tileSizeMeters,
  toLonLat,
  webMercatorX,
  webMercatorY,
  worldToTileLocalPx,
  worldToTileXY,
} from "../../src/geo/projection";

describe("projection mercator", () => {
  it("round-trips lon/lat through EPSG:3857 within 1e-6 deg", () => {
    const samples: Array<[number, number]> = [
      [-122.4194, 37.7749],
      [0, 0],
      [151.2093, -33.8688],
      [-179.9, 85.05],
      [179.9, -85.05],
    ];
    for (const [lon, lat] of samples) {
      const x = webMercatorX(lon);
      const y = webMercatorY(lat);
      const [lonBack, latBack] = toLonLat(x, y);
      expect(lonBack).toBeCloseTo(lon, 6);
      expect(latBack).toBeCloseTo(lat, 6);
    }
  });

  it("matches known San Francisco mercator coordinate", () => {
    const x = webMercatorX(-122.4194);
    const y = webMercatorY(37.7749);
    expect(x).toBeCloseTo(-13627665.27136141, 3);
    expect(y).toBeCloseTo(4547675.354388391, 3);
    expect(mercatorXToLon(x)).toBeCloseTo(-122.4194, 6);
    expect(mercatorYToLat(y)).toBeCloseTo(37.7749, 6);
  });
});

describe("projection tiles", () => {
  it("tile size at zoom z equals circumference / 2^z", () => {
    expect(tileSizeMeters(0)).toBeCloseTo(EARTH_CIRCUMFERENCE, 0);
    expect(tileSizeMeters(15)).toBeCloseTo(1222.99, 0);
    expect(tileSizeMeters(17)).toBeCloseTo(305.75, 0);
  });

  it("tile origin anchors the tile at its west/north edge", () => {
    const z = 15;
    const x = 10478;
    const y = 25335;
    const ox = tileOriginX(x, z);
    const oy = tileOriginY(y, z);
    const [tx, ty] = worldToTileXY(ox, oy, z);
    expect([tx, ty]).toEqual([x, y]);
    const [px, py] = worldToTileLocalPx(ox, oy, z);
    expect(px).toBeCloseTo(0, 6);
    expect(py).toBeCloseTo(0, 6);
    const [pxNe, pyNe] = worldToTileLocalPx(ox + tileSizeMeters(z) - 1, oy - tileSizeMeters(z) + 1, z);
    expect(pxNe).toBeGreaterThan(TILE_SIZE - 1);
    expect(pxNe).toBeLessThan(TILE_SIZE);
    expect(pyNe).toBeGreaterThan(TILE_SIZE - 1);
    expect(pyNe).toBeLessThan(TILE_SIZE);
    const [tx2, ty2] = worldToTileXY(ox + tileSizeMeters(z) - 1, oy - tileSizeMeters(z) + 1, z);
    expect([tx2, ty2]).toEqual([x, y]);
  });

  it("SF falls inside its own z15 tile bounds", () => {
    const lon = -122.4194;
    const lat = 37.7749;
    const z = 15;
    const x = webMercatorX(lon);
    const y = webMercatorY(lat);
    const [tx, ty] = worldToTileXY(x, y, z);
    expect([tx, ty]).toEqual([5241, 12665]);
    const [west, south, east, north] = tileBounds(z, tx, ty);
    expect(west).toBeLessThanOrEqual(lon);
    expect(east).toBeGreaterThan(lon);
    expect(south).toBeLessThanOrEqual(lat);
    expect(north).toBeGreaterThan(lat);
    expect(east - west).toBeCloseTo(360 / 2 ** z, 9);
  });

  it("tile local pixel coords stay within 0..256", () => {
    const [px, py] = worldToTileLocalPx(webMercatorX(139.6917), webMercatorY(35.6895), 12);
    expect(px).toBeGreaterThanOrEqual(0);
    expect(px).toBeLessThan(256);
    expect(py).toBeGreaterThanOrEqual(0);
    expect(py).toBeLessThan(256);
  });
});
