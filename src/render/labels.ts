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

const LABEL_PRIORITY: Record<string, number> = {
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

function makeTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "600 36px system-ui, -apple-system, sans-serif";
  const w = Math.min(240, ctx.measureText(name).width + 28);
  ctx.fillStyle = "rgba(14, 18, 22, 0.78)";
  const h = 44;
  const rx = (256 - w) / 2;
  ctx.beginPath();
  ctx.roundRect(rx, (64 - h) / 2, w, h, 12);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(14, 18, 22, 0.9)";
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
  const aspect = Math.min(3.6, Math.max(1.1, label.name.length * 0.55));
  sprite.scale.set(label.scale, (label.scale / aspect) * 0.55, 1);
  sprite.renderOrder = 10;
  return sprite;
}
