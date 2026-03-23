import * as THREE from 'three';

export interface ControllerConfig {
  moveSpeed?: number;
  rotateSpeed?: number;
  deadzone?: number;
  enabled?: boolean;
}

export abstract class XRControllerBase {
  protected config: Required<ControllerConfig>;
  protected prevButtonState: Map<string, boolean> = new Map();

  constructor(config: ControllerConfig = {}) {
    this.config = {
      moveSpeed: config.moveSpeed ?? 2.0,
      rotateSpeed: config.rotateSpeed ?? 1.5,
      deadzone: config.deadzone ?? 0.15,
      enabled: config.enabled ?? true,
    };
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setMoveSpeed(speed: number): void {
    this.config.moveSpeed = speed;
  }

  setRotateSpeed(speed: number): void {
    this.config.rotateSpeed = speed;
  }

  setDeadzone(deadzone: number): void {
    this.config.deadzone = deadzone;
  }

  protected isButtonPressed(
    inputSource: any,
    buttonIndex: number
  ): boolean {
    const gamepad = inputSource.gamepad;
    if (!gamepad || !gamepad.buttons) return false;
    
    const button = gamepad.buttons[buttonIndex];
    return button ? button.pressed : false;
  }

  protected wasButtonJustPressed(
    controllerIndex: number,
    buttonIndex: number,
    isPressed: boolean
  ): boolean {
    const key = `${controllerIndex}-${buttonIndex}`;
    const wasPressed = this.prevButtonState.get(key) || false;
    
    const justPressed = isPressed && !wasPressed;
    this.prevButtonState.set(key, isPressed);
    
    return justPressed;
  }

  protected getAxisValue(
    inputSource: any,
    axisIndex: number
  ): number {
    const gamepad = inputSource.gamepad;
    if (!gamepad || !gamepad.axes || axisIndex >= gamepad.axes.length) return 0;
    
    const value = gamepad.axes[axisIndex];
    return typeof value === 'number' && !isNaN(value) ? value : 0;
  }

  protected isAxisActive(value: number): boolean {
    return Math.abs(value) > this.config.deadzone;
  }


  abstract update(
    session: any,
    camera: THREE.Camera,
    delta: number
  ): void;
  
  abstract reset(): void;
}

// Alignment state types
export type AlignmentState = 
  | 'idle'
  | 'selectingCorner'
  | 'aligningFirstCorner'
  | 'aligningSecondCorner'
  | 'aligningThirdCorner'
  | 'aligningFourthCorner'
  | 'completed';

export interface Corner {
  position: THREE.Vector3;
  index: number;
}

export interface AlignmentData {
  selectedCorner: Corner | null;
  firstCornerWorldPos: THREE.Vector3 | null;
  secondCornerWorldPos: THREE.Vector3 | null;
  thirdCornerWorldPos: THREE.Vector3 | null;
  fourthCornerWorldPos: THREE.Vector3 | null;
  firstCornerModelPos: THREE.Vector3 | null;
  secondCornerModelPos: THREE.Vector3 | null;
  thirdCornerModelPos: THREE.Vector3 | null;
  fourthCornerModelPos: THREE.Vector3 | null;
}

// NavigationController
export class NavigationController extends XRControllerBase {
  private rig: THREE.Group | null = null;
  private isNavigating: boolean = false;
  private onNavigationModeChange?: (isActive: boolean) => void;
  private homeModelGroup: THREE.Group | null = null;
  private alignmentMode: boolean = false;
  private alignmentState: AlignmentState = 'idle';
  private alignmentData: AlignmentData = {
    selectedCorner: null,
    firstCornerWorldPos: null,
    secondCornerWorldPos: null,
    thirdCornerWorldPos: null,
    fourthCornerWorldPos: null,
    firstCornerModelPos: null,
    secondCornerModelPos: null,
    thirdCornerModelPos: null,
    fourthCornerModelPos: null,
  };
  private onAlignmentStateChange?: (state: AlignmentState, data: AlignmentData) => void;
  private onAlignmentComplete?: (transform: { position: THREE.Vector3; rotation: THREE.Euler }) => void;
  private boundingBox: THREE.Box3 | null = null;
  private localBBox: THREE.Box3 | null = null;

  constructor(
    config: ControllerConfig = {},
    onNavigationModeChange?: (isActive: boolean) => void
  ) {
    super(config);
    this.onNavigationModeChange = onNavigationModeChange;
  }

