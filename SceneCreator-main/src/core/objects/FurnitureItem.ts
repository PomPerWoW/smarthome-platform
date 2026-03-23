import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Base3DObject, Transform } from './Base3DObject';

export interface FurnitureMetadata {
  description?: string;
  category?: string;
  type?: string;
  isContainer?: boolean;
  image?: string;
  wallMountable?: boolean;
}

export type PlacementMode = 'floor' | 'wall';

export interface WallPlacementInfo {
  wallNormal: [number, number, number];
  wallPosition: number;
}

export class FurnitureItem extends Base3DObject {
  public metadata: FurnitureMetadata;
  protected isSelected: boolean = false;
  protected hasCollision: boolean = false;
  protected isFloating: boolean = false;
  protected loader: GLTFLoader;
  protected selectionIndicator: THREE.Group | null = null;
  protected collisionIndicator: THREE.Group | null = null;
  protected placementMode: PlacementMode = 'floor';
  protected wallPlacement: WallPlacementInfo | null = null;
  protected mixer: THREE.AnimationMixer | null = null;
  protected animations: THREE.AnimationClip[] = [];
  protected actions: THREE.AnimationAction[] = [];

  constructor(
    id: string,
    name: string,
    modelId: number,
    modelPath: string | null,
    metadata: FurnitureMetadata = {},
    initialTransform?: Partial<Transform>,
    type?: string,
    image?: string
  ) {
    super(id, name, modelId, modelPath, initialTransform, type, image);
    this.metadata = metadata;
    this.loader = new GLTFLoader();
  }

  // Wall mounting methods
  isWallMountable(): boolean {
    return this.metadata.wallMountable || false;
  }

  getPlacementMode(): PlacementMode {
    return this.placementMode;
  }

  setPlacementMode(mode: PlacementMode): void {
    this.placementMode = mode;
    if (mode === 'floor') {
      this.wallPlacement = null;
    }
  }

  isOnWall(): boolean {
    return this.placementMode === 'wall';
  }

  setWallPlacement(info: WallPlacementInfo): void {
    this.placementMode = 'wall';
    this.wallPlacement = info;
  }

  getWallPlacement(): WallPlacementInfo | null {
    return this.wallPlacement;
  }

  isWallpaper(): boolean {
    return false;
  }

  // Move along wall surface
  moveAlongWall(deltaVertical: number, deltaHorizontal: number): [number, number, number] {
    const currentPos = this.getPosition();
    const newPos: [number, number, number] = [...currentPos];
    
    if (!this.wallPlacement) {
      return newPos;
    }

    const wallNormal = this.wallPlacement.wallNormal;
    
    // Move vertically (up/down)
    newPos[1] += deltaVertical;
    
    // Move horizontally along the wall
    if (Math.abs(wallNormal[2]) > Math.abs(wallNormal[0])) {
      newPos[0] += deltaHorizontal;
    } else {
      newPos[2] += deltaHorizontal;
    }

    return newPos;
  }

