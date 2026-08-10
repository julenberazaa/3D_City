import * as THREE from "three";
import type { VehicleTransform } from "../physics/vehicle";

const BODY_COLOR = 0xd9482f;
const WHEEL_COLOR = 0x1b1b1d;
const WHEEL_RADIUS = 0.4;
const WHEEL_WIDTH = 0.32;

export interface CarVisual {
  group: THREE.Group;
  sync(t: VehicleTransform): void;
}

/** Stylized low-poly car: red box body + 4 black cylinders, forward = local +Z. */
export function createCarVisual(): CarVisual {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.7, 4.4),
    new THREE.MeshLambertMaterial({ color: BODY_COLOR }),
  );
  body.position.y = 0.45;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.5, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x2a3b52 }),
  );
  cabin.position.set(0, 0.95, -0.2);
  group.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_WIDTH, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: WHEEL_COLOR });
  for (const [x, z] of [
    [1.35, 1.25],
    [-1.35, 1.25],
    [1.35, -1.25],
    [-1.35, -1.25],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, WHEEL_RADIUS, z);
    group.add(wheel);
  }

  return {
    group,
    sync(t: VehicleTransform): void {
      group.position.set(t.position.x, t.position.y, t.position.z);
      group.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    },
  };
}
