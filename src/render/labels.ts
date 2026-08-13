import * as THREE from "three";

/**
 * Google-Maps-like street labels as always-facing canvas sprites.
 * Deterministic placement (positions computed by the generator); the canvas
 * texture is per-chunk and disposed with the chunk group.
 */
export interface RoadLabel {
  name: string;
  x: number;
  z: number;
  y: number;
  /** World width of the label. */
  scale: number;
}

export const LABEL_PRIORITY: Record<string, number> = {
  motorway: 6,
  trunk: 5,
  primary: 4,
  secondary: 3,
  tertiary: 2,
  residential: 1,
  unclassified: 1,
  living_street: 1,
};

export function labelPriorityOf(cls: string): number {
  return LABEL_PRIORITY[cls] ?? 0;
}

export const MAX_LABELS_PER_CHUNK = 10;

/** Apparent-size targets (world units at 1 m distance scale to 768 px on the
 *  55° FOV viewport): keep labels readable at gameplay distances without
 *  ballooning when the camera is close. Applied per-frame to billboards. */
export const LABEL_TARGET_PX = 170;
export const LABEL_MIN_WORLD = 7;
export const LABEL_MAX_WORLD = 22;

function makeTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "600 44px system-ui, -apple-system, sans-serif";
  const w = Math.min(244, ctx.measureText(name).width + 24);
  ctx.fillStyle = "rgba(14, 18, 22, 0.8)";
  const h = 50;
  const rx = (256 - w) / 2;
  ctx.beginPath();
  ctx.roundRect(rx, (64 - h) / 2, w, h, 12);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(14, 18, 22, 0.95)";
  ctx.strokeText(name, 128, 33);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, 128, 33);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export function createLabelSprite(label: RoadLabel): THREE.Sprite {
  const texture = makeTexture(label.name);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(label.x, label.y, label.z);
  const aspect = Math.min(4, Math.max(1.4, label.name.length * 0.6));
  sprite.scale.set(label.scale, (label.scale / aspect) * 0.62, 1);
  sprite.renderOrder = 10;
  // Per-frame apparent-size clamp (see updateLabelScales): the base scale is
  // the label's native width at the reference distance.
  sprite.userData.roadLabel = true;
  sprite.userData.baseScale = label.scale;
  sprite.userData.aspect = aspect;
  return sprite;
}

const PX_PER_WORLD_AT_1M = 768;

/**
 * Bounded apparent-size clamp for street labels: each label's world width is
 * scaled so it stays readable (>= LABEL_TARGET_PX of screen) but never grows
 * beyond LABEL_MAX_WORLD when the camera is close. Labels stay attached to
 * their street — this only adjusts size, never position.
 */
export function updateLabelScales(scene: THREE.Scene, camera: THREE.Camera): void {
  for (const group of scene.children) {
    if (!(group as THREE.Group).isGroup) continue;
    for (const child of group.children) {
      const u = child.userData as { roadLabel?: boolean; baseScale?: number; aspect?: number };
      if (!u.roadLabel || !u.baseScale || !u.aspect) continue;
      const d = camera.position.distanceTo(child.position);
      const target = (LABEL_TARGET_PX * d) / PX_PER_WORLD_AT_1M;
      const w = Math.min(LABEL_MAX_WORLD, Math.max(LABEL_MIN_WORLD, target));
      child.scale.set(w, (w / u.aspect) * 0.62, 1);
    }
  }
}
