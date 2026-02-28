import { createSystem, XRPlane, XRMesh, Entity } from "@iwsdk/core";
import { Object3D, Vector3, Quaternion } from "three";
import type {
  DetectedPlane,
  MeshWallInfo,
  MeshFloorInfo,
  ModelWall,
  WallMatch,
  AlignmentConfidence,
} from "../types";

// ─── LabPlan Model Reference Geometry ────────────────────────────
// From LabPlan.gltf analysis:
//   Floor: X:[0, 9], Z:[-10.5, 0], Y=0
//   Ceiling: Y ≈ 2.78
//   Walls: perimeter of the floor rectangle

const MODEL_WALLS: ModelWall[] = [
  {
    label: "North (Z=0)",
    length: 9.0,
    normal: new Vector3(0, 0, 1),
    center: new Vector3(4.5, 1.39, 0),
  },
  {
    label: "South (Z=-10.5)",
    length: 9.0,
    normal: new Vector3(0, 0, -1),
    center: new Vector3(4.5, 1.39, -10.5),
  },
  {
    label: "East (X=9)",
    length: 10.5,
    normal: new Vector3(1, 0, 0),
    center: new Vector3(9.0, 1.39, -5.25),
  },
  {
    label: "West (X=0)",
    length: 10.5,
    normal: new Vector3(-1, 0, 0),
    center: new Vector3(0, 1.39, -5.25),
  },
];

const MODEL_FLOOR_Y = 0;
const MODEL_CEILING_Y = 2.78;
const MODEL_ROOM_HEIGHT = MODEL_CEILING_Y - MODEL_FLOOR_Y; // 2.78m
const MODEL_FLOOR_CENTER = new Vector3(4.5, 0, -5.25);

const MAX_LENGTH_DIFF = 1.5;
const MAX_HEIGHT_DIFF = 0.5;