  setRig(rig: THREE.Group): void {
    this.rig = rig;
  }

  getRig(): THREE.Group | null {
    return this.rig;
  }

  setHomeModelGroup(homeModelGroup: THREE.Group | null): void {
    this.homeModelGroup = homeModelGroup;
    if (homeModelGroup) {
      this.updateBoundingBox();
    }
  }

  setBoundingBox(box: THREE.Box3 | null): void {
    this.boundingBox = box;
  }

  setAlignmentMode(enabled: boolean): void {
    if (this.alignmentMode === enabled) return;
    this.alignmentMode = enabled;
    if (!enabled) {
      this.resetAlignment();
    }
  }

  setAlignmentCallbacks(
    onStateChange?: (state: AlignmentState, data: AlignmentData) => void,
    onComplete?: (transform: { position: THREE.Vector3; rotation: THREE.Euler }) => void
  ): void {
    this.onAlignmentStateChange = onStateChange;
    this.onAlignmentComplete = onComplete;
  }

  getAlignmentState(): AlignmentState {
    return this.alignmentState;
  }

  getAlignmentData(): AlignmentData {
    return { ...this.alignmentData };
  }

  getModelCornersPublic(): Corner[] {
    return this.getModelCorners();
  }

  private computeLocalBoundingBox(): THREE.Box3 | null {
    if (!this.homeModelGroup) return null;

    const savedPosition = this.homeModelGroup.position.clone();
    const savedQuaternion = this.homeModelGroup.quaternion.clone();
    const savedScale = this.homeModelGroup.scale.clone();

    this.homeModelGroup.position.set(0, 0, 0);
    this.homeModelGroup.quaternion.identity();
    this.homeModelGroup.scale.set(1, 1, 1);
    this.homeModelGroup.updateMatrix();
    this.homeModelGroup.updateMatrixWorld(true);

    const localBBox = new THREE.Box3().setFromObject(this.homeModelGroup);

    this.homeModelGroup.position.copy(savedPosition);
    this.homeModelGroup.quaternion.copy(savedQuaternion);
    this.homeModelGroup.scale.copy(savedScale);
    this.homeModelGroup.updateMatrix();
    this.homeModelGroup.updateMatrixWorld(true);

    return localBBox.isEmpty() ? null : localBBox;
  }

