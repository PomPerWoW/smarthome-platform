import { createSystem, AssetManager } from "@iwsdk/core";
import { DeviceType } from "../types";
import { getStore, isFurnitureType } from "../store/DeviceStore";
import { Vector3, Raycaster, Mesh, Intersection, Object3D, Box3 } from "three";
import { getRoomBounds, clampToWalkableArea, isPositionWalkable } from "../config/navmesh";
import { constrainDeviceMovement, DEVICE_RADIUS } from "../config/collision";

export class DevicePlacementSystem extends createSystem({}) {
  private placementCounter = 0;

  update(_dt: number) {
    const store = getStore();
    const placementMode = store.placementMode;

    if (placementMode) {
      store.setPlacementMode(null);
      this.spawnDevice(placementMode);
    }
  }

  /**
   * Compute a room-local spawn position that is guaranteed to be inside the
   * LabPlan model.
   *
   * Strategy:
   *  1. Project 2 m in front of the camera (world space, horizontal only).
   *  2. Convert that world-space target into room-local space via
   *     `labModel.worldToLocal()`.
   *  3. Clamp XZ to the room-local walkable area (navmesh bounds) with a
   *     small margin so devices never end up inside walls.
   *  4. Override Y with a device-specific height.
   *
   * If the camera projects way outside the room (e.g. viewing from afar) the
   * clamp naturally snaps the position to the closest point inside.
   */
  private async spawnDevice(type: DeviceType) {
    const camera = this.world.camera;
    const labModel = (globalThis as any).__labRoomModel;

    const spawnPos = new Vector3();
    const roomBounds = getRoomBounds();

    if (labModel && roomBounds) {
      // 1. World-space target: 2 m in front of the camera (flat on XZ plane)
      const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0;
      forward.normalize();

      const worldTarget = new Vector3()
        .copy(camera.position)
        .addScaledVector(forward, 2.0);

      // 2. Convert to room-local space
      spawnPos.copy(labModel.worldToLocal(worldTarget.clone()));

      // 3. Apply a small inward margin so devices don't sit exactly on the wall
      const MARGIN = 0.3;
      const minX = roomBounds.minX + MARGIN;
      const maxX = roomBounds.maxX - MARGIN;
      const minZ = roomBounds.minZ + MARGIN;
      const maxZ = roomBounds.maxZ - MARGIN;

      // 4. Clamp XZ to room walkable area (room-local bounds)
      spawnPos.x = Math.max(minX, Math.min(maxX, spawnPos.x));
      spawnPos.z = Math.max(minZ, Math.min(maxZ, spawnPos.z));

      // 5. Verify position is walkable (inside room bounds) - if not, use room center
      if (!isPositionWalkable(spawnPos.x, spawnPos.z)) {
        console.warn(
          `[DevicePlacement] Position (${spawnPos.x.toFixed(2)}, ${spawnPos.z.toFixed(2)}) is outside walkable area, finding safe position`,
        );
        const safePos = this.findSafeSpawnPosition(spawnPos, roomBounds);
        spawnPos.x = safePos.x;
        spawnPos.z = safePos.z;
      }

      // 6. Check collision with room geometry and find a collision-free position
      const worldSpawnPos = new Vector3();
      worldSpawnPos.copy(labModel.localToWorld(spawnPos.clone()));

      // Check if initial position collides with room geometry
      if (this.isPositionColliding(worldSpawnPos, spawnPos.y, labModel)) {
        console.log(
          `[DevicePlacement] Initial position collides with room geometry, finding collision-free position`,
        );
        const collisionFreePos = this.findCollisionFreePosition(
          spawnPos,
          roomBounds,
          labModel,
        );
        spawnPos.x = collisionFreePos.x;
        spawnPos.z = collisionFreePos.z;
      } else {
        // Double-check with constrainDeviceMovement
        const constrainedWorldPos = constrainDeviceMovement(
          worldSpawnPos,
          worldSpawnPos,
          DEVICE_RADIUS,
        );

        // If position was adjusted due to collision, find alternative
        if (
          Math.abs(constrainedWorldPos.x - worldSpawnPos.x) > 0.01 ||
          Math.abs(constrainedWorldPos.z - worldSpawnPos.z) > 0.01
        ) {
          console.log(
            `[DevicePlacement] Position adjusted due to collision, finding alternative position`,
          );
          const collisionFreePos = this.findCollisionFreePosition(
            spawnPos,
            roomBounds,
            labModel,
          );
          spawnPos.x = collisionFreePos.x;
          spawnPos.z = collisionFreePos.z;
        }
      }

      // 7. Final verification: ensure position is still within bounds
      spawnPos.x = Math.max(minX, Math.min(maxX, spawnPos.x));
      spawnPos.z = Math.max(minZ, Math.min(maxZ, spawnPos.z));

      // 8. Double-check: if still outside bounds, use room center as fallback
      if (!isPositionWalkable(spawnPos.x, spawnPos.z)) {
        console.warn(
          `[DevicePlacement] Position still outside bounds after clamping, using room center`,
        );
        const centerX = (minX + maxX) * 0.5;
        const centerZ = (minZ + maxZ) * 0.5;
        spawnPos.x = centerX;
        spawnPos.z = centerZ;
      }
    } else if (labModel && !roomBounds) {
      // labModel exists but roomBounds not initialized - use room center as fallback
      console.warn(
        `[DevicePlacement] Room bounds not initialized, using room center`,
      );
      const bbox = new Box3().setFromObject(labModel);
      const center = bbox.getCenter(new Vector3());
      spawnPos.copy(center);
      spawnPos.y = 0; // Will be overridden by device-specific height
    } else {
      // No labModel — try to use room center if bounds are available, otherwise use camera-relative position
      if (roomBounds) {
        console.warn(
          `[DevicePlacement] No labModel but roomBounds available, using room center`,
        );
        const centerX = (roomBounds.minX + roomBounds.maxX) * 0.5;
        const centerZ = (roomBounds.minZ + roomBounds.maxZ) * 0.5;
        spawnPos.set(centerX, 0, centerZ);
      } else {
        // Last resort: spawn in world space in front of the camera
        const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
        forward.normalize();
        spawnPos.copy(camera.position).addScaledVector(forward, 2.0);
        console.warn(
          `[DevicePlacement] No labModel or roomBounds, spawning in world space`,
        );
      }
    }

    // 9. Device-specific Y height (room-local space, floor = 0)
    switch (type) {
      case DeviceType.Lightbulb:
        spawnPos.y = 2.5; // Ceiling lamp hangs high
        break;
      case DeviceType.AirConditioner:
        spawnPos.y = 2.2; // Wall-mounted high
        break;
      case DeviceType.Television:
        spawnPos.y = 1.0; // Eye-level on a stand
        break;
      case DeviceType.Fan:
      case DeviceType.Chair:
      case DeviceType.Chair2:
      case DeviceType.Chair3:
      case DeviceType.Chair4:
      case DeviceType.Chair5:
      case DeviceType.Chair6:
        spawnPos.y = 0.0; // Floor standing / furniture
        break;
      default:
        spawnPos.y = 0.0;
    }

    // Generate a unique name
    this.placementCounter++;
    const name = `${type} ${this.placementCounter}`;

    console.log(
      `[DevicePlacement] ✨ Spawning "${name}" at local pos ` +
      `(${spawnPos.x.toFixed(2)}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)})`,
    );

    const store = getStore();
    try {
      if (isFurnitureType(type)) {
        await store.createFurniture(
          type,
          name,
          [spawnPos.x, spawnPos.y, spawnPos.z],
          0,
        );
        console.log(`[DevicePlacement] ✅ "${name}" saved as furniture`);
      } else {
        await store.createDevice(
          type,
          name,
          [spawnPos.x, spawnPos.y, spawnPos.z],
          0,
        );
        console.log(`[DevicePlacement] ✅ "${name}" saved to backend`);
      }
    } catch (err) {
      console.error(`[DevicePlacement] ❌ Failed to create "${name}":`, err);
    }
  }