export class RoomAlignmentSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  // ── Configuration ────────────────────────────────────────────────
  public roomModel: Object3D | null = null;
  private modelScale = 0.5;

  private readonly MIN_WALL_SIGNALS = 2;
  private readonly ALIGNMENT_TIMEOUT = 10; // seconds
  /** After initial alignment, continue improving for this many seconds */
  private readonly REFINEMENT_WINDOW = 5;

  // ── State ─────────────────────────────────────────────────────────
  private aligned = false;
  private collecting = false;
  private collectTimer = 0;
  private refinementTimer = 0;
  private lastConfidence: AlignmentConfidence = "low";

  // Plane-based detections
  private detectedFloors: DetectedPlane[] = [];
  private detectedCeilings: DetectedPlane[] = [];
  private detectedWalls: DetectedPlane[] = [];

  // Mesh-based detections
  private meshWalls: MeshWallInfo[] = [];
  private meshFloors: MeshFloorInfo[] = [];

  // Anchor persistence
  private anchorCreated = false;

  init(): void {
    console.log(
      "[RoomAlignment] System initialized — enhanced scene-understanding mode",
    );

    // Grab room model reference from globalThis (set by index.ts)
    const labModel = (globalThis as any).__labRoomModel;
    if (labModel) {
      this.roomModel = labModel as Object3D;
      console.log("[RoomAlignment] Room model reference acquired");
    } else {
      console.warn(
        "[RoomAlignment] No room model found on globalThis.__labRoomModel",
      );
    }

    // ── Plane detection ───────────────────────────────────────────
    this.queries.planes.subscribe("qualify", (entity: Entity) => {
      this.onPlaneDetected(entity);
    });

    // ── Mesh detection (semantic) ─────────────────────────────────
    this.queries.meshes.subscribe("qualify", (entity: Entity) => {
      this.onMeshDetected(entity);
    });

    // ── XR session lifecycle ──────────────────────────────────────
    this.renderer.xr.addEventListener("sessionstart", () => {
      console.log(
        "[RoomAlignment] XR session started — collecting planes + meshes",
      );
      this.resetState();
    });

    this.renderer.xr.addEventListener("sessionend", () => {
      this.collecting = false;
      this.aligned = false;
      this.anchorCreated = false;
    });

    // ── Expose realign function globally ───────────────────────────
    (globalThis as any).__realignRoom = () => this.realign();
    console.log(
      "[RoomAlignment] 💡 Call __realignRoom() to force re-alignment",
    );
  }

  /** Public method to force re-alignment */
  public realign(): void {
    console.log("[RoomAlignment] 🔄 Manual re-alignment triggered");
    this.aligned = false;
    this.collecting = true;
    this.collectTimer = 0;
    this.refinementTimer = 0;
    this.anchorCreated = false;
    this.tryAlign(true);
  }

  private resetState(): void {
    this.aligned = false;
    this.collecting = true;
    this.collectTimer = 0;
    this.refinementTimer = 0;
    this.anchorCreated = false;
    this.detectedFloors = [];
    this.detectedCeilings = [];
    this.detectedWalls = [];
    this.meshWalls = [];
    this.meshFloors = [];
    this.lastConfidence = "low";
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Plane detection
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private onPlaneDetected(entity: Entity): void {
    if (!this.collecting && !this.aligned) return;
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

      // Compute normal from first 3 vertices
      let normal = new Vector3(0, 1, 0);
      if (worldVertices.length >= 3) {
        const e1 = new Vector3().subVectors(worldVertices[1], worldVertices[0]);
        const e2 = new Vector3().subVectors(worldVertices[2], worldVertices[0]);
        normal = new Vector3().crossVectors(e1, e2).normalize();
      }

      // Compute longest edge length
      let maxEdgeLen = 0;
      for (let i = 0; i < worldVertices.length; i++) {
        const next = (i + 1) % worldVertices.length;
        const edgeLen = worldVertices[i].distanceTo(worldVertices[next]);
        maxEdgeLen = Math.max(maxEdgeLen, edgeLen);
      }

      // Get semantic label if available (Quest 3 provides this)
      const semanticLabel: string | undefined = planeData.semanticLabel;

      const detected: DetectedPlane = {
        orientation: orientation as DetectedPlane["orientation"],
        worldPosition: centroid,
        worldNormal: normal,
        worldVertices,
        length: maxEdgeLen,
        isCeiling: false,
        semanticLabel,
      };

      // Classify: use semantic label first, then fall back to heuristics
      if (
        semanticLabel === "ceiling" ||
        (orientation === "horizontal" && centroid.y > 1.5)
      ) {
        detected.isCeiling = true;
        this.detectedCeilings.push(detected);
        console.log(
          `[RoomAlignment] 🔼 Ceiling plane at Y=${centroid.y.toFixed(2)} ` +
            `(${semanticLabel ? `label: ${semanticLabel}` : "heuristic"}) ` +
            this.signalSummary(),
        );
      } else if (
        semanticLabel === "floor" ||
        (orientation === "horizontal" && centroid.y <= 1.5)
      ) {
        this.detectedFloors.push(detected);
        console.log(
          `[RoomAlignment] 🔽 Floor plane at Y=${centroid.y.toFixed(2)} ` +
            `(${semanticLabel ? `label: ${semanticLabel}` : "heuristic"}) ` +
            this.signalSummary(),
        );
      } else if (orientation === "vertical" || semanticLabel === "wall") {
        this.detectedWalls.push(detected);
        console.log(
          `[RoomAlignment] 🧱 Wall plane | len=${maxEdgeLen.toFixed(2)}m ` +
            `normal=(${normal.x.toFixed(2)}, ${normal.z.toFixed(2)}) ` +
            `${semanticLabel ? `label: ${semanticLabel}` : ""} ` +
            this.signalSummary(),
        );
      }

      this.tryAlign();
    } catch (err) {
      console.warn("[RoomAlignment] Error processing plane:", err);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Mesh detection (semantic)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private onMeshDetected(entity: Entity): void {
    if (!this.collecting && !this.aligned) return;
    try {
      const isBounded = entity.getValue(XRMesh, "isBounded3D") as boolean;
      const semanticLabel =
        (entity.getValue(XRMesh, "semanticLabel") as string) || "unknown";
      const dimensions = entity.getValue(XRMesh, "dimensions") as
        | [number, number, number]
        | undefined;

      if (!entity.object3D) return;
      const obj3D = entity.object3D as any;
      obj3D.updateWorldMatrix(true, false);
      const worldPos = new Vector3();
      obj3D.getWorldPosition(worldPos);

      const label = semanticLabel.toLowerCase();

      // ── Wall meshes ──────────────────────────────────────────────
      if (label === "wall" && isBounded) {
        // Extract wall info from mesh
        const worldQuat = new Quaternion();
        obj3D.getWorldQuaternion(worldQuat);

        // Wall normal: typically the local Z axis rotated to world
        const localNormal = new Vector3(0, 0, 1);
        localNormal.applyQuaternion(worldQuat).normalize();

        // Wall length from dimensions (width is usually the longest horizontal extent)
        let wallLength = 1.0;
        if (dimensions) {
          // dimensions = [width, height, depth] — wall length ≈ max(width, depth)
          wallLength = Math.max(dimensions[0], dimensions[2]);
        }

        const wallInfo: MeshWallInfo = {
          worldPosition: worldPos,
          worldNormal: localNormal,
          length: wallLength,
          dimensions,
        };
        this.meshWalls.push(wallInfo);

        console.log(
          `[RoomAlignment] 🧱📦 Wall MESH | len≈${wallLength.toFixed(2)}m ` +
            `normal=(${localNormal.x.toFixed(2)}, ${localNormal.z.toFixed(2)}) ` +
            `pos=(${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}) ` +
            this.signalSummary(),
        );

        this.tryAlign();
      }

      // ── Floor meshes ─────────────────────────────────────────────
      if (label === "floor") {
        this.meshFloors.push({ worldY: worldPos.y, worldPosition: worldPos });
        console.log(
          `[RoomAlignment] 🔽📦 Floor MESH at Y=${worldPos.y.toFixed(2)} ` +
            this.signalSummary(),
        );
        this.tryAlign();
      }

      // ── Ceiling meshes — used for height verification ────────────
      if (label === "ceiling") {
        console.log(
          `[RoomAlignment] 🔼📦 Ceiling MESH at Y=${worldPos.y.toFixed(2)} ` +
            this.signalSummary(),
        );
        // We don't store mesh ceilings separately — the plane ceilings are sufficient.
        // But the log helps debugging.
      }
    } catch (err) {
      console.warn("[RoomAlignment] Error processing mesh:", err);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Update loop
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  update(dt: number): void {
    if (!this.collecting) return;

    this.collectTimer += dt;

    // Timeout — force alignment with whatever data we have
    if (!this.aligned && this.collectTimer >= this.ALIGNMENT_TIMEOUT) {
      console.log(
        "[RoomAlignment] ⏰ Timeout — attempting alignment with available data",
      );
      this.tryAlign(true);
    }

    // Refinement window — keep improving alignment after initial lock
    if (this.aligned && this.lastConfidence !== "high") {
      this.refinementTimer += dt;
      if (this.refinementTimer < this.REFINEMENT_WINDOW) {
        // Still in refinement window — new signals can improve alignment
      } else {
        // Refinement window closed — stop collecting
        this.collecting = false;
        console.log(
          "[RoomAlignment] ⏹ Refinement window closed. Final alignment locked.",
        );
        this.tryCreateAnchor();
      }
    }

    // If high confidence, stop immediately
    if (this.aligned && this.lastConfidence === "high" && !this.anchorCreated) {
      this.collecting = false;
      console.log(
        "[RoomAlignment] ⏹ High-confidence alignment — locking immediately.",
      );
      this.tryCreateAnchor();
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Core alignment logic
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private tryAlign(force = false): void {
    if (!this.roomModel) {
      console.warn("[RoomAlignment] No room model — cannot align");
      return;
    }

    const totalWallSignals = this.detectedWalls.length + this.meshWalls.length;
    const hasFloor =
      this.detectedFloors.length >= 1 || this.meshFloors.length >= 1;
    const hasWalls = totalWallSignals >= this.MIN_WALL_SIGNALS;

    if (!force && (!hasFloor || !hasWalls)) return;
    if (!hasFloor && totalWallSignals === 0) {
      console.warn("[RoomAlignment] No signals at all — cannot align");
      return;
    }

    console.log(
      `[RoomAlignment] 🔧 Aligning... ` +
        `(${this.detectedFloors.length} floor planes, ${this.meshFloors.length} floor meshes, ` +
        `${this.detectedCeilings.length} ceiling planes, ` +
        `${this.detectedWalls.length} wall planes, ${this.meshWalls.length} wall meshes)`,
    );

    // ── Step 1: Floor Y (multi-signal) ──────────────────────────
    const floorY = this.computeFloorY();
    const ceilingY = this.computeCeilingY();
    const roomHeight = ceilingY !== null ? ceilingY - floorY : null;

    console.log(`[RoomAlignment]   Floor Y = ${floorY.toFixed(3)}`);
    if (ceilingY !== null) {
      console.log(`[RoomAlignment]   Ceiling Y = ${ceilingY.toFixed(3)}`);
      console.log(
        `[RoomAlignment]   Room height = ${roomHeight!.toFixed(2)}m ` +
          `(model: ${MODEL_ROOM_HEIGHT.toFixed(2)}m, diff: ${Math.abs(roomHeight! - MODEL_ROOM_HEIGHT).toFixed(2)}m)`,
      );
      if (Math.abs(roomHeight! - MODEL_ROOM_HEIGHT) > MAX_HEIGHT_DIFF) {
        console.warn(
          `[RoomAlignment]   ⚠️ Room height mismatch! Proceeding with caution.`,
        );
      } else {
        console.log(`[RoomAlignment]   ✅ Room height matches model`);
      }
    }

    // ── Step 2: Match walls (planes + meshes) ───────────────────
    const matches = this.matchWalls();

    if (matches.length === 0 && !force) {
      console.log(
        "[RoomAlignment]   No wall matches yet — waiting for more data",
      );
      return;
    }

    if (matches.length > 0) {
      console.log(`[RoomAlignment]   ${matches.length} wall match(es):`);
      for (const m of matches) {
        console.log(
          `[RoomAlignment]     [${m.source}] len=${m.detectedLength.toFixed(2)}m → ` +
            `Model "${m.modelWall.label}" ${m.modelWall.length.toFixed(2)}m ` +
            `(diff: ${m.lengthDiff.toFixed(2)}m)`,
        );
      }
    }

    // ── Step 3: Compute rotation ────────────────────────────────
    const rotationY = this.computeRotation(matches);
    console.log(
      `[RoomAlignment]   Rotation = ${((rotationY * 180) / Math.PI).toFixed(1)}°`,
    );

    // ── Step 4: Compute translation ─────────────────────────────
    const translation = this.computeTranslation(matches, floorY, rotationY);
    console.log(
      `[RoomAlignment]   Translation = (${translation.x.toFixed(2)}, ${translation.y.toFixed(2)}, ${translation.z.toFixed(2)})`,
    );

    // ── Step 5: Compute confidence ──────────────────────────────
    const confidence = this.computeConfidence(matches);

    // ── Step 6: Apply transform ─────────────────────────────────
    // Only apply if this is first alignment OR confidence improved
    if (
      !this.aligned ||
      this.confidenceRank(confidence) > this.confidenceRank(this.lastConfidence)
    ) {
      this.roomModel.scale.setScalar(this.modelScale);
      this.roomModel.rotation.y = rotationY;
      this.roomModel.position.copy(translation);

      this.lastConfidence = confidence;
      const wasAligned = this.aligned;
      this.aligned = true;

      if (!wasAligned) {
        this.refinementTimer = 0;
        console.log(
          `[RoomAlignment] ✅ Room model aligned! Confidence: ${confidence.toUpperCase()}`,
        );
      } else {
        console.log(
          `[RoomAlignment] ✅ Alignment REFINED. Confidence: ${confidence.toUpperCase()}`,
        );
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Floor / Ceiling computation (multi-signal)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private computeFloorY(): number {
    const floorYValues: number[] = [];

    // From plane detection
    for (const floor of this.detectedFloors) {
      floorYValues.push(floor.worldPosition.y);
    }

    // From mesh detection
    for (const meshFloor of this.meshFloors) {
      floorYValues.push(meshFloor.worldY);
    }

    if (floorYValues.length === 0) return 0;

    // Use the lowest value — LiDAR floor planes are most reliable
    let lowest = Infinity;
    for (const y of floorYValues) {
      if (y < lowest) lowest = y;
    }
    return lowest;
  }

  private computeCeilingY(): number | null {
    if (this.detectedCeilings.length === 0) return null;

    let highest = -Infinity;
    for (const ceiling of this.detectedCeilings) {
      if (ceiling.worldPosition.y > highest) {
        highest = ceiling.worldPosition.y;
      }
    }
    return highest;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Wall matching (planes + meshes combined)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** Combined wall matching from both plane and mesh sources. */
  private matchWalls(): WallMatch[] {
    // Build a unified list of wall candidates
    interface WallCandidate {
      worldPosition: Vector3;
      worldNormal: Vector3;
      length: number;
      source: "plane" | "mesh";
    }

    const candidates: WallCandidate[] = [];

    for (const wall of this.detectedWalls) {
      candidates.push({
        worldPosition: wall.worldPosition,
        worldNormal: wall.worldNormal,
        length: wall.length,
        source: "plane",
      });
    }

    for (const meshWall of this.meshWalls) {
      candidates.push({
        worldPosition: meshWall.worldPosition,
        worldNormal: meshWall.worldNormal,
        length: meshWall.length,
        source: "mesh",
      });
    }

    // Sort by length descending (biggest walls first = most reliable)
    candidates.sort((a, b) => b.length - a.length);

    const matches: WallMatch[] = [];
    const usedModelWalls = new Set<string>();

    for (const candidate of candidates) {
      let bestMatch: { modelWall: ModelWall; diff: number } | null = null;

      for (const modelWall of MODEL_WALLS) {
        if (usedModelWalls.has(modelWall.label)) continue;

        const diff = Math.abs(candidate.length - modelWall.length);
        if (diff <= MAX_LENGTH_DIFF) {
          if (!bestMatch || diff < bestMatch.diff) {
            bestMatch = { modelWall, diff };
          }
        }
      }

      if (bestMatch) {
        matches.push({
          worldPosition: candidate.worldPosition,
          worldNormal: candidate.worldNormal,
          detectedLength: candidate.length,
          modelWall: bestMatch.modelWall,
          lengthDiff: bestMatch.diff,
          source: candidate.source,
        });
        usedModelWalls.add(bestMatch.modelWall.label);
      }
    }

    return matches;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Rotation computation
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private computeRotation(matches: WallMatch[]): number {
    if (matches.length === 0) {
      return this.computeWallRotationFallback();
    }

    const angleDeltas: number[] = [];

    for (const match of matches) {
      const xrAngle = Math.atan2(match.worldNormal.z, match.worldNormal.x);
      const modelAngle = Math.atan2(
        match.modelWall.normal.z,
        match.modelWall.normal.x,
      );

      let delta = xrAngle - modelAngle;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;

      angleDeltas.push(delta);
    }

    // Circular mean of angle deltas
    let sumSin = 0,
      sumCos = 0;
    for (const d of angleDeltas) {
      sumSin += Math.sin(d);
      sumCos += Math.cos(d);
    }
    const avgDelta = Math.atan2(
      sumSin / angleDeltas.length,
      sumCos / angleDeltas.length,
    );

    console.log(
      `[RoomAlignment]   Angle deltas: [${angleDeltas.map((d) => ((d * 180) / Math.PI).toFixed(1) + "°").join(", ")}]`,
    );

    return avgDelta;
  }

  private computeWallRotationFallback(): number {
    // Combine plane walls and mesh walls
    const allNormals: Vector3[] = [];
    for (const wall of this.detectedWalls) {
      allNormals.push(wall.worldNormal);
    }
    for (const meshWall of this.meshWalls) {
      allNormals.push(meshWall.worldNormal);
    }

    if (allNormals.length === 0) return 0;

    const angles: number[] = [];
    for (const n of allNormals) {
      const len = Math.sqrt(n.x * n.x + n.z * n.z);
      if (len < 0.1) continue;
      let angle = Math.atan2(n.z, n.x);
      if (angle < 0) angle += Math.PI;
      if (angle >= Math.PI) angle -= Math.PI;
      angles.push(angle);
    }

    if (angles.length === 0) return 0;

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
  //  Translation computation
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private computeTranslation(
    matches: WallMatch[],
    floorY: number,
    rotationY: number,
  ): Vector3 {
    if (matches.length >= 2) {
      return this.computeTranslationFromWallPositions(
        matches,
        floorY,
        rotationY,
      );
    }
    if (matches.length === 1) {
      return this.computeTranslationFromOneWall(matches[0], floorY, rotationY);
    }
    return this.computeTranslationFromFloorCentroid(floorY, rotationY);
  }

  private computeTranslationFromWallPositions(
    matches: WallMatch[],
    floorY: number,
    rotationY: number,
  ): Vector3 {
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);

    let sumTx = 0,
      sumTz = 0;
    let countTx = 0,
      countTz = 0;

    for (const match of matches) {
      const mc = match.modelWall.center.clone().multiplyScalar(this.modelScale);
      const rotatedX = mc.x * cos - mc.z * sin;
      const rotatedZ = mc.x * sin + mc.z * cos;

      const mn = match.modelWall.normal;
      const rotatedNx = mn.x * cos - mn.z * sin;
      const rotatedNz = mn.x * sin + mn.z * cos;

      const xrPos = match.worldPosition;

      if (Math.abs(rotatedNx) > Math.abs(rotatedNz)) {
        const tx = xrPos.x - rotatedX;
        sumTx += tx;
        countTx++;
      } else {
        const tz = xrPos.z - rotatedZ;
        sumTz += tz;
        countTz++;
      }
    }

    const tx = countTx > 0 ? sumTx / countTx : 0;
    const tz = countTz > 0 ? sumTz / countTz : 0;

    if (countTx === 0 || countTz === 0) {
      const floorFallback = this.computeTranslationFromFloorCentroid(
        floorY,
        rotationY,
      );
      return new Vector3(
        countTx > 0 ? tx : floorFallback.x,
        floorY,
        countTz > 0 ? tz : floorFallback.z,
      );
    }

    return new Vector3(tx, floorY, tz);
  }

  private computeTranslationFromOneWall(
    match: WallMatch,
    floorY: number,
    rotationY: number,
  ): Vector3 {
    const fallback = this.computeTranslationFromFloorCentroid(
      floorY,
      rotationY,
    );
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);

    const mc = match.modelWall.center.clone().multiplyScalar(this.modelScale);
    const rotatedX = mc.x * cos - mc.z * sin;
    const rotatedZ = mc.x * sin + mc.z * cos;

    const mn = match.modelWall.normal;
    const rotatedNx = mn.x * cos - mn.z * sin;
    const rotatedNz = mn.x * sin + mn.z * cos;

    const xrPos = match.worldPosition;

    if (Math.abs(rotatedNx) > Math.abs(rotatedNz)) {
      return new Vector3(xrPos.x - rotatedX, floorY, fallback.z);
    } else {
      return new Vector3(fallback.x, floorY, xrPos.z - rotatedZ);
    }
  }

  private computeTranslationFromFloorCentroid(
    floorY: number,
    rotationY: number,
  ): Vector3 {
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);

    const sc = MODEL_FLOOR_CENTER.clone().multiplyScalar(this.modelScale);
    const rx = sc.x * cos - sc.z * sin;
    const rz = sc.x * sin + sc.z * cos;

    // Combine plane floor vertices AND mesh floor positions
    const xrCenter = new Vector3();
    let count = 0;

    for (const floor of this.detectedFloors) {
      for (const v of floor.worldVertices) {
        xrCenter.x += v.x;
        xrCenter.z += v.z;
        count++;
      }
    }

    for (const meshFloor of this.meshFloors) {
      xrCenter.x += meshFloor.worldPosition.x;
      xrCenter.z += meshFloor.worldPosition.z;
      count++;
    }

    if (count > 0) {
      xrCenter.x /= count;
      xrCenter.z /= count;
    }

    return new Vector3(xrCenter.x - rx, floorY, xrCenter.z - rz);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Confidence scoring
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private computeConfidence(matches: WallMatch[]): AlignmentConfidence {
    const hasPlaneFloor = this.detectedFloors.length >= 1;
    const hasMeshFloor = this.meshFloors.length >= 1;
    const hasCeiling = this.detectedCeilings.length >= 1;
    const hasMeshWalls = this.meshWalls.length >= 1;
    const wallMatches = matches.length;

    const signals: string[] = [];
    if (hasPlaneFloor) signals.push("plane-floor");
    if (hasMeshFloor) signals.push("mesh-floor");
    if (hasCeiling) signals.push("ceiling");
    if (hasMeshWalls) signals.push("mesh-walls");
    signals.push(`${wallMatches} wall-matches`);

    console.log(`[RoomAlignment]   Signals: [${signals.join(", ")}]`);

    // High: floor + ceiling + ≥2 wall matches + mesh data
    if (
      hasPlaneFloor &&
      hasCeiling &&
      wallMatches >= 2 &&
      (hasMeshWalls || hasMeshFloor)
    ) {
      return "high";
    }
    // Medium: floor + ≥2 wall matches (plane-only is acceptable)
    if ((hasPlaneFloor || hasMeshFloor) && wallMatches >= 2) {
      return "medium";
    }
    // Low: anything less
    return "low";
  }

  private confidenceRank(c: AlignmentConfidence): number {
    switch (c) {
      case "high":
        return 3;
      case "medium":
        return 2;
      case "low":
        return 1;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  XRAnchor persistence
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private tryCreateAnchor(): void {
    if (this.anchorCreated || !this.roomModel) return;

    try {
      const session = this.renderer.xr.getSession();
      const frame = (this.renderer.xr as any).getFrame?.();
      const refSpace = this.renderer.xr.getReferenceSpace();

      if (!session || !frame || !refSpace) {
        console.log(
          "[RoomAlignment] ⚓ Cannot create anchor — no XR frame/session",
        );
        return;
      }

      // Create an XRRigidTransform at the model's current world position
      const pos = this.roomModel.position;
      const quat = this.roomModel.quaternion;

      if (typeof frame.createAnchor === "function") {
        const anchorPose = new XRRigidTransform(
          { x: pos.x, y: pos.y, z: pos.z, w: 1 },
          { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
        );

        frame
          .createAnchor(anchorPose, refSpace)
          .then((anchor: any) => {
            this.anchorCreated = true;
            console.log(
              "[RoomAlignment] ⚓ XRAnchor created — alignment is persistent!",
            );

            // Store anchor for potential future updates
            (globalThis as any).__roomAlignmentAnchor = anchor;
          })
          .catch((err: any) => {
            console.warn("[RoomAlignment] ⚓ Failed to create anchor:", err);
          });
      } else {
        console.log(
          "[RoomAlignment] ⚓ frame.createAnchor not available — anchor skipped",
        );
        this.anchorCreated = true; // Don't retry
      }
    } catch (err) {
      console.warn("[RoomAlignment] ⚓ Anchor creation error:", err);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Utilities
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  private signalSummary(): string {
    return (
      `(${this.detectedFloors.length}F+${this.meshFloors.length}MF, ` +
      `${this.detectedCeilings.length}C, ` +
      `${this.detectedWalls.length}W+${this.meshWalls.length}MW)`
    );
  }
}
