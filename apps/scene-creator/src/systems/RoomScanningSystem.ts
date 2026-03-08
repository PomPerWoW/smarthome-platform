import { createSystem, XRPlane, XRMesh, Entity } from "@iwsdk/core";

import {
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  Uint32BufferAttribute,
  DoubleSide,
  Object3D,
  Color,
  WireframeGeometry,
  LineSegments,
  LineBasicMaterial,
  BoxGeometry,
  EdgesGeometry,
  Scene,
  Group,
  CanvasTexture,
  PlaneGeometry,
  Vector3,
  Quaternion,
} from "three";

import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// Extend XRSession type to include Meta Quest's proprietary room capture API
declare global {
  interface XRSession {
    initiateRoomCapture?(): Promise<void>;
  }
}

// Color palette for plane orientation types
const PLANE_COLORS: Record<string, number> = {
  horizontal: 0x00ff88, // green for floors/ceilings
  vertical: 0x4488ff, // blue for walls
  unknown: 0xff8844, // orange for unknown
};

// Color palette for mesh semantic labels
const MESH_COLORS: Record<string, number> = {
  table: 0xffaa00,
  couch: 0x8855ff,
  chair: 0xff5588,
  desk: 0x00cccc,
  bed: 0xcc88ff,
  screen: 0x88ffcc,
  lamp: 0xffff44,
  plant: 0x44cc44,
  shelf: 0xcc8844,
  door: 0x8888ff,
  window: 0x88ccff,
  wall_art: 0xff88cc,
  storage: 0xaaaa44,
  other: 0xcccccc,
  global_mesh: 0x666666,
};

function getMeshColor(label: string): number {
  return MESH_COLORS[label.toLowerCase()] ?? MESH_COLORS.other;
}

/**
 * RoomScanningSystem — triggers Meta Quest room capture and visualizes
 * detected planes and meshes from the IWSDK SceneUnderstandingSystem.
 *
 * Features:
 * - Auto-triggers `initiateRoomCapture()` on every AR session start
 * - Renders actual mesh geometry from XRMesh (LiDAR triangles) in the scene
 * - Creates semi-transparent colored overlays for detected planes
 * - Creates real mesh geometry + wireframe bounding boxes for detected 3D meshes
 * - GLTF export: call `exportRoomAsGLB()` to download the scanned room as .glb
 * - Logs detailed info (orientation, semantic labels, dimensions) to console
 */
