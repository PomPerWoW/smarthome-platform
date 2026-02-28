import { Vector3 } from "three";

/** An XR-detected plane with computed world-space properties. */
export interface DetectedPlane {
  orientation: "horizontal" | "vertical" | "unknown";
  worldPosition: Vector3;
  worldNormal: Vector3;
  worldVertices: Vector3[];
  /** Longest edge length (for walls: wall length) */
  length: number;
  /** For horizontal planes: is it likely a ceiling? */
  isCeiling: boolean;
  /** Semantic label if available (from plane.semanticLabel) */
  semanticLabel?: string;
}

/** Wall info derived from an XRMesh with semantic label 'wall'. */
export interface MeshWallInfo {
  worldPosition: Vector3;
  worldNormal: Vector3;
  /** Estimated wall length from mesh dimensions/bounding box */
  length: number;
  dimensions?: [number, number, number];
}

/** Floor info derived from an XRMesh with semantic label 'floor'. */
export interface MeshFloorInfo {
  worldY: number;
  worldPosition: Vector3;
}

/** A known wall from the LabPlan model. */
export interface ModelWall {
  length: number;
  normal: Vector3;
  center: Vector3;
  label: string;
}

/** A pairing between a detected wall (from planes or meshes) and a model wall. */
export interface WallMatch {
  /** World position of the detected wall */
  worldPosition: Vector3;
  /** World normal of the detected wall */
  worldNormal: Vector3;
  /** Detected wall length */
  detectedLength: number;
  /** The matched model wall */
  modelWall: ModelWall;
  /** Absolute length difference */
  lengthDiff: number;
  /** Source of detection */
  source: "plane" | "mesh";
}

/** Alignment confidence levels */
export type AlignmentConfidence = "high" | "medium" | "low";
