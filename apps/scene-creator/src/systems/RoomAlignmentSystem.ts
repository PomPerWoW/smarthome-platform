import { createSystem, XRPlane, Entity } from "@iwsdk/core";
import { Object3D, Vector3 } from "three";

/**
 * DetectedPlane — an XR-detected plane with computed world-space properties.
 */
interface DetectedPlane {
  orientation: "horizontal" | "vertical" | "unknown";
  worldPosition: Vector3;
  worldNormal: Vector3;
  /** Polygon vertices in world space */
  worldVertices: Vector3[];
  /** Length of the longest edge (for walls: wall length) */
  length: number;
  /** For horizontal planes: is it likely a ceiling? */
  isCeiling: boolean;
}

/**
 * ModelWall — a known wall from the LabPlan model.
 */
interface ModelWall {
  /** Wall length in model space (meters) */
  length: number;
  /** Normal direction in model space (unit vector in XZ) */
  normal: Vector3;
  /** Center position of the wall in model space */
  center: Vector3;
  /** Label for debugging */
  label: string;
}

/**
 * WallMatch — a pairing between a detected XR wall and a model wall.
 */
interface WallMatch {
  xrWall: DetectedPlane;
  modelWall: ModelWall;
  lengthDiff: number;
}

// ─── LabPlan Model Reference Geometry ────────────────────────────
// From LabPlan.gltf analysis:
//   Floor: X:[0, 9], Z:[-10.5, 0], Y=0
//   Ceiling: Y ≈ 2.78
//   Walls: perimeter of the floor rectangle

const MODEL_WALLS: ModelWall[] = [
  {
    label: "North (Z=0)",
    length: 9.0,
    normal: new Vector3(0, 0, 1),      // faces +Z
    center: new Vector3(4.5, 1.39, 0),
  },
  {
    label: "South (Z=-10.5)",
    length: 9.0,
    normal: new Vector3(0, 0, -1),     // faces -Z
    center: new Vector3(4.5, 1.39, -10.5),
  },
  {
    label: "East (X=9)",
    length: 10.5,
    normal: new Vector3(1, 0, 0),      // faces +X
    center: new Vector3(9.0, 1.39, -5.25),
  },
  {
    label: "West (X=0)",
    length: 10.5,
    normal: new Vector3(-1, 0, 0),     // faces -X
    center: new Vector3(0, 1.39, -5.25),
  },
];

const MODEL_FLOOR_Y = 0;
const MODEL_CEILING_Y = 2.78;
const MODEL_ROOM_HEIGHT = MODEL_CEILING_Y - MODEL_FLOOR_Y; // 2.78m
const MODEL_FLOOR_CENTER = new Vector3(4.5, 0, -5.25);

/** Maximum length difference (meters) to consider a wall match valid */
const MAX_LENGTH_DIFF = 1.5;
/** Maximum height difference (meters) to consider ceiling match valid */
const MAX_HEIGHT_DIFF = 0.5;

/**
 * RoomAlignmentSystem — Dimension-Matching Approach
 *
 * Aligns the LabPlan 3D model to the real room by:
 * 1. Detecting floor + ceiling → verify room height matches (2.78m)
 * 2. Detecting walls → compare wall lengths to model walls (9m and 10.5m)
 * 3. Matching detected walls to model walls by nearest length
 * 4. Computing rotation from matched wall normals
 * 5. Computing translation from matched wall positions
 *
 * Standing/sitting handling:
 * - Floor/ceiling positions come from LiDAR plane detection, NOT head height
 * - So they're absolute and unaffected by user posture
 * - The camera Y (head) is irrelevant for alignment
 */
