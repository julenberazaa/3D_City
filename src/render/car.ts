import * as THREE from "three";
import type { VehicleTransform } from "../physics/vehicle";

const BODY_COLOR = 0xe0522e;
const CABIN_COLOR = 0x22354a;
const WINDSHIELD_COLOR = 0x16222e;
const WHEEL_COLOR = 0x141416;
const WHEEL_RADIUS = 0.45;
const WHEEL_WIDTH = 0.36;

export interface CarVisual {
  group: THREE.Group;
  sync(t: VehicleTransform): void;
}

/** Stylized low-poly car: bright red box body + cabin + windshield + blob
 *  shadow. Render-only (physics collider untouched). Forward = local +Z. */
export function createCarVisual(): CarVisual {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.8, 5.0),
    new THREE.MeshLambertMaterial({ color: BODY_COLOR }),
  );
  body.position.y = 0.5;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 0.55, 2.4),
    new THREE.MeshLambertMaterial({ color: CABIN_COLOR }),
  );
  cabin.position.set(0, 1.05, -0.25);
  group.add(cabin);

  // Windshield facet: dark glass strip on the cabin front (+Z), gives the car
  // an immediate heading cue at a glance.
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.42, 0.12),
    new THREE.MeshLambertMaterial({ color: WINDSHIELD_COLOR }),
  );
  windshield.position.set(0, 1.12, 0.95);
  group.add(windshield);

  const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: WHEEL_COLOR });
  for (const [x, z] of [
    [1.45, 1.45],
    [-1.45, 1.45],
    [1.45, -1.45],
    [-1.45, -1.45],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, WHEEL_RADIUS, z);
    group.add(wheel);
  }

  // Blob contact shadow: cheap ground cue (render-only, no shadow mapping).
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(2.1, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  group.add(shadow);

  return {
    group,
    sync(t: VehicleTransform): void {
      group.position.set(t.position.x, t.position.y, t.position.z);
      group.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    },
  };
}
