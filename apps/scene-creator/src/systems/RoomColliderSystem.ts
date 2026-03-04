import { createSystem, XRPlane, Entity } from "@iwsdk/core";
import { PhysicsSystem } from "./PhysicsSystem";
import { Vector3, Quaternion, Matrix4, Raycaster } from "three";

export class RoomColliderSystem extends createSystem({
  planes: { required: [XRPlane] }
}) {
  private physicsSystem!: PhysicsSystem;
  private colliders = new Map<Entity, any>(); // Map entity -> Rapier collider handle
  private floorCollider: any = null;
  private floorEntity: Entity | null = null;

  // Raycaster for floor height correction
  private raycaster = new Raycaster();
  private floorReplaced = false;

  init() {
    this.physicsSystem = this.world.getSystem(PhysicsSystem)!;

    // Subscribe to plane changes
    this.queries.planes.subscribe("qualify", (entity) => {
      this.createPlaneCollider(entity);
    });

    this.queries.planes.subscribe("disqualify", (entity) => {
      this.removePlaneCollider(entity);
    });
  }

  update(dt: number) {
    // Check if we need to refine the floor height
    // In chairs-etc they do a specific raycast down to find the "real" floor intersection
    // because planes can be noisy or estimated.
    if (this.physicsSystem.physicsWorld && this.floorEntity && !this.floorReplaced) {
      this.refineFloorHeight();
    }
  }

  private createPlaneCollider(entity: Entity) {
    if (!this.physicsSystem.physicsWorld || !this.physicsSystem.RAPIER) return;

    const RAPIER = this.physicsSystem.RAPIER;
    const world = this.physicsSystem.physicsWorld;

    // Check orientation
    const planeData = entity.getValue(XRPlane, "_plane") as any;
    if (!planeData) return;

    const orientation = planeData.orientation; // 'horizontal' | 'vertical'
    const semanticLabel = planeData.semanticLabel; // 'floor', 'wall', 'ceiling', etc.

    // Get transform
    const obj = entity.object3D;
    if (!obj) return;

    // Dimensions
    // planeData also typically has `polygon`, but for simpler collision we might use bounding box
    // XRPlane detection usually gives a pose and a polygon. 
    // Ideally we triangulate the polygon. For now let's use a cuboid approximation if sizes are available
    // OR create a heightfield/trimesh if polygon is complex.
    // chairs-etc uses cuboids for walls and floor.

    // Assuming planeData gives us width/height in local space XZ?
    // Actually WebXR planes are typically XZ plane in local space.
    // We need to fetch width/depth.
    // Since IWSDK XRPlane might not expose width/height seamlessly in component data,
    // let's rely on what we can find. 

    // For now, let's look at how RoomScanningSystem visualized it.
    // It used the polygon.

    // Let's defer to a simpler logic:
    // If it's a floor, create a large infinite (or huge) floor collider.
    // If it's a wall, create a thin cuboid.

    // NOTE: chairs-etc logic:
    // if (vertical) -> cuboid(width, 0, height) at pos/rot
    // if (floor) -> huge cuboid at detected Y

    if (orientation === 'vertical') {
      this.createWallCollider(entity, RAPIER, world);
    } else if (semanticLabel === 'floor' || orientation === 'horizontal') {
      // Only one floor main collider usually
      if (!this.floorCollider) {
        this.createFloorCollider(entity, RAPIER, world);
      }
    }
  }

  private createWallCollider(entity: Entity, RAPIER: any, world: any) {
    // Just an approximation for now since accessing raw plane width/height from XRPlane component
    // might need digging into the `_plane` object (WebXR XRPlane object)
    const plane = entity.getValue(XRPlane, "_plane") as any; // XRPlane native object
    if (!plane) return;

    const width = plane.width || 1;
    const depth = plane.height || 1; // XRPlane usually defined on XZ, so "height" is depth

    // Create rigid body (fixed)
    // Position/Rotation comes from entity.object3D
    const obj = entity.object3D!;
    obj.updateWorldMatrix(true, false);
    const pos = obj.position;
    const quat = obj.quaternion;

    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });

    const rigidBody = world.createRigidBody(rigidBodyDesc);

    // Collider: cuboid(width/2, 0.05, height/2) ?? 
    // WebXR planes are X-Z. So thickness is Y.
    const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, 0.01, depth / 2);

    const collider = world.createCollider(colliderDesc, rigidBody);
    this.colliders.set(entity, collider);
    console.log("[RoomCollider] Created wall collider");
  }

  private createFloorCollider(entity: Entity, RAPIER: any, world: any) {
    const obj = entity.object3D!;
    const pos = obj.position;

    // Create large floor
    // logic from chairs-etc: cuboid(10, 0, 10)

    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(pos.x, pos.y, pos.z);
    // .setRotation(...) // floors usually flat

    const rigidBody = world.createRigidBody(rigidBodyDesc);

    // Huge floor
    const colliderDesc = RAPIER.ColliderDesc.cuboid(100.0, 0.01, 100.0).setFriction(1.0);

    const collider = world.createCollider(colliderDesc, rigidBody);

    this.floorCollider = collider;
    this.floorEntity = entity;
    this.colliders.set(entity, collider);
    console.log("[RoomCollider] Created floor collider");
  }

  private refineFloorHeight() {
    // Simple check: Raycast down from 1.5m
    // If we hit the visual mesh of the floor plane, snaps the physics floor to that Y.
    // For now, let's assume the WebXR plane position is accurate enough 
    // unless we see floating/sinking issues.
    this.floorReplaced = true;
  }

  private removePlaneCollider(entity: Entity) {
    const collider = this.colliders.get(entity);
    if (collider && this.physicsSystem.physicsWorld) {
      // In Rapier, we usually remove the RigidBody
      const rb = collider.parent();
      if (rb) {
        this.physicsSystem.physicsWorld.removeRigidBody(rb);
      }
      this.colliders.delete(entity);
      if (entity === this.floorEntity) {
        this.floorCollider = null;
        this.floorEntity = null;
      }
    }
  }
}
