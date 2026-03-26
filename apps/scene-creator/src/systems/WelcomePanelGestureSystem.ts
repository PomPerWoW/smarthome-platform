import { createSystem, Entity } from "@iwsdk/core";
import { Vector3, Object3D } from "three";

/**
 * WelcomePanelGestureSystem
 * 
 * Detects hand gestures (palm up / come here) and summons the welcome panel
 * to appear in front of the user when the gesture is detected.
 */
export class WelcomePanelGestureSystem extends createSystem({}) {
  private welcomePanelEntity: Entity | null = null;
  private xrSession: XRSession | null = null;
  private gestureDetected = false;
  private gestureCooldown = 0;
  private readonly GESTURE_COOLDOWN_TIME = 2.0; // 2 seconds between gestures
  private readonly GESTURE_DETECTION_THRESHOLD = 0.7; // Confidence threshold
  private isFollowingCamera = false;
  private frameCallbackId: number | null = null;

  init(): void {
    console.log("[WelcomePanelGesture] System initializing...");

    // Get welcome panel reference from global
    this.welcomePanelEntity = (globalThis as any).__welcomePanelEntity;

    // Set up XR session listeners
    this.renderer.xr.addEventListener("sessionstart", () => {
      console.log("[WelcomePanelGesture] XR session started");
      const session = this.renderer.xr.getSession();
      if (session) {
        this.xrSession = session;
        this.setupHandTracking();
      }
    });

    this.renderer.xr.addEventListener("sessionend", () => {
      console.log("[WelcomePanelGesture] XR session ended");
      if (this.frameCallbackId !== null && this.xrSession) {
        this.xrSession.cancelAnimationFrame(this.frameCallbackId);
        this.frameCallbackId = null;
      }
      this.xrSession = null;
      this.isFollowingCamera = false;
    });

    // Initialize welcome panel reference if available
    if (!this.welcomePanelEntity) {
      // Try to get it from global after a short delay
      setTimeout(() => {
        this.welcomePanelEntity = (globalThis as any).__welcomePanelEntity;
        if (this.welcomePanelEntity) {
          console.log("[WelcomePanelGesture] Welcome panel reference found");
        }
      }, 1000);
    }
  }

  private setupHandTracking(): void {
    if (!this.xrSession) return;

    // Check if hand tracking is available
    // enabledFeatures might be a Set, an array, or might not exist
    let handTrackingSupported = false;

    if (this.xrSession.enabledFeatures) {
      // Check if it's a Set
      if (this.xrSession.enabledFeatures instanceof Set) {
        handTrackingSupported = this.xrSession.enabledFeatures.has("hand-tracking");
      }
      // Check if it's an array
      else if (Array.isArray(this.xrSession.enabledFeatures)) {
        handTrackingSupported = this.xrSession.enabledFeatures.includes("hand-tracking");
      }
      // Check if it has the feature as a property
      else if (typeof this.xrSession.enabledFeatures === "object") {
        handTrackingSupported = "hand-tracking" in this.xrSession.enabledFeatures;
      }
    }

    // If we can't determine from enabledFeatures, try to detect by checking input sources
    // Hand tracking input sources will have a 'hand' property
    if (!handTrackingSupported && this.xrSession.inputSources) {
      for (const inputSource of this.xrSession.inputSources) {
        if ((inputSource as any).hand !== undefined) {
          handTrackingSupported = true;
          break;
        }
      }
    }

    if (!handTrackingSupported) {
      console.warn(
        "[WelcomePanelGesture] Hand tracking not detected in this session. Gesture detection may not work."
      );
      // Still try to set up - maybe hand tracking will be available later
      // or the check method isn't reliable
    } else {
      console.log("[WelcomePanelGesture] Hand tracking enabled");
    }

    // Set up frame callback for gesture detection
    // This will gracefully handle cases where hand tracking isn't available
    this.setupFrameCallback();
  }

