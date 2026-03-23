import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
  Object3D,
} from "@iwsdk/core";

import { VoiceControlSystem } from "../systems/VoiceControlSystem";
import { RobotAssistantSystem } from "../systems/RobotAssistantSystem";
import { DialogueOverlay } from "./DialogueOverlay";
import { sceneNotify, SN_ICONS } from "./SceneNotification";

// ============================================================================
// Dialogue interaction states
// ============================================================================

enum DialogueState {
  /** Normal — no voice interaction in progress */
  IDLE = 0,
  /** Robot is walking toward the user; dialogue overlay is showing */
  APPROACHING = 1,
  /** Robot arrived; voice listening / processing / responding */
  ACTIVE = 2,
  /** Interaction ended; dialogue fading out */
  CLOSING = 3,
}

const CLOSING_DURATION = 1.5; // Seconds in CLOSING state before going IDLE

export class VoicePanelSystem extends createSystem({
  voicePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/voice_panel.json")],
  },
}) {
  private voiceSystem!: VoiceControlSystem;
  private _robotSystem: RobotAssistantSystem | null = null;
  private _robotSystemResolved = false;
  private currentStatus: "listening" | "processing" | "idle" = "idle";

  // Follow logic - store reference to the panel's Object3D
  private panelObject3D: any = null;

  // Status reset timer
  private resetStatusTimeout: any = null;

  // ── Dialogue orchestration ──
  private dialogue: DialogueOverlay | null = null;
  private dialogueState: DialogueState = DialogueState.IDLE;

  // Dialogue closing timer
  private closingTimer = 0;

  // Track if we're in an active conversation (robot is waiting for user response)
  private inActiveConversation = false;

  // 3D panel status text reference
  private statusTextRef: UIKit.Text | null = null;
  private micButtonRef: UIKit.Container | null = null;

  /** Lazily resolve RobotAssistantSystem — safe even if called before
   *  the robot entity is created. */
  private get robotSystem(): RobotAssistantSystem | null {
    if (!this._robotSystemResolved) {
      this._robotSystem =
        (this.world.getSystem(RobotAssistantSystem) as RobotAssistantSystem) ??
        null;
      if (this._robotSystem) {
        this._robotSystemResolved = true;
        console.log("[VoicePanel] ✅ Found RobotAssistantSystem");
      }
    }
    return this._robotSystem;
  }

  init() {
    this.voiceSystem = VoiceControlSystem.getInstance();
    this.dialogue = new DialogueOverlay();

    // Register a callback for robot messages (to be called by RobotAssistantSystem)
    this.setupRobotMessageListener();

    this.queries.voicePanel.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) return;

      // Store the Object3D reference for follow behavior
      this.panelObject3D = entity.object3D;

      const micButton = document.getElementById(
        "mic-button",
      ) as UIKit.Container;
      const statusText = document.getElementById("voice-status") as UIKit.Text;

      this.micButtonRef = micButton;
      this.statusTextRef = statusText;

      if (micButton) {
        micButton.addEventListener("click", () => {
          // Haptic feedback if available (simulated)
          if (navigator.vibrate) navigator.vibrate(50);
          this.handleMicClick();
        });
      }

      // ── Transcript listener ──────────────────────────────────
      this.voiceSystem.setTranscriptListener((text) => {
        // Update 3D panel status
        if (statusText) {
          statusText.setProperties({ text: `"${text}"` });

          if (this.resetStatusTimeout) clearTimeout(this.resetStatusTimeout);
          this.resetStatusTimeout = setTimeout(() => {
            if (this.currentStatus === "idle") {
              statusText.setProperties({ text: "Say 'Turn on...'" });
            }
          }, 3000);
        }

        // Update dialogue overlay — show user message
        if (this.dialogue && this.dialogue.isVisible()) {
          this.dialogue.hideTyping();
          this.dialogue.addUserMessage(text);
        }
      });

      // ── Voice status listener ────────────────────────────────
      this.voiceSystem.addStatusListener((status, payload) => {
        this.currentStatus = status;

        // Update 3D panel appearance
        if (micButton && statusText) {
          if (status === "listening") {
            micButton.setProperties({ backgroundColor: "#ef4444" }); // Red
            statusText.setProperties({ text: "Listening..." });
            if (this.resetStatusTimeout) clearTimeout(this.resetStatusTimeout);
          } else if (status === "processing") {
            micButton.setProperties({ backgroundColor: "#eab308" }); // Yellow/Orange
            statusText.setProperties({ text: "Processing..." });
          } else {
            // idle - but check if we're in an active conversation
            if (
              this.inActiveConversation &&
              this.dialogueState === DialogueState.ACTIVE
            ) {
              // Still in conversation, keep button active (red) to indicate user can click to stop
              micButton.setProperties({ backgroundColor: "#ef4444" }); // Red
              statusText.setProperties({ text: "Click to stop" });
            } else {
              // Not in conversation, show idle state
              micButton.setProperties({ backgroundColor: "#2563eb" }); // Blue
              if (!this.resetStatusTimeout) {
                statusText.setProperties({ text: "Say 'Turn on...'" });
              }
            }
          }
        }

        // Update dialogue overlay
        if (this.dialogue && this.dialogue.isVisible()) {
          if (status === "listening") {
            this.dialogue.setStatus("Listening", "#4ade80");
            this.dialogue.showTyping("Listening…");
          } else if (status === "processing") {
            this.dialogue.setStatus("Processing", "#facc15");
            this.dialogue.showTyping("Processing…");
          } else {
            // idle
            this.dialogue.hideTyping();

            if (payload?.success && payload.action && payload.device) {
              this.dialogue.addAssistantMessage(
                `Done! I've ${payload.action.replace(/_/g, " ")} the ${payload.device}.`,
              );
              // After successful action, robot will ask follow-up, so stay in conversation
              this.inActiveConversation = true;
              // ── scene notification ──────────────────────────────────────────
              sceneNotify({
                title: "Voice command executed",
                description: `${payload.action.replace(/_/g, " ")} → ${payload.device}`,
                severity: "success",
                icon: SN_ICONS.checkCircle,
                iconBg: "rgba(34,197,94,0.15)",
                iconFg: "#22c55e",
              });
            } else if (payload?.success && payload.instructionTopic) {
              if (payload.instructionTopic === "goodbye") {
                this.dialogue.addAssistantMessage("See you again! 👋");
                this.inActiveConversation = false;
                sceneNotify({
                  title: "Voice session ended",
                  description: "Robot assistant returned to standby",
                  severity: "info",
                  icon: SN_ICONS.micOff,
                  iconBg: "rgba(100,116,139,0.15)",
                  iconFg: "#94a3b8",
                });
                // Stop listening when conversation ends
                if (
                  this.currentStatus === "listening" ||
                  this.currentStatus === "processing"
                ) {
                  this.voiceSystem.toggleListening();
                }
                setTimeout(() => this.beginClosing(), 1000);
              } else {
                // Don't add generic message - the actual instruction text will be added by RobotAssistantSystem
                // Only mark as active conversation if it's not device_info (which should close)
                if (payload.instructionTopic !== "device_info") {
                  this.inActiveConversation = true;
                } else {
                  // device_info should close after answering
                  this.inActiveConversation = false;
                }
                sceneNotify({
                  title: "Robot provided information",
                  description: `Topic: ${payload.instructionTopic.replace(/_/g, " ")}`,
                  severity: "info",
                  icon: SN_ICONS.bot,
                  iconBg: "rgba(99,102,241,0.15)",
                  iconFg: "#818cf8",
                });
              }
            } else if (payload?.cancelled) {
              this.dialogue.addAssistantMessage("See you again! 👋");
              this.inActiveConversation = false;
              sceneNotify({
                title: "Voice session cancelled",
                description: "Robot assistant returned to standby",
                severity: "info",
                icon: SN_ICONS.micOff,
                iconBg: "rgba(100,116,139,0.15)",
                iconFg: "#94a3b8",
              });
              // Stop listening when cancelled
              if (
                this.currentStatus === "listening" ||
                this.currentStatus === "processing"
              ) {
                this.voiceSystem.toggleListening();
              }
              // Close dialogue after goodbye message
              setTimeout(() => this.beginClosing(), 1000);
            } else if (payload?.noMatch) {
              this.dialogue.addAssistantMessage(
                "Sorry, I didn't understand that. Could you try again?",
              );
              // Stay in conversation, robot will ask follow-up
              this.inActiveConversation = true;
              sceneNotify({
                title: "Command not recognized",
                description: 'Try rephrasing — e.g. "Turn on the fan"',
                severity: "warning",
                icon: SN_ICONS.alertCircle,
                iconBg: "rgba(245,158,11,0.14)",
                iconFg: "#f59e0b",
              });
            } else if (payload?.endSession) {
              // End of instruction session
              this.inActiveConversation = false;
              sceneNotify({
                title: "Instruction session ended",
                description: "Robot returned to patrol",
                severity: "info",
                icon: SN_ICONS.bot,
                iconBg: "rgba(99,102,241,0.15)",
                iconFg: "#818cf8",
              });
              // Stop listening when session ends
              if (
                this.currentStatus === "listening" ||
                this.currentStatus === "processing"
              ) {
                this.voiceSystem.toggleListening();
              }
              setTimeout(() => this.beginClosing(), 1000);
            }

            // Only begin closing if we're not in an active conversation
            // (i.e., robot is not waiting for user response)
            if (
              this.dialogueState === DialogueState.ACTIVE &&
              status === "idle" &&
              !this.inActiveConversation
            ) {
              // Don't auto-close if we're still in conversation
              // Only close if user explicitly stops or conversation ends
            }
          }
        }
      });

      // Initial state
      if (statusText) statusText.setProperties({ text: "Say 'Turn on...'" });
    });
  }

  // ====================================================================
  // Mic click orchestration
  // ====================================================================

  private handleMicClick(): void {
    console.log(
      `[VoicePanel] 🎤 Mic clicked — current state: ${DialogueState[this.dialogueState]}, voice status: ${this.currentStatus}, inActiveConversation: ${this.inActiveConversation}`,
    );

    // If currently listening or processing, stop it and close dialogue
    // This handles the case where robot auto-started listening after asking "anything else?"
    if (
      this.currentStatus === "listening" ||
      this.currentStatus === "processing"
    ) {
      console.log("[VoicePanel] Stopping active listening/processing");
      this.voiceSystem.toggleListening();
      // Clear instruction session state in RobotAssistantSystem
      const robotSystem = (globalThis as any).__robotAssistantSystem;
      if (robotSystem) {
        robotSystem.inInstructionSession = false;
        robotSystem.walkingToUser = false;
        robotSystem.pendingInstructionTopic = null;
        robotSystem.pendingInstructionText = null;
      }
      // Always close the dialogue when user stops
      if (
        this.dialogueState === DialogueState.ACTIVE ||
        this.dialogueState === DialogueState.APPROACHING
      ) {
        this.beginClosing();
      }
      return;
    }

    // If already in active dialogue (including when robot is waiting for response), close the dialogue
    if (this.dialogueState === DialogueState.ACTIVE) {
      console.log("[VoicePanel] Closing dialogue (ACTIVE → closing)");
      // Clear instruction session state in RobotAssistantSystem
      const robotSystem = (globalThis as any).__robotAssistantSystem;
      if (robotSystem) {
        robotSystem.inInstructionSession = false;
        robotSystem.walkingToUser = false;
        robotSystem.pendingInstructionTopic = null;
        robotSystem.pendingInstructionText = null;
      }
      this.beginClosing(); // beginClosing() already handles stopping listening
      return;
    }

    // If approaching, cancel the approach
    if (this.dialogueState === DialogueState.APPROACHING) {
      console.log("[VoicePanel] Cancelling approach");
      this.beginClosing();
      return;
    }

    // If closing, ignore click
    if (this.dialogueState === DialogueState.CLOSING) return;

    // ── Start the dialogue sequence ──
    this.dialogueState = DialogueState.APPROACHING;

    // Show dialogue overlay immediately with "approaching" message
    if (this.dialogue) {
      this.dialogue.clearMessages();
      this.dialogue.show();
      this.dialogue.setStatus("Walking to you…", "#60a5fa");
      this.dialogue.addSystemMessage("Robot assistant is coming to you…");
    }

    // Tell robot to walk to the user
    const camera = this.world.camera;
    const robot = this.robotSystem;
    if (robot && camera) {
      console.log("[VoicePanel] 🤖 Telling robot to walk to user...");
      robot.walkToUser(camera, () => {
        this.onRobotArrived();
      });
    } else {
      console.warn(
        `[VoicePanel] ⚠️ Robot=${!!robot}, Camera=${!!camera} — skipping walk, starting voice immediately`,
      );
      this.onRobotArrived();
    }
  }

  /** Called when the robot has reached the user (or approach timed out). */
  private onRobotArrived(): void {
    console.log("[VoicePanel] 🤖 Robot arrived — activating dialogue");
    this.dialogueState = DialogueState.ACTIVE;
    this.inActiveConversation = true;

    // No camera zoom — robot faces user via RobotAssistantSystem

    // Update dialogue
    if (this.dialogue) {
      this.dialogue.setStatus("Active", "#4ade80");
      this.dialogue.addAssistantMessage("How can I help you?");
      this.dialogue.showTyping("Listening…");
    }

    // Start voice listening (TTS greeting + mic)
    this.voiceSystem.toggleListening();
  }

  /** Begin the closing / camera-return phase. */
  private beginClosing(): void {
    if (this.dialogueState === DialogueState.CLOSING) return;
    if (this.dialogueState === DialogueState.IDLE) return;

    console.log(
      `[VoicePanel] 🔚 Closing (was ${DialogueState[this.dialogueState]})`,
    );
    this.dialogueState = DialogueState.CLOSING;
    this.closingTimer = 0;
    this.inActiveConversation = false;

    // Clear instruction session state in RobotAssistantSystem
    const robotSystem = (globalThis as any).__robotAssistantSystem;
    if (robotSystem) {
      robotSystem.inInstructionSession = false;
      robotSystem.walkingToUser = false;
      robotSystem.pendingInstructionTopic = null;
      robotSystem.pendingInstructionText = null;
    }

    // Stop listening when closing
    if (
      this.currentStatus === "listening" ||
      this.currentStatus === "processing"
    ) {
      console.log("[VoicePanel] Stopping listening during close");
      this.voiceSystem.toggleListening();
    }

    // Explicitly reset button to idle state (blue) when closing
    if (this.micButtonRef && this.statusTextRef) {
      this.micButtonRef.setProperties({ backgroundColor: "#2563eb" }); // Blue
      this.statusTextRef.setProperties({ text: "Say 'Turn on...'" });
    }

    // Hide dialogue overlay
    if (this.dialogue) {
      this.dialogue.setStatus("Goodbye", "#94a3b8");
      this.dialogue.hide();
    }

    // Tell robot to go back to patrol
    const robot = this.robotSystem;
    if (robot) {
      robot.returnToPatrol();
    }
  }

  /** Setup listener for robot messages (called by RobotAssistantSystem) */
  private setupRobotMessageListener(): void {
    // Store reference to this system so RobotAssistantSystem can call it
    (globalThis as any).__voicePanelSystem = this;
  }

  /** Public method to add robot assistant message to dialogue */
  public addRobotMessage(message: string): void {
    if (this.dialogue && this.dialogue.isVisible()) {
      this.dialogue.addAssistantMessage(message);
      // When robot asks a question, we're in active conversation
      if (
        message.includes("Do you want") ||
        message.includes("What would you like") ||
        message.includes("Sorry, I didn't catch")
      ) {
        this.inActiveConversation = true;
        // Update button state to show we're waiting for user
        if (this.micButtonRef && this.statusTextRef) {
          this.micButtonRef.setProperties({ backgroundColor: "#ef4444" }); // Red
          this.statusTextRef.setProperties({ text: "Click to stop" });
        }
        // Show typing indicator to indicate waiting for user
        this.dialogue.showTyping("Listening…");
      }
    }
  }

  // ====================================================================
  // Update loop — camera animation + panel follow
  // ====================================================================

  update(dt: number) {
    const camera = this.world.camera;

    // ── CLOSING state cleanup ────────────────────────────────────
    if (this.dialogueState === DialogueState.CLOSING) {
      this.closingTimer += dt;
      if (this.closingTimer >= CLOSING_DURATION) {
        this.dialogueState = DialogueState.IDLE;
        console.log("[VoicePanel] ✅ Closing complete — IDLE");

        // Ensure button is in idle state when transition to IDLE completes
        if (this.micButtonRef && this.statusTextRef) {
          this.micButtonRef.setProperties({ backgroundColor: "#2563eb" }); // Blue
          this.statusTextRef.setProperties({ text: "Say 'Turn on...'" });
        }
      }
    }

    // ── 3D voice panel follow camera ───────────────────────────
    if (!this.panelObject3D) return;
    if (!camera) return;

    // Calculate target position: 0.6m in front of camera, 0.3m lower, 0.2m to the right
    const camDir = camera.getWorldDirection(
      new Object3D().position.clone().set(0, 0, 0),
    );
    camDir.y = 0; // Flatten the forward vector
    camDir.normalize();

    // Right vector (cross product of forward and up)
    const rightX = camDir.z;
    const rightZ = -camDir.x;

    const targetX = camera.position.x + camDir.x * 0.6 + rightX * 0.2;
    const targetY = camera.position.y - 0.3;
    const targetZ = camera.position.z + camDir.z * 0.6 + rightZ * 0.2;

    // Lerp for smooth movement
    const dxP = targetX - this.panelObject3D.position.x;
    const dyP = targetY - this.panelObject3D.position.y;
    const dzP = targetZ - this.panelObject3D.position.z;
    const dist = Math.sqrt(dxP * dxP + dyP * dyP + dzP * dzP);

    if (dist > 1.0) {
      this.panelObject3D.position.set(targetX, targetY, targetZ);
    } else {
      const tP = Math.min(1, 5 * dt);
      this.panelObject3D.position.x += dxP * tP;
      this.panelObject3D.position.y += dyP * tP;
      this.panelObject3D.position.z += dzP * tP;
    }

    // Always face the camera
    this.panelObject3D.lookAt(camera.position);
  }
}
