import {
  createSystem,
  Entity,
  Object3D,
  MeshBasicMaterial,
  Vector3,
  Quaternion,
  XRPlane,
} from "@iwsdk/core";

/**
 * RoomScanningSystem
 *
 * Uses iwsdk's built-in sceneUnderstanding feature for real-world room scanning.
 * Features:
 * - Access to detected XRPlane entities
 * - Automatic plane visualization (debug mode)
 * - Floor plane detection for room alignment
 * - Plane-to-model matching utilities
 */
export class RoomScanningSystem extends createSystem({
  planes: {
    required: [XRPlane],
  },
}) {
  private debugEnabled = true;
  private debugMaterials: Map<Entity, MeshBasicMaterial> = new Map();
  private floorPlane: Entity | null = null;
  private alignmentOffset: Vector3 = new Vector3();
  private alignmentRotation: Quaternion = new Quaternion();

  init() {
    console.log("[RoomScanning] System initialized (iwsdk built-in mode)");
    console.log(
      "[RoomScanning] sceneUnderstanding: true - planes will be detected automatically",
    );
  }

  /**
   * Get the native XRPlane object from an entity
   */
  private getNativePlane(entity: Entity): XRPlane | null {
    try {
      // Access the internal _plane property which holds the native XRPlane
      return entity.getValue(XRPlane, "_plane") as XRPlane | null;
    } catch {
      return null;
    }
  }

  /**
   * Get plane orientation from entity
   */
  private getPlaneOrientation(entity: Entity): XRPlaneOrientation | undefined {
    const nativePlane = this.getNativePlane(entity);
    return (nativePlane as any)?.orientation;
  }

  /**
   * Get visualization color based on plane orientation
   */
  private getPlaneColor(orientation?: XRPlaneOrientation): number {
    if (orientation === "horizontal") return 0x00ff00; // Green for floors/tables
    if (orientation === "vertical") return 0xff6600; // Orange for walls
    return 0xffffff; // White for unknown
  }

  /**
   * Apply debug visualization to a plane entity
   */
  private applyDebugVisualization(planeEntity: Entity): void {
    if (!this.debugEnabled) return;

    const object = planeEntity.object3D;
    if (!object) return;

    // Get plane orientation from native XRPlane
    const orientation = this.getPlaneOrientation(planeEntity);

    // Create debug material if not exists
    if (!this.debugMaterials.has(planeEntity)) {
      const debugMaterial = new MeshBasicMaterial({
        color: this.getPlaneColor(orientation),
        transparent: true,
        opacity: 0.4,
        wireframe: false,
        side: 2, // DoubleSide
      });
      this.debugMaterials.set(planeEntity, debugMaterial);

      // Apply to mesh children
      object.traverse((child: Object3D) => {
        if ((child as any).isMesh) {
          (child as any).material = debugMaterial;
        }
      });
    }
  }

  /**
   * Get all detected plane entities
   */
  getPlaneEntities(): Entity[] {
    return Array.from(this.queries.planes.entities);
  }

  /**
   * Get planes by orientation
   */
  getPlanesByOrientation(orientation: "horizontal" | "vertical"): Entity[] {
    return this.getPlaneEntities().filter((entity) => {
      const planeOrientation = this.getPlaneOrientation(entity);
      return planeOrientation === orientation;
    });
  }

  /**
   * Find the floor plane (largest horizontal plane)
   */
  findFloorPlane(): Entity | null {
    const horizontalPlanes = this.getPlanesByOrientation("horizontal");

    let bestFloor: Entity | null = null;
    let largestArea = 0;

    for (const planeEntity of horizontalPlanes) {
      const object = planeEntity.object3D;
      if (!object) continue;

      // Estimate area from bounding box
      if (object.children.length > 0) {
        const mesh = object.children.find((c: any) => c.isMesh) as any;
        if (mesh?.geometry) {
          mesh.geometry.computeBoundingBox();
          const bbox = mesh.geometry.boundingBox;
          if (bbox) {
            const size = new Vector3();
            bbox.getSize(size);
            const area = size.x * size.z;

            if (area > largestArea) {
              largestArea = area;
              bestFloor = planeEntity;
            }
          }
        }
      }
    }

    this.floorPlane = bestFloor;
    return bestFloor;
  }

  /**
   * Calculate alignment offset to match a target position
   * Used to align detected floor with LabPlan floor
   */
  calculateAlignmentToTarget(targetPosition: Vector3): Vector3 {
    const floorPlane = this.findFloorPlane();
    if (!floorPlane?.object3D) {
      console.warn("[RoomScanning] No floor plane detected for alignment");
      return new Vector3();
    }

    const floorPosition = floorPlane.object3D.position;
    this.alignmentOffset.copy(targetPosition).sub(floorPosition);

    console.log(
      `[RoomScanning] Alignment offset: (${this.alignmentOffset.x.toFixed(2)}, ${this.alignmentOffset.y.toFixed(2)}, ${this.alignmentOffset.z.toFixed(2)})`,
    );

    return this.alignmentOffset.clone();
  }

  /**
   * Get the calculated alignment offset
   */
  getAlignmentOffset(): Vector3 {
    return this.alignmentOffset.clone();
  }

  /**
   * Toggle debug visualization
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    console.log(`[RoomScanning] Debug visualization: ${enabled}`);

    if (!enabled) {
      this.debugMaterials.forEach((material) => material.dispose());
      this.debugMaterials.clear();
    }
  }

  /**
   * Log current plane status
   */
  logPlaneStatus(): void {
    const planes = this.getPlaneEntities();
    console.log(`[RoomScanning] Detected ${planes.length} planes:`);

    planes.forEach((entity, index) => {
      const orientation = this.getPlaneOrientation(entity);
      const pos = entity.object3D?.position;
      console.log(
        `  ${index + 1}. ${orientation || "unknown"} plane at (${pos?.x.toFixed(2)}, ${pos?.y.toFixed(2)}, ${pos?.z.toFixed(2)})`,
      );
    });
  }

  update(_dt: number): void {
    const planes = this.queries.planes.entities;

    // Apply debug visualization to new planes
    planes.forEach((planeEntity) => {
      if (!this.debugMaterials.has(planeEntity)) {
        const orientation = this.getPlaneOrientation(planeEntity);
        console.log(
          `[RoomScanning] ✅ Plane detected: ${orientation || "unknown"}`,
        );
        this.applyDebugVisualization(planeEntity);
      }
    });
  }

  destroy(): void {
    this.debugMaterials.forEach((material) => material.dispose());
    this.debugMaterials.clear();
    console.log("[RoomScanning] System destroyed");
  }
}