  /**
   * Find a safe spawn position inside the room bounds if the initial position is outside.
   * Tries positions near the room center or along the bounds.
   */
  private findSafeSpawnPosition(
    initialPos: Vector3,
    roomBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  ): Vector3 {
    const MARGIN = 0.3;
    const minX = roomBounds.minX + MARGIN;
    const maxX = roomBounds.maxX - MARGIN;
    const minZ = roomBounds.minZ + MARGIN;
    const maxZ = roomBounds.maxZ - MARGIN;

    // Try room center first
    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    if (isPositionWalkable(centerX, centerZ)) {
      return new Vector3(centerX, initialPos.y, centerZ);
    }

    // Try positions along the bounds (closest valid point)
    const clampedX = Math.max(minX, Math.min(maxX, initialPos.x));
    const clampedZ = Math.max(minZ, Math.min(maxZ, initialPos.z));

    // If clamped position is valid, use it
    if (isPositionWalkable(clampedX, clampedZ)) {
      return new Vector3(clampedX, initialPos.y, clampedZ);
    }

    // Last resort: use a random position within bounds
    const randomX = minX + Math.random() * (maxX - minX);
    const randomZ = minZ + Math.random() * (maxZ - minZ);
    console.warn(
      `[DevicePlacement] Using random safe position: (${randomX.toFixed(2)}, ${randomZ.toFixed(2)})`,
    );
    return new Vector3(randomX, initialPos.y, randomZ);
  }

