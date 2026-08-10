import {
  ColliderDesc,
  RigidBodyDesc,
  type DynamicRayCastVehicleController,
  type Quaternion,
  type RigidBody,
  type Vector3,
  type World as RapierWorld,
} from "@dimforge/rapier3d-compat";

interface ColliderDescFactory {
  cuboid(hx: number, hy: number, hz: number): ColliderDesc;
}

const descFactory = ColliderDesc as unknown as ColliderDescFactory;

export interface CarSpawn {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export interface VehicleTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
}

export interface Car {
  vehicle: DynamicRayCastVehicleController;
  body: RigidBody;
  setThrottle(t: number): void;
  setSteer(s: number): void;
  setBrake(b: number): void;
  update(dt: number): void;
  speedKmh(): number;
  wheelsInContact(): number;
  position(): { x: number; y: number; z: number };
  headingRad(): number;
  forward(): { x: number; z: number };
  transform(): VehicleTransform;
}

const WHEEL_POS: Array<[number, number, number]> = [
  [1.55, -0.2, -1.35],
  [-1.55, -0.2, -1.35],
  [1.55, -0.2, 1.35],
  [-1.55, -0.2, 1.35],
];
const FRONT_WHEELS = [0, 1];

function quatFromHeading(heading: number): Quaternion {
  return {
    x: 0,
    y: Math.sin(heading / 2),
    z: 0,
    w: Math.cos(heading / 2),
  };
}

/**
 * Create a stylized drivable car with a raycast suspension vehicle controller.
 * heading 0 => car faces +Z (rapier forward axis convention, calibrated by tests).
 */
export function createCar(world: RapierWorld, spawn: CarSpawn): Car {
  const body = world.createRigidBody(
    RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .setRotation(quatFromHeading(spawn.heading))
      .setLinearDamping(0.1)
      .setAngularDamping(0.4),
  );
  const chassis = descFactory.cuboid(2.1, 0.5, 0.9);
  chassis.setFriction(0.5);
  chassis.setDensity(159);
  world.createCollider(chassis, body);

  const vehicle = world.createVehicleController(body);
  vehicle.indexUpAxis = 1;
  vehicle.setIndexForwardAxis = 2;

  for (const [x, y, z] of WHEEL_POS) {
    vehicle.addWheel(
      { x, y, z } as Vector3,
      { x: 0, y: -1, z: 0 } as Vector3,
      { x: 1, y: 0, z: 0 } as Vector3,
      0.45,
      0.4,
    );
  }
  const n = vehicle.numWheels();
  for (let i = 0; i < n; i++) {
    vehicle.setWheelSuspensionStiffness(i, 25);
    vehicle.setWheelSuspensionCompression(i, 4.4);
    vehicle.setWheelSuspensionRelaxation(i, 2.2);
    vehicle.setWheelFrictionSlip(i, 2.6);
    vehicle.setWheelMaxSuspensionTravel(i, 0.3);
    vehicle.setWheelMaxSuspensionForce(i, 40000);
  }

  let throttle = 0;
  let steer = 0;
  let brake = 0;

  return {
    vehicle,
    body,
    setThrottle(t) {
      throttle = Math.max(-1, Math.min(1, t));
    },
    setSteer(s) {
      steer = Math.max(-1, Math.min(1, s));
    },
    setBrake(b) {
      brake = Math.max(0, Math.min(1, b));
    },
    update(dt) {
      for (let i = 0; i < n; i++) {
        vehicle.setWheelBrake(i, brake * 40);
        vehicle.setWheelSteering(i, FRONT_WHEELS.includes(i) ? steer * 0.55 : 0);
        // Calibrated empirically: positive engine force thrusts along -Z in rapier 0.20.
        const force = FRONT_WHEELS.includes(i) ? throttle * -650 : throttle * -400;
        vehicle.setWheelEngineForce(i, force);
      }
      vehicle.updateVehicle(dt, undefined);
    },
    speedKmh() {
      return Math.abs(vehicle.currentVehicleSpeed()) * 3.6;
    },
    wheelsInContact() {
      let count = 0;
      for (let i = 0; i < n; i++) if (vehicle.wheelIsInContact(i)) count++;
      return count;
    },
    position() {
      const t = body.translation();
      return { x: t.x, y: t.y, z: t.z };
    },
    headingRad() {
      const q = body.rotation();
      return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    },
    forward() {
      const h = this.headingRad();
      return { x: Math.sin(h), z: Math.cos(h) };
    },
    transform() {
      const t = body.translation();
      const q = body.rotation();
      return { position: { x: t.x, y: t.y, z: t.z }, rotation: { x: q.x, y: q.y, z: q.z, w: q.w } };
    },
  };
}
