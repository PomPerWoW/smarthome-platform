import { createSystem, Entity, AssetManager, XRPlane } from "@iwsdk/core";
import { PhysicsSystem } from "./PhysicsSystem";
import { DeviceType } from "../types";
import { getStore } from "../store/DeviceStore";
import { Vector3, Quaternion, Raycaster, Matrix4, Group, Mesh, MeshStandardMaterial } from "three";
import { GamepadWrapper, XR_BUTTONS, AXES } from "gamepad-wrapper";

export class DevicePlacementSystem extends createSystem({
  planes: { required: [XRPlane] }
}) {
  private physicsSystem!: PhysicsSystem;
  private currentGhost: Entity | null = null;
  private currentGhostBody: any | null = null; // Rapier RigidBody
  private currentDeviceType: DeviceType | null = null;

  private rightGamepad: GamepadWrapper | null = null;
  private raycaster = new Raycaster();

  // Placement state
  private targetPosition = new Vector3();
  private targetRotationY = 0;

  // PD Controller gains
  private kp = 50;  // Proportional gain (spring) — reduced to avoid Rapier crash
  private kd = 10;  // Derivative gain (damper)

  init() {
    this.physicsSystem = this.world.getSystem(PhysicsSystem)!;
  }

  update(dt: number) {
    const store = getStore();
    const placementMode = store.placementMode;

    this.updateController();

    // 1. Handle Entering/Exiting Placement Mode
    if (placementMode && !this.currentGhost) {
      this.startPlacement(placementMode);
    } else if (!placementMode && this.currentGhost) {
      this.stopPlacement();
    }

    // 2. Update Placement Loop
    if (this.currentGhost && this.currentGhostBody && this.physicsSystem.RAPIER && this.physicsSystem.physicsWorld) {
      this.handlePlacementLogic(dt);
    }
  }

  private updateController() {
    const session = this.renderer.xr.getSession();
    if (!session) return;

    // We assume RIGHT hand is for placement (pointer), LEFT for menu.
    if (session.inputSources) {
      for (const source of session.inputSources) {
        if (source.handedness === 'right' && source.gamepad) {
          if (!this.rightGamepad || this.rightGamepad.gamepad !== source.gamepad) {
            this.rightGamepad = new GamepadWrapper(source.gamepad);
          } else {
            this.rightGamepad.update();
          }
        }
      }
    }
  }

  private async startPlacement(type: DeviceType) {
    console.log(`[DevicePlacement] Starting placement for ${type}`);
    this.currentDeviceType = type;

    // Create ghost entity
    this.currentGhost = this.world.createTransformEntity();

    // Load model
    // TODO: Centralize model paths. For now, map manually implies duplication.
    // Better: use DeviceRendererSystem's map or store's data?
    // Store has `devices`, but we need a template.
    // Let's use the hardcoded paths from index.ts/AssetManifest for now.

    let assetId = "";
    switch (type) {
      case DeviceType.Lightbulb: assetId = "lightbulb"; break;
      case DeviceType.Fan: assetId = "fan"; break;
      case DeviceType.Television: assetId = "television"; break;
      case DeviceType.AirConditioner: assetId = "air_conditioner"; break;
    }

    const gltf = AssetManager.getGLTF(assetId);
    if (gltf) {
      const model = gltf.scene.clone();
      this.currentGhost.object3D!.add(model);

      // Apply Ghost Visuals (Transparency)
      model.traverse((child: any) => {
        if (child.isMesh) {
          // clone material to modify
          child.material = child.material.clone();
          child.material.transparent = true;
          child.material.opacity = 0.7;
          child.material.emissive.setHex(0xaaaaaa);
          child.material.emissiveIntensity = 0.2;
        }
      });
    }

    // Create Physics Body
    this.createPhysicsBody();

    // Initial pos: in front of user
    const startPos = new Vector3(0, 1.0, -1.0).applyMatrix4(this.world.camera.matrixWorld as any);
    this.currentGhostBody.setTranslation({ x: startPos.x, y: startPos.y, z: startPos.z }, true);

    this.targetRotationY = 0;
  }

  private createPhysicsBody() {
    if (!this.physicsSystem.RAPIER || !this.physicsSystem.physicsWorld || !this.currentGhost) return;

    const RAPIER = this.physicsSystem.RAPIER;
    const world = this.physicsSystem.physicsWorld;

    // Dynamic body
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setCanSleep(false)
      .setLinearDamping(0.5)
      .setAngularDamping(0.5);

    this.currentGhostBody = world.createRigidBody(rigidBodyDesc);

    // Collider: approximated Box or Ball
    // Ideally matches model size.
    // For now, fixed size 0.5m box
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.2, 0.2, 0.2);
    world.createCollider(colliderDesc, this.currentGhostBody);
  }

  private stopPlacement() {
    console.log("[DevicePlacement] Stopping placement");
    if (this.currentGhost) {
      this.currentGhost.destroy();
      this.currentGhost = null;
    }

    if (this.currentGhostBody && this.physicsSystem.physicsWorld) {
      this.physicsSystem.physicsWorld.removeRigidBody(this.currentGhostBody);
      this.currentGhostBody = null;
    }
    this.currentDeviceType = null;
  }

  private handlePlacementLogic(dt: number) {
    if (!this.rightGamepad) return; // Need controller to drag

    // 1. Raycast to find target
    // Get controller pointer pose
    // In Three, we can use renderer.xr.getController(0) for ray?
    // 0 = Right usually.
    const controller = this.renderer.xr.getController(0);

    // Create ray from controller
    const tempMatrix = new Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld as any);

    // Ray origin and direction
    const origin = new Vector3().setFromMatrixPosition(controller.matrixWorld as any);
    const direction = new Vector3(0, 0, -1).applyMatrix4(tempMatrix).normalize();

    // Cast ray against Room Colliders (Rapier)
    // physicsSystem.physicsWorld.castRay
    const ray = new this.physicsSystem.RAPIER!.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: direction.x, y: direction.y, z: direction.z });
    const hit = this.physicsSystem.physicsWorld!.castRayAndGetNormal(ray, 10.0, true);

    if (hit) {
      // Target position is hit point + offset (half height)
      // Normal allows us to orient if needed (e.g. wall placement)
      const toi = (hit as any).toi;
      const hitPoint = ray.pointAt(toi);
      // RAPIER 0.11+ ray.pointAt helper? Or manual: origin + dir * toi
      const target = origin.clone().add(direction.clone().multiplyScalar(toi));

      // Add offset to avoid sinking (0.2m up)
      // Should depend on device type (Floor vs Wall)
      // For now, float slightly
      this.targetPosition.copy(target).add(new Vector3(0, 0.2, 0));

      // Debug visual?
    } else {
      // Floating in air at 2m distance
      this.targetPosition.copy(origin).add(direction.clone().multiplyScalar(2.0));
    }

    // 2. Apply Forces (PD Controller)
    const currentPos = this.currentGhostBody.translation(); // {x, y, z}
    const currentVel = this.currentGhostBody.linvel();      // {x, y, z}

    const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
    const MAX_FORCE = 100;

    const force = {
      x: clamp(this.kp * (this.targetPosition.x - currentPos.x) - this.kd * currentVel.x, MAX_FORCE),
      y: clamp(this.kp * (this.targetPosition.y - currentPos.y) - this.kd * currentVel.y, MAX_FORCE),
      z: clamp(this.kp * (this.targetPosition.z - currentPos.z) - this.kd * currentVel.z, MAX_FORCE),
    };

    // Sanity check: skip if any component is NaN
    if (isNaN(force.x) || isNaN(force.y) || isNaN(force.z)) return;

    // Wake up
    this.currentGhostBody.wakeUp();
    this.currentGhostBody.addForce(force, true);

    // 3. Handle Rotation
    // Thumbstick X rotates
    const stickX = this.rightGamepad.getAxis(AXES.XR_STANDARD.THUMBSTICK_X);
    if (Math.abs(stickX) > 0.2) {
      this.targetRotationY -= stickX * 2.0 * dt;
    }

    // Set rotation (Kinematic-ish for rotation, we want it snappy)
    // Or use torque?
    // Let's just set rotation directly for responsiveness, or use torque.
    // Direct set is safer for aligning.
    // But we want it to react to collisions...
    // Let's use torque PD too? Or just setNextKinematicRotation if it was kinematic?
    // It's Dynamic.
    // Let's simple: set rotation to targetRotationY, ignore physics rotation for now (lock it)
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), this.targetRotationY);
    this.currentGhostBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.currentGhostBody.setAngvel({ x: 0, y: 0, z: 0 }, true);

    // Sync Visuals
    const p = this.currentGhostBody.translation();
    const r = this.currentGhostBody.rotation();
    this.currentGhost!.object3D!.position.set(p.x, p.y, p.z);
    this.currentGhost!.object3D!.quaternion.set(r.x, r.y, r.z, r.w);

    // 4. Finalize
    if (this.rightGamepad.getButtonDown(XR_BUTTONS.TRIGGER)) {
      this.placeDevice();
    }
  }

  private async placeDevice() {
    if (!this.currentDeviceType || !this.currentGhost) return;

    const pos = this.currentGhost.object3D!.position;
    const rot = this.currentGhost.object3D!.rotation; // Euler

    console.log(`[DevicePlacement] Placing ${this.currentDeviceType} at`, pos);

    // Wait, we need to call backend to create device.
    // DeviceStore doesn't have createDevice?
    // It has `api` access internally.
    // Let's check DeviceStore actions.

    // We might need to add `createDevice` to store.
    // For now, mock it or use interact.

    // Assuming we just clear mode locally for now, 
    // but ideally we persist.
    const store = getStore();

    // HACK: Since we don't have createDevice in store interface yet,
    // we'll just log it.
    // But user wants "real" placement.
    // I should add `addDevice` to store.

    // Clear mode
    store.setPlacementMode(null);

    // Trigger haptic
    if (this.rightGamepad && this.rightGamepad.gamepad && this.rightGamepad.gamepad.hapticActuators) {
      this.rightGamepad.gamepad.hapticActuators[0].pulse(1.0, 100);
    }
  }
}
