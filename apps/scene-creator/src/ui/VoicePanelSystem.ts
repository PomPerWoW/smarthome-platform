import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
} from "@iwsdk/core";

import { VoiceControlSystem } from "../systems/VoiceControlSystem";
import { RobotAssistantSystem } from "../systems/RobotAssistantSystem";
import { DialogueOverlay } from "./DialogueOverlay";
import { sceneNotify, SN_ICONS } from "./SceneNotification";
import {
  GOODBYE_ASSISTANT_MESSAGE,
  speakSeeYouAgain,
} from "../utils/VoiceTextToSpeech";

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
/** Let the user read the goodbye line after they tap to stop (accidental open / cancel). */
const USER_GOODBYE_OVERLAY_SEC = 1.8;

type DashboardVoiceHooks = {
  onShow?: () => void;
  onHide?: () => void;
  onStatus?: (status: string) => void;
  onUserMessage?: (message: string) => void;
  onAssistantMessage?: (message: string) => void;
  onSystemMessage?: (message: string) => void;
  onTyping?: (label?: string) => void;
  onTypingEnd?: () => void;
};

export class VoicePanelSystem extends createSystem({
  voicePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/welcome.json")],
  },
}) {
  private voiceSystem!: VoiceControlSystem;
  private _robotSystem: RobotAssistantSystem | null = null;
  private _robotSystemResolved = false;
  private currentStatus: "listening" | "processing" | "idle" = "idle";
  private lastTranscript: string = "";

  // Status reset timer
  private resetStatusTimeout: any = null;

  // ── Dialogue orchestration ──
  private dialogue: DialogueOverlay | null = null;
  private dialogueState: DialogueState = DialogueState.IDLE;

  // Dialogue closing timer
  private closingTimer = 0;

  /** True while showing goodbye after user cancelled — delays hide until timeout. */
  private pendingUserGoodbyeOverlay = false;
  private userGoodbyeTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Track if we're in an active conversation (robot is waiting for user response)
  private inActiveConversation = false;

  private statusTextRef: UIKit.Text | null = null;
  private micButtonRef: UIKit.Container | null = null;

  private get dashboardHooks(): DashboardVoiceHooks | null {
    return ((globalThis as any).__dashboardVoiceHooks as DashboardVoiceHooks) ?? null;
  }

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
        // Clean up text if it ends with "..." for active display
        const cleanText = text.replace(/\.\.\.$/, "");
        this.lastTranscript = cleanText;

        // Update 3D panel status
        if (statusText) {
          statusText.setProperties({ text: `"${text}"` });

          if (this.resetStatusTimeout) clearTimeout(this.resetStatusTimeout);
          // Do not reset while actively processing
        }

        // One live user bubble (frontend-style thread) — no duplicate rows per interim event
        if (this.dialogue && this.dialogue.isVisible()) {
          this.dialogue.hideTyping();
          this.dialogue.setLiveUserTranscript(text);
        }
        this.dashboardHooks?.onTypingEnd?.();
        this.dashboardHooks?.onUserMessage?.(text);
      });

      // ── Voice status listener ────────────────────────────────
      this.voiceSystem.addStatusListener((status, payload) => {
        this.currentStatus = status;

        // Update 3D panel appearance
        if (micButton && statusText) {
          if (status === "listening") {
            micButton.setProperties({ backgroundColor: "#ef4444" }); // Red
            statusText.setProperties({ text: "Listening..." });
            this.lastTranscript = "";
            if (this.resetStatusTimeout) clearTimeout(this.resetStatusTimeout);
          } else if (status === "processing") {
            micButton.setProperties({ backgroundColor: "#eab308" }); // Yellow/Orange
            const pText = this.lastTranscript ? `"${this.lastTranscript}" (Processing...)` : "Processing...";
            statusText.setProperties({ text: pText });
            if (this.resetStatusTimeout) clearTimeout(this.resetStatusTimeout);
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
              micButton.setProperties({ backgroundColor: "#2563eb" }); // Blue
              // Only reset to idle immediately if not a successful action
              if (payload?.success && payload.action && payload.device) {
                const doneMessage = `Done! ${payload.action.replace(/_/g, " ")} the ${payload.device}.`;
                statusText.setProperties({ text: doneMessage });
              } else if (payload?.noMatch) {
                statusText.setProperties({ text: "Command not recognized" });
              } else if (payload?.serverError) {
                statusText.setProperties({ text: "Server error" });
              } else if (payload?.cancelled) {
                statusText.setProperties({ text: "Cancelled" });
              } else if (!payload?.success && !payload?.instructionTopic && !payload?.endSession) {
                statusText.setProperties({ text: "Say 'Turn on...'" });
              }

              // Auto-reset to idle text after a delay for finished states
              if (this.resetStatusTimeout) clearTimeout(this.resetStatusTimeout);
              this.resetStatusTimeout = setTimeout(() => {
                if (this.currentStatus === "idle") {
                  statusText.setProperties({ text: "Say 'Turn on...'" });
                }
              }, 4000);
            }
          }
        }

        // Update dialogue overlay
        if (this.dialogue && this.dialogue.isVisible()) {
          if (status === "listening") {
            this.dialogue.clearLiveUserTranscript();
            this.dialogue.setStatus("Listening", "#4ade80");
            this.dialogue.showTyping("Listening…");
            this.dashboardHooks?.onStatus?.("Listening");
            this.dashboardHooks?.onTyping?.("Listening...");
          } else if (status === "processing") {
            this.dialogue.finalizeLiveUserTranscript(this.lastTranscript);
            this.dialogue.setStatus("Processing", "#facc15");
            this.dialogue.showTyping("Processing…");
            this.dashboardHooks?.onStatus?.("Processing");
            this.dashboardHooks?.onTyping?.("Processing...");
          } else {
            // idle — always refresh header (otherwise "Listening" / "Processing" sticks)
            this.dialogue.hideTyping();
            this.dashboardHooks?.onTypingEnd?.();
            this.dialogue.setStatus("Ready", "#94a3b8");
            this.dashboardHooks?.onStatus?.("Idle");

            if (payload?.success && payload.action && payload.device) {
              const doneMessage = `Done! I've ${payload.action.replace(/_/g, " ")} the ${payload.device}.`;
              this.dialogue.addAssistantMessage(doneMessage);
              this.dashboardHooks?.onAssistantMessage?.(doneMessage);
              // Command is completely resolved, do not stay in conversation to await follow up
              this.inActiveConversation = false;
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
                this.dialogue.addAssistantMessage(GOODBYE_ASSISTANT_MESSAGE);
                this.dashboardHooks?.onAssistantMessage?.(
                  GOODBYE_ASSISTANT_MESSAGE,
                );
                this.inActiveConversation = false;
                sceneNotify({
                  title: "Voice session ended",
                  description: "Robot assistant returned to standby",
                  severity: "info",
                  icon: SN_ICONS.micOff,
                  iconBg: "rgba(100,116,139,0.15)",
                  iconFg: "#94a3b8",
                });
                this.beginClosing({
                  userInitiated: true,
                  skipGoodbyeBubble: true,
                });
              } else {
                // Robot speaks then closes the dialogue (one session per mic); keep mic idle until then.
                this.inActiveConversation = false;
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
              this.dialogue.clearLiveUserTranscript();
              this.dialogue.addAssistantMessage(GOODBYE_ASSISTANT_MESSAGE);
              this.dashboardHooks?.onAssistantMessage?.(
                GOODBYE_ASSISTANT_MESSAGE,
              );
              this.inActiveConversation = false;
              sceneNotify({
                title: "Voice session cancelled",
                description: "Robot assistant returned to standby",
                severity: "info",
                icon: SN_ICONS.micOff,
                iconBg: "rgba(100,116,139,0.15)",
                iconFg: "#94a3b8",
              });
              this.beginClosing({
                userInitiated: true,
                skipGoodbyeTts: true,
                skipGoodbyeBubble: true,
              });
            } else if (payload?.serverError) {
              this.dialogue.setStatus("Server error", "#ef4444");
              const errMsg =
                "The voice service failed (server error). Make sure the backend on port 5500 is running the latest code, then tap the mic to try again.";
              this.dialogue.addAssistantMessage(errMsg);
              this.dashboardHooks?.onAssistantMessage?.(errMsg);
              this.inActiveConversation = false;
              sceneNotify({
                title: "Voice service error",
                description: "Check backend logs for /api/homes/voice/command/",
                severity: "error",
                icon: SN_ICONS.alertCircle,
                iconBg: "rgba(239,68,68,0.15)",
                iconFg: "#ef4444",
              });
              // Close dialogue after showing error
              setTimeout(() => this.beginClosing(), 3000);
            } else if (payload?.noMatch) {
              this.dialogue.setStatus("Not recognized", "#f59e0b");
              const noMatchMessage =
                "Sorry, I didn't understand that. Could you try again?";
              this.dialogue.addAssistantMessage(noMatchMessage);
              this.dashboardHooks?.onAssistantMessage?.(noMatchMessage);
              // Mic is not listening after idle — show idle mic, not "click to stop"
              this.inActiveConversation = false;
              sceneNotify({
                title: "Command not recognized",
                description: 'Try rephrasing — e.g. "Turn on the fan"',
                severity: "warning",
                icon: SN_ICONS.alertCircle,
                iconBg: "rgba(245,158,11,0.14)",
                iconFg: "#f59e0b",
              });
            } else if (payload?.endSession) {
              this.inActiveConversation = false;
              sceneNotify({
                title: "Instruction session ended",
                description: "Robot returned to patrol",
                severity: "info",
                icon: SN_ICONS.bot,
                iconBg: "rgba(99,102,241,0.15)",
                iconFg: "#818cf8",
              });
              this.beginClosing();
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

      (globalThis as any).__triggerVoiceAssistant = () => {
        this.triggerAssistant();
      };
    });
  }

  /** DOM floating mic button & shortcuts — same as tapping the 3D mic. */
  triggerAssistant(): void {
    this.handleMicClick();
  }

  // ====================================================================
  // Mic click orchestration
  // ====================================================================

  private handleMicClick(): void {
    console.log(
      `[VoicePanel] 🎤 Mic clicked — current state: ${DialogueState[this.dialogueState]}, voice status: ${this.currentStatus}, inActiveConversation: ${this.inActiveConversation}`,
    );

    // User tapped to stop while the mic is on (very common accidental case)
    if (
      this.currentStatus === "listening" ||
      this.currentStatus === "processing"
    ) {
      console.log("[VoicePanel] Stopping active listening/processing");
      const robotSystem = (globalThis as any).__robotAssistantSystem;
      if (robotSystem) {
        robotSystem.inInstructionSession = false;
        robotSystem.walkingToUser = false;
        robotSystem.pendingInstructionTopic = null;
        robotSystem.pendingInstructionText = null;
      }
      if (
        this.dialogueState === DialogueState.ACTIVE ||
        this.dialogueState === DialogueState.APPROACHING
      ) {
        this.beginClosing({ userInitiated: true });
      } else {
        this.voiceSystem.forceStopListening();
      }
      return;
    }

    // Active dialogue but mic idle — still a deliberate dismiss (e.g. mis-tap after reply)
    if (this.dialogueState === DialogueState.ACTIVE) {
      console.log("[VoicePanel] Closing dialogue (ACTIVE → closing)");
      const robotSystem = (globalThis as any).__robotAssistantSystem;
      if (robotSystem) {
        robotSystem.inInstructionSession = false;
        robotSystem.walkingToUser = false;
        robotSystem.pendingInstructionTopic = null;
        robotSystem.pendingInstructionText = null;
      }
      this.beginClosing({ userInitiated: true });
      return;
    }

    if (this.dialogueState === DialogueState.APPROACHING) {
      console.log("[VoicePanel] Cancelling approach");
      this.beginClosing({ userInitiated: true });
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
    this.dashboardHooks?.onShow?.();
    this.dashboardHooks?.onStatus?.("Walking to you...");
    this.dashboardHooks?.onSystemMessage?.("Robot assistant is coming to you...");

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
    this.dashboardHooks?.onStatus?.("Active");
    this.dashboardHooks?.onAssistantMessage?.("How can I help you?");
    this.dashboardHooks?.onTyping?.("Listening...");

    // Start voice listening (TTS greeting + mic)
    this.voiceSystem.toggleListening();
  }

  /**
   * End the voice conversation. When `userInitiated`, show a clear goodbye and
   * brief delay so mis-taps still feel intentional; robot/system closes stay snappy.
   */
  beginClosing(
    opts?: {
      userInitiated?: boolean;
      skipGoodbyeTts?: boolean;
      skipGoodbyeBubble?: boolean;
    },
  ): void {
    if (this.dialogueState === DialogueState.CLOSING) return;
    if (this.dialogueState === DialogueState.IDLE) return;

    if (this.userGoodbyeTimeoutId) {
      clearTimeout(this.userGoodbyeTimeoutId);
      this.userGoodbyeTimeoutId = null;
    }

    const userInitiated = opts?.userInitiated ?? false;

    console.log(
      `[VoicePanel] 🔚 Closing (was ${DialogueState[this.dialogueState]}, userInitiated=${userInitiated})`,
    );

    const listening =
      this.currentStatus === "listening" ||
      this.currentStatus === "processing";

    this.dialogueState = DialogueState.CLOSING;
    this.closingTimer = 0;
    this.inActiveConversation = false;

    const robotSystem = (globalThis as any).__robotAssistantSystem;
    if (robotSystem) {
      robotSystem.inInstructionSession = false;
      robotSystem.walkingToUser = false;
      robotSystem.pendingInstructionTopic = null;
      robotSystem.pendingInstructionText = null;
    }

    if (listening) {
      this.voiceSystem.forceStopListening();
    } else if (userInitiated && !opts?.skipGoodbyeTts) {
      void speakSeeYouAgain();
    }

    if (this.micButtonRef && this.statusTextRef) {
      this.micButtonRef.setProperties({ backgroundColor: "#2563eb" });
      this.statusTextRef.setProperties({ text: "Say 'Turn on...'" });
    }

    const runFinishOverlay = () => {
      this.pendingUserGoodbyeOverlay = false;
      this.userGoodbyeTimeoutId = null;
      this.finishClosingOverlay();
    };

    if (userInitiated) {
      if (!opts?.skipGoodbyeBubble && this.dialogue?.isVisible()) {
        this.dialogue.hideTyping();
        this.dialogue.addAssistantMessage(GOODBYE_ASSISTANT_MESSAGE);
        this.dashboardHooks?.onAssistantMessage?.(GOODBYE_ASSISTANT_MESSAGE);
      }
      this.pendingUserGoodbyeOverlay = true;
      this.userGoodbyeTimeoutId = setTimeout(
        runFinishOverlay,
        USER_GOODBYE_OVERLAY_SEC * 1000,
      );
      return;
    }

    // Small delay so the user can read the final assistant message
    this.pendingUserGoodbyeOverlay = true;
    this.userGoodbyeTimeoutId = setTimeout(runFinishOverlay, 1500);
  }

  private finishClosingOverlay(): void {
    this.dashboardHooks?.onStatus?.("Goodbye");
    if (this.dialogue) {
      this.dialogue.setStatus("Goodbye", "#94a3b8");
      this.dialogue.hide();
    }
    this.dashboardHooks?.onHide?.();

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
      this.dashboardHooks?.onAssistantMessage?.(message);
    }
  }

  // ====================================================================
  // Update loop — dialogue closing cleanup (voice UI lives on main portal)
  // ====================================================================

  update(dt: number) {
    if (this.dialogueState !== DialogueState.CLOSING) return;
    if (this.pendingUserGoodbyeOverlay) return;

    this.closingTimer += dt;
    if (this.closingTimer >= CLOSING_DURATION) {
      this.dialogueState = DialogueState.IDLE;
      console.log("[VoicePanel] ✅ Closing complete — IDLE");

      if (this.micButtonRef && this.statusTextRef) {
        this.micButtonRef.setProperties({ backgroundColor: "#2563eb" });
        this.statusTextRef.setProperties({ text: "Say 'Turn on...'" });
      }
    }
  }
}
