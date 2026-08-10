import * as THREE from "three";

export const FOG_COLOR = 0xb8cfe0;
export const FOG_NEAR = 800;
export const FOG_FAR = 4000;

export interface RendererHandle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  resize(width: number, height: number): void;
  getStats(): { drawCalls: number; triangles: number };
  /** Starts the rAF loop; returns a stop function. */
  startRender(camera: THREE.Camera, updateCb?: (dt: number) => void): () => void;
}

export function createRenderer(): RendererHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a86, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(600, 900, 400);
  scene.add(sun);

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
    startRender(camera: THREE.Camera, updateCb?: (dt: number) => void): () => void {
      let rafId = 0;
      let last = performance.now();
      const frame = (now: number) => {
        rafId = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (updateCb) updateCb(dt);
        renderer.render(scene, camera);
      };
      rafId = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(rafId);
    },
  };
}