  /**
   * Detect palm-up gesture from hand tracking data
   * Palm up: wrist, middle finger MCP, and index finger MCP form a roughly horizontal plane
   * with palm facing upward (positive Y direction)
   */
  private detectPalmUpGesture(frame: XRFrame): boolean {
    if (!this.xrSession) return false;

    const inputSources = this.xrSession.inputSources;
    for (const inputSource of inputSources) {
      // Check if this input source has hand tracking
      if (!(inputSource as any).hand) continue;

      const hand = (inputSource as any).hand;
      const handPose = frame.getHandPose?.(hand as XRHand);

      if (!handPose) continue;

      try {
        // Get key joints for palm detection
        const wrist = handPose.joints.get("wrist");
        const middleMCP = handPose.joints.get("middle-finger-metacarpal");
        const indexMCP = handPose.joints.get("index-finger-metacarpal");
        const thumbTip = handPose.joints.get("thumb-tip");

        if (!wrist || !middleMCP || !indexMCP || !thumbTip) continue;

        // Check if joints are tracked
        if (
          wrist.jointRadius === undefined ||
          middleMCP.jointRadius === undefined ||
          indexMCP.jointRadius === undefined
        ) {
          continue;
        }

        // Get positions in reference space
        const referenceSpace = this.renderer.xr.getReferenceSpace();
        if (!referenceSpace) continue;

        const wristPose = frame.getPose(wrist.transform, referenceSpace);
        const middleMCPPose = frame.getPose(middleMCP.transform, referenceSpace);
        const indexMCPPose = frame.getPose(indexMCP.transform, referenceSpace);
        const thumbTipPose = frame.getPose(thumbTip.transform, referenceSpace);

        if (!wristPose || !middleMCPPose || !indexMCPPose || !thumbTipPose)
          continue;

        // Calculate vectors
        const wristPos = new Vector3(
          wristPose.transform.position.x,
          wristPose.transform.position.y,
          wristPose.transform.position.z
        );
        const middleMCPPos = new Vector3(
          middleMCPPose.transform.position.x,
          middleMCPPose.transform.position.y,
          middleMCPPose.transform.position.z
        );
        const indexMCPPos = new Vector3(
          indexMCPPose.transform.position.x,
          indexMCPPose.transform.position.y,
          indexMCPPose.transform.position.z
        );
        const thumbTipPos = new Vector3(
          thumbTipPose.transform.position.x,
          thumbTipPose.transform.position.y,
          thumbTipPose.transform.position.z
        );

        // Calculate palm normal (cross product of two vectors in the palm plane)
        const v1 = new Vector3().subVectors(middleMCPPos, wristPos);
        const v2 = new Vector3().subVectors(indexMCPPos, wristPos);
        const palmNormal = new Vector3().crossVectors(v1, v2).normalize();

        // Check if palm is facing up (normal pointing upward)
        // Palm up means normal Y component should be positive and significant
        const palmUpThreshold = 0.5; // 0.5 means ~60 degrees from horizontal
        if (palmNormal.y > palmUpThreshold) {
          // Additional check: fingers should be extended (thumb tip should be away from palm)
          const thumbDistance = thumbTipPos.distanceTo(wristPos);
          const palmSize = v1.length() + v2.length() / 2;

          // Thumb should be extended (distance > palm size)
          if (thumbDistance > palmSize * 0.8) {
            return true;
          }
        }
      } catch (error) {
        // Hand tracking API might not be fully available
        console.debug("[WelcomePanelGesture] Error reading hand pose:", error);
      }
    }

    return false;
  }

  /**
   * Alternative gesture detection: "Come here" gesture
   * Index finger extended, other fingers curled, moving toward user
   */
  private detectComeHereGesture(frame: XRFrame): boolean {
    if (!this.xrSession) return false;

    const inputSources = this.xrSession.inputSources;
    for (const inputSource of inputSources) {
      if (!(inputSource as any).hand) continue;

      const hand = (inputSource as any).hand;
      const handPose = frame.getHandPose?.(hand as XRHand);

      if (!handPose) continue;

      try {
        const referenceSpace = this.renderer.xr.getReferenceSpace();
        if (!referenceSpace) continue;

        // Get index finger joints
        const indexTip = handPose.joints.get("index-finger-tip");
        const indexMCP = handPose.joints.get("index-finger-metacarpal");
        const wrist = handPose.joints.get("wrist");

        if (!indexTip || !indexMCP || !wrist) continue;

        const indexTipPose = frame.getPose(indexTip.transform, referenceSpace);
        const indexMCPPose = frame.getPose(indexMCP.transform, referenceSpace);
        const wristPose = frame.getPose(wrist.transform, referenceSpace);

        if (!indexTipPose || !indexMCPPose || !wristPose) continue;

        const indexTipPos = new Vector3(
          indexTipPose.transform.position.x,
          indexTipPose.transform.position.y,
          indexTipPose.transform.position.z
        );
        const indexMCPPos = new Vector3(
          indexMCPPose.transform.position.x,
          indexMCPPose.transform.position.y,
          indexMCPPose.transform.position.z
        );
        const wristPos = new Vector3(
          wristPose.transform.position.x,
          wristPose.transform.position.y,
          wristPose.transform.position.z
        );

        // Check if index finger is extended (tip is far from MCP)
        const indexLength = indexTipPos.distanceTo(indexMCPPos);
        const handSize = indexMCPPos.distanceTo(wristPos);

        // Index finger should be extended (length > hand size)
        if (indexLength > handSize * 1.2) {
          // Check if other fingers are curled (simplified: check middle finger)
          const middleTip = handPose.joints.get("middle-finger-tip");
          const middleMCP = handPose.joints.get("middle-finger-metacarpal");

          if (middleTip && middleMCP) {
            const middleTipPose = frame.getPose(
              middleTip.transform,
              referenceSpace
            );
            const middleMCPPose = frame.getPose(
              middleMCP.transform,
              referenceSpace
            );

            if (middleTipPose && middleMCPPose) {
              const middleLength = new Vector3(
                middleTipPose.transform.position.x,
                middleTipPose.transform.position.y,
                middleTipPose.transform.position.z
              ).distanceTo(
                new Vector3(
                  middleMCPPose.transform.position.x,
                  middleMCPPose.transform.position.y,
                  middleMCPPose.transform.position.z
                )
              );

              // Middle finger should be curled (shorter than index)
              if (middleLength < indexLength * 0.7) {
                return true;
              }
            }
          }
        }
      } catch (error) {
        console.debug("[WelcomePanelGesture] Error in come-here detection:", error);
      }
    }

    return false;
  }

