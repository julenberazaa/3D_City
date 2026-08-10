import * as THREE from "three";

const FOV = 55;
const NEAR = 0.5;
const FAR = 20000;
const MIN_DISTANCE = 100;
const MAX_DISTANCE = 6000;
const MIN_ELEVATION = 0.05;
const MAX_ELEVATION = 1.35;
const DEFAULT_AZIMUTH = -0.9;
const DEFAULT_ELEVATION = 0.55;
const DEFAULT_DISTANCE = 1400;

export interface CameraHandle {
  camera: THREE.PerspectiveCamera;
  /** Wires pointer/wheel input on the given element (the canvas). */
  attach(element: HTMLElement): void;
  detach(): void;
}

export function createOrbitCamera(target?: THREE.Vector3): CameraHandle {
  const camera = new THREE.PerspectiveCamera(FOV, 1, NEAR, FAR);
  let azimuth = DEFAULT_AZIMUTH;
  let elevation = DEFAULT_ELEVATION;
  let distance = DEFAULT_DISTANCE;
  const focus = target ? target.clone() : new THREE.Vector3(0, 0, 0);

  const apply = () => {
    const cp = Math.cos(elevation);
    camera.position.set(
      focus.x + distance * cp * Math.sin(azimuth),
      focus.y + distance * Math.sin(elevation),
      focus.z + distance * cp * Math.cos(azimuth),
    );
    camera.lookAt(focus);
  };
  apply();

  let mode: 0 | 1 | 2 = 0; // 0 none, 1 rotate (left), 2 pan (right)
  let lastX = 0;
  let lastY = 0;
  let attachedEl: HTMLElement | null = null;

  const toWorldPerPixel = () => distance * 0.0016;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 0) mode = 1;
    else if (e.button === 2) mode = 2;
    else return;
    lastX = e.clientX;
    lastY = e.clientY;
    attachedEl?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (mode === 0) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (mode === 1) {
      azimuth -= dx * 0.005;
      elevation = Math.min(MAX_ELEVATION, Math.max(MIN_ELEVATION, elevation + dy * 0.005));
    } else {
      camera.updateMatrixWorld();
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const k = toWorldPerPixel();
      focus.addScaledVector(right, -dx * k);
      focus.addScaledVector(up, dy * k);
    }
    apply();
  };
  const onPointerUp = () => {
    mode = 0;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance * Math.exp(e.deltaY * 0.0012)));
    apply();
  };
  const onContextMenu = (e: Event) => e.preventDefault();

  return {
    camera,
    attach(element: HTMLElement): void {
      attachedEl = element;
      element.addEventListener("pointerdown", onPointerDown);
      element.addEventListener("pointermove", onPointerMove);
      element.addEventListener("pointerup", onPointerUp);
      element.addEventListener("pointercancel", onPointerUp);
      element.addEventListener("wheel", onWheel, { passive: false });
      element.addEventListener("contextmenu", onContextMenu);
    },
    detach(): void {
      if (!attachedEl) return;
      attachedEl.removeEventListener("pointerdown", onPointerDown);
      attachedEl.removeEventListener("pointermove", onPointerMove);
      attachedEl.removeEventListener("pointerup", onPointerUp);
      attachedEl.removeEventListener("pointercancel", onPointerUp);
      attachedEl.removeEventListener("wheel", onWheel);
      attachedEl.removeEventListener("contextmenu", onContextMenu);
      attachedEl = null;
    },
  };
}