  startAutomaticAlignment(): void {
    if (!this.homeModelGroup || !this.boundingBox) return;
    this.localBBox = this.computeLocalBoundingBox();
    
    this.alignmentState = 'selectingCorner';
    this.alignmentData = {
      selectedCorner: null,
      firstCornerWorldPos: null,
      secondCornerWorldPos: null,
      thirdCornerWorldPos: null,
      fourthCornerWorldPos: null,
      firstCornerModelPos: null,
      secondCornerModelPos: null,
      thirdCornerModelPos: null,
      fourthCornerModelPos: null,
    };
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  private getFloorCornerInGroupLocal(semanticIndex: number): THREE.Vector3 | null {
    if (!this.homeModelGroup) return null;
    this.homeModelGroup.updateMatrixWorld(true);
    const corners = this.getModelCorners();
    const entry = corners.find((c) => c.index === semanticIndex);
    if (!entry) return null;
    const inv = new THREE.Matrix4().copy(this.homeModelGroup.matrixWorld).invert();
    return entry.position.clone().applyMatrix4(inv);
  }

  selectCorner(cornerIndex: number): void {
    if (this.alignmentState !== 'selectingCorner' || !this.boundingBox || !this.homeModelGroup) return;

    this.homeModelGroup.updateMatrixWorld(true);
    const corners = this.getModelCorners();
    const worldCorner = corners.find((c) => c.index === cornerIndex);
    if (!worldCorner) return;

    const inv = new THREE.Matrix4().copy(this.homeModelGroup.matrixWorld).invert();
    this.alignmentData.selectedCorner = worldCorner;
    this.alignmentData.firstCornerModelPos = worldCorner.position.clone().applyMatrix4(inv);

    this.alignmentState = 'aligningFirstCorner';
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  confirmFirstCornerAlignment(worldPosition: THREE.Vector3): void {
    if (this.alignmentState !== 'aligningFirstCorner') return;
    
    const position = worldPosition.clone();
    position.y = 0;
    
    this.alignmentData.firstCornerWorldPos = position;
    this.alignmentState = 'aligningSecondCorner';
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  confirmSecondCornerAlignment(worldPosition: THREE.Vector3): void {
    if (this.alignmentState !== 'aligningSecondCorner' || !this.alignmentData.selectedCorner || !this.homeModelGroup) {
      console.warn('confirmSecondCornerAlignment: Invalid state or missing data', {
        state: this.alignmentState,
        hasSelectedCorner: !!this.alignmentData.selectedCorner,
        hasHomeModelGroup: !!this.homeModelGroup
      });
      return;
    }
    
    const secondCornerIndex = (this.alignmentData.selectedCorner.index + 1) % 4;
    const secondLocal = this.getFloorCornerInGroupLocal(secondCornerIndex);
    if (!secondLocal) return;

    const position = worldPosition.clone();
    position.y = 0;
    
    this.alignmentData.secondCornerWorldPos = position;
    this.alignmentData.secondCornerModelPos = secondLocal;
    
    this.alignmentState = 'aligningThirdCorner';
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  confirmThirdCornerAlignment(worldPosition: THREE.Vector3): void {
    if (this.alignmentState !== 'aligningThirdCorner' || !this.alignmentData.selectedCorner || !this.homeModelGroup) {
      console.warn('confirmThirdCornerAlignment: Invalid state or missing data');
      return;
    }
    
    const thirdCornerIndex = (this.alignmentData.selectedCorner.index + 2) % 4;
    const thirdLocal = this.getFloorCornerInGroupLocal(thirdCornerIndex);
    if (!thirdLocal) return;

    const position = worldPosition.clone();
    position.y = 0;
    
    this.alignmentData.thirdCornerWorldPos = position;
    this.alignmentData.thirdCornerModelPos = thirdLocal;
    
    this.alignmentState = 'aligningFourthCorner';
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  confirmFourthCornerAlignment(worldPosition: THREE.Vector3): void {
    if (this.alignmentState !== 'aligningFourthCorner' || !this.alignmentData.selectedCorner || !this.homeModelGroup) {
      console.warn('confirmFourthCornerAlignment: Invalid state or missing data');
      return;
    }
    
    const fourthCornerIndex = (this.alignmentData.selectedCorner.index + 3) % 4;
    const fourthLocal = this.getFloorCornerInGroupLocal(fourthCornerIndex);
    if (!fourthLocal) return;

    const position = worldPosition.clone();
    position.y = 0;
    
    this.alignmentData.fourthCornerWorldPos = position;
    this.alignmentData.fourthCornerModelPos = fourthLocal;
    
    const transform = this.calculateTransform();
    if (transform && this.homeModelGroup) {
      this.homeModelGroup.position.copy(transform.position);
      this.homeModelGroup.rotation.copy(transform.rotation);
      this.homeModelGroup.updateMatrix();
      this.homeModelGroup.updateMatrixWorld(true);
      this.updateBoundingBox();
      this.onAlignmentComplete?.(transform);
    } else {
      console.error('confirmFourthCornerAlignment: Failed to calculate transform', { transform, hasHomeModelGroup: !!this.homeModelGroup });
    }
    
    this.alignmentState = 'completed';
    this.onAlignmentStateChange?.(this.alignmentState, this.alignmentData);
  }

  resetAlignment(): void {
    this.alignmentState = 'idle';
    this.alignmentData = {
      selectedCorner: null,
      firstCornerWorldPos: null,
      secondCornerWorldPos: null,
      thirdCornerWorldPos: null,
      fourthCornerWorldPos: null,
      firstCornerModelPos: null,
      secondCornerModelPos: null,
      thirdCornerModelPos: null,
      fourthCornerModelPos: null,
    };
    this.localBBox = null;
    this.cleanupHitTest();
  }

  private getModelCorners(): Corner[] {
    if (!this.homeModelGroup) return [];
    
    const box = this.localBBox || this.computeLocalBoundingBox();
    if (!box) return [];
    
    const maxY = box.max.y;
    const localCorners: Corner[] = [
      { position: new THREE.Vector3(box.min.x, maxY, box.min.z), index: 0 },
      { position: new THREE.Vector3(box.max.x, maxY, box.min.z), index: 1 },
      { position: new THREE.Vector3(box.max.x, maxY, box.max.z), index: 2 },
      { position: new THREE.Vector3(box.min.x, maxY, box.max.z), index: 3 },
    ];
    
    return localCorners.map(corner => ({
      position: corner.position.clone().applyMatrix4(this.homeModelGroup!.matrixWorld),
      index: corner.index,
    }));
  }

  private calculateTransform(): { position: THREE.Vector3; rotation: THREE.Euler } | null {
    if (!this.alignmentData.firstCornerWorldPos || 
        !this.alignmentData.secondCornerWorldPos ||
        !this.alignmentData.thirdCornerWorldPos ||
        !this.alignmentData.fourthCornerWorldPos ||
        !this.alignmentData.firstCornerModelPos ||
        !this.alignmentData.secondCornerModelPos ||
        !this.alignmentData.thirdCornerModelPos ||
        !this.alignmentData.fourthCornerModelPos ||
        !this.homeModelGroup || !this.boundingBox) {
      return null;
    }
    
    const initialRotation = this.homeModelGroup.rotation.clone();
    
    const localBox = this.localBBox || this.computeLocalBoundingBox();
    const modelFloorY = localBox ? localBox.min.y : 0;
    
    // Build all 4 corner pairs
    const cornerPairs: { model: THREE.Vector3; world: THREE.Vector3 }[] = [
      { model: this.alignmentData.firstCornerModelPos.clone(), world: this.alignmentData.firstCornerWorldPos.clone() },
      { model: this.alignmentData.secondCornerModelPos.clone(), world: this.alignmentData.secondCornerWorldPos.clone() },
      { model: this.alignmentData.thirdCornerModelPos.clone(), world: this.alignmentData.thirdCornerWorldPos.clone() },
      { model: this.alignmentData.fourthCornerModelPos.clone(), world: this.alignmentData.fourthCornerWorldPos.clone() },
    ];
    
    // Calculate rotation (average of corner pairs)
    const rotationEstimates: number[] = [];
    
    for (let i = 0; i < cornerPairs.length; i++) {
      const next = (i + 1) % cornerPairs.length;
      const modelVec = new THREE.Vector3().subVectors(cornerPairs[next].model, cornerPairs[i].model);
      const worldVec = new THREE.Vector3().subVectors(cornerPairs[next].world, cornerPairs[i].world);
      
      const modelVecH = new THREE.Vector3(modelVec.x, 0, modelVec.z);
      const worldVecH = new THREE.Vector3(worldVec.x, 0, worldVec.z);
      
      if (modelVecH.length() > 0.001 && worldVecH.length() > 0.001) {
        const modelAngle = Math.atan2(modelVecH.x, modelVecH.z);
        const worldAngle = Math.atan2(worldVecH.x, worldVecH.z);
        rotationEstimates.push(worldAngle - modelAngle);
      }
    }
    
    if (rotationEstimates.length === 0) {
      const offset = new THREE.Vector3(
        this.alignmentData.firstCornerWorldPos.x - this.alignmentData.firstCornerModelPos.x,
        0,
        this.alignmentData.firstCornerWorldPos.z - this.alignmentData.firstCornerModelPos.z
      );
      
      offset.y = 0 - modelFloorY;
      
      return { 
        position: this.homeModelGroup.position.clone().add(offset), 
        rotation: new THREE.Euler(initialRotation.x, initialRotation.y, initialRotation.z) 
      };
    }
    
    let sinSum = 0, cosSum = 0;
    for (const angle of rotationEstimates) {
      sinSum += Math.sin(angle);
      cosSum += Math.cos(angle);
    }
    const rotationY = Math.atan2(sinSum / rotationEstimates.length, cosSum / rotationEstimates.length);
    
    const rotation = new THREE.Euler(
      initialRotation.x,
      initialRotation.y + rotationY,
      initialRotation.z
    );
    
    const quaternion = new THREE.Quaternion().setFromEuler(rotation);
    
    // Calculate position (average of corner pairs after applying rotation)
    const positionEstimates: THREE.Vector3[] = [];
    
    for (const pair of cornerPairs) {
      const rotatedModelPos = pair.model.clone().applyQuaternion(quaternion);
      
      positionEstimates.push(new THREE.Vector3(
        pair.world.x - rotatedModelPos.x,
        0,
        pair.world.z - rotatedModelPos.z
      ));
    }
    
    const avgPosition = new THREE.Vector3();
    for (const est of positionEstimates) {
      avgPosition.add(est);
    }
    avgPosition.divideScalar(positionEstimates.length);

    avgPosition.y = 0 - modelFloorY;
    
    return { position: avgPosition, rotation };
  }

  private updateBoundingBox(): void {
    if (!this.homeModelGroup) {
      this.boundingBox = null;
      return;
    }
    
    this.boundingBox = new THREE.Box3().setFromObject(this.homeModelGroup);
  }

  private hitTestSource: XRHitTestSource | null = null;
  private viewerSpace: XRReferenceSpace | null = null;
  private lastHitPoint: THREE.Vector3 | null = null;

  // Initialize AR hit test source
  async initializeHitTest(session: XRSession): Promise<void> {
    if (!session || this.hitTestSource) return;
    
    try {
      this.viewerSpace = await (session as any).requestReferenceSpace('viewer');
      this.hitTestSource = await (session as any).requestHitTestSource({ space: this.viewerSpace });
    } catch (err) {
      console.warn('Failed to initialize AR hit test:', err);
    }
  }

  // Cleanup hit test source
  cleanupHitTest(): void {
    if (this.hitTestSource) {
      this.hitTestSource.cancel();
      this.hitTestSource = null;
    }
    this.viewerSpace = null;
    this.lastHitPoint = null;
  }

  // Head tracking alignment methods using AR hit testing
  updateHeadTrackingAlignment(
    camera: THREE.Camera,
    session: any,
    _raycaster: THREE.Raycaster,
    _scene: THREE.Scene,
    frame?: XRFrame,
    xrReferenceSpace?: XRReferenceSpace | null
  ): THREE.Vector3 | null {
    if (this.alignmentState !== 'aligningFirstCorner' && 
        this.alignmentState !== 'aligningSecondCorner' &&
        this.alignmentState !== 'aligningThirdCorner' &&
        this.alignmentState !== 'aligningFourthCorner') {
      return null;
    }

    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    if (session && frame && (session as any).mode === 'immersive-ar') {
      try {
        if (!this.hitTestSource && session.requestHitTestSource) {
          this.initializeHitTest(session).catch(err => {
            console.warn('Failed to initialize hit test:', err);
          });
        }

        if (this.hitTestSource && this.viewerSpace && frame) {
          const hitTestResults = frame.getHitTestResults(this.hitTestSource);
          
          if (hitTestResults && hitTestResults.length > 0) {
            const hit = hitTestResults[0];
            const poseSpace = xrReferenceSpace || this.viewerSpace;
            const pose = hit.getPose(poseSpace);
            
            if (pose) {
              const xrMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
              const hitPoint = new THREE.Vector3().setFromMatrixPosition(xrMatrix);
              this.lastHitPoint = hitPoint;
              return hitPoint;
            }
          }
        }

        if (this.lastHitPoint) {
          return this.lastHitPoint.clone();
        }
      } catch (err) {
        console.warn('AR hit test failed, using fallback:', err);
      }
    }

    const defaultDepth = 3.0;
    const fallbackPoint = cameraPosition.clone().addScaledVector(cameraDirection, defaultDepth);
    return fallbackPoint;
  }

  // Get alignment line position based on head tracking
  getAlignmentLinePosition(
    camera: THREE.Camera,
    targetDepth: number
  ): { position: THREE.Vector3; direction: THREE.Vector3 } | null {
    if (this.alignmentState !== 'aligningFirstCorner' && 
        this.alignmentState !== 'aligningSecondCorner' &&
        this.alignmentState !== 'aligningThirdCorner' &&
        this.alignmentState !== 'aligningFourthCorner') {
      return null;
    }

    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Calculate position at target depth
    const linePosition = cameraPosition.clone().addScaledVector(cameraDirection, targetDepth);

    return {
      position: linePosition,
      direction: cameraDirection.clone()
    };
  }

  isNavigationActive(): boolean {
    return this.isNavigating;
  }

  update(
    session: any,
    camera: THREE.Camera,
    delta: number
  ): void {
    if (!this.config.enabled || !this.rig || !session || !session.inputSources) return;

    if (this.alignmentState !== 'idle' && this.alignmentState !== 'completed') {
      return;
    }

    let isGripPressed = false;
    let moveX = 0;
    let moveZ = 0;
    let rotateInput = 0;

    session.inputSources.forEach((source: any) => {
      const gamepad = source.gamepad;
      if (!gamepad) return;

      const gripButton = gamepad.buttons[1];
      const squeezeButton = gamepad.buttons[2];
      
      if ((gripButton && gripButton.pressed) || (squeezeButton && squeezeButton.pressed)) {
        isGripPressed = true;

        if (source.handedness === "right" && gamepad.axes.length >= 4) {
          const x = this.getAxisValue(source, 2);
          const z = this.getAxisValue(source, 3);
          if (this.isAxisActive(x)) moveX = x;
          if (this.isAxisActive(z)) moveZ = z;
        }

        if (source.handedness === "left" && gamepad.axes.length >= 3) {
          const r = this.getAxisValue(source, 2);
          if (this.isAxisActive(r)) rotateInput = -r;
        }
      }
    });

    if (isGripPressed !== this.isNavigating) {
      this.isNavigating = isGripPressed;
      this.onNavigationModeChange?.(this.isNavigating);
    }

    if (!isGripPressed) return;

    // Legacy manual alignment mode (only when not in automatic alignment)
    if (this.alignmentMode && this.homeModelGroup && this.alignmentState === 'idle') {
      if (Math.abs(rotateInput) > 0) {
        const rotationDelta = -rotateInput * this.config.rotateSpeed * delta;
        this.homeModelGroup.rotateY(rotationDelta);
      }

      if (Math.abs(moveX) > 0 || Math.abs(moveZ) > 0) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, camera.up).normalize();

        const movement = new THREE.Vector3();
        movement.addScaledVector(forward, moveZ * this.config.moveSpeed * delta);
        movement.addScaledVector(right, -moveX * this.config.moveSpeed * delta);

        this.homeModelGroup.position.add(movement);
      }
      // Normal navigation mode
    } else if (this.rig) {
      if (Math.abs(rotateInput) > 0) {
        const rotationDelta = rotateInput * this.config.rotateSpeed * delta;
        this.rig.rotateY(rotationDelta);
      }

      if (Math.abs(moveX) > 0 || Math.abs(moveZ) > 0) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, camera.up).normalize();

        const movement = new THREE.Vector3();
        movement.addScaledVector(forward, -moveZ * this.config.moveSpeed * delta);
        movement.addScaledVector(right, moveX * this.config.moveSpeed * delta);

        this.rig.position.add(movement);
      }
    }
  }

  reset(): void {
    this.isNavigating = false;
    this.prevButtonState.clear();
  }
}

// FurnitureController
export class FurnitureEditController extends XRControllerBase {
  private selectedFurnitureId: string | null = null;
  private onFurnitureMove?: (id: string, delta: THREE.Vector3) => void;
  private onFurnitureRotate?: (id: string, deltaY: number) => void;
  private onFurnitureDeselect?: (id: string) => void;
  private onWallFurnitureMove?: (id: string, deltaVertical: number, deltaHorizontal: number, deltaInOut: number) => void;
  private isWallMountedCallback?: (id: string) => boolean;
  private onUnmountFromWall?: (id: string) => void;
  private verticalMovementMode: boolean = false;
  private wasThumbstickPressed: boolean = false;