  /**
   * Check if a world position collides with room geometry.
   * Uses raycasting to detect if the position is too close to walls/furniture.
   */
  private isPositionColliding(
    worldPos: Vector3,
    height: number,
    roomModel: Object3D,
  ): boolean {
    // Get collision meshes from room model
    const collisionMeshes: Mesh[] = [];
    roomModel.traverse((child: any) => {
      if (child.isMesh && child.geometry) {
        collisionMeshes.push(child);
      }
    });

    if (collisionMeshes.length === 0) return false;

    // Use original raycast method (bypass any overrides)
    const originalRaycast = (Mesh.prototype as any).raycast;
    const raycaster = new Raycaster();

    // Check at multiple heights around the device
    const checkHeights = [height - 0.1, height, height + 0.1, height + 0.2];
    const checkRadius = DEVICE_RADIUS * 1.5; // Slightly larger radius for safety
    const testDirections = [
      new Vector3(1, 0, 0),   // Right
      new Vector3(-1, 0, 0),  // Left
      new Vector3(0, 0, 1),  // Forward
      new Vector3(0, 0, -1), // Back
      new Vector3(0.707, 0, 0.707),   // Diagonal
      new Vector3(-0.707, 0, 0.707),  // Diagonal
      new Vector3(0.707, 0, -0.707),  // Diagonal
      new Vector3(-0.707, 0, -0.707), // Diagonal
    ];

    for (const h of checkHeights) {
      const testOrigin = new Vector3(worldPos.x, worldPos.y + h, worldPos.z);

      for (const dir of testDirections) {
        raycaster.set(testOrigin, dir);
        raycaster.far = checkRadius;
        raycaster.near = 0;

        const hits: Intersection[] = [];
        for (const mesh of collisionMeshes) {
          originalRaycast.call(mesh, raycaster, hits);
        }

        if (hits.length > 0) {
          hits.sort((a, b) => a.distance - b.distance);
          if (hits[0].distance < checkRadius) {
            // Position is too close to room geometry
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Find a collision-free position by trying multiple candidate positions.
   * Tests positions in a spiral pattern from the initial position.
   */
  private findCollisionFreePosition(
    initialPos: Vector3,
    roomBounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    roomModel: Object3D,
  ): Vector3 {
    const MARGIN = 0.3;
    const minX = roomBounds.minX + MARGIN;
    const maxX = roomBounds.maxX - MARGIN;
    const minZ = roomBounds.minZ + MARGIN;
    const maxZ = roomBounds.maxZ - MARGIN;

    // Try multiple candidate positions in a spiral pattern
    const candidates = [
      // Start with initial position (already clamped)
      { x: initialPos.x, z: initialPos.z },
      // Room center
      { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5 },
      // Around initial position (spiral pattern)
      { x: initialPos.x + 0.5, z: initialPos.z },
      { x: initialPos.x - 0.5, z: initialPos.z },
      { x: initialPos.x, z: initialPos.z + 0.5 },
      { x: initialPos.x, z: initialPos.z - 0.5 },
      { x: initialPos.x + 0.7, z: initialPos.z + 0.7 },
      { x: initialPos.x - 0.7, z: initialPos.z + 0.7 },
      { x: initialPos.x + 0.7, z: initialPos.z - 0.7 },
      { x: initialPos.x - 0.7, z: initialPos.z - 0.7 },
      // Further positions
      { x: initialPos.x + 1.0, z: initialPos.z },
      { x: initialPos.x - 1.0, z: initialPos.z },
      { x: initialPos.x, z: initialPos.z + 1.0 },
      { x: initialPos.x, z: initialPos.z - 1.0 },
    ];

    for (const candidate of candidates) {
      // Clamp to bounds
      const clampedX = Math.max(minX, Math.min(maxX, candidate.x));
      const clampedZ = Math.max(minZ, Math.min(maxZ, candidate.z));

      // Check if position is walkable
      if (!isPositionWalkable(clampedX, clampedZ)) continue;

      // Convert to world space and check collision
      const worldPos = roomModel.localToWorld(
        new Vector3(clampedX, initialPos.y, clampedZ),
      );

      if (!this.isPositionColliding(worldPos, initialPos.y, roomModel)) {
        // Found a collision-free position
        return new Vector3(clampedX, initialPos.y, clampedZ);
      }
    }

    // If no collision-free position found, try random positions
    for (let i = 0; i < 20; i++) {
      const randomX = minX + Math.random() * (maxX - minX);
      const randomZ = minZ + Math.random() * (maxZ - minZ);

      if (!isPositionWalkable(randomX, randomZ)) continue;

      const worldPos = roomModel.localToWorld(
        new Vector3(randomX, initialPos.y, randomZ),
      );

      if (!this.isPositionColliding(worldPos, initialPos.y, roomModel)) {
        console.log(
          `[DevicePlacement] Found collision-free random position: (${randomX.toFixed(2)}, ${randomZ.toFixed(2)})`,
        );
        return new Vector3(randomX, initialPos.y, randomZ);
      }
    }

    // Last resort: return room center (even if it might collide, it's better than nothing)
    console.warn(
      `[DevicePlacement] Could not find collision-free position, using room center`,
    );
    return new Vector3(
      (minX + maxX) * 0.5,
      initialPos.y,
      (minZ + maxZ) * 0.5,
    );
  }
}