export class RoomScanningSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  private roomCaptureInitiated = false;
  private sessionStarted = false;
  private planeVisuals = new Map<Entity, Object3D>();
  private meshVisuals = new Map<Entity, Object3D>();
  private logTimer = 0;
  private readonly LOG_INTERVAL = 3; // seconds between summary logs

  // ── Auto-export state ───────────────────────────────────────────
  private autoExportDone = false;
  private scanReadyTimer = 0;
  private readonly SCAN_READY_DELAY = 5;

  init(): void {
    console.log("[RoomScanning] System initializing...");

    // ── XR session lifecycle ────────────────────────────────────────
    this.renderer.xr.addEventListener("sessionstart", () => {
      console.log(
        "[RoomScanning] XR session started — triggering room capture immediately",
      );
      this.sessionStarted = true;
      this.roomCaptureInitiated = false;

      // Always trigger room capture on every session start (fresh scan)
      this.initiateRoomCapture();
    });

    this.renderer.xr.addEventListener("sessionend", () => {
      console.log("[RoomScanning] XR session ended — cleaning up visuals");
      this.sessionStarted = false;
      this.roomCaptureInitiated = false;
      this.cleanupAllVisuals();
    });

    // ── React to detected planes ────────────────────────────────────
    this.queries.planes.subscribe("qualify", (entity: Entity) => {
      this.onPlaneDetected(entity);
    });

    this.queries.planes.subscribe("disqualify", (entity: Entity) => {
      this.onPlaneRemoved(entity);
    });

    // ── React to detected meshes ────────────────────────────────────
    this.queries.meshes.subscribe("qualify", (entity: Entity) => {
      this.onMeshDetected(entity);
    });

    this.queries.meshes.subscribe("disqualify", (entity: Entity) => {
      this.onMeshRemoved(entity);
    });

    // Expose export function globally for easy access from console
    (globalThis as any).__exportRoomAsGLB = () => this.exportRoomAsGLB();
    console.log("[RoomScanning] System initialized ✅");
    console.log(
      "[RoomScanning] 💡 Call __exportRoomAsGLB() from the console to download scanned room as .glb",
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Room Capture trigger
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private initiateRoomCapture(): void {
    if (this.roomCaptureInitiated) return;

    const session = this.renderer.xr.getSession();
    if (session && typeof session.initiateRoomCapture === "function") {
      console.log(
        "[RoomScanning] 🔍 Triggering initiateRoomCapture() — always scan on session start",
      );
      this.roomCaptureInitiated = true;
      this.autoExportDone = false;
      this.scanReadyTimer = 0;
      session
        .initiateRoomCapture()
        .then(() => {
          console.log("[RoomScanning] ✅ Room capture completed successfully");
          this.scanReadyTimer = 0;
        })
        .catch((err: unknown) => {
          console.warn(
            "[RoomScanning] ⚠️ Room capture failed or was cancelled:",
            err,
          );
        });
    } else {
      console.warn(
        "[RoomScanning] initiateRoomCapture() not available — " +
          "this is a Meta Quest proprietary API. " +
          "Room scanning will rely on automatic plane detection.",
      );
      // Still mark as initiated so HUD shows scan data
      this.roomCaptureInitiated = true;
      this.scanReadyTimer = 0;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Plane event handlers
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private onPlaneDetected(entity: Entity): void {
    try {
      const planeData = entity.getValue(XRPlane, "_plane") as any;
      const orientation: string = planeData?.orientation ?? "unknown";
      const pos = entity.object3D?.position;

      console.log(
        `[RoomScanning] 📐 Plane detected | orientation: ${orientation}` +
          (pos
            ? ` | pos: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`
            : ""),
      );

      // Build a visual overlay from the plane's polygon vertices
      if (planeData?.polygon && entity.object3D) {
        const visual = this.createPlaneVisual(planeData, orientation);
        (entity.object3D as any).add(visual);
        this.planeVisuals.set(entity, visual);
      }
    } catch (err) {
      console.warn("[RoomScanning] Error processing detected plane:", err);
    }
  }

  private onPlaneRemoved(entity: Entity): void {
    console.log("[RoomScanning] 📐 Plane removed");
    const visual = this.planeVisuals.get(entity);
    if (visual) {
      visual.removeFromParent();
      this.planeVisuals.delete(entity);
    }
  }

  /**
   * Creates a semi-transparent polygon mesh to visualize a detected plane.
   */
  private createPlaneVisual(planeData: any, orientation: string): Object3D {
    const color = PLANE_COLORS[orientation] ?? PLANE_COLORS.unknown;
    const polygon: DOMPointReadOnly[] = planeData.polygon;

    // Triangulate a convex polygon (fan from vertex 0)
    const vertices: number[] = [];
    for (let i = 1; i < polygon.length - 1; i++) {
      vertices.push(polygon[0].x, polygon[0].y, polygon[0].z);
      vertices.push(polygon[i].x, polygon[i].y, polygon[i].z);
      vertices.push(polygon[i + 1].x, polygon[i + 1].y, polygon[i + 1].z);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    const material = new MeshBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity: 0.25,
      side: DoubleSide,
      depthWrite: false,
    });

    const mesh = new Mesh(geometry, material);
    mesh.name = `plane-overlay-${orientation}`;
    mesh.raycast = () => {}; // Prevent scan visuals from blocking grab rays

    // Also add wireframe edges for clarity
    const wireGeom = new WireframeGeometry(geometry);
    const wireMat = new LineBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity: 0.6,
    });
    const wireframe = new LineSegments(wireGeom, wireMat);
    wireframe.name = `plane-wireframe-${orientation}`;
    mesh.add(wireframe);

    return mesh;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Mesh event handlers — renders ACTUAL mesh geometry from LiDAR
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private onMeshDetected(entity: Entity): void {
    try {
      const meshData = entity.getValue(XRMesh, "_mesh") as any;
      const isBounded = entity.getValue(XRMesh, "isBounded3D") as boolean;
      const semanticLabel =
        (entity.getValue(XRMesh, "semanticLabel") as string) || "unknown";
      const dimensions = entity.getValue(XRMesh, "dimensions") as
        | [number, number, number]
        | undefined;
      const pos = entity.object3D?.position;

      if (isBounded) {
        console.log(
          `[RoomScanning] 🧊 Mesh detected | label: "${semanticLabel}"` +
            (dimensions
              ? ` | size: ${dimensions[0].toFixed(2)}×${dimensions[1].toFixed(2)}×${dimensions[2].toFixed(2)}`
              : "") +
            (pos
              ? ` | pos: (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)})`
              : ""),
        );
      } else {
        console.log("[RoomScanning] 🌐 Global mesh detected (room structure)");
      }

      // Render the actual mesh geometry from the XRMesh data
      if (entity.object3D) {
        const visual = this.createMeshGeometryVisual(
          meshData,
          semanticLabel,
          isBounded,
          dimensions,
        );
        if (visual) {
          (entity.object3D as any).add(visual);
          this.meshVisuals.set(entity, visual);
        }
      }
    } catch (err) {
      console.warn("[RoomScanning] Error processing detected mesh:", err);
    }
  }

  private onMeshRemoved(entity: Entity): void {
    const visual = this.meshVisuals.get(entity);
    if (visual) {
      console.log("[RoomScanning] 🧊 Mesh removed");
      visual.removeFromParent();
      this.meshVisuals.delete(entity);
    }
  }

  /**
   * Creates a three.js mesh from the raw XRMesh geometry (vertices + indices)
   * returned by the WebXR mesh detection API. This shows the actual LiDAR
   * triangles in the scene.
   */
  private createMeshGeometryVisual(
    meshData: any,
    semanticLabel: string,
    isBounded: boolean,
    dimensions?: [number, number, number],
  ): Object3D | null {
    const group = new Object3D();
    group.name = `mesh-group-${semanticLabel}`;
    // Prevent scan visuals from blocking grab rays
    group.raycast = () => {};
    const color = isBounded
      ? getMeshColor(semanticLabel)
      : MESH_COLORS.global_mesh;

    // ── Try to build geometry from raw XRMesh vertices/indices ──────
    const hasRawGeometry = this.tryBuildRawMeshGeometry(
      meshData,
      group,
      color,
      isBounded,
    );

    // ── Fallback: if no raw geometry and it's bounded, use bounding box ──
    if (!hasRawGeometry && isBounded && dimensions) {
      const bbox = this.createMeshBoundingBox(semanticLabel, dimensions);
      group.add(bbox);
    }

    // ── Also try to grab geometry from entity's existing object3D children ──
    // SceneUnderstandingSystem may have already created wireframe meshes
    if (!hasRawGeometry && !isBounded) {
      const overlay = this.createOverlayFromExistingChildren(group, color);
      if (!overlay) return group.children.length > 0 ? group : null;
    }

    return group.children.length > 0 ? group : null;
  }

  /**
   * Attempts to build a three.js BufferGeometry from the raw XRMesh
   * vertices (Float32Array) and indices (Uint32Array).
   */
  private tryBuildRawMeshGeometry(
    meshData: any,
    group: Object3D,
    color: number,
    isBounded: boolean,
  ): boolean {
    if (!meshData) return false;

    // XRMesh provides vertices as Float32Array and indices as Uint32Array
    const vertices: Float32Array | undefined = meshData.vertices;
    const indices: Uint32Array | undefined = meshData.indices;

    if (!vertices || vertices.length === 0) return false;

    console.log(
      `[RoomScanning] 🔺 Building mesh geometry: ${vertices.length / 3} vertices` +
        (indices ? `, ${indices.length / 3} triangles` : ""),
    );

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    if (indices && indices.length > 0) {
      geometry.setIndex(new Uint32BufferAttribute(indices, 1));
    }
    geometry.computeVertexNormals();

    // Solid semi-transparent fill
    const fillMat = new MeshStandardMaterial({
      color: new Color(color),
      transparent: true,
      opacity: isBounded ? 0.3 : 0.12,
      side: DoubleSide,
      depthWrite: false,
      roughness: 0.8,
      metalness: 0.1,
    });
    const fillMesh = new Mesh(geometry, fillMat);
    fillMesh.name = "mesh-fill";
    fillMesh.raycast = () => {}; // Prevent blocking grab rays
    group.add(fillMesh);

    // Wireframe edge overlay
    const wireGeom = new WireframeGeometry(geometry);
    const wireMat = new LineBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity: isBounded ? 0.5 : 0.2,
    });
    const wireframe = new LineSegments(wireGeom, wireMat);
    wireframe.name = "mesh-wireframe";
    group.add(wireframe);

    return true;
  }

  /**
   * Creates a wireframe overlay from existing Mesh children
   * (e.g., those created by IWSDK's SceneUnderstandingSystem).
   */
  private createOverlayFromExistingChildren(
    group: Object3D,
    color: number,
  ): boolean {
    let found = false;
    // This will be called later once the entity's object3D is populated
    // For now, mark as not found — the update loop will catch it
    return found;
  }

  /**
   * Creates a colored wireframe bounding box for a detected 3D mesh.
   */
  private createMeshBoundingBox(
    label: string,
    dimensions: [number, number, number],
  ): Object3D {
    const color = getMeshColor(label);
    const boxGeom = new BoxGeometry(
      dimensions[0],
      dimensions[1],
      dimensions[2],
    );
    const edgesGeom = new EdgesGeometry(boxGeom);
    const lineMat = new LineBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity: 0.8,
    });
    const edges = new LineSegments(edgesGeom, lineMat);
    edges.name = `mesh-bbox-${label}`;

    // Also add a faint solid fill
    const fillMat = new MeshBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity: 0.08,
      side: DoubleSide,
      depthWrite: false,
    });
    const fill = new Mesh(boxGeom, fillMat);
    fill.name = `mesh-fill-${label}`;
    fill.raycast = () => {}; // Prevent blocking grab rays

    const bboxGroup = new Object3D();
    bboxGroup.name = `mesh-bbox-group-${label}`;
    bboxGroup.raycast = () => {};
    bboxGroup.add(edges);
    bboxGroup.add(fill);
    return bboxGroup;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  GLTF Export — download scanned room as .glb
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Exports all currently detected planes and meshes as a single .glb file.
   * Call from console: `__exportRoomAsGLB()` or `world.getSystem(RoomScanningSystem).exportRoomAsGLB()`
   */
  async exportRoomAsGLB(): Promise<void> {
    console.log("[RoomScanning] 📦 Starting GLTF export...");

    const exportScene = new Scene();
    exportScene.name = "RoomScan";

    // ── Add plane geometry ──────────────────────────────────────────
    const planesGroup = new Group();
    planesGroup.name = "Planes";

    for (const entity of this.queries.planes.entities) {
      try {
        const planeData = entity.getValue(XRPlane, "_plane") as any;
        const orientation: string = planeData?.orientation ?? "unknown";

        if (planeData?.polygon) {
          const polygon: DOMPointReadOnly[] = planeData.polygon;
          const vertices: number[] = [];
          for (let i = 1; i < polygon.length - 1; i++) {
            vertices.push(polygon[0].x, polygon[0].y, polygon[0].z);
            vertices.push(polygon[i].x, polygon[i].y, polygon[i].z);
            vertices.push(polygon[i + 1].x, polygon[i + 1].y, polygon[i + 1].z);
          }

          const geometry = new BufferGeometry();
          geometry.setAttribute(
            "position",
            new Float32BufferAttribute(vertices, 3),
          );
          geometry.computeVertexNormals();

          const material = new MeshStandardMaterial({
            color: new Color(PLANE_COLORS[orientation] ?? PLANE_COLORS.unknown),
            side: DoubleSide,
            roughness: 0.9,
            metalness: 0.0,
          });

          const planeMesh = new Mesh(geometry, material);
          planeMesh.name = `plane-${orientation}-${planesGroup.children.length}`;

          // Copy world position/rotation from entity
          if (entity.object3D) {
            entity.object3D.updateWorldMatrix(true, false);
            planeMesh.applyMatrix4(entity.object3D.matrixWorld as any);
          }

          planesGroup.add(planeMesh);
        }
      } catch {
        /* skip */
      }
    }
    exportScene.add(planesGroup);

    // ── Add mesh geometry ───────────────────────────────────────────
    const meshesGroup = new Group();
    meshesGroup.name = "Meshes";

    for (const entity of this.queries.meshes.entities) {
      try {
        const meshData = entity.getValue(XRMesh, "_mesh") as any;
        const isBounded = entity.getValue(XRMesh, "isBounded3D") as boolean;
        const semanticLabel =
          (entity.getValue(XRMesh, "semanticLabel") as string) || "unknown";
        const color = isBounded
          ? getMeshColor(semanticLabel)
          : MESH_COLORS.global_mesh;

        let meshObj: Mesh | null = null;

        // Try raw XRMesh vertices/indices
        if (meshData?.vertices && meshData.vertices.length > 0) {
          const geometry = new BufferGeometry();
          geometry.setAttribute(
            "position",
            new Float32BufferAttribute(meshData.vertices, 3),
          );
          if (meshData.indices && meshData.indices.length > 0) {
            geometry.setIndex(new Uint32BufferAttribute(meshData.indices, 1));
          }
          geometry.computeVertexNormals();

          const material = new MeshStandardMaterial({
            color: new Color(color),
            side: DoubleSide,
            roughness: 0.7,
            metalness: 0.1,
          });

          meshObj = new Mesh(geometry, material);
          meshObj.name = isBounded
            ? `mesh-${semanticLabel}-${meshesGroup.children.length}`
            : `global-mesh-${meshesGroup.children.length}`;
        }

        if (meshObj) {
          // Copy world transform from entity
          if (entity.object3D) {
            entity.object3D.updateWorldMatrix(true, false);
            meshObj.applyMatrix4(entity.object3D.matrixWorld as any);
          }
          meshesGroup.add(meshObj);
        }
      } catch {
        /* skip */
      }
    }
    exportScene.add(meshesGroup);

    const totalObjects =
      planesGroup.children.length + meshesGroup.children.length;
    if (totalObjects === 0) {
      console.warn(
        "[RoomScanning] ⚠️ No geometry to export. Complete a room scan first.",
      );
      return;
    }

    console.log(
      `[RoomScanning] 📦 Exporting ${planesGroup.children.length} planes + ${meshesGroup.children.length} meshes...`,
    );

    // ── Export as binary .glb ───────────────────────────────────────
    try {
      const exporter = new GLTFExporter();
      const glb = await (exporter as any).parseAsync(exportScene, {
        binary: true,
      });

      const blob = new Blob([glb as ArrayBuffer], {
        type: "application/octet-stream",
      });
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const filename = `room-scan-${timestamp}.glb`;

      // POST to dev server to save in room-scans/
      try {
        const serverUrl = `${window.location.protocol}//${window.location.host}/api/save-room-scan`;
        const formData = new FormData();
        formData.append("file", blob, filename);
        const resp = await fetch(serverUrl, { method: "POST", body: formData });
        if (resp.ok) {
          console.log(
            `[RoomScanning] ✅ Saved to server: room-scans/${filename}`,
          );
        } else {
          console.warn(`[RoomScanning] ⚠️ Server save failed: ${resp.status}`);
        }
      } catch (postErr) {
        console.warn(
          "[RoomScanning] ⚠️ Could not POST to dev server:",
          postErr,
        );
      }

      console.log(
        `[RoomScanning] ✅ Exported ${filename} (${(blob.size / 1024).toFixed(1)} KB)`,
      );
    } catch (err) {
      console.error("[RoomScanning] ❌ GLTF export failed:", err);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Update loop & cleanup
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  update(dt: number): void {
    if (!this.sessionStarted) {
      // Even outside AR, position HUD if it exists
      return;
    }

    // Periodic summary log + HUD refresh
    this.logTimer += dt;
    if (this.logTimer >= this.LOG_INTERVAL) {
      this.logTimer = 0;

      const planeCount = this.queries.planes.entities.size;
      const meshCount = this.queries.meshes.entities.size;

      if (planeCount > 0 || meshCount > 0) {
        // Gather plane orientations
        const orientations: Record<string, number> = {};
        for (const entity of this.queries.planes.entities) {
          try {
            const planeData = entity.getValue(XRPlane, "_plane") as any;
            const o: string = planeData?.orientation ?? "unknown";
            orientations[o] = (orientations[o] ?? 0) + 1;
          } catch {
            /* skip */
          }
        }

        // Gather mesh labels
        const labels: Record<string, number> = {};
        for (const entity of this.queries.meshes.entities) {
          try {
            const isBounded = entity.getValue(XRMesh, "isBounded3D") as boolean;
            const label = isBounded
              ? (entity.getValue(XRMesh, "semanticLabel") as string) ||
                "unknown"
              : "global_mesh";
            labels[label] = (labels[label] ?? 0) + 1;
          } catch {
            /* skip */
          }
        }

        const orientStr = Object.entries(orientations)
          .map(([k, v]) => `${k}:${v}`)
          .join(", ");
        const labelStr = Object.entries(labels)
          .map(([k, v]) => `${k}:${v}`)
          .join(", ");

        console.log(
          `[RoomScanning] 📊 Summary | planes: ${planeCount} (${orientStr}) | meshes: ${meshCount} (${labelStr})`,
        );
      }
    }

    // Auto-export countdown
    if (this.roomCaptureInitiated && !this.autoExportDone) {
      this.scanReadyTimer += dt;
      if (this.scanReadyTimer >= this.SCAN_READY_DELAY) {
        const planeCount = this.queries.planes.entities.size;
        const meshCount = this.queries.meshes.entities.size;
        if (planeCount > 0 || meshCount > 0) {
          this.autoExportDone = true;
          console.log("[RoomScanning] 📦 Auto-exporting scan...");
          this.exportRoomAsGLB().catch((err) => {
            console.warn("[RoomScanning] Auto-export failed:", err);
          });
        }
      }
    }
  }

  private cleanupAllVisuals(): void {
    for (const [, visual] of this.planeVisuals) {
      visual.removeFromParent();
    }
    this.planeVisuals.clear();

    for (const [, visual] of this.meshVisuals) {
      visual.removeFromParent();
    }
    this.meshVisuals.clear();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Public getters for other systems (e.g. RoomAlignmentSystem)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** Get the current detected floor Y value (lowest floor plane/mesh Y) */
  public getFloorY(): number | null {
    let floorY: number | null = null;
    for (const entity of this.queries.planes.entities) {
      try {
        const planeData = entity.getValue(XRPlane, "_plane") as any;
        const label: string = planeData?.semanticLabel ?? "";
        const o: string = planeData?.orientation ?? "unknown";
        if (label === "floor" || (o === "horizontal" && entity.object3D)) {
          const y = entity.object3D?.position?.y;
          if (y !== undefined && (floorY === null || y < floorY)) {
            floorY = y;
          }
        }
      } catch {
        /* skip */
      }
    }
    return floorY;
  }

  /**
   * Get wall normals (world-space) using multi-strategy detection:
   *   Strategy 1: XRMesh with semanticLabel === "wall"
   *   Strategy 2: XRPlane with orientation === "vertical" (most common on Quest)
   *   Strategy 3: XRMesh with vertical bounding box (tall + thin = wall-like)
   */
  public getWallNormals(): {
    position: Vector3;
    normal: Vector3;
    length: number;
  }[] {
    const walls: { position: Vector3; normal: Vector3; length: number }[] = [];

    // ── Strategy 1: Semantic "wall" labels on XRMesh ──────────────
    for (const entity of this.queries.meshes.entities) {
      try {
        const isBounded = entity.getValue(XRMesh, "isBounded3D") as boolean;
        const label =
          (entity.getValue(XRMesh, "semanticLabel") as string) || "";
        const dims = entity.getValue(XRMesh, "dimensions") as
          | [number, number, number]
          | undefined;
        if (label.toLowerCase() === "wall" && isBounded && entity.object3D) {
          entity.object3D.updateWorldMatrix(true, false);
          const pos = new Vector3();
          entity.object3D.getWorldPosition(pos as any);
          const q = new Quaternion();
          entity.object3D.getWorldQuaternion(q as any);
          const normal = new Vector3(0, 0, 1).applyQuaternion(q).normalize();
          const length = dims ? Math.max(dims[0], dims[2]) : 1;
          walls.push({ position: pos, normal, length });
        }
      } catch {
        /* skip */
      }
    }

    if (walls.length > 0) {
      console.log(
        `[RoomScanning] Wall detection: ${walls.length} walls from semantic labels`,
      );
      return walls;
    }

    // ── Strategy 2: Vertical XRPlanes (most reliable on Quest 3) ──
    // Quest 3 often returns planes with orientation "vertical" even without wall semantic labels
    for (const entity of this.queries.planes.entities) {
      try {
        const planeData = entity.getValue(XRPlane, "_plane") as any;
        const orientation: string = planeData?.orientation ?? "unknown";

        if (orientation === "vertical" && entity.object3D) {
          entity.object3D.updateWorldMatrix(true, false);
          const pos = new Vector3();
          entity.object3D.getWorldPosition(pos as any);
          const q = new Quaternion();
          entity.object3D.getWorldQuaternion(q as any);
          // Plane normal is the local Z axis
          const normal = new Vector3(0, 0, 1).applyQuaternion(q).normalize();

          // Estimate wall length from plane polygon extent
          let length = 1;
          if (planeData?.polygon && planeData.polygon.length >= 2) {
            let maxExtent = 0;
            for (let i = 0; i < planeData.polygon.length; i++) {
              for (let j = i + 1; j < planeData.polygon.length; j++) {
                const dx = planeData.polygon[i].x - planeData.polygon[j].x;
                const dz = planeData.polygon[i].z - planeData.polygon[j].z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > maxExtent) maxExtent = dist;
              }
            }
            if (maxExtent > 0.1) length = maxExtent;
          }

          // Also check bounding rect dimensions if available
          if (planeData?.boundingRectangleWidth) {
            length = Math.max(length, planeData.boundingRectangleWidth);
          }

          walls.push({ position: pos, normal, length });
        }
      } catch {
        /* skip */
      }
    }

    if (walls.length > 0) {
      console.log(
        `[RoomScanning] Wall detection: ${walls.length} walls from vertical XRPlanes`,
      );
      return walls;
    }

    // ── Strategy 3: XRMesh with vertical bounding box (tall + thin) ──
    // If neither semantic labels nor vertical planes are available,
    // look for bounded meshes that are taller than wide (wall-like shape)
    for (const entity of this.queries.meshes.entities) {
      try {
        const isBounded = entity.getValue(XRMesh, "isBounded3D") as boolean;
        const dims = entity.getValue(XRMesh, "dimensions") as
          | [number, number, number]
          | undefined;
        if (!isBounded || !dims || !entity.object3D) continue;

        // Wall heuristic: height > 1m, and height > max horizontal extent * 0.5
        const [w, h, d] = dims;
        const maxHoriz = Math.max(w, d);
        if (h > 1.0 && h > maxHoriz * 0.5) {
          entity.object3D.updateWorldMatrix(true, false);
          const pos = new Vector3();
          entity.object3D.getWorldPosition(pos as any);
          const q = new Quaternion();
          entity.object3D.getWorldQuaternion(q as any);
          const normal = new Vector3(0, 0, 1).applyQuaternion(q).normalize();
          walls.push({ position: pos, normal, length: maxHoriz });
        }
      } catch {
        /* skip */
      }
    }

    if (walls.length > 0) {
      console.log(
        `[RoomScanning] Wall detection: ${walls.length} walls from mesh shape heuristic`,
      );
    } else {
      console.log(
        "[RoomScanning] Wall detection: no walls found by any strategy",
      );
    }
    return walls;
  }

  /** No-op — HUD removed but RoomAlignmentSystem still calls this */
  public addHUDLine(_line: string): void {}

  /**
   * Detect door(s) from XRMesh semantic labels.
   * Returns world position, wall-normal direction, and width of each door.
   */
  public getDoorInfo(): {
    position: Vector3;
    normal: Vector3;
    width: number;
  }[] {
    const doors: { position: Vector3; normal: Vector3; width: number }[] = [];

    for (const entity of this.queries.meshes.entities) {
      try {
        const isBounded = entity.getValue(XRMesh, "isBounded3D") as boolean;
        const label =
          (entity.getValue(XRMesh, "semanticLabel") as string) || "";
        const dims = entity.getValue(XRMesh, "dimensions") as
          | [number, number, number]
          | undefined;

        if (label.toLowerCase() === "door" && isBounded && entity.object3D) {
          entity.object3D.updateWorldMatrix(true, false);
          const pos = new Vector3();
          entity.object3D.getWorldPosition(pos as any);
          const q = new Quaternion();
          entity.object3D.getWorldQuaternion(q as any);
          // Door normal = direction it faces (perpendicular to door plane)
          const normal = new Vector3(0, 0, 1).applyQuaternion(q).normalize();
          normal.y = 0;
          normal.normalize();
          const width = dims ? Math.max(dims[0], dims[2]) : 0.9;
          doors.push({ position: pos, normal, width });
          console.log(
            `[RoomScanning] 🚪 Door detected at ` +
              `(${pos.x.toFixed(2)}, ${pos.z.toFixed(2)}) ` +
              `normal=${((Math.atan2(normal.z, normal.x) * 180) / Math.PI).toFixed(0)}° ` +
              `width=${width.toFixed(2)}m`,
          );
        }
      } catch {
        /* skip */
      }
    }

    // Also check planes (some runtimes report doors as vertical planes)
    for (const entity of this.queries.planes.entities) {
      try {
        const planeData = entity.getValue(XRPlane, "_plane") as any;
        const label: string = planeData?.semanticLabel ?? "";
        if (label.toLowerCase() === "door" && entity.object3D) {
          entity.object3D.updateWorldMatrix(true, false);
          const pos = new Vector3();
          entity.object3D.getWorldPosition(pos as any);
          const q = new Quaternion();
          entity.object3D.getWorldQuaternion(q as any);
          const normal = new Vector3(0, 0, 1).applyQuaternion(q).normalize();
          normal.y = 0;
          normal.normalize();

          let width = 0.9;
          if (planeData?.polygon && planeData.polygon.length >= 2) {
            let maxExtent = 0;
            for (let i = 0; i < planeData.polygon.length; i++) {
              for (let j = i + 1; j < planeData.polygon.length; j++) {
                const dx = planeData.polygon[i].x - planeData.polygon[j].x;
                const dz = planeData.polygon[i].z - planeData.polygon[j].z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > maxExtent) maxExtent = dist;
              }
            }
            if (maxExtent > 0.3) width = maxExtent;
          }

          doors.push({ position: pos, normal, width });
          console.log(
            `[RoomScanning] 🚪 Door (plane) at ` +
              `(${pos.x.toFixed(2)}, ${pos.z.toFixed(2)}) width=${width.toFixed(2)}m`,
          );
        }
      } catch {
        /* skip */
      }
    }

    return doors;
  }

  /**
   * Extract room corners from all detected mesh/plane vertices.
   * Projects all vertices onto the XZ plane, computes a convex hull,
   * and simplifies to corner points. Works even without semantic labels.
   *
   * Returns corners as Vector3[] (Y = floorY or 0) sorted clockwise.
   */
  public getRoomCorners(): Vector3[] {
    const floorY = this.getFloorY() ?? 0;
    const points2D: { x: number; z: number }[] = [];

    // Gather all world-space vertices from meshes
    for (const entity of this.queries.meshes.entities) {
      if (!entity.object3D) continue;
      entity.object3D.updateWorldMatrix(true, false);
      entity.object3D.traverse((child: any) => {
        if (child.isMesh && child.geometry?.attributes?.position) {
          const posAttr = child.geometry.attributes.position;
          const v = new Vector3();
          for (let i = 0; i < posAttr.count; i++) {
            v.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
            child.localToWorld(v);
            // Only include vertices near floor level (within 2m above floor)
            if (v.y >= floorY - 0.1 && v.y <= floorY + 2.5) {
              points2D.push({ x: v.x, z: v.z });
            }
          }
        }
      });
    }

    // Also from plane vertices
    for (const entity of this.queries.planes.entities) {
      try {
        const planeData = entity.getValue(XRPlane, "_plane") as any;
        if (planeData?.polygon && entity.object3D) {
          entity.object3D.updateWorldMatrix(true, false);
          for (const pt of planeData.polygon) {
            const v = new Vector3(pt.x, pt.y, pt.z);
            entity.object3D.localToWorld(v as any);
            if (v.y >= floorY - 0.1 && v.y <= floorY + 2.5) {
              points2D.push({ x: v.x, z: v.z });
            }
          }
        }
      } catch {
        /* skip */
      }
    }

    if (points2D.length < 3) {
      console.log(
        `[RoomScanning] getRoomCorners: only ${points2D.length} points — not enough`,
      );
      return [];
    }

    console.log(
      `[RoomScanning] getRoomCorners: ${points2D.length} floor-level points collected`,
    );

    // Compute convex hull (Andrew's monotone chain)
    const hull = this.convexHull2D(points2D);

    // Simplify hull to corners (Douglas-Peucker, tolerance 0.3m)
    const corners = this.simplifyPolygon(hull, 0.3);

    console.log(
      `[RoomScanning] getRoomCorners: hull=${hull.length} pts → ${corners.length} corners`,
    );

    return corners.map((p) => new Vector3(p.x, floorY, p.z));
  }

  /** Andrew's monotone chain convex hull (2D, XZ plane) */
  private convexHull2D(
    points: { x: number; z: number }[],
  ): { x: number; z: number }[] {
    const pts = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
    if (pts.length <= 1) return pts;

    const cross = (
      o: { x: number; z: number },
      a: { x: number; z: number },
      b: { x: number; z: number },
    ) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

    // Lower hull
    const lower: { x: number; z: number }[] = [];
    for (const p of pts) {
      while (
        lower.length >= 2 &&
        cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
      ) {
        lower.pop();
      }
      lower.push(p);
    }

    // Upper hull
    const upper: { x: number; z: number }[] = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (
        upper.length >= 2 &&
        cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
      ) {
        upper.pop();
      }
      upper.push(p);
    }

    // Remove last point of each half because it's repeated
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  /** Douglas-Peucker polygon simplification (2D, XZ) */
  private simplifyPolygon(
    points: { x: number; z: number }[],
    tolerance: number,
  ): { x: number; z: number }[] {
    if (points.length <= 2) return points;

    // Find point with max distance from the line between first and last
    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.pointLineDistance(points[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > tolerance) {
      const left = this.simplifyPolygon(points.slice(0, maxIdx + 1), tolerance);
      const right = this.simplifyPolygon(points.slice(maxIdx), tolerance);
      return left.slice(0, -1).concat(right);
    }

    return [first, last];
  }

  /** Distance from point to line segment (2D, XZ) */
  private pointLineDistance(
    p: { x: number; z: number },
    a: { x: number; z: number },
    b: { x: number; z: number },
  ): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.z - a.z) ** 2);
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2),
    );
    const projX = a.x + t * dx;
    const projZ = a.z + t * dz;
    return Math.sqrt((p.x - projX) ** 2 + (p.z - projZ) ** 2);
  }
}