export class RoomAlignmentSystem extends createSystem({
  planes: { required: [XRPlane] },
}) {
  // ── Configuration ────────────────────────────────────────────────
  public roomModel: Object3D | null = null;
  private modelScale = 0.5;

  /** Minimum planes needed */
  private readonly MIN_WALL_PLANES = 2;
  private readonly ALIGNMENT_TIMEOUT = 10; // seconds

  // ── State ─────────────────────────────────────────────────────────
  private aligned = false;
  private collecting = false;
  private collectTimer = 0;
  private detectedFloors: DetectedPlane[] = [];
  private detectedCeilings: DetectedPlane[] = [];
  private detectedWalls: DetectedPlane[] = [];

  init(): void {
    console.log("[RoomAlignment] System initialized — dimension-matching mode");

    // Grab room model reference from globalThis (set by index.ts)
    const labModel = (globalThis as any).__labRoomModel;
    if (labModel) {
      this.roomModel = labModel as Object3D;
      console.log("[RoomAlignment] Room model reference acquired");
    } else {
      console.warn("[RoomAlignment] No room model found on globalThis.__labRoomModel");
    }

    // Subscribe to plane detection
    this.queries.planes.subscribe("qualify", (entity: Entity) => {
      if (this.aligned) return;
      this.onPlaneDetected(entity);
    });

    // XR session lifecycle
    this.renderer.xr.addEventListener("sessionstart", () => {
      console.log("[RoomAlignment] XR session started — collecting planes");
      this.aligned = false;
      this.collecting = true;
      this.collectTimer = 0;
      this.detectedFloors = [];
      this.detectedCeilings = [];
      this.detectedWalls = [];
    });

    this.renderer.xr.addEventListener("sessionend", () => {
      this.collecting = false;
      this.aligned = false;
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Plane detection
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private onPlaneDetected(entity: Entity): void {
    try {
      const planeData = entity.getValue(XRPlane, "_plane") as any;
      const orientation: string = planeData?.orientation ?? "unknown";

      if (!entity.object3D || !planeData?.polygon) return;

      entity.object3D.updateWorldMatrix(true, false);
      const worldMatrix = entity.object3D.matrixWorld as any;

      // Transform polygon to world space
      const polygon: DOMPointReadOnly[] = planeData.polygon;
      const worldVertices: Vector3[] = polygon.map((pt: DOMPointReadOnly) => {
        const v = new Vector3(pt.x, pt.y, pt.z);
        v.applyMatrix4(worldMatrix);
        return v;
      });

      // Compute centroid
      const centroid = new Vector3();
      for (const v of worldVertices) centroid.add(v);
      centroid.divideScalar(worldVertices.length);

      // Compute normal
      let normal = new Vector3(0, 1, 0);
      if (worldVertices.length >= 3) {
        const e1 = new Vector3().subVectors(worldVertices[1], worldVertices[0]);
        const e2 = new Vector3().subVectors(worldVertices[2], worldVertices[0]);
        normal = new Vector3().crossVectors(e1, e2).normalize();
      }

      // Compute longest edge length (approximate plane length)
      let maxEdgeLen = 0;
      for (let i = 0; i < worldVertices.length; i++) {
        const next = (i + 1) % worldVertices.length;
        const edgeLen = worldVertices[i].distanceTo(worldVertices[next]);
        maxEdgeLen = Math.max(maxEdgeLen, edgeLen);
      }

      const detected: DetectedPlane = {
        orientation: orientation as DetectedPlane["orientation"],
        worldPosition: centroid,
        worldNormal: normal,
        worldVertices,
        length: maxEdgeLen,
        isCeiling: false,
      };

      if (orientation === "horizontal") {
        // Distinguish floor from ceiling by Y height
        // Floor is typically Y < 0.5 (near ground level)
        // Ceiling is typically Y > 2.0
        if (centroid.y > 1.5) {
          detected.isCeiling = true;
          this.detectedCeilings.push(detected);
          console.log(
            `[RoomAlignment] 🔼 Ceiling detected at Y=${centroid.y.toFixed(2)} ` +
            `(${this.detectedFloors.length}F, ${this.detectedCeilings.length}C, ${this.detectedWalls.length}W)`
          );
        } else {
          this.detectedFloors.push(detected);
          console.log(
            `[RoomAlignment] 🔽 Floor detected at Y=${centroid.y.toFixed(2)} ` +
            `(${this.detectedFloors.length}F, ${this.detectedCeilings.length}C, ${this.detectedWalls.length}W)`
          );
        }
      } else if (orientation === "vertical") {
        this.detectedWalls.push(detected);
        console.log(
          `[RoomAlignment] 🧱 Wall detected | length=${maxEdgeLen.toFixed(2)}m ` +
          `normal=(${normal.x.toFixed(2)}, ${normal.z.toFixed(2)}) ` +
          `(${this.detectedFloors.length}F, ${this.detectedCeilings.length}C, ${this.detectedWalls.length}W)`
        );
      }

      this.tryAlign();
    } catch (err) {
      console.warn("[RoomAlignment] Error processing plane:", err);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Update loop
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  update(dt: number): void {
    if (!this.collecting || this.aligned) return;

    this.collectTimer += dt;
    if (this.collectTimer >= this.ALIGNMENT_TIMEOUT) {
      console.log("[RoomAlignment] ⏰ Timeout — attempting alignment with available data");
      this.tryAlign(true);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Alignment: Dimension Matching
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private tryAlign(force = false): void {
    if (this.aligned) return;
    if (!this.roomModel) {
      console.warn("[RoomAlignment] No room model — cannot align");
      return;
    }

    const hasFloor = this.detectedFloors.length >= 1;
    const hasWalls = this.detectedWalls.length >= this.MIN_WALL_PLANES;

    if (!force && (!hasFloor || !hasWalls)) return;
    if (this.detectedFloors.length === 0 && this.detectedWalls.length === 0) {
      console.warn("[RoomAlignment] No planes at all — cannot align");
      return;
    }

    console.log(
      `[RoomAlignment] 🔧 Dimension-matching alignment ` +
      `(${this.detectedFloors.length}F, ${this.detectedCeilings.length}C, ${this.detectedWalls.length}W)...`
    );

    // ── Step 1: Floor & Ceiling Heights ──────────────────────────
    const floorY = this.computeFloorY();
    const ceilingY = this.computeCeilingY();
    const roomHeight = ceilingY !== null ? (ceilingY - floorY) : null;

    console.log(`[RoomAlignment]   Floor Y = ${floorY.toFixed(3)}`);
    if (ceilingY !== null) {
      console.log(`[RoomAlignment]   Ceiling Y = ${ceilingY.toFixed(3)}`);
      console.log(
        `[RoomAlignment]   Room height = ${roomHeight!.toFixed(2)}m ` +
        `(model: ${MODEL_ROOM_HEIGHT.toFixed(2)}m, diff: ${Math.abs(roomHeight! - MODEL_ROOM_HEIGHT).toFixed(2)}m)`
      );

      if (Math.abs(roomHeight! - MODEL_ROOM_HEIGHT) > MAX_HEIGHT_DIFF) {
        console.warn(
          `[RoomAlignment] ⚠️ Room height mismatch! ` +
          `Detected ${roomHeight!.toFixed(2)}m vs model ${MODEL_ROOM_HEIGHT.toFixed(2)}m ` +
          `(diff > ${MAX_HEIGHT_DIFF}m threshold). Proceeding with caution.`
        );
      } else {
        console.log(`[RoomAlignment]   ✅ Room height matches model`);
      }
    } else {
      console.log(`[RoomAlignment]   No ceiling detected — skipping height verification`);
    }

    // ── Step 2: Match walls by length ────────────────────────────
    const matches = this.matchWallsByLength();

    if (matches.length === 0 && !force) {
      console.log("[RoomAlignment]   No wall matches found yet — waiting for more data");
      return;
    }

    if (matches.length > 0) {
      console.log(`[RoomAlignment]   ${matches.length} wall match(es):`);
      for (const m of matches) {
        console.log(
          `[RoomAlignment]     XR wall ${m.xrWall.length.toFixed(2)}m → ` +
          `Model "${m.modelWall.label}" ${m.modelWall.length.toFixed(2)}m ` +
          `(diff: ${m.lengthDiff.toFixed(2)}m)`
        );
      }
    }

    // ── Step 3: Compute rotation from matched walls ──────────────
    const rotationY = this.computeRotationFromMatches(matches);
    console.log(`[RoomAlignment]   Rotation = ${(rotationY * 180 / Math.PI).toFixed(1)}°`);

    // ── Step 4: Compute translation ──────────────────────────────
    const translation = this.computeTranslationFromMatches(matches, floorY, rotationY);
    console.log(
      `[RoomAlignment]   Translation = (${translation.x.toFixed(2)}, ${translation.y.toFixed(2)}, ${translation.z.toFixed(2)})`
    );

    // ── Step 5: Apply transform ──────────────────────────────────
    this.roomModel.scale.setScalar(this.modelScale);
    this.roomModel.rotation.y = rotationY;
    this.roomModel.position.copy(translation);

    console.log("[RoomAlignment] ✅ Room model aligned via dimension matching!");
    this.aligned = true;
    this.collecting = false;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Height computation
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** Floor Y = lowest horizontal plane Y. Independent of user posture (LiDAR-based). */
  private computeFloorY(): number {
    if (this.detectedFloors.length === 0) return 0;

    let lowestY = Infinity;
    for (const floor of this.detectedFloors) {
      if (floor.worldPosition.y < lowestY) {
        lowestY = floor.worldPosition.y;
      }
    }
    return lowestY;
  }

  /** Ceiling Y = highest horizontal plane Y, or null if no ceiling detected. */
  private computeCeilingY(): number | null {
    if (this.detectedCeilings.length === 0) return null;

    let highestY = -Infinity;
    for (const ceiling of this.detectedCeilings) {
      if (ceiling.worldPosition.y > highestY) {
        highestY = ceiling.worldPosition.y;
      }
    }
    return highestY;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Wall matching by dimensions
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Match detected XR walls to model walls by comparing wall lengths.
   *
   * For each XR wall, find the model wall with the closest length.
   * A match is only valid if the difference is within MAX_LENGTH_DIFF.
   *
   * We also group XR walls by direction (parallel walls should match the
   * same model wall pair, e.g., both 9m walls face N/S).
   */
  private matchWallsByLength(): WallMatch[] {
    const matches: WallMatch[] = [];
    const usedModelWalls = new Set<string>();

    // Sort XR walls by length descending (biggest walls first = most reliable)
    const sortedXR = [...this.detectedWalls].sort((a, b) => b.length - a.length);

    for (const xrWall of sortedXR) {
      let bestMatch: { modelWall: ModelWall; diff: number } | null = null;

      for (const modelWall of MODEL_WALLS) {
        // Skip if this specific model wall is already matched
        if (usedModelWalls.has(modelWall.label)) continue;

        // Compare length (model lengths are in full scale, XR lengths are real-world)
        const diff = Math.abs(xrWall.length - modelWall.length);

        if (diff <= MAX_LENGTH_DIFF) {
          if (!bestMatch || diff < bestMatch.diff) {
            bestMatch = { modelWall, diff };
          }
        }
      }

      if (bestMatch) {
        matches.push({
          xrWall,
          modelWall: bestMatch.modelWall,
          lengthDiff: bestMatch.diff,
        });
        usedModelWalls.add(bestMatch.modelWall.label);
      }
    }

    return matches;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Rotation from matched walls
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Compute Y-axis rotation by comparing the normal directions
   * of matched XR walls to their corresponding model walls.
   */
  private computeRotationFromMatches(matches: WallMatch[]): number {
    if (matches.length === 0) {
      // Fallback: use simple dominant wall angle (like v1)
      return this.computeWallRotationFallback();
    }

    // For each match, compute the angle difference between
    // XR wall normal and model wall normal
    const angleDeltas: number[] = [];

    for (const match of matches) {
      const xrAngle = Math.atan2(match.xrWall.worldNormal.z, match.xrWall.worldNormal.x);
      const modelAngle = Math.atan2(match.modelWall.normal.z, match.modelWall.normal.x);

      let delta = xrAngle - modelAngle;

      // Normalize to [-π, π]
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;

      angleDeltas.push(delta);
    }

    // Average the angle deltas (they should all be similar if matches are correct)
    let sumSin = 0, sumCos = 0;
    for (const d of angleDeltas) {
      sumSin += Math.sin(d);
      sumCos += Math.cos(d);
    }
    const avgDelta = Math.atan2(sumSin / angleDeltas.length, sumCos / angleDeltas.length);

    console.log(
      `[RoomAlignment]   Angle deltas: [${angleDeltas.map(d => (d * 180 / Math.PI).toFixed(1) + "°").join(", ")}] → avg: ${(avgDelta * 180 / Math.PI).toFixed(1)}°`
    );

    return avgDelta;
  }

  /** Fallback: cluster wall normals like v1 */
  private computeWallRotationFallback(): number {
    if (this.detectedWalls.length === 0) return 0;

    const angles: number[] = [];
    for (const wall of this.detectedWalls) {
      const nx = wall.worldNormal.x;
      const nz = wall.worldNormal.z;
      const len = Math.sqrt(nx * nx + nz * nz);
      if (len < 0.1) continue;

      let angle = Math.atan2(nz, nx);
      if (angle < 0) angle += Math.PI;
      if (angle >= Math.PI) angle -= Math.PI;
      angles.push(angle);
    }

    if (angles.length === 0) return 0;

    // Simple average
    let sum = 0;
    for (const a of angles) sum += a;
    const avgAngle = sum / angles.length;

    const MODEL_WALL_NORMAL_ANGLE = Math.PI / 2;
    let rotation = avgAngle - MODEL_WALL_NORMAL_ANGLE;
    while (rotation > Math.PI) rotation -= 2 * Math.PI;
    while (rotation < -Math.PI) rotation += 2 * Math.PI;

    return rotation;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Translation from matched walls
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Compute translation by:
   * 1. If we have matched walls: use wall positions for precise XZ alignment
   * 2. Otherwise: use floor centroid fallback
   */
  private computeTranslationFromMatches(
    matches: WallMatch[],
    floorY: number,
    rotationY: number,
  ): Vector3 {
    if (matches.length >= 2) {
      // Use wall positions for precise alignment
      return this.computeTranslationFromWallPositions(matches, floorY, rotationY);
    }

    if (matches.length === 1) {
      // One wall match + floor centroid for the other axis
      return this.computeTranslationFromOneWall(matches[0], floorY, rotationY);
    }

    // Fallback: floor centroid
    return this.computeTranslationFromFloorCentroid(floorY, rotationY);
  }

  /**
   * With ≥2 wall matches, we can compute precise XZ position
   * by solving where the model walls must be to match the XR wall positions.
   */
  private computeTranslationFromWallPositions(
    matches: WallMatch[],
    floorY: number,
    rotationY: number,
  ): Vector3 {
    // For each matched wall:
    //   The XR wall's position (projected onto its normal axis) tells us
    //   where the model wall's center should be in world space.
    //
    // We accumulate constraints and average them.
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);

    let sumTx = 0, sumTz = 0;
    let countTx = 0, countTz = 0;

    for (const match of matches) {
      // Model wall center in scaled + rotated space (before translation)
      const mc = match.modelWall.center.clone().multiplyScalar(this.modelScale);
      const rotatedX = mc.x * cos - mc.z * sin;
      const rotatedZ = mc.x * sin + mc.z * cos;

      // XR wall position along its normal axis
      const xrPos = match.xrWall.worldPosition;

      // Model wall normal in rotated space
      const mn = match.modelWall.normal;
      const rotatedNx = mn.x * cos - mn.z * sin;
      const rotatedNz = mn.x * sin + mn.z * cos;

      // The wall normal tells us which axis this wall constrains.
      // If the normal is primarily along X, this wall constrains the X translation.
      // If primarily along Z, constrains Z translation.
      if (Math.abs(rotatedNx) > Math.abs(rotatedNz)) {
        // This wall constrains X: xrPos.x = rotatedX + tx
        const tx = xrPos.x - rotatedX;
        sumTx += tx;
        countTx++;
      } else {
        // This wall constrains Z: xrPos.z = rotatedZ + tz
        const tz = xrPos.z - rotatedZ;
        sumTz += tz;
        countTz++;
      }
    }

    const tx = countTx > 0 ? sumTx / countTx : 0;
    const tz = countTz > 0 ? sumTz / countTz : 0;

    // If we only got constraints on one axis, use floor centroid for the other
    if (countTx === 0 || countTz === 0) {
      const floorFallback = this.computeTranslationFromFloorCentroid(floorY, rotationY);
      return new Vector3(
        countTx > 0 ? tx : floorFallback.x,
        floorY,
        countTz > 0 ? tz : floorFallback.z,
      );
    }

    return new Vector3(tx, floorY, tz);
  }

  /**
   * With 1 wall match, use that wall for one axis and floor centroid for the other.
   */
  private computeTranslationFromOneWall(
    match: WallMatch,
    floorY: number,
    rotationY: number,
  ): Vector3 {
    const fallback = this.computeTranslationFromFloorCentroid(floorY, rotationY);
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);

    const mc = match.modelWall.center.clone().multiplyScalar(this.modelScale);
    const rotatedX = mc.x * cos - mc.z * sin;
    const rotatedZ = mc.x * sin + mc.z * cos;

    const mn = match.modelWall.normal;
    const rotatedNx = mn.x * cos - mn.z * sin;
    const rotatedNz = mn.x * sin + mn.z * cos;

    const xrPos = match.xrWall.worldPosition;

    if (Math.abs(rotatedNx) > Math.abs(rotatedNz)) {
      return new Vector3(xrPos.x - rotatedX, floorY, fallback.z);
    } else {
      return new Vector3(fallback.x, floorY, xrPos.z - rotatedZ);
    }
  }

  /**
   * Floor centroid fallback — matches model floor center to XR floor center.
   */
  private computeTranslationFromFloorCentroid(floorY: number, rotationY: number): Vector3 {
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);

    const sc = MODEL_FLOOR_CENTER.clone().multiplyScalar(this.modelScale);
    const rx = sc.x * cos - sc.z * sin;
    const rz = sc.x * sin + sc.z * cos;

    // Compute XR floor centroid
    const xrCenter = new Vector3();
    let count = 0;
    for (const floor of this.detectedFloors) {
      for (const v of floor.worldVertices) {
        xrCenter.x += v.x;
        xrCenter.z += v.z;
        count++;
      }
    }
    if (count > 0) {
      xrCenter.x /= count;
      xrCenter.z /= count;
    }

    return new Vector3(xrCenter.x - rx, floorY, xrCenter.z - rz);
  }
}