  constructor(
    config: ControllerConfig = {},
    callbacks?: {
      onFurnitureMove?: (id: string, delta: THREE.Vector3) => void;
      onFurnitureRotate?: (id: string, deltaY: number) => void;
      onFurnitureDeselect?: (id: string) => void;
      onWallFurnitureMove?: (id: string, deltaVertical: number, deltaHorizontal: number, deltaInOut: number) => void;
      isWallMounted?: (id: string) => boolean;
      onUnmountFromWall?: (id: string) => void;
    }
  ) {
    super(config);
    this.onFurnitureMove = callbacks?.onFurnitureMove;
    this.onFurnitureRotate = callbacks?.onFurnitureRotate;
    this.onFurnitureDeselect = callbacks?.onFurnitureDeselect;
    this.onWallFurnitureMove = callbacks?.onWallFurnitureMove;
    this.isWallMountedCallback = callbacks?.isWallMounted;
    this.onUnmountFromWall = callbacks?.onUnmountFromWall;
  }

  setSelectedFurniture(id: string | null): void {
    this.selectedFurnitureId = id;
  }

  getSelectedFurniture(): string | null {
    return this.selectedFurnitureId;
  }

  update(
    session: any,
    camera: THREE.Camera,
    delta: number
  ): void {
    if (!this.config.enabled || !this.selectedFurnitureId || !session || !session.inputSources) return;

    let shouldCheckInputs = true;
    session.inputSources.forEach((source: any, index: number) => {
      const gamepad = source.gamepad;
      if (!gamepad || !gamepad.buttons) return;

      const gripButton = gamepad.buttons[1];
      if (this.wasButtonJustPressed(index, 1, gripButton?.pressed || false)) {
        if (this.selectedFurnitureId) {
          this.onFurnitureDeselect?.(this.selectedFurnitureId);
          this.selectedFurnitureId = null;
          shouldCheckInputs = false;
        }
      }
    });

    if (!this.selectedFurnitureId || !shouldCheckInputs) return;

    let moveX = 0;
    let moveZ = 0;
    let moveY = 0;
    let rotateInput = 0;

    session.inputSources.forEach((source: any) => {
      const gamepad = source.gamepad;
      if (!gamepad) return;

      // Handle thumbstick click to toggle vertical mode
      const thumbstick_click = gamepad.buttons[3];
      if (thumbstick_click && thumbstick_click.pressed) {
        if (!this.wasThumbstickPressed) {
          const previousMode = this.verticalMovementMode;
          this.verticalMovementMode = !this.verticalMovementMode;
          this.wasThumbstickPressed = true;
          
          if (this.verticalMovementMode && !previousMode && this.selectedFurnitureId) {
            const isWallMounted = this.isWallMountedCallback?.(this.selectedFurnitureId) || false;
            if (isWallMounted) {
              this.onUnmountFromWall?.(this.selectedFurnitureId);
            }
          }
        }
      } else {
        this.wasThumbstickPressed = false;
      }

      if (source.handedness === "right" && gamepad.axes.length >= 4) {
        const x = this.getAxisValue(source, 2);
        const z = this.getAxisValue(source, 3);
        
        if (!this.verticalMovementMode) {
          if (this.isAxisActive(x)) moveX = x;  
          if (this.isAxisActive(z)) moveZ = z;
        } else {
          if (this.isAxisActive(z)) moveY = -z;
        }
      }

      if (source.handedness === "left" && gamepad.axes.length >= 4) {
        const r = this.getAxisValue(source, 2);
        if (this.isAxisActive(r)) rotateInput = -r;
      }
    });

    // Check if furniture is wall-mounted
    const isWallMounted = this.isWallMountedCallback?.(this.selectedFurnitureId) || false;
    
    if (isWallMounted && !this.verticalMovementMode && this.onWallFurnitureMove && (Math.abs(moveX) > 0 || Math.abs(moveZ) > 0 || Math.abs(moveY) > 0)) {
      const deltaVertical = -moveZ * this.config.moveSpeed * delta;
      const deltaHorizontal = moveX * this.config.moveSpeed * delta;
      const deltaInOut = moveY * this.config.moveSpeed * delta;
      this.onWallFurnitureMove(this.selectedFurnitureId, deltaVertical, deltaHorizontal, deltaInOut);
    } else if (Math.abs(moveX) > 0 || Math.abs(moveZ) > 0 || Math.abs(moveY) > 0) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, camera.up).normalize();

      const deltaPosition = new THREE.Vector3();
      deltaPosition.addScaledVector(forward, -moveZ * this.config.moveSpeed * delta);
      deltaPosition.addScaledVector(right, moveX * this.config.moveSpeed * delta);
      deltaPosition.y = moveY * this.config.moveSpeed * delta;

      this.onFurnitureMove?.(this.selectedFurnitureId, deltaPosition);
    }

    if (Math.abs(rotateInput) > 0) {
      const deltaRotation = rotateInput * this.config.rotateSpeed * delta;
      this.onFurnitureRotate?.(this.selectedFurnitureId, deltaRotation);
    }

    if (Math.abs(rotateInput) > 0) {
      const deltaRotation = rotateInput * this.config.rotateSpeed * delta;
      this.onFurnitureRotate?.(this.selectedFurnitureId, deltaRotation);
    }
  }

  reset(): void {
    this.selectedFurnitureId = null;
    this.verticalMovementMode = false;
    this.prevButtonState.clear();
  }
}