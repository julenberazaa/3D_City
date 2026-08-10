import * as THREE from "three";

export const FOG_COLOR = 0xb8cfe0;
export const FOG_NEAR = 800;
export const FOG_FAR = 4000;

export interface RendererHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  resize(width: number, height: number): void;
  getStats(): { drawCalls: number; triangles: number };
  /** Last measured frame time in ms (EMA). */
  lastFrameTimeMs(): number;
  /** Starts the rAF loop; returns a stop function. */
  startRender(camera: THREE.Camera, updateCb?: (dt: number) => void): () => void;
}

/**
 * Adaptive quality: when frames are slow, lower the pixel ratio (with
 * hysteresis) so the sim stays playable on weak/software renderers.
 */
export function createRenderer(): RendererHandle {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a86, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(600, 900, 400);
  scene.add(sun);

  let emaFrameMs = 16;
  let frameCount = 0;
  let lastAdapt = 0;

  const adapt = (now: number): void => {
    if (now - lastAdapt < 2000) return;
    lastAdapt = now;
    const current = renderer.getPixelRatio();
    if (emaFrameMs > 140 && current > 1) {
      renderer.setPixelRatio(1);
    } else if (emaFrameMs < 60 && current < dpr) {
      renderer.setPixelRatio(dpr);
    }
  };

  return {
    renderer,
    scene,
    resize(width: number, height: number): void {
      renderer.setSize(width, height);
    },
    getStats() {
      return {
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      };
    },
    lastFrameTimeMs() {
      return emaFrameMs;
    },
    startRender(camera: THREE.Camera, updateCb?: (dt: number) => void): () => void {
      let rafId = 0;
      let last = performance.now();
      const frame = (now: number) => {
        rafId = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        emaFrameMs = emaFrameMs * 0.9 + (now - last) * 0.1;
        frameCount++;
        if (frameCount > 30) adapt(now);
        if (updateCb) updateCb(dt);
        renderer.render(scene, camera);
      };
      rafId = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(rafId);
    },
  };
}