  /**
   * Position the welcome panel in front of the camera
   */
  private summonPanel(): void {
    if (!this.welcomePanelEntity || !this.welcomePanelEntity.object3D) {
      console.warn("[WelcomePanelGesture] Welcome panel not available");
      return;
    }

    const camera = this.world.camera;
    if (!camera) return;

    // Calculate position: 0.8m in front of camera, slightly below eye level
    const forward = new Vector3();
    camera.getWorldDirection(forward);

    const targetX = camera.position.x + forward.x * 0.8;
    const targetY = camera.position.y - 0.2; // Slightly below eye level
    const targetZ = camera.position.z + forward.z * 0.8;

    // Set panel position in 3D space
    // Note: If panel has ScreenSpace component, it might still work in 3D
    // but the ScreenSpace positioning might be overridden
    this.welcomePanelEntity.object3D.position.set(targetX, targetY, targetZ);

    // Make panel face the camera
    this.welcomePanelEntity.object3D.lookAt(camera.position);

    // Make panel visible
    this.welcomePanelEntity.object3D.visible = true;

    // Enable camera following
    this.isFollowingCamera = true;

    console.log("[WelcomePanelGesture] ✅ Panel summoned to user via hand gesture");
  }

  /**
   * Update panel position to follow camera
   */
  private updatePanelFollow(dt: number): void {
    if (!this.isFollowingCamera) return;
    if (!this.welcomePanelEntity || !this.welcomePanelEntity.object3D) return;

    const camera = this.world.camera;
    if (!camera) return;

    const panelObj = this.welcomePanelEntity.object3D;

    // Calculate target position
    const forward = new Vector3();
    camera.getWorldDirection(forward);

    const targetX = camera.position.x + forward.x * 0.8;
    const targetY = camera.position.y - 0.2;
    const targetZ = camera.position.z + forward.z * 0.8;

    // Smoothly lerp to target position
    const lerpSpeed = 5.0; // Adjust for smoother/faster following
    const t = Math.min(1, lerpSpeed * dt);

    panelObj.position.x += (targetX - panelObj.position.x) * t;
    panelObj.position.y += (targetY - panelObj.position.y) * t;
    panelObj.position.z += (targetZ - panelObj.position.z) * t;

    // Always face the camera
    panelObj.lookAt(camera.position);
  }

  update(dt: number): void {
    // Update cooldown
    if (this.gestureCooldown > 0) {
      this.gestureCooldown -= dt;
    }

    // Update panel follow if active
    this.updatePanelFollow(dt);

    // Gesture detection happens in the XR frame callback (setupFrameCallback)
    // This update method just handles cooldown and panel following
  }

  /**
   * Set up frame callback for hand tracking
   * This should be called when XR session starts
   */
  private setupFrameCallback(): void {
    if (!this.xrSession) return;

    // Request animation frame for XR
    const onXRFrame = (time: number, frame: XRFrame) => {
      if (!this.xrSession) return;

      try {
        // Detect gestures - these methods will gracefully handle missing hand data
        const palmUp = this.detectPalmUpGesture(frame);
        const comeHere = this.detectComeHereGesture(frame);

        if ((palmUp || comeHere) && this.gestureCooldown <= 0) {
          this.gestureDetected = true;
          this.gestureCooldown = this.GESTURE_COOLDOWN_TIME;
          this.summonPanel();
        } else {
          this.gestureDetected = false;
        }
      } catch (error) {
        // Silently handle errors - hand tracking might not be fully available
        // This is expected in some environments
        console.debug("[WelcomePanelGesture] Error in gesture detection:", error);
      }

      // Continue frame loop
      this.frameCallbackId = this.xrSession.requestAnimationFrame(onXRFrame);
    };

    // Start the frame loop
    this.frameCallbackId = this.xrSession.requestAnimationFrame(onXRFrame);
  }
}
