/**
 * RoomAlignmentSystem — aligns the LabPlan model to the real room
 *
 * Priority order:
 *   1. Floor match — set LabPlan Y so its floor sits on the detected real floor
 *   2. User inside — translate LabPlan so the XR camera is inside the model
 *   3. Wall match — rotate LabPlan to align its walls with detected real walls
 *   4. Fallback fit — if wall matching fails, uniformly scale LabPlan to fit
 *      inside the detected room bounds while keeping user inside
 */
import { createSystem, XRPlane, XRMesh } from "@iwsdk/core";
import { Vector3, Quaternion, Box3, Object3D } from "three";
import { getStore } from "../store/DeviceStore";
import { RoomScanningSystem } from "./RoomScanningSystem";

// LabPlan model native dimensions (at 1:1 scale, Y-up)
const LAB_WIDTH = 9.0; // X extent
const LAB_DEPTH = 10.5; // Z extent
const LAB_HEIGHT = 2.78; // Y extent

// Wall-match angle tolerance (degrees)
const WALL_ANGLE_TOLERANCE = 25;

// Minimum floor / wall data before alignment triggers
const MIN_PLANES_FOR_ALIGN = 1;

export class RoomAlignmentSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  private aligned = false;
  private timer = 0;
  private sessionReady = false;

  init(): void {
    console.log("[RoomAlignment] System initialized — waiting for scan data");

    this.renderer.xr.addEventListener("sessionstart", () => {
      this.sessionReady = true;
      this.timer = 0;
      this.aligned = false;
      console.log(
        "[RoomAlignment] XR session started — alignment will run when confidence is high enough",
      );
      this.tryLoadSavedAlignment();
    });
  }

  private async tryLoadSavedAlignment() {
    const state = getStore();
    const homes = state.homes;
    if (
      homes &&
      homes.length > 0 &&
      homes[0].floors &&
      homes[0].floors.length > 0 &&
      homes[0].floors[0].rooms &&
      homes[0].floors[0].rooms.length > 0
    ) {
      const room: any = homes[0].floors[0].rooms[0];
      const roomModel = (globalThis as any).__labRoomModel as
        | Object3D
        | undefined;
      const scanSystem = this.world.getSystem(RoomScanningSystem);

      if (!roomModel) return;

      // 1. Try restoring via XRAnchor if available
      const session = this.renderer.xr.getSession();
      if (room.anchor_uuid && session && "restorePersistentAnchor" in session) {
        try {
          console.log(
            `[RoomAlignment] ⚓ Attempting to restore persistent anchor: ${room.anchor_uuid}`,
          );
          const restoredAnchor = await (session as any).restorePersistentAnchor(
            room.anchor_uuid,
          );

          if (restoredAnchor && restoredAnchor.anchorSpace) {
            // Convert anchorSpace to world coordinates
            const referenceSpace = this.renderer.xr.getReferenceSpace();
            if (referenceSpace) {
              // Since we can't cleanly project WebXR spaces synchronously in Three.js without the frame,
              // We'll hook into the next frame to apply the anchor pose.
              const onFrame = (time: number, frame: XRFrame) => {
                session.removeEventListener(
                  "requestAnimationFrame",
                  onFrame as any,
                );
                const pose = frame.getPose(
                  restoredAnchor.anchorSpace,
                  referenceSpace,
                );
                if (pose) {
                  roomModel.position.set(
                    pose.transform.position.x,
                    pose.transform.position.y,
                    pose.transform.position.z,
                  );
                  roomModel.quaternion.set(
                    pose.transform.orientation.x,
                    pose.transform.orientation.y,
                    pose.transform.orientation.z,
                    pose.transform.orientation.w,
                  );
                  this.aligned = true;
                  console.log(
                    "[RoomAlignment] ✅ Restored exactly via XRAnchor!",
                  );
                  scanSystem?.addHUDLine("✅ Restored XRAnchor");
                } else {
                  this.fallbackToManualCoordinates(room, roomModel, scanSystem);
                }
              };
              session.requestAnimationFrame(onFrame);
              return;
            }
          }
        } catch (e) {
          console.warn(
            "[RoomAlignment] ⚠ Failed to restore XRAnchor, falling back to manual coords:",
            e,
          );
        }
      }

      // 2. Fallback to manual coordinates
      this.fallbackToManualCoordinates(room, roomModel, scanSystem);
    }
  }

  private fallbackToManualCoordinates(
    room: any,
    roomModel: Object3D,
    scanSystem: RoomScanningSystem | undefined,
  ) {
    if (room.position && room.rotation) {
      if (
        room.position.x !== 0 ||
        room.position.y !== 0 ||
        room.position.z !== 0 ||
        room.rotation.y !== 0
      ) {
        roomModel.position.set(
          room.position.x,
          room.position.y,
          room.position.z,
        );
        roomModel.rotation.set(0, room.rotation.y, 0);
        this.aligned = true;
        console.log(
          "[RoomAlignment] ✅ Loaded PREVIOUSLY SAVED manual alignment from backend!",
        );
        if (scanSystem) {
          scanSystem.addHUDLine("✅ Loaded Saved Room Alignment");
        }
      }
    }
  }

  update(dt: number): void {
    if (!this.sessionReady || this.aligned) return;

    this.timer += dt;

    const scanSystem = this.world.getSystem(RoomScanningSystem);
    if (!scanSystem) {
      return;
    }

    const planeCount = this.queries.planes.entities.size;
    const meshCount = this.queries.meshes.entities.size;

    // We consider "confident" if we have a floor and at least a few walls/meshes.
    const hasFloor = scanSystem.getFloorY() !== null;
    const confidenceScore =
      (hasFloor ? 50 : 0) +
      Math.min(planeCount * 10, 30) +
      Math.min(meshCount * 5, 20);

    // If confidence score is >= 80, OR if we've been waiting for over 15 seconds with some data, we align.
    if (
      confidenceScore >= 80 ||
      (this.timer >= 15 && (planeCount > 0 || meshCount > 0))
    ) {
      this.performAlignment(scanSystem);
    } else {
      if (this.timer % 2 < dt) {
        scanSystem.addHUDLine(`Scanning Room... (${confidenceScore}%)`);
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Main alignment routine
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private async performAlignment(
    scanSystem: RoomScanningSystem,
  ): Promise<void> {
    const roomModel = (globalThis as any).__labRoomModel as
      | Object3D
      | undefined;
    if (!roomModel) {
      console.warn(
        "[RoomAlignment] __labRoomModel not found — skipping alignment",
      );
      return;
    }

    this.aligned = true;
    console.log(
      "[RoomAlignment] ━━━ Starting rectangle-to-rectangle alignment ━━━",
    );

    // ── Step 1: Floor match ────────────────────────────────
    const floorY = scanSystem.getFloorY();
    if (floorY !== null) {
      roomModel.position.y = floorY;
      console.log(`[RoomAlignment] ✅ Floor matched: Y = ${floorY.toFixed(3)}`);
      scanSystem.addHUDLine(`✅ Floor: Y=${floorY.toFixed(3)}m`);
    } else {
      console.log("[RoomAlignment] ⚠ No floor detected — keeping Y=0");
    }

    // ── Step 2: Determine scanned room rectangle (center + orientation) ──
    const roomRect = this.findScannedRoomRectangle(scanSystem);
    const camera = this.renderer.xr.getCamera();
    const camPos = camera ? camera.position.clone() : new Vector3(0, 1.6, 0);

    if (!roomRect) {
      // Fallback: just center on user if no room shape detected
      console.log(
        "[RoomAlignment] ⚠ Cannot determine room rectangle — centering on user",
      );
      const bbox = new Box3().setFromObject(roomModel);
      const center = bbox.getCenter(new Vector3());
      roomModel.position.x += camPos.x - center.x;
      roomModel.position.z += camPos.z - center.z;
    } else {
      console.log(
        `[RoomAlignment] 📐 Scanned room: center=(${roomRect.center.x.toFixed(2)}, ${roomRect.center.z.toFixed(2)}) angle=${((roomRect.angle * 180) / Math.PI).toFixed(1)}°`,
      );

      // ── Step 3: Rotate LabPlan to match scanned room orientation ──
      const rotationY = this.computeAlignmentRotation(roomRect.angle);
      if (Math.abs(rotationY) > (0.5 * Math.PI) / 180) {
        const bbox = new Box3().setFromObject(roomModel);
        const labCenter = bbox.getCenter(new Vector3());
        this.rotateAroundPoint(roomModel, labCenter, rotationY);
      }

      // ── Step 4: Intelligent User Placement ──
      // Instead of purely matching bounding boxes, let's keep the user (camera)
      // neatly located in a known valid "walking" area of the LabPlan.
      // E.g., placing the user near (0, floorY, 0) relative to the LabPlan's initial transform.
      const currentLabBbox = new Box3().setFromObject(roomModel);
      const currentLabCenter = currentLabBbox.getCenter(new Vector3());

      // Let's bias the model so that `camPos` lies closely to the center of the LabPlan
      // but shifted so we don't end up inside a wall if the room bounds don't match.
      const dx = camPos.x - currentLabCenter.x;
      const dz = camPos.z - currentLabCenter.z;

      roomModel.position.x += dx;
      roomModel.position.z += dz;
    }

    // ── Step 5: Persistent XRAnchor Creation ──
    const session = this.renderer.xr.getSession();
    if (session && "requestPersistentHandle" in XRAnchor.prototype) {
      try {
        const xrAnchor = await this.createPersistableAnchor(session, roomModel);
        if (xrAnchor) {
          let anchorUuid: string | undefined;

          if (typeof (xrAnchor as any).requestPersistentHandle === "function") {
            anchorUuid = await (xrAnchor as any).requestPersistentHandle();
          }

          if (anchorUuid) {
            console.log(
              `[RoomAlignment] ⚓ Anchor Created and persisted UUID: ${anchorUuid}`,
            );
            scanSystem.addHUDLine(`✅ Room Pinned (${anchorUuid.slice(0, 8)})`);

            // Notify backend
            const store = getStore();
            if (store.homes.length > 0 && store.homes[0].floors.length > 0) {
              const activeRoomId = store.homes[0].floors[0].rooms[0].id;
              await store.updateRoomAlignment(
                activeRoomId,
                roomModel.position.x,
                roomModel.position.y,
                roomModel.position.z,
                roomModel.rotation.y,
                anchorUuid,
              );
              console.log("[RoomAlignment] Backend synchronized with anchor");
            }
          }
        }
      } catch (err) {
        console.error(
          "[RoomAlignment] ❌ Failed to create or persist XR Anchor:",
          err,
        );
      }
    } else {
      console.warn(
        "[RoomAlignment] ⚠ XR Anchor persistence not supported by this browser.",
      );
      const store = getStore();
      if (store.homes.length > 0 && store.homes[0].floors.length > 0) {
        const activeRoomId = store.homes[0].floors[0].rooms[0].id;
        await store.updateRoomAlignment(
          activeRoomId,
          roomModel.position.x,
          roomModel.position.y,
          roomModel.position.z,
          roomModel.rotation.y,
        );
      }
    }
  }

  private async createPersistableAnchor(
    session: XRSession,
    targetObj: Object3D,
  ): Promise<XRAnchor | null> {
    const referenceSpace = this.renderer.xr.getReferenceSpace();
    if (!referenceSpace) return null;

    // We want the anchor to be exactly where targetObj is.
    // Convert targetObj's pos/rot to an XRRigidTransform
    const transform = new XRRigidTransform(
      {
        x: targetObj.position.x,
        y: targetObj.position.y,
        z: targetObj.position.z,
      },
      {
        x: targetObj.quaternion.x,
        y: targetObj.quaternion.y,
        z: targetObj.quaternion.z,
        w: targetObj.quaternion.w,
      },
    );

    // Some session APIs put createAnchor on the session itself, others use hitTest or frame...
    // standard WebXR (ar-module) puts createAnchor on session or frame.
    // In three.js XR callbacks, you can capture frame in render loop, but some runtimes
    // allow doing it if the frame is available. However, since the system API handles it:

    // WebXR spec says trackable anchors are requested on a frame: frame.createAnchor(transform, space)
    // For simplicity, we just use the global/session-based anchor approach and return mock if omitted.
    return new Promise((resolve) => {
      const onFrame = (time: number, frame: XRFrame) => {
        session.removeEventListener("requestAnimationFrame", onFrame as any);
        if (frame.createAnchor) {
          frame
            .createAnchor(transform, referenceSpace)
            .then(resolve)
            .catch((e) => resolve(null));
        } else {
          resolve(null);
        }
      };
      session.requestAnimationFrame(onFrame);
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Scanned room rectangle detection
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Determines the scanned room's rectangle parameters:
   *   - center (XZ world position)
   *   - angle (orientation of the room's longest axis)
   *   - width, depth (estimated room dimensions)
   *   - method (how it was determined, for debug)
   */
  private findScannedRoomRectangle(scanSystem: RoomScanningSystem): {
    center: Vector3;
    angle: number;
    width: number;
    depth: number;
    method: string;
  } | null {
    // ── Strategy A: From room corners (most precise) ──
    const corners = scanSystem.getRoomCorners();
    if (corners.length >= 4) {
      const rect = this.fitRectangleToCorners(corners);
      if (rect) return { ...rect, method: "corners" };
    }

    // ── Strategy B: From wall normals + room bounds ──
    const walls = scanSystem.getWallNormals();
    const bounds = this.estimateRoomBounds();
    if (walls.length > 0 && bounds) {
      const sorted = [...walls].sort((a, b) => b.length - a.length);
      const bestWall = sorted[0];
      // Wall normal is perpendicular to wall face; wall direction = normal rotated 90°
      const wallDirAngle =
        Math.atan2(bestWall.normal.z, bestWall.normal.x) + Math.PI / 2;

      const center = new Vector3(
        (bounds.min.x + bounds.max.x) / 2,
        0,
        (bounds.min.z + bounds.max.z) / 2,
      );
      const width = bounds.max.x - bounds.min.x;
      const depth = bounds.max.z - bounds.min.z;
      return {
        center,
        angle: wallDirAngle,
        width,
        depth,
        method: "walls+bounds",
      };
    }

    // ── Strategy C: From raw bounds only (axis-aligned, no rotation) ──
    if (bounds) {
      const center = new Vector3(
        (bounds.min.x + bounds.max.x) / 2,
        0,
        (bounds.min.z + bounds.max.z) / 2,
      );
      return {
        center,
        angle: 0,
        width: bounds.max.x - bounds.min.x,
        depth: bounds.max.z - bounds.min.z,
        method: "bounds-only",
      };
    }

    return null;
  }

  /**
   * Fits an oriented bounding rectangle to a set of 2D corners (XZ plane).
   * Uses the "rotating calipers" idea: try each edge angle and find the
   * tightest axis-aligned bounding box in that rotated frame.
   */
  private fitRectangleToCorners(
    corners: Vector3[],
  ): { center: Vector3; angle: number; width: number; depth: number } | null {
    if (corners.length < 3) return null;

    let bestArea = Infinity;
    let bestAngle = 0;
    let bestCenter = new Vector3();
    let bestW = 0;
    let bestD = 0;

    // Try each edge angle as a candidate rotation
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      const edgeAngle = Math.atan2(b.z - a.z, b.x - a.x);

      // Rotate all corners by -edgeAngle to align this edge with X axis
      const cos = Math.cos(-edgeAngle);
      const sin = Math.sin(-edgeAngle);

      let minX = Infinity,
        maxX = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
      for (const c of corners) {
        const rx = c.x * cos - c.z * sin;
        const rz = c.x * sin + c.z * cos;
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
        minZ = Math.min(minZ, rz);
        maxZ = Math.max(maxZ, rz);
      }

      const w = maxX - minX;
      const d = maxZ - minZ;
      const area = w * d;

      if (area < bestArea) {
        bestArea = area;
        bestAngle = edgeAngle;
        bestW = w;
        bestD = d;

        // Center in rotated frame → back to world
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        const cosBack = Math.cos(edgeAngle);
        const sinBack = Math.sin(edgeAngle);
        bestCenter = new Vector3(
          cx * cosBack - cz * sinBack,
          0,
          cx * sinBack + cz * cosBack,
        );
      }
    }

    if (bestW < 1 || bestD < 1) return null;

    console.log(
      `[RoomAlignment] fitRectangle: ${bestW.toFixed(1)}×${bestD.toFixed(1)}m ` +
        `angle=${((bestAngle * 180) / Math.PI).toFixed(1)}° ` +
        `center=(${bestCenter.x.toFixed(2)}, ${bestCenter.z.toFixed(2)})`,
    );
    return { center: bestCenter, angle: bestAngle, width: bestW, depth: bestD };
  }

  /**
   * Compute the Y-rotation needed to align LabPlan (axis-aligned) with
   * the scanned room's orientation angle.
   *
   * LabPlan has its long side (LAB_DEPTH=10.5m) along Z and short side
   * (LAB_WIDTH=9m) along X. The scanned room angle is the direction
   * of one of its edges. We need to find which LabPlan axis to align to.
   */
  private computeAlignmentRotation(roomAngle: number): number {
    // Normalize to [-π, π]
    let angle = roomAngle;
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;

    // Cardinal directions the LabPlan edges align with
    const cardinals = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    let bestCardinal = 0;
    let bestDiff = Infinity;

    for (const c of cardinals) {
      let diff = Math.abs(angle - c);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestCardinal = c;
      }
    }

    return angle - bestCardinal;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Step 3: Wall matching
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private tryWallMatch(
    roomModel: Object3D,
    walls: { position: Vector3; normal: Vector3; length: number }[],
    scanSystem: RoomScanningSystem,
  ): boolean {
    if (walls.length < 1) {
      console.log("[RoomAlignment] ⚠ No walls detected — skipping wall match");
      scanSystem.addHUDLine("⚠ No walls for matching");
      return false;
    }

    // Find the longest detected wall for most reliable orientation
    const sorted = [...walls].sort((a, b) => b.length - a.length);
    const bestWall = sorted[0];

    // Wall normal angle (in XZ plane)
    const wallAngle = Math.atan2(bestWall.normal.z, bestWall.normal.x);

    // LabPlan has walls aligned to cardinal axes (0°, 90°, 180°, 270°)
    // Find closest cardinal direction
    const cardinals = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    let bestCardinal = 0;
    let bestDiff = Infinity;

    for (const c of cardinals) {
      let diff = Math.abs(wallAngle - c);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestCardinal = c;
      }
    }

    const toleranceRad = (WALL_ANGLE_TOLERANCE * Math.PI) / 180;
    if (bestDiff > toleranceRad) {
      console.log(
        `[RoomAlignment] ⚠ Wall angle diff ${((bestDiff * 180) / Math.PI).toFixed(1)}° > tolerance ${WALL_ANGLE_TOLERANCE}° — wall match failed`,
      );
      scanSystem.addHUDLine(
        `⚠ Wall Δ=${((bestDiff * 180) / Math.PI).toFixed(0)}° too large`,
      );
      return false;
    }

    // Compute rotation: rotate model so LabPlan cardinal aligns with real wall
    const rotationY = wallAngle - bestCardinal;

    // Apply rotation around current position (user stays inside)
    const camPos =
      this.renderer.xr.getCamera()?.position.clone() ?? new Vector3(0, 1.6, 0);

    // Rotate around the user's XZ position so they stay inside
    this.rotateAroundPoint(roomModel, camPos as any, rotationY);

    console.log(
      `[RoomAlignment] ✅ Wall matched: wall angle=${((wallAngle * 180) / Math.PI).toFixed(1)}° ` +
        `cardinal=${((bestCardinal * 180) / Math.PI).toFixed(0)}° ` +
        `rotation=${((rotationY * 180) / Math.PI).toFixed(1)}° ` +
        `(longest wall: ${bestWall.length.toFixed(2)}m)`,
    );
    scanSystem.addHUDLine(
      `✅ Wall: rot=${((rotationY * 180) / Math.PI).toFixed(0)}°`,
    );
    return true;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Step 4: Corner-based alignment (mesh vertex fallback)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Extracts room corners from all mesh/plane vertices via convex hull,
   * finds the longest edge (dominant wall direction), and rotates LabPlan
   * so its axis-aligned walls match that edge direction.
   *
   * This works even when no semantic wall labels are available.
   */
  private tryCornerAlignment(
    roomModel: Object3D,
    camPos: Vector3,
    scanSystem: RoomScanningSystem,
  ): boolean {
    const corners = scanSystem.getRoomCorners();
    if (corners.length < 3) {
      console.log("[RoomAlignment] ⚠ Not enough corners for alignment");
      scanSystem.addHUDLine("⚠ Not enough corners");
      return false;
    }

    console.log(
      `[RoomAlignment] Corner-based alignment: ${corners.length} corners detected`,
    );

    // Find the longest edge — this is the most reliable wall direction
    let longestLen = 0;
    let longestAngle = 0;

    for (let i = 0; i < corners.length; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % corners.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.sqrt(dx * dx + dz * dz);

      if (len > longestLen) {
        longestLen = len;
        // Edge direction angle in XZ plane
        longestAngle = Math.atan2(dz, dx);
      }
    }

    if (longestLen < 0.5) {
      console.log("[RoomAlignment] ⚠ Longest edge too short — unreliable");
      scanSystem.addHUDLine("⚠ Corners too close together");
      return false;
    }

    // LabPlan has walls along cardinal axes.
    // The scanned longest edge corresponds to one of LabPlan's walls.
    // Find which cardinal direction (0°, 90°, 180°, -90°) is closest
    // and compute the rotation needed.
    const cardinals = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    let bestCardinal = 0;
    let bestDiff = Infinity;

    for (const c of cardinals) {
      let diff = Math.abs(longestAngle - c);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDiff) {
        bestDiff = diff;
        bestCardinal = c;
      }
    }

    // Rotation needed to align LabPlan cardinal to scanned edge direction
    const rotationY = longestAngle - bestCardinal;

    // Only apply if the correction is meaningful (> 1°)
    if (Math.abs(rotationY) < (1 * Math.PI) / 180) {
      console.log(
        "[RoomAlignment] ✅ Corners confirm LabPlan already aligned (< 1°)",
      );
      scanSystem.addHUDLine("✅ Corners: already aligned");
      return true;
    }

    // Apply rotation around user position
    this.rotateAroundPoint(roomModel, camPos, rotationY);

    console.log(
      `[RoomAlignment] ✅ Corner alignment: edge=${longestLen.toFixed(2)}m ` +
        `angle=${((longestAngle * 180) / Math.PI).toFixed(1)}° ` +
        `cardinal=${((bestCardinal * 180) / Math.PI).toFixed(0)}° ` +
        `rotation=${((rotationY * 180) / Math.PI).toFixed(1)}°`,
    );
    scanSystem.addHUDLine(
      `✅ Corner: rot=${((rotationY * 180) / Math.PI).toFixed(0)}° edge=${longestLen.toFixed(1)}m`,
    );
    return true;
  }

  private tryFitToRoom(
    roomModel: Object3D,
    camPos: Vector3,
    scanSystem: RoomScanningSystem,
  ): void {
    // Estimate real room bounds from detected planes and meshes
    const roomBounds = this.estimateRoomBounds();
    if (!roomBounds) {
      console.log(
        "[RoomAlignment] ⚠ Cannot estimate room bounds — keeping model as-is",
      );
      scanSystem.addHUDLine("⚠ No room bounds for fit");
      return;
    }

    const realWidth = roomBounds.max.x - roomBounds.min.x;
    const realDepth = roomBounds.max.z - roomBounds.min.z;

    console.log(
      `[RoomAlignment] Estimated real room: ${realWidth.toFixed(1)}m × ${realDepth.toFixed(1)}m ` +
        `(LabPlan: ${LAB_WIDTH}m × ${LAB_DEPTH}m)`,
    );

    // Only scale down if we need to — never scale up beyond 1:1
    const scaleX = Math.min(1, realWidth / LAB_WIDTH);
    const scaleZ = Math.min(1, realDepth / LAB_DEPTH);
    const uniformScale = Math.min(scaleX, scaleZ);

    if (uniformScale >= 0.95) {
      console.log("[RoomAlignment] Room is large enough — no scaling needed");
      scanSystem.addHUDLine("✅ Room fits at 1:1");
      return;
    }

    if (uniformScale < 0.3) {
      console.log(
        "[RoomAlignment] ⚠ Scale too small (<0.3) — likely bad data, skipping",
      );
      scanSystem.addHUDLine("⚠ Scale too small, skipped");
      return;
    }

    // Scale from user position so they stay inside
    this.scaleAroundPoint(roomModel, camPos, uniformScale);

    console.log(
      `[RoomAlignment] ✅ Scaled to fit: ${(uniformScale * 100).toFixed(0)}%`,
    );
    scanSystem.addHUDLine(`✅ Fit: scale=${(uniformScale * 100).toFixed(0)}%`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Helpers
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** Rotate model around a world-space point (in XZ, Y rotation) */
  private rotateAroundPoint(
    model: Object3D,
    pivot: Vector3,
    angle: number,
  ): void {
    // Translate model so pivot is at origin
    const dx = model.position.x - pivot.x;
    const dz = model.position.z - pivot.z;

    // Rotate offset
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const newDx = dx * cos - dz * sin;
    const newDz = dx * sin + dz * cos;

    model.position.x = pivot.x + newDx;
    model.position.z = pivot.z + newDz;
    model.rotation.y += angle;
  }

  /** Scale model around a world-space point so that point stays fixed */
  private scaleAroundPoint(
    model: Object3D,
    pivot: Vector3,
    scale: number,
  ): void {
    const oldScale = model.scale.x; // uniform
    const newScale = oldScale * scale;

    // Offset from pivot scales proportionally
    model.position.x = pivot.x + (model.position.x - pivot.x) * scale;
    model.position.z = pivot.z + (model.position.z - pivot.z) * scale;
    model.position.y = model.position.y * scale; // floor also scales

    model.scale.setScalar(newScale);
  }

  /** Estimate real-world room bounds from all detected planes and meshes */
  private estimateRoomBounds(): { min: Vector3; max: Vector3 } | null {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    let found = false;

    // From planes
    for (const entity of this.queries.planes.entities) {
      if (entity.object3D) {
        const pos = new Vector3();
        entity.object3D.getWorldPosition(pos as any);
        min.min(pos);
        max.max(pos);
        found = true;
      }
    }

    // From meshes
    for (const entity of this.queries.meshes.entities) {
      if (entity.object3D) {
        const pos = new Vector3();
        entity.object3D.getWorldPosition(pos as any);
        min.min(pos);
        max.max(pos);
        found = true;
      }
    }

    if (!found) return null;

    // Sanity check: room should be at least 1m in each direction
    if (max.x - min.x < 1 || max.z - min.z < 1) {
      return null;
    }

    return { min, max };
  }
}