  protected async fetchModel(path: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        path,
        (gltf) => {
          if (gltf.animations && gltf.animations.length > 0) {
            this.animations = gltf.animations;
          }
          resolve(gltf.scene);
        },
        undefined,
        reject
      );
    });
  }

  protected setupModel(model: THREE.Group): void {
    const clonedModel = model.clone();
    this.modelGroup.clear();
    
    const box = new THREE.Box3().setFromObject(clonedModel);
    
    if (this.placementMode === 'wall' && this.wallPlacement) {
      const wallNormal = this.wallPlacement.wallNormal;
      
      if (Math.abs(wallNormal[2]) > Math.abs(wallNormal[0])) {
        if (wallNormal[2] > 0) {
          clonedModel.position.z = -box.min.z;
        } else {
          clonedModel.position.z = -box.max.z;
        }
      } else {
        if (wallNormal[0] > 0) {
          clonedModel.position.x = -box.min.x;
        } else {
          clonedModel.position.x = -box.max.x;
        }
      }
    } else {
      const minY = box.min.y;
      clonedModel.position.y = -minY;
    }
    
    this.modelGroup.add(clonedModel);
  }

  protected onModelLoaded(model: THREE.Group): void {
    void model;
    
    if (this.animations.length > 0) {
      this.setupAnimations();
    }
  }

  protected setupAnimations(): void {
    this.mixer = new THREE.AnimationMixer(this.modelGroup);
    
    this.actions = this.animations.map(clip => {
      const action = this.mixer!.clipAction(clip);
      action.play();
      return action;
    });
  }

  update(delta: number): void {
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }

  hasAnimations(): boolean {
    return this.animations.length > 0;
  }

  // Stop all animations
  stopAnimations(): void {
    this.actions.forEach(action => action.stop());
  }

  // Play all animations
  playAnimations(): void {
    this.actions.forEach(action => action.play());
  }

  // Pause all animations
  pauseAnimations(): void {
    this.actions.forEach(action => action.paused = true);
  }

  // Resume all animations
  resumeAnimations(): void {
    this.actions.forEach(action => action.paused = false);
  }

  protected onModelLoadError(error: unknown): void {
    console.error(`Failed to load model for furniture ${this.name}`, error);
  }

  getMetadata(): FurnitureMetadata {
    return { ...this.metadata };
  }

  isContainerType(): boolean {
    return this.metadata.isContainer || false;
  }

  select(): void {
    if (this.isSelected) return;
    this.isSelected = true;
    this.updateSelectionIndicator();
  }

  deselect(): void {
    if (!this.isSelected || this.isFloating) return;
    this.isSelected = false;
    this.updateSelectionIndicator();
  }

  toggleSelection(): void {
    if (this.isSelected) {
      this.deselect();
    } else {
      this.select();
    }
  }

  getIsSelected(): boolean {
    return this.isSelected;
  }

  // Collision management
  setCollision(hasCollision: boolean): void {
    this.hasCollision = hasCollision;
    this.updateCollisionIndicator();
  }

  setFloating(isFloating: boolean): void {
    this.isFloating = isFloating;
    this.updateCollisionIndicator();
  }

  getHasCollision(): boolean {
    return this.hasCollision;
  }

  getIsFloating(): boolean {
    return this.isFloating;
  }

  protected updateSelectionIndicator(): void {
    if (this.selectionIndicator) {
      this.group.remove(this.selectionIndicator);
      this.selectionIndicator = null;
    }

    if (this.isSelected) {
      this.selectionIndicator = this.createSelectionIndicator();
      this.group.add(this.selectionIndicator);
    }
  }

  protected createSelectionIndicator(): THREE.Group {
    const indicator = new THREE.Group();
    
    const ringGeometry = new THREE.RingGeometry(0.3, 0.35, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: this.hasCollision || this.isFloating ? 0xff0000 : 0x00ff00,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    indicator.add(ring);

    const coneGeometry = new THREE.ConeGeometry(0.05, 0.1, 8);
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: this.hasCollision || this.isFloating ? 0xff0000 : 0xffff00,
    });
    const cone = new THREE.Mesh(coneGeometry, coneMaterial);
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0.01, 0.35);
    indicator.add(cone);

    return indicator;
  }

  protected updateCollisionIndicator(): void {
    if (this.collisionIndicator) {
      this.group.remove(this.collisionIndicator);
      this.collisionIndicator = null;
    }

    if (this.hasCollision && !this.isSelected) {
      this.collisionIndicator = this.createCollisionIndicator();
      this.group.add(this.collisionIndicator);
    }

    if (this.isSelected) {
      this.updateSelectionIndicator();
    }
  }

  protected createCollisionIndicator(): THREE.Group {
    const indicator = new THREE.Group();
    
    const ringGeometry = new THREE.RingGeometry(0.25, 0.3, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    indicator.add(ring);

    return indicator;
  }

  async moveWithValidation(
    newPosition: [number, number, number],
    validator?: (item: FurnitureItem) => Promise<boolean>
  ): Promise<boolean> {
    const originalPosition = this.getPosition();
    this.setPosition(newPosition);

    if (validator) {
      const isValid = await validator(this);
      if (!isValid) {
        this.setPosition(originalPosition);
        return false;
      }
    }

    return true;
  }

  clone(): FurnitureItem {
    return new FurnitureItem(
      `${this.id}-${Date.now()}`,
      this.name,
      this.modelId,
      this.modelPath,
      this.metadata,
      {
        position: this.getPosition(),
        rotation: this.getRotation(),
        scale: this.getScale(),
      }
    );
  }

  serialize(): Record<string, unknown> {
    const scale = this.getScale();
    const scaleArray = typeof scale === 'number' ? [scale, scale, scale] : scale;
    const positions = [...this.getPosition(), 0] as [number, number, number, number];

    return {
      id: this.id,
      positions,
      rotation: this.getRotation(),
      scale: scaleArray,
      is_container: this.isContainerType(),
      contain: this.isContainerType() ? [] : undefined,
      composite: !this.isContainerType() ? [] : undefined,
      texture_id: null,
      placement_mode: this.placementMode,
      wall_placement: this.wallPlacement,
    };
  }

  dispose(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.actions = [];
    this.animations = [];
    
    if (this.selectionIndicator) {
      this.group.remove(this.selectionIndicator);
      this.selectionIndicator = null;
    }
    if (this.collisionIndicator) {
      this.group.remove(this.collisionIndicator);
      this.collisionIndicator = null;
    }
    super.dispose();
  }
}