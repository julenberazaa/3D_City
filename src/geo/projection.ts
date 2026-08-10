export const EARTH_CIRCUMFERENCE = 40075016.686;
export const TILE_SIZE = 256;
const HALF_CIRCUMFERENCE = EARTH_CIRCUMFERENCE / 2;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;
const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

/** Longitude to Web Mercator (EPSG:3857) X in meters. */
export function webMercatorX(lon: number): number {
  return (lon / 360) * EARTH_CIRCUMFERENCE;
}

/** Latitude to Web Mercator (EPSG:3857) Y in meters. */
export function webMercatorY(lat: number): number {
  const sin = Math.sin(toRadians(lat));
  const clamped = Math.max(-0.999999, Math.min(0.999999, sin));
  return HALF_CIRCUMFERENCE * Math.log((1 + clamped) / (1 - clamped)) * 0.5;
}

/** Web Mercator (EPSG:3857) X in meters to longitude. */
export function mercatorXToLon(x: number): number {
  return (x / EARTH_CIRCUMFERENCE) * 360;
}

/** Web Mercator (EPSG:3857) Y in meters to latitude. */
export function mercatorYToLat(y: number): number {
  const n = Math.exp((y / HALF_CIRCUMFERENCE) * 2);
  return toDegrees(Math.asin((n - 1) / (n + 1)));
}

/** EPSG:3857 meter X/Y to lon/lat. */
export function toLonLat(x: number, y: number): [lon: number, lat: number] {
  return [mercatorXToLon(x), mercatorYToLat(y)];
}

/** Size in meters of one side of a square tile at zoom z. */
export function tileSizeMeters(z: number): number {
  return EARTH_CIRCUMFERENCE / 2 ** z;
}

/** Web Mercator X/Y (meters) to fractional tile x coordinate at zoom z. */
export function worldToTileX(x: number, z: number): number {
  return (x / EARTH_CIRCUMFERENCE + 0.5) * 2 ** z;
}

/** Web Mercator X/Y (meters) to fractional tile y coordinate at zoom z. */
export function worldToTileY(y: number, z: number): number {
  return (0.5 - y / EARTH_CIRCUMFERENCE) * 2 ** z;
}

/** Web Mercator X/Y (meters) to integer tile coordinates at zoom z. */
export function worldToTileXY(x: number, y: number, z: number): [tx: number, ty: number] {
  return [Math.floor(worldToTileX(x, z)), Math.floor(worldToTileY(y, z))];
}

/** World X (meters) of the west edge of tile (z, x). */
export function tileOriginX(x: number, z: number): number {
  return (x / 2 ** z - 0.5) * EARTH_CIRCUMFERENCE;
}

/** World Y (meters) of the north edge of tile (z, y). */
export function tileOriginY(y: number, z: number): number {
  return (0.5 - y / 2 ** z) * EARTH_CIRCUMFERENCE;
}

/** Local 0..256 pixel coordinates of a Web Mercator X/Y (meters) point inside a tile at zoom z. */
export function worldToTileLocalPx(x: number, y: number, z: number): [px: number, py: number] {
  const tx = worldToTileX(x, z);
  const ty = worldToTileY(y, z);
  return [TILE_SIZE * (tx - Math.floor(tx)), TILE_SIZE * (ty - Math.floor(ty))];
}

/** Geographic bounding box of a tile at (z, x, y): [west, south, east, north]. */
export function tileBounds(z: number, x: number, y: number): [west: number, south: number, east: number, north: number] {
  const size = 360 / 2 ** z;
  const west = (x / 2 ** z) * 360 - 180;
  const east = west + size;
  const latTop = mercatorYToLat(tileOriginY(y, z));
  const latBottom = mercatorYToLat(tileOriginY(y + 1, z));
  const north = Math.max(latTop, latBottom);
  const south = Math.min(latTop, latBottom);
  return [west, south, east, north];
}
