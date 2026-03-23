import * as THREE from 'three';

const API_BASE_URL = import.meta.env.VITE_API_URL;
const COLLISION_API_URL = API_BASE_URL
  ? `${API_BASE_URL}/digitalhomes/overlap_check/`
  : null;

export interface CollisionResult {
  hasCollision: boolean;
  collidingObjects: string[];
  penetrationDepth?: number;
  collisionNormal?: THREE.Vector3;
}

interface TransformData {
  modelId?: number;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export class CollisionDetector {
  private static instance: CollisionDetector;
  public furnitureBoxes: Map<string, THREE.Box3> = new Map();
  private furnitureTransforms: Map<string, TransformData> = new Map();
  private roomBox: THREE.Box3 | null = null;
  private helperMeshes: Map<string, THREE.Mesh> = new Map();
  private showDebugBoxes: boolean = false;
  private readonly EPSILON = 0.01;

  private constructor() {}

  static getInstance(): CollisionDetector {
    if (!CollisionDetector.instance) {
      CollisionDetector.instance = new CollisionDetector();
    }
    return CollisionDetector.instance;
  }

  setDebugMode(enabled: boolean): void {
    this.showDebugBoxes = enabled;
    if (!enabled) {
      this.clearHelperMeshes();
    }
  }

  private clearHelperMeshes(): void {
    this.helperMeshes.forEach(mesh => {
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
    });
    this.helperMeshes.clear();
  }

  setRoomBoundary(boundary: {
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
    min_z: number;
    max_z: number;
  }): void {
    this.roomBox = new THREE.Box3(
      new THREE.Vector3(boundary.min_x, boundary.min_y, boundary.min_z),
      new THREE.Vector3(boundary.max_x, boundary.max_y, boundary.max_z)
    );
  }

  setRoomBoundaryFromBox3(box: THREE.Box3): void {
    this.roomBox = box.clone();
  }

  getRoomBoundary(): THREE.Box3 | null {
    return this.roomBox;
  }

  updateFurnitureBox(itemId: string, object: THREE.Object3D, modelId?: number): void {
    const box = new THREE.Box3().setFromObject(object);
    this.furnitureBoxes.set(itemId, box);

    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    object.getWorldPosition(worldPosition);
    object.getWorldQuaternion(worldQuaternion);
    object.getWorldScale(worldScale);

    const worldRotation = new THREE.Euler().setFromQuaternion(worldQuaternion);
    const existing = this.furnitureTransforms.get(itemId);

    this.furnitureTransforms.set(itemId, {
      modelId: modelId ?? existing?.modelId,
      position: worldPosition.clone(),
      rotation: worldRotation.clone(),
      scale: worldScale.clone(),
    });

    if (this.showDebugBoxes) {
      this.createDebugBox(itemId, box, object.parent);
    }
  }

  removeFurniture(itemId: string): void {
    this.furnitureBoxes.delete(itemId);
    this.furnitureTransforms.delete(itemId);
    const helper = this.helperMeshes.get(itemId);
    if (helper && helper.parent) {
      helper.parent.remove(helper);
    }
    this.helperMeshes.delete(itemId);
  }

  checkRoomCollision(itemId: string): CollisionResult {
    const box = this.furnitureBoxes.get(itemId);
    
    if (!box || !this.roomBox) {
      return { hasCollision: false, collidingObjects: [] };
    }

    const isOutsideX = box.min.x < this.roomBox.min.x - this.EPSILON || 
                       box.max.x > this.roomBox.max.x + this.EPSILON;
    const isOutsideZ = box.min.z < this.roomBox.min.z - this.EPSILON || 
                       box.max.z > this.roomBox.max.z + this.EPSILON;
    const isOutsideY = box.min.y < this.roomBox.min.y - (this.EPSILON + 0.1) || 
                       box.max.y >= this.roomBox.max.y;
    
    const hasCollision = isOutsideX || isOutsideZ || isOutsideY;
    
    if (!hasCollision) {
      return { hasCollision: false, collidingObjects: [] };
    }

    const center = new THREE.Vector3();
    box.getCenter(center);
    
    const roomCenter = new THREE.Vector3();
    this.roomBox.getCenter(roomCenter);

    const normal = new THREE.Vector3().subVectors(roomCenter, center);
    normal.y = 0;
    normal.normalize();

    return {
      hasCollision: true,
      collidingObjects: ['room'],
      collisionNormal: normal,
    };
  }

  checkRoomFloor(itemId: string): boolean {
    const box = this.furnitureBoxes.get(itemId);
    
    if (!box || !this.roomBox) {
      return false;
    }

    const onFloor = box.min.y <= this.roomBox.min.y;
    
    return onFloor;
  }

  checkAABBCollisionOnly(itemId: string): boolean {
    const box = this.furnitureBoxes.get(itemId);
    
    if (!box) {
      return false;
    }

    for (const [otherId, otherBox] of this.furnitureBoxes.entries()) {
      if (otherId === itemId) continue;
      if (box.intersectsBox(otherBox)) {
        return true; // AABB collision detected
      }
    }

    return false;
  }

  async checkFurnitureCollisions(itemId: string): Promise<CollisionResult> {
    const box = this.furnitureBoxes.get(itemId);
    
    if (!box) {
      return { hasCollision: false, collidingObjects: [] };
    }

    const collidingObjects: string[] = [];

    for (const [otherId, otherBox] of this.furnitureBoxes.entries()) {
      if (otherId === itemId) continue;
      if (!box.intersectsBox(otherBox)) continue;

      const hasPreciseOverlap = await this.checkModelsOverlapWithApi(itemId, otherId);
      
      if (hasPreciseOverlap) {
        collidingObjects.push(otherId);
      }
    }

    return {
      hasCollision: collidingObjects.length > 0,
      collidingObjects,
    };
  }

  async checkAllCollisions(itemId: string): Promise<CollisionResult> {
    const roomCollision = this.checkRoomCollision(itemId);
    const furnitureCollision = await this.checkFurnitureCollisions(itemId);

    return {
      hasCollision: roomCollision.hasCollision || furnitureCollision.hasCollision,
      collidingObjects: [
        ...roomCollision.collidingObjects,
        ...furnitureCollision.collidingObjects,
      ],
      collisionNormal: roomCollision.collisionNormal,
    };
  }

  async isPositionValid(
    itemId: string,
    position: THREE.Vector3,
    object: THREE.Object3D
  ): Promise<boolean> {
    const originalPosition = object.position.clone();
    object.position.copy(position);
    this.updateFurnitureBox(itemId, object);

    const collision = await this.checkAllCollisions(itemId);
    
    object.position.copy(originalPosition);
    this.updateFurnitureBox(itemId, object);

    return !collision.hasCollision;
  }

  constrainToRoom(position: THREE.Vector3, itemBox: THREE.Box3): THREE.Vector3 {
    if (!this.roomBox) return position;

    const correctedPosition = position.clone();
    const size = new THREE.Vector3();
    itemBox.getSize(size);
    const halfSize = size.clone().multiplyScalar(0.5);

    // Constrain X
    if (correctedPosition.x - halfSize.x < this.roomBox.min.x) {
      correctedPosition.x = this.roomBox.min.x + halfSize.x;
    }
    if (correctedPosition.x + halfSize.x > this.roomBox.max.x) {
      correctedPosition.x = this.roomBox.max.x - halfSize.x;
    }

    // Constrain Y 
    if (correctedPosition.y + halfSize.y > this.roomBox.max.y) {
      correctedPosition.y = this.roomBox.max.y - halfSize.y;
    }

    // Constrain Z
    if (correctedPosition.z - halfSize.z < this.roomBox.min.z) {
      correctedPosition.z = this.roomBox.min.z + halfSize.z;
    }
    if (correctedPosition.z + halfSize.z > this.roomBox.max.z) {
      correctedPosition.z = this.roomBox.max.z - halfSize.z;
    }

    return correctedPosition;
  }

  private getModelDetails(itemId: string) {
    const transform = this.furnitureTransforms.get(itemId);
    if (!transform || transform.modelId === undefined) return null;

    return {
      modelId: transform.modelId,
      position: [
        transform.position.x,
        transform.position.y,
        transform.position.z,
        0,
      ],
      rotation: [
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
      ],
      scale: [
        transform.scale.x,
        transform.scale.y,
        transform.scale.z,
      ],
    };
  }

  private async checkModelsOverlapWithApi(
    mainItemId: string,
    otherItemId: string
  ): Promise<boolean> {
    if (!COLLISION_API_URL) {
      return true;
    }

    const mainDetails = this.getModelDetails(mainItemId);
    const otherDetails = this.getModelDetails(otherItemId);

    if (!mainDetails || !otherDetails) {
      return true;
    }

    const payloadMain = { [mainDetails.modelId]: {
      position: mainDetails.position,
      rotation: mainDetails.rotation,
      scale: mainDetails.scale,
    }};

    const payloadOthers = { [otherDetails.modelId]: {
      position: otherDetails.position,
      rotation: otherDetails.rotation,
      scale: otherDetails.scale,
    }};

    const formData = new FormData();
    formData.append('main_model_details', JSON.stringify(payloadMain));
    formData.append('model_details_list', JSON.stringify(payloadOthers));

    try {
      const response = await fetch(COLLISION_API_URL, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        return true;
      }

      const data = await response.json();

      if (typeof data?.contain_overlap === 'boolean') {
        return data.contain_overlap;
      }

      const results = Array.isArray(data?.results) ? data.results : null;
      if (results) {
        return results.some(
          (r: any) => r?.result?.status !== 'error' && r?.result?.overlap === true
        );
      }

      return true;
    } catch (error) {
      console.error('Failed to call collision API, assuming collision:', error);
      return true;
    }
  }

  private computeBoxDistance(boxA: THREE.Box3, boxB: THREE.Box3): number {
    const dx = Math.max(0, Math.max(boxB.min.x - boxA.max.x, boxA.min.x - boxB.max.x));
    const dy = Math.max(0, Math.max(boxB.min.y - boxA.max.y, boxA.min.y - boxB.max.y));
    const dz = Math.max(0, Math.max(boxB.min.z - boxA.max.z, boxA.min.z - boxB.max.z));
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  getDistanceToNearestCollision(itemId: string): number {
    const box = this.furnitureBoxes.get(itemId);
    if (!box) return Infinity;

    let minDistance = Infinity;
    this.furnitureBoxes.forEach((otherBox, otherId) => {
      if (otherId !== itemId) {
        const distance = this.computeBoxDistance(box, otherBox);
        minDistance = Math.min(minDistance, distance);
      }
    });

    return minDistance;
  }

  findSurfaceBelow(itemId: string): { hasSurface: boolean; surfaceY: number; supportingItemId: string | null } {
    const box = this.furnitureBoxes.get(itemId);
    if (!box || !this.roomBox) {
      return { hasSurface: false, surfaceY: 0, supportingItemId: null };
    }

    const probeMaxY = box.min.y - this.EPSILON;
    if (probeMaxY <= this.roomBox.min.y) {
      return { hasSurface: false, surfaceY: 0, supportingItemId: null };
    }

    // Probe box: same X/Z footprint, extends from room floor to just below the item
    const probeBox = new THREE.Box3(
      new THREE.Vector3(box.min.x, this.roomBox.min.y, box.min.z),
      new THREE.Vector3(box.max.x, probeMaxY, box.max.z)
    );

    let highestSurfaceY = this.roomBox.min.y;
    let supportingItemId: string | null = null;

    for (const [otherId, otherBox] of this.furnitureBoxes.entries()) {
      if (otherId === itemId) continue;
      if (otherBox.max.y >= box.min.y) continue;
      if (probeBox.intersectsBox(otherBox)) {
        if (otherBox.max.y > highestSurfaceY) {
          highestSurfaceY = otherBox.max.y;
          supportingItemId = otherId;
        }
      }
    }

    return { hasSurface: supportingItemId !== null, surfaceY: highestSurfaceY, supportingItemId };
  }

  getAllFurnitureBoxes(): Map<string, THREE.Box3> {
    return new Map(this.furnitureBoxes);
  }

  private createDebugBox(itemId: string, box: THREE.Box3, parent: THREE.Object3D | null): void {
    const oldHelper = this.helperMeshes.get(itemId);
    if (oldHelper && oldHelper.parent) {
      oldHelper.parent.remove(oldHelper);
    }

    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });

    const helper = new THREE.Mesh(geometry, material);
    helper.position.copy(center);

    if (parent) {
      parent.add(helper);
    }

    this.helperMeshes.set(itemId, helper);
  }

  clear(): void {
    this.furnitureBoxes.clear();
    this.furnitureTransforms.clear();
    this.roomBox = null;
    this.clearHelperMeshes();
  }
}

export const collisionDetector = CollisionDetector.getInstance();