import {
  createSystem,
  Entity,
  Object3D,
  AssetManager,
  AnimationMixer,
  AnimationAction,
  LoopOnce,
} from "@iwsdk/core";

import { Box3, MathUtils, Quaternion, SkinnedMesh, Vector3 } from "three";
import { SkeletonUtils } from "three-stdlib";
import { Lipsync, VISEMES } from "wawa-lipsync";
import { UserControlledAvatarComponent } from "../components/UserControlledAvatarComponent";
import { clampToWalkableArea, getRoomBounds } from "../config/navmesh";

// ============================================================================
// LIP SYNC CONFIG
// ============================================================================

const LIPSYNC_LERP_SPEED = { vowel: 0.15, consonant: 0.35, reset: 0.1 };
// Faster transitions for microphone mode (real-time needs quicker response)
const MIC_LIPSYNC_LERP_SPEED = { vowel: 0.25, consonant: 0.45, reset: 0.15 };
// Minimum volume threshold for mic mode (filters out background noise)
const MIC_VOLUME_THRESHOLD = 0.01;
// Smoothing window size for mic visemes (reduces jitter)
const MIC_VISEME_SMOOTHING_WINDOW = 3;
const DEBUG_LIPSYNC = true; // Set to false to disable debug logs

// ============================================================================
// CONFIG (Ready Player Me: forwardOffset = Math.PI so I/K/J/L face movement)
// ============================================================================

const FADE_DURATION = 0.2;
const RUN_VELOCITY = 2.5;
const WALK_VELOCITY = 1.0;
const ROTATE_SPEED = 0.2;

// Ready Player Me / test.glb: model forward is opposite; add 180° so avatar faces movement direction
const RPM_FORWARD_OFFSET = Math.PI;

// Keys: I=W, J=A, K=S, L=D
const KEY_FORWARD = "i";
const KEY_BACK = "k";
const KEY_LEFT = "j";
const KEY_RIGHT = "l";
const DIRECTIONS = [KEY_FORWARD, KEY_BACK, KEY_LEFT, KEY_RIGHT];

// ============================================================================
// AVATAR RECORD
// ============================================================================

interface RPMUserControlledAvatarRecord {
  entity: Entity;
  model: Object3D;
  mixer: AnimationMixer;
  animationsMap: Map<string, AnimationAction>;
  currentAction: string;
  toggleRun: boolean;
  walkDirection: Vector3;
  rotateAngle: Vector3;
  rotateQuaternion: Quaternion;
  cameraTarget: Vector3;
  forwardOffset: number;
  isPlayingJump: boolean;
  previousActionBeforeJump: string;
  isPlayingWave: boolean;
  previousActionBeforeWave: string;
  isSitting: boolean;
  previousActionBeforeSit: string;
  isSleeping: boolean;
  previousActionBeforeSleep: string;
  morphTargetMeshes: SkinnedMesh[];
}

// ============================================================================
// RPM USER CONTROLLED AVATAR SYSTEM (clip-based, for Ready Player Me / test.glb)
// ============================================================================

export class RPMUserControlledAvatarSystem extends createSystem({
  controlledAvatars: {
    required: [UserControlledAvatarComponent],
  },
}) {
  private avatarRecords: Map<string, RPMUserControlledAvatarRecord> = new Map();
  private keyStates: Map<string, boolean> = new Map();
  private currentControlledAvatarId: string | null = null;
  private followCamera: { position: Vector3; getWorldDirection: (target: Vector3) => Vector3; lookAt?: (a: any, b?: any, c?: any) => void } | null = null;
  // When false, this system does not process input or camera (used by avatar switcher)
  private active = true;

  // Lip sync
  private lipsyncManager = new Lipsync();
  private audioElement = new Audio();
  private isSpeaking = false;
  private useMicrophoneMode = false;
  // Mic source from connectMicrophone(); disconnect when turning off mic so pre-scripted audio can play again.
  private micSource: MediaStreamAudioSourceNode | null = null;
  // Viseme history for smoothing in mic mode
  private micVisemeHistory: (typeof VISEMES[keyof typeof VISEMES])[] = [];

  init() {
    console.log("[RPMUserControlledAvatar] System initialized (Ready Player Me / test.glb, forwardOffset=π + lip sync)");
    this.setupKeyboardControls();
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.addEventListener("ended", () => this.onSpeechEnded());
  }

  setCamera(cam: { position: Vector3; getWorldDirection: (target: Vector3) => Vector3; lookAt?: (a: any, b?: any, c?: any) => void }) {
    this.followCamera = cam;
  }

  setActive(active: boolean): void {
    if (active) this.keyStates.clear();
    this.active = active;
  }

  private setupKeyboardControls(): void {
    window.addEventListener("keydown", (event) => {
      if (!this.active) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) return;
      const key = event.key.toLowerCase();
      this.keyStates.set(key, true);
      if (key === "h" && this.currentControlledAvatarId) {
        const record = this.avatarRecords.get(this.currentControlledAvatarId);
        if (record) record.toggleRun = !record.toggleRun;
        event.preventDefault();
      }
      if (event.key === " ") {
        event.preventDefault();
        this.handleJump();
      }
      if (key === "u") {
        event.preventDefault();
        this.handleWave();
      }
      if (key === "m") {
        event.preventDefault();
        this.handleSit();
      }
      if (key === "n") {
        event.preventDefault();
        this.handleSleep();
      }
    });
    window.addEventListener("keyup", (event) => {
      if (!this.active) return;
      this.keyStates.set(event.key.toLowerCase(), false);
    });
  }

  private isKeyPressed(key: string): boolean {
    return this.keyStates.get(key.toLowerCase()) === true;
  }

  private directionOffset(): number {
    const I = this.isKeyPressed(KEY_FORWARD);
    const K = this.isKeyPressed(KEY_BACK);
    const J = this.isKeyPressed(KEY_LEFT);
    const L = this.isKeyPressed(KEY_RIGHT);
    let directionOffset = 0;
    if (I) {
      if (J) directionOffset = Math.PI / 4;
      else if (L) directionOffset = -Math.PI / 4;
    } else if (K) {
      if (J) directionOffset = Math.PI / 4 + Math.PI / 2;
      else if (L) directionOffset = -Math.PI / 4 - Math.PI / 2;
      else directionOffset = Math.PI;
    } else if (J) directionOffset = Math.PI / 2;
    else if (L) directionOffset = -Math.PI / 2;
    return directionOffset;
  }

  async createRPMUserControlledAvatar(
    avatarId: string,
    avatarName: string,
    modelKey: string,
    position: [number, number, number]
  ): Promise<Entity | null> {
    try {
      const gltf = AssetManager.getGLTF(modelKey);
      if (!gltf) {
        console.error(`[RPMUserControlledAvatar] Model not found: ${modelKey}`);
        return null;
      }

      const avatarModel = SkeletonUtils.clone(gltf.scene) as Object3D;
      avatarModel.scale.setScalar(0.5);
      avatarModel.position.set(position[0], position[1], position[2]);
      avatarModel.rotation.set(0, 0, 0);

      this.world.scene.add(avatarModel);

      const bounds = getRoomBounds();
      const floorY = bounds?.floorY ?? position[1];
      const box = new Box3().setFromObject(avatarModel as any);
      const feetY = floorY - box.min.y + position[1];
      avatarModel.position.y = feetY;

      const clips: unknown[] = Array.isArray(gltf.animations) ? gltf.animations : [];
      const rawClipNames = clips.map((c: any) => c?.name ?? "(no name)");
      console.log(`[RPMUserControlledAvatar] 📋 ${avatarName} (${modelKey}) — clips:`, rawClipNames.length ? rawClipNames : "(none)");

      const mixer = new AnimationMixer(avatarModel);
      const animationsMap = new Map<string, AnimationAction>();
      for (const clip of clips) {
        const c = clip as { name?: string };
        if (!c.name || c.name === "TPose" || c.name.toLowerCase() === "tpose") continue;
        const action = mixer.clipAction(clip as any);
        if (action) {
          if (c.name === "Jump") {
            action.setLoop(LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          animationsMap.set(c.name, action);
        }
      }
      console.log(`[RPMUserControlledAvatar] 🎬 ${avatarName} — animations:`, Array.from(animationsMap.keys()));

      const entity = this.world.createTransformEntity(avatarModel);
      entity.addComponent(UserControlledAvatarComponent, {
        avatarId,
        avatarName,
        baseY: feetY,
        isSelected: this.currentControlledAvatarId === null,
      });

      const currentAction = animationsMap.has("Idle") ? "Idle" : Array.from(animationsMap.keys())[0] || "Idle";
      animationsMap.forEach((action, key) => {
        if (key === currentAction) action.play();
      });

      // Find meshes with viseme blendshapes for lip sync (Ready Player Me)
      // Use Wolf3D_Head (face) - primary mesh for mouth visemes; Wolf3D_Teeth for teeth
      const morphTargetMeshes: SkinnedMesh[] = [];
      avatarModel.traverse((child) => {
        const maybeSkinnedMesh = child as any;
        if (
          maybeSkinnedMesh.isSkinnedMesh &&
          maybeSkinnedMesh.morphTargetDictionary &&
          maybeSkinnedMesh.morphTargetInfluences &&
          maybeSkinnedMesh.morphTargetDictionary["viseme_aa"] !== undefined
        ) {
          const name = maybeSkinnedMesh.name || "";
          if (name.includes("Head") || name.includes("Teeth")) {
            morphTargetMeshes.push(maybeSkinnedMesh as SkinnedMesh);
            console.log(`[RPMUserControlledAvatar] 🎤 Lip sync mesh: ${name}`);
          }
        }
      });
      if (morphTargetMeshes.length === 0) {
        console.warn(`[RPMUserControlledAvatar] ⚠️ No lip sync blendshapes found for ${avatarName}`);
      }

      const record: RPMUserControlledAvatarRecord = {
        entity,
        model: avatarModel,
        mixer,
        animationsMap,
        currentAction,
        toggleRun: false,
        walkDirection: new Vector3(),
        rotateAngle: new Vector3(0, 1, 0),
        rotateQuaternion: new Quaternion(),
        cameraTarget: new Vector3(),
        forwardOffset: RPM_FORWARD_OFFSET,
        isPlayingJump: false,
        previousActionBeforeJump: "Idle",
        isPlayingWave: false,
        previousActionBeforeWave: "Idle",
        isSitting: false,
        previousActionBeforeSit: "Idle",
        isSleeping: false,
        previousActionBeforeSleep: "Idle",
        morphTargetMeshes,
      };
      this.avatarRecords.set(avatarId, record);

      if (this.currentControlledAvatarId === null) {
        this.currentControlledAvatarId = avatarId;
      }

      console.log(`[RPMUserControlledAvatar] ✅ Created: ${avatarName} (animations: ${Array.from(animationsMap.keys()).join(", ")})`);
      return entity;
    } catch (error) {
      console.error(`[RPMUserControlledAvatar] Failed to create ${avatarName}:`, error);
      return null;
    }
  }

  private handleJump(): void {
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;
    if (!record.animationsMap.has("Jump") || record.isPlayingJump) return;
    if (record.isSitting || record.isSleeping) return; // no jump while sitting/sleeping
    record.previousActionBeforeJump = record.currentAction;
    const jumpAction = record.animationsMap.get("Jump")!;
    const current = record.animationsMap.get(record.currentAction);
    if (current) current.fadeOut(FADE_DURATION);
    jumpAction.reset().fadeIn(FADE_DURATION).play();
    record.currentAction = "Jump";
    record.isPlayingJump = true;
    const onJumpFinished = (): void => {
      record.mixer.removeEventListener("finished", onJumpFinished);
      record.isPlayingJump = false;
      jumpAction.fadeOut(FADE_DURATION);
      const restore = record.animationsMap.get(record.previousActionBeforeJump);
      if (restore) {
        restore.reset().fadeIn(FADE_DURATION).play();
        record.currentAction = record.previousActionBeforeJump;
      }
    };
    record.mixer.addEventListener("finished", onJumpFinished);
  }

  private handleWave(): void {
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;
    if (!record.animationsMap.has("Wave") || record.isPlayingWave) return;
    if (record.isSitting || record.isSleeping) return; // no wave while sitting/sleeping
    record.previousActionBeforeWave = record.currentAction;
    const waveAction = record.animationsMap.get("Wave")!;
    waveAction.setLoop(LoopOnce, 1);
    const current = record.animationsMap.get(record.currentAction);
    if (current) current.fadeOut(FADE_DURATION);
    waveAction.reset().fadeIn(FADE_DURATION).play();
    record.currentAction = "Wave";
    record.isPlayingWave = true;
    const onWaveFinished = (): void => {
      record.mixer.removeEventListener("finished", onWaveFinished);
      record.isPlayingWave = false;
      waveAction.fadeOut(FADE_DURATION);
      const restore = record.animationsMap.get(record.previousActionBeforeWave);
      if (restore) {
        restore.reset().fadeIn(FADE_DURATION).play();
        record.currentAction = record.previousActionBeforeWave;
      }
    };
    record.mixer.addEventListener("finished", onWaveFinished);
  }

  private handleSit(): void {
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;
    if (!record.animationsMap.has("Sit")) return;
    if (record.isPlayingJump || record.isPlayingWave) return;

    const sitAction = record.animationsMap.get("Sit")!;

    if (record.isSitting) {
      // Stand up: fade back to previous action
      sitAction.fadeOut(FADE_DURATION);
      const restore = record.animationsMap.get(record.previousActionBeforeSit);
      if (restore) {
        restore.reset().fadeIn(FADE_DURATION).play();
        record.currentAction = record.previousActionBeforeSit;
      }
      record.isSitting = false;
    } else {
      // Sit down: play Sit (looping) and save previous action
      record.previousActionBeforeSit = record.currentAction;
      record.isSleeping = false; // can't sit and sleep at once
      const current = record.animationsMap.get(record.currentAction);
      if (current) current.fadeOut(FADE_DURATION);
      sitAction.reset().fadeIn(FADE_DURATION).play();
      record.currentAction = "Sit";
      record.isSitting = true;
    }
  }

  private handleSleep(): void {
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;
    if (!record.animationsMap.has("Sleep")) return;
    if (record.isPlayingJump || record.isPlayingWave) return;

    const sleepAction = record.animationsMap.get("Sleep")!;

    if (record.isSleeping) {
      // Wake up: fade back to previous action
      sleepAction.fadeOut(FADE_DURATION);
      const restore = record.animationsMap.get(record.previousActionBeforeSleep);
      if (restore) {
        restore.reset().fadeIn(FADE_DURATION).play();
        record.currentAction = record.previousActionBeforeSleep;
      }
      record.isSleeping = false;
    } else {
      // Sleep: play Sleep (looping) and save previous action
      record.previousActionBeforeSleep = record.currentAction;
      record.isSitting = false; // can't sit and sleep at once
      const current = record.animationsMap.get(record.currentAction);
      if (current) current.fadeOut(FADE_DURATION);
      sleepAction.reset().fadeIn(FADE_DURATION).play();
      record.currentAction = "Sleep";
      record.isSleeping = true;
    }
  }

  // ============================================================================
  // LIP SYNC
  // ============================================================================

  /** Play pre-scripted audio with lip sync */
  speak(audioUrl: string): void {
    const record = this.getCurrentRecord();
    if (!record || record.morphTargetMeshes.length === 0) {
      console.warn("[RPMUserControlledAvatar] Cannot speak: no avatar or no lip sync blendshapes");
      return;
    }
    if (this.useMicrophoneMode) {
      console.warn("[RPMUserControlledAvatar] Switch off microphone mode first to play pre-scripted audio");
      return;
    }
    
    // Stop any current playback first
    this.stopSpeaking();
    
    // Set the new source and connect to lipsync manager
    this.audioElement.src = audioUrl;
    this.lipsyncManager.connectAudio(this.audioElement);
    
    // Set speaking state and play
    this.isSpeaking = true;
    this.audioElement.play().catch((err) => {
      // AbortError is expected when src changes while audio is loading
      // Silently ignore it - the audio will play once it loads
      if (err.name !== "AbortError") {
        console.error("[RPMUserControlledAvatar] Audio play failed:", err);
        this.onSpeechEnded();
      }
      // For AbortError, retry once when audio is ready to play
      else if (this.isSpeaking) {
        const retryPlay = () => {
          if (this.isSpeaking && this.audioElement.readyState >= 2) {
            this.audioElement.play().catch((retryErr) => {
              if (retryErr.name !== "AbortError") {
                console.error("[RPMUserControlledAvatar] Audio play failed on retry:", retryErr);
                this.onSpeechEnded();
              }
            });
          }
        };
        this.audioElement.addEventListener("canplay", retryPlay, { once: true });
      }
    });
    console.log("[RPMUserControlledAvatar] 🗣️ Speaking:", audioUrl);
  }

  /**
   * Stop speaking and close mouth (also disables microphone mode).
   * When in microphone mode, does nothing and returns false; call setMicrophoneMode(false) to stop mic mode.
   */
  stopSpeaking(): boolean {
    if (this.useMicrophoneMode) {
      console.warn("[RPMUserControlledAvatar] Switch off microphone mode first to stop");
      return false;
    }
    this.isSpeaking = false;
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    const record = this.getCurrentRecord();
    if (record) this.resetAllVisemes(record);
    console.log("[RPMUserControlledAvatar] 🔇 Stop speaking");
    return true;
  }

  // Toggle microphone mode - lip sync to user's voice
  async setMicrophoneMode(enabled: boolean): Promise<void> {
    if (this.useMicrophoneMode === enabled) return;
    if (enabled) {
      // Stop pre-scripted audio but keep useMicrophoneMode intent (stopSpeaking clears it)
      this.isSpeaking = false;
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      const record = this.getCurrentRecord();
      if (record) this.resetAllVisemes(record);
      try {
        const lipsyncAny = this.lipsyncManager as any;
        if (lipsyncAny.audioContext && typeof lipsyncAny.audioContext.resume === "function") {
          await lipsyncAny.audioContext.resume();
        }
        if (Array.isArray(lipsyncAny.history)) {
          lipsyncAny.history = [];
        }
        lipsyncAny.features = null;
        lipsyncAny.state = "silence";
        lipsyncAny.visemeStartTime = performance.now();
        
        // Clear viseme history for fresh start
        this.micVisemeHistory = [];
        
        this.micSource = await this.lipsyncManager.connectMicrophone();
        
        // Configure microphone constraints for better quality
        if (this.micSource && this.micSource.mediaStream) {
          const audioTracks = this.micSource.mediaStream.getAudioTracks();
          for (const track of audioTracks) {
            // Request better audio quality settings
            const constraints = {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 44100,
            };
            try {
              await track.applyConstraints(constraints);
            } catch (e) {
              // Some browsers may not support all constraints
              console.log("[RPMUserControlledAvatar] Some audio constraints not supported:", e);
            }
          }
        }
        
        // Disconnect analyser from speakers so user doesn't hear their own voice
        lipsyncAny.analyser?.disconnect?.();
        
        // Try to configure analyser for better frequency analysis
        if (lipsyncAny.analyser) {
          lipsyncAny.analyser.fftSize = 2048; // Higher FFT size for better frequency resolution
          lipsyncAny.analyser.smoothingTimeConstant = 0.3; // Less smoothing for more responsive visemes
        }
        
        this.useMicrophoneMode = true;
        console.log("[RPMUserControlledAvatar] 🎤 Microphone mode ON (muted: no speaker output, optimized for lip sync)");
      } catch (err) {
        console.error("[RPMUserControlledAvatar] Microphone access failed:", err);
        this.useMicrophoneMode = false;
      }
    } else {
      this.useMicrophoneMode = false;
      // Clear viseme history when turning off mic mode
      this.micVisemeHistory = [];
      
      // Disconnect mic from analyser and reconnect analyser to destination so pre-scripted audio (1/2) plays again.
      // After connectMicrophone() we had called analyser.disconnect(), so playback was silent until we fix the graph.
      if (this.micSource) {
        try {
          // Stop all tracks to release microphone
          if (this.micSource.mediaStream) {
            this.micSource.mediaStream.getTracks().forEach(track => track.stop());
          }
          this.micSource.disconnect();
        } catch (_) {}
        this.micSource = null;
      }
      const lipsyncAny = this.lipsyncManager as any;
      if (lipsyncAny.analyser && lipsyncAny.audioContext?.destination) {
        lipsyncAny.analyser.connect(lipsyncAny.audioContext.destination);
      }
      const record = this.getCurrentRecord();
      if (record) this.resetAllVisemes(record);
      console.log("[RPMUserControlledAvatar] 🎤 Microphone mode OFF");
    }
  }

  isMicrophoneMode(): boolean {
    return this.useMicrophoneMode;
  }

  private onSpeechEnded(): void {
    this.isSpeaking = false;
    const record = this.getCurrentRecord();
    if (record) this.resetAllVisemes(record);
  }

  private getCurrentRecord(): RPMUserControlledAvatarRecord | null {
    if (!this.currentControlledAvatarId) return null;
    return this.avatarRecords.get(this.currentControlledAvatarId) ?? null;
  }

  private applyViseme(record: RPMUserControlledAvatarRecord, visemeName: string, weight: number, speed: number): void {
    for (const mesh of record.morphTargetMeshes) {
      const index = mesh.morphTargetDictionary![visemeName];
      if (index !== undefined && mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences[index] = MathUtils.lerp(
          mesh.morphTargetInfluences[index],
          weight,
          speed
        );
      }
    }
  }

  private resetAllVisemes(record: RPMUserControlledAvatarRecord): void {
    const allVisemes = Object.values(VISEMES);
    for (const mesh of record.morphTargetMeshes) {
      for (const viseme of allVisemes) {
        const index = mesh.morphTargetDictionary![viseme];
        if (index !== undefined && mesh.morphTargetInfluences) {
          mesh.morphTargetInfluences[index] = 0;
        }
      }
    }
  }

  private processLipSyncCallCount = 0;

  private processLipSync(): void {
    const record = this.getCurrentRecord();
    if (!record || record.morphTargetMeshes.length === 0) {
      if (DEBUG_LIPSYNC && this.useMicrophoneMode) console.log("[RPMUserControlledAvatar] processLipSync SKIP: no record or no meshes");
      return;
    }
    if (!this.isSpeaking && !this.useMicrophoneMode) return;

    this.lipsyncManager.processAudio();
    let currentViseme = this.lipsyncManager.viseme;
    let shouldResetVisemes = false;

    // For microphone mode: apply volume threshold and smoothing
    if (this.useMicrophoneMode) {
      const lipsyncAny = this.lipsyncManager as any;
      const volume = lipsyncAny.features?.volume ?? 0;
      
      // Filter out low-volume noise
      if (volume < MIC_VOLUME_THRESHOLD) {
        // Reset all visemes when volume is too low (silence)
        shouldResetVisemes = true;
      } else {
        // Apply smoothing to reduce jitter
        this.micVisemeHistory.push(currentViseme);
        if (this.micVisemeHistory.length > MIC_VISEME_SMOOTHING_WINDOW) {
          this.micVisemeHistory.shift();
        }
        
        // Use most common viseme in the smoothing window
        const visemeCounts = new Map<typeof VISEMES[keyof typeof VISEMES], number>();
        for (const viseme of this.micVisemeHistory) {
          visemeCounts.set(viseme, (visemeCounts.get(viseme) || 0) + 1);
        }
        let maxCount = 0;
        let mostCommonViseme = currentViseme;
        for (const [viseme, count] of visemeCounts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            mostCommonViseme = viseme;
          }
        }
        currentViseme = mostCommonViseme;
      }

      if (DEBUG_LIPSYNC) {
        this.processLipSyncCallCount++;
        if (this.processLipSyncCallCount <= 5 || this.processLipSyncCallCount % 120 === 0) {
          const vol = volume.toFixed(3);
          console.log(`[RPMUserControlledAvatar] #${this.processLipSyncCallCount} viseme: ${currentViseme} vol: ${vol} (threshold: ${MIC_VOLUME_THRESHOLD})`);
        }
      }
    }

    // Use different lerp speeds for mic mode vs pre-recorded audio
    const lerpSpeeds = this.useMicrophoneMode ? MIC_LIPSYNC_LERP_SPEED : LIPSYNC_LERP_SPEED;
    
    // If volume is too low, reset all visemes instead of applying current viseme
    if (shouldResetVisemes) {
      this.resetAllVisemes(record);
      return;
    }
    
    const isVowel = ["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U"].includes(currentViseme);
    const lerpSpeed = isVowel ? lerpSpeeds.vowel : lerpSpeeds.consonant;

    this.applyViseme(record, currentViseme, 1, lerpSpeed);
    for (const viseme of Object.values(VISEMES)) {
      if (viseme !== currentViseme) {
        this.applyViseme(record, viseme, 0, lerpSpeeds.reset);
      }
    }
  }

  private updateCameraTarget(record: RPMUserControlledAvatarRecord, moveX: number, moveZ: number): void {
    if (!this.followCamera) return;
    this.followCamera.position.x += moveX;
    this.followCamera.position.z += moveZ;
    record.cameraTarget.x = record.model.position.x;
    record.cameraTarget.y = record.model.position.y + 1;
    record.cameraTarget.z = record.model.position.z;
    if (this.followCamera.lookAt) {
      this.followCamera.lookAt(record.cameraTarget);
    }
  }

  private updateCallCount = 0;

  update(dt: number): void {
    // Always advance all avatar mixers so inactive avatars keep playing Idle (no T-pose freeze)
    for (const record of this.avatarRecords.values()) {
      record.mixer.update(dt);
    }
    if (!this.active) return;
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;

    if (DEBUG_LIPSYNC && this.useMicrophoneMode) {
      this.updateCallCount++;
      if (this.updateCallCount === 1) console.log("[RPMUserControlledAvatar] update() running with mic mode ON");
    }

    this.processLipSync();

    const directionPressed = DIRECTIONS.some((k) => this.isKeyPressed(k));
    if (!record.isPlayingJump && !record.isPlayingWave && !record.isSitting && !record.isSleeping) {
      let play = "Idle";
      if (directionPressed && record.toggleRun && record.animationsMap.has("Run")) {
        play = "Run";
      } else if (directionPressed && (record.animationsMap.has("Walk") || record.animationsMap.has("Walking"))) {
        play = record.animationsMap.has("Walk") ? "Walk" : "Walking";
      } else if (record.animationsMap.has("Idle")) {
        play = "Idle";
      } else {
        play = record.currentAction;
      }

      if (record.animationsMap.has(play) && record.currentAction !== play) {
        const toPlay = record.animationsMap.get(play)!;
        const current = record.animationsMap.get(record.currentAction);
        if (current) {
          current.fadeOut(FADE_DURATION);
        }
        toPlay.reset().fadeIn(FADE_DURATION).play();
        record.currentAction = play;
      }
    }

    // Lock movement during Jump/Wave/Sit: IJKL pressed but no position/rotation update
    if (directionPressed && this.followCamera && !record.isPlayingWave && !record.isSitting && !record.isSleeping) {
      const angleYCameraDirection = Math.atan2(
        this.followCamera.position.x - record.model.position.x,
        this.followCamera.position.z - record.model.position.z
      );
      const directionOffset = this.directionOffset();

      record.rotateQuaternion.setFromAxisAngle(record.rotateAngle, angleYCameraDirection + directionOffset + record.forwardOffset);
      (record.model as any).quaternion.rotateTowards(record.rotateQuaternion, ROTATE_SPEED);

      this.followCamera.getWorldDirection(record.walkDirection);
      record.walkDirection.y = 0;
      record.walkDirection.normalize();
      record.walkDirection.applyAxisAngle(record.rotateAngle, directionOffset);

      const velocity =
        record.currentAction === "Run" ? RUN_VELOCITY : WALK_VELOCITY;
      const moveX = record.walkDirection.x * velocity * dt;
      const moveZ = record.walkDirection.z * velocity * dt;

      record.model.position.x += moveX;
      record.model.position.z += moveZ;

      const [clampedX, clampedZ] = clampToWalkableArea(
        record.model.position.x,
        record.model.position.z
      );
      record.model.position.x = clampedX;
      record.model.position.z = clampedZ;

      this.updateCameraTarget(record, moveX, moveZ);
    }

  }

  switchToAvatar(avatarId: string): void {
    if (!this.avatarRecords.has(avatarId)) return;
    if (this.currentControlledAvatarId) {
      const r = this.avatarRecords.get(this.currentControlledAvatarId);
      if (r) r.entity.setValue(UserControlledAvatarComponent, "isSelected", false);
    }
    this.currentControlledAvatarId = avatarId;
    const r = this.avatarRecords.get(avatarId);
    if (r) r.entity.setValue(UserControlledAvatarComponent, "isSelected", true);
  }

  getCurrentAvatarId(): string | null {
    return this.currentControlledAvatarId;
  }

  destroy(): void {
    this.setMicrophoneMode(false);
    this.stopSpeaking();
    this.audioElement.src = "";
    for (const [, record] of this.avatarRecords) {
      record.mixer.stopAllAction();
      const obj = record.entity.object3D;
      if (obj?.parent) obj.parent.remove(obj);
      record.entity.destroy();
    }
    this.avatarRecords.clear();
    this.followCamera = null;
    console.log("[RPMUserControlledAvatar] System destroyed");
  }
}
