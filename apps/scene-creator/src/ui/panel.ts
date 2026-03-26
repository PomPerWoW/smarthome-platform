import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  VisibilityState,
  UIKitDocument,
  UIKit,
} from "@iwsdk/core";
import { Vector3 } from "three";

import { deviceStore, getStore } from "../store/DeviceStore";
import { getAuth } from "../api/auth";

export class PanelSystem extends createSystem({
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/welcome.json")],
  },
}) {
  private xrSession: XRSession | null = null;
  private frameCallbackId: number | null = null;
  private lastTriggerState: Map<XRInputSource, boolean> = new Map();
  private triggerCooldown = 0;
  private readonly TRIGGER_COOLDOWN_TIME = 0.5; // 500ms cooldown to prevent rapid triggers

  init() {
    this.queries.welcomePanel.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        return;
      }

      const store = getStore();
      const auth = getAuth();
      const user = auth.getUser();

      // Update user email
      const userEmail = document.getElementById("user-email") as UIKit.Text;
      if (userEmail && user) {
        userEmail.setProperties({ text: user.email });
      }

      // Update device stats
      const deviceStats = document.getElementById("device-stats") as UIKit.Text;
      if (deviceStats) {
        const count = store.getDeviceCount();
        const active = store.getActiveDevices().length;
        deviceStats.setProperties({
          text: `${count} devices | ${active} active`,
        });
      }

      // Subscribe to device changes to update stats
      deviceStore.subscribe(
        (state) => state.devices,
        () => {
          if (deviceStats) {
            const count = store.getDeviceCount();
            const active = store.getActiveDevices().length;
            deviceStats.setProperties({
              text: `${count} devices | ${active} active`,
            });
          }
        },
      );

      // ── AR / VR Mode Toggle ────────────────────────────────────────
      let isARMode = false; // Default: VR mode (room model visible)
      (globalThis as any).__sceneMode = "vr";

      const vrModeBtn = document.getElementById("vr-mode-btn");
      const arModeBtn = document.getElementById("ar-mode-btn");

      const applyMode = (ar: boolean) => {
        isARMode = ar;
        (globalThis as any).__sceneMode = ar ? "ar" : "vr";

        // Toggle room model visibility
        const roomModel = (globalThis as any).__labRoomModel;
        if (roomModel) {
          roomModel.visible = !ar;
        }

        // Update mode button styling via backgroundColor
        if (vrModeBtn) {
          vrModeBtn.setProperties({
            backgroundColor: ar ? "#27272a" : "#7c3aed",
          });
        }
        if (arModeBtn) {
          arModeBtn.setProperties({
            backgroundColor: ar ? "#7c3aed" : "#27272a",
          });
        }

        // Update XR button text based on mode
        const xrBtnText = document.getElementById(
          "xr-button-text",
        ) as UIKit.Text;
        if (xrBtnText) {
          if (
            this.world.visibilityState.value === VisibilityState.NonImmersive
          ) {
            xrBtnText.setProperties({
              text: ar ? "Enter AR" : "Enter VR",
            });
          } else {
            xrBtnText.setProperties({
              text: ar ? "Exit AR" : "Exit VR",
            });
          }
        }

        console.log(`[Panel] Mode switched to: ${ar ? "AR" : "VR"}`);
      };

      if (vrModeBtn) {
        vrModeBtn.addEventListener("click", () => applyMode(false));
      }
      if (arModeBtn) {
        arModeBtn.addEventListener("click", () => applyMode(true));
      }

      // ── XR Button ────────────────────────────────────────────────────
      const xrButton = document.getElementById("xr-button") as UIKit.Text;
      if (xrButton) {
        xrButton.addEventListener("click", async () => {
          if (
            this.world.visibilityState.value === VisibilityState.NonImmersive
          ) {
            // Check WebXR availability before attempting to launch
            if (!navigator.xr) {
              console.warn(
                "[Panel] WebXR API not available. Ensure you are using HTTPS and a compatible browser.",
              );
              alert(
                "WebXR is not available.\n\nPlease ensure:\n• You are accessing this page over HTTPS\n• Your browser supports WebXR\n• An XR headset is connected",
              );
              return;
            }

            const sessionMode = isARMode ? "immersive-ar" : "immersive-vr";
            try {
              const supported =
                await navigator.xr.isSessionSupported(sessionMode);
              if (!supported) {
                console.warn(
                  `[Panel] XR session mode "${sessionMode}" is not supported on this device.`,
                );
                alert(
                  `XR mode "${sessionMode}" is not supported on this device.\n\nPlease ensure:\n• An XR headset is connected\n• Your browser supports the requested XR mode\n• Required permissions are granted`,
                );
                return;
              }
            } catch (checkErr) {
              console.warn(
                "[Panel] Could not check XR session support:",
                checkErr,
              );
            }

            try {
              await this.world.launchXR();
            } catch (err) {
              console.error("[Panel] Failed to launch XR session:", err);
              alert(
                "Failed to start XR session.\n\nPlease check that:\n• An XR headset is connected and active\n• You are using HTTPS\n• No other XR session is already running",
              );
            }
          } else {
            this.world.exitXR();
          }
        });

        // Set initial text based on visibility state
        const updateButtonText = () => {
          const xrBtnText = document.getElementById(
            "xr-button-text",
          ) as UIKit.Text;
          if (!xrBtnText) return;

          const visibilityState = this.world.visibilityState.value;
          if (visibilityState === VisibilityState.NonImmersive) {
            xrBtnText.setProperties({
              text: isARMode ? "Enter AR" : "Enter VR",
            });
          } else {
            xrBtnText.setProperties({ text: isARMode ? "Exit AR" : "Exit VR" });
          }
        };

        // Set initial text
        updateButtonText();

        // Update text when visibility state changes
        this.world.visibilityState.subscribe(() => {
          updateButtonText();
        });
      }

      // Refresh Button
      const refreshButton = document.getElementById(
        "refresh-button",
      ) as UIKit.Text;
      if (refreshButton) {
        refreshButton.addEventListener("click", async () => {
          console.log("[Panel] Refreshing devices...");
          await store.refreshDevices();
        });
      }

      // Devices Button → toggle placement panel
      const devicesButton = document.getElementById(
        "devices-button",
      ) as UIKit.Text;
      if (devicesButton) {
        devicesButton.addEventListener("click", () => {
          console.log("[Panel] Toggling placement panel");
          const placementEntity = (globalThis as any).__placementPanelEntity;
          if (placementEntity?.object3D) {
            placementEntity.object3D.visible =
              !placementEntity.object3D.visible;
          }
        });
      }

      // Align Room Button → toggle alignment panel
      const alignButton = document.getElementById(
        "align-room-button",
      ) as UIKit.Text;
      if (alignButton) {
        alignButton.addEventListener("click", () => {
          console.log("[Panel] Toggling room alignment panel");
          const alignEntity = (globalThis as any).__alignmentPanelEntity;
          if (alignEntity?.object3D) {
            alignEntity.object3D.visible = !alignEntity.object3D.visible;
          }
        });
      }

      // ── Welcome Panel Toggle Function ────────────────────────────────────
      const toggleWelcomePanel = () => {
        const welcomeEntity = (globalThis as any).__welcomePanelEntity;
        if (welcomeEntity?.object3D) {
          const isVisible = welcomeEntity.object3D.visible;
          welcomeEntity.object3D.visible = !isVisible;
          console.log(
            `[Panel] Welcome panel ${!isVisible ? "shown" : "hidden"}`,
          );

          // Update floating button text/icon if it exists
          const floatingBtn = document.getElementById(
            "welcome-panel-toggle-btn",
          );
          if (floatingBtn) {
            floatingBtn.title = isVisible
              ? "Show Welcome Panel (Press U)"
              : "Hide Welcome Panel (Press U)";
            // Update button visual state to indicate panel visibility
            if (isVisible) {
              floatingBtn.style.backgroundColor = "#3b82f6";
              floatingBtn.style.opacity = "1";
            } else {
              floatingBtn.style.backgroundColor = "#7c3aed";
              floatingBtn.style.opacity = "0.9";
            }
          }
        } else {
          console.warn("[Panel] Welcome panel entity not found");
        }
      };

      // ── Show Welcome Panel Function (always accessible) ───────────────────
      const showWelcomePanel = () => {
        const welcomeEntity = (globalThis as any).__welcomePanelEntity;
        if (welcomeEntity?.object3D) {
          welcomeEntity.object3D.visible = true;
          console.log("[Panel] Welcome panel shown");

          // Update floating button
          const floatingBtn = document.getElementById(
            "welcome-panel-toggle-btn",
          );
          if (floatingBtn) {
            floatingBtn.title = "Hide Welcome Panel (Press U)";
            floatingBtn.style.backgroundColor = "#7c3aed";
            floatingBtn.style.opacity = "0.9";
          }
        }
      };

      // Store both functions globally for access from anywhere
      (globalThis as any).__toggleWelcomePanel = toggleWelcomePanel;
      (globalThis as any).__showWelcomePanel = showWelcomePanel;
      (globalThis as any).__summonWelcomePanel = () =>
        this.summonPanelInFront();

      // ── Close Button in Welcome Panel ──────────────────────────────────────
      const closeButton = document.getElementById("close-welcome-panel");
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          toggleWelcomePanel();
        });
      }

      // ── Keyboard Shortcut: Press 'U' to toggle Welcome Panel ──────────────
      window.addEventListener("keydown", (event) => {
        // Don't trigger if user is typing in an input field
        if (
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement
        ) {
          return;
        }

        // Press 'U' or 'u' to toggle welcome panel
        if (event.key.toLowerCase() === "u") {
          event.preventDefault();
          toggleWelcomePanel();
        }

        // Press 'Y' or 'y' to summon panel in front of user
        if (event.key.toLowerCase() === "y") {
          event.preventDefault();
          this.summonPanelInFront();
        }
      });

      // ── Create Floating Toggle Button (Always Visible) ──────────────────────
      const createFloatingButton = () => {
        // Remove existing button if it exists (to recreate it)
        const existingBtn = document.getElementById("welcome-panel-toggle-btn");
        const existingContainer = document.getElementById(
          "welcome-panel-toggle-container",
        );
        if (existingBtn) existingBtn.remove();
        if (existingContainer) existingContainer.remove();

        const container = document.createElement("div");
        container.id = "welcome-panel-toggle-container";
        container.style.position = "fixed";
        container.style.top = "20px";
        container.style.right = "20px";
        container.style.zIndex = "99999"; // Very high z-index to ensure it's always on top
        container.style.pointerEvents = "auto";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "8px";
        container.style.alignItems = "flex-end";

        const button = document.createElement("button");
        button.id = "welcome-panel-toggle-btn";
        button.title = "Show Welcome Panel (Press U)";
        button.style.width = "56px";
        button.style.height = "56px";
        button.style.borderRadius = "50%";
        button.style.backgroundColor = "#3b82f6";
        button.style.border = "3px solid #1e40af";
        button.style.cursor = "pointer";
        button.style.display = "flex";
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.style.boxShadow =
          "0 8px 16px -4px rgba(0, 0, 0, 0.4), 0 4px 8px -2px rgba(0, 0, 0, 0.3)";
        button.style.transition = "all 0.2s ease";
        button.style.color = "white";
        button.style.fontSize = "20px";
        button.style.fontWeight = "bold";
        button.style.outline = "none";
        button.setAttribute("aria-label", "Toggle Welcome Panel");

        // Add hover effects
        button.addEventListener("mouseenter", () => {
          button.style.backgroundColor = "#2563eb";
          button.style.transform = "scale(1.15)";
          button.style.boxShadow =
            "0 12px 24px -4px rgba(0, 0, 0, 0.5), 0 6px 12px -2px rgba(0, 0, 0, 0.4)";
        });
        button.addEventListener("mouseleave", () => {
          const welcomeEntity = (globalThis as any).__welcomePanelEntity;
          const isVisible = welcomeEntity?.object3D?.visible ?? false;
          button.style.backgroundColor = isVisible ? "#7c3aed" : "#3b82f6";
          button.style.transform = "scale(1)";
          button.style.boxShadow =
            "0 8px 16px -4px rgba(0, 0, 0, 0.4), 0 4px 8px -2px rgba(0, 0, 0, 0.3)";
        });

        // Add active/press effect
        button.addEventListener("mousedown", () => {
          button.style.transform = "scale(0.95)";
        });
        button.addEventListener("mouseup", () => {
          button.style.transform = "scale(1.1)";
        });

        // Add click handler
        button.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWelcomePanel();
        });

        // House icon SVG (similar to the welcome panel logo)
        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        `;

        // Add a small label below the button
        const label = document.createElement("div");
        label.textContent = "Menu";
        label.style.color = "#fafafa";
        label.style.fontSize = "12px";
        label.style.fontWeight = "500";
        label.style.textAlign = "center";
        label.style.pointerEvents = "none";
        label.style.userSelect = "none";
        label.style.textShadow = "0 2px 4px rgba(0, 0, 0, 0.5)";

        container.appendChild(button);
        container.appendChild(label);
        document.body.appendChild(container);

        // Ensure button is always visible, even in immersive mode
        // The button should work in both 2D and XR contexts
        console.log(
          "[Panel] ✅ Floating welcome panel toggle button created (always accessible)",
        );
      };

      // Create the floating button immediately and also after a delay as fallback
      createFloatingButton();
      setTimeout(() => {
        // Ensure it exists even if initial creation failed
        if (!document.getElementById("welcome-panel-toggle-btn")) {
          createFloatingButton();
        }
      }, 500);

      // Recreate button if it gets removed (e.g., during page transitions)
      const observer = new MutationObserver((mutations) => {
        if (!document.getElementById("welcome-panel-toggle-btn")) {
          console.log("[Panel] Floating button missing, recreating...");
          createFloatingButton();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // ── XR Controller Input Detection (Meta Quest 3 Trigger) ────────────────
      this.setupXRControllerInput();

      console.log("[Panel] Press 'U' to toggle Welcome Panel");
      console.log("[Panel] Press 'Y' to summon panel in front of you");
      console.log("[Panel] Press trigger button in VR to summon panel");
    });
  }

  private setupXRControllerInput(): void {
    // Set up XR session listeners
    this.renderer.xr.addEventListener("sessionstart", () => {
      console.log(
        "[Panel] 🥽 XR session started - setting up Meta Quest 3 controller input",
      );
      const session = this.renderer.xr.getSession();
      if (session) {
        this.xrSession = session;
        this.triggerCooldown = 0;
        this.lastTriggerState.clear();
        this.setupControllerFrameCallback();
      }
    });

    this.renderer.xr.addEventListener("sessionend", () => {
      console.log("[Panel] XR session ended");
      if (this.frameCallbackId !== null && this.xrSession) {
        this.xrSession.cancelAnimationFrame(this.frameCallbackId);
        this.frameCallbackId = null;
      }
      this.xrSession = null;
      this.lastTriggerState.clear();
      this.triggerCooldown = 0;
    });
  }

  private setupControllerFrameCallback(): void {
    if (!this.xrSession) return;

    const onXRFrame = (time: number, frame: XRFrame) => {
      if (!this.xrSession) return;

      // Update cooldown timer
      if (this.triggerCooldown > 0) {
        this.triggerCooldown -= frame.session.predictedFrameTime || 0.016; // ~60fps default
        if (this.triggerCooldown < 0) this.triggerCooldown = 0;
      }

      try {
        const inputSources = this.xrSession.inputSources;

        for (const inputSource of inputSources) {
          // Skip hand tracking input sources
          if (inputSource.hand) continue;

          // Check for trigger button press
          const gamepad = inputSource.gamepad;
          if (!gamepad) continue;

          // Meta Quest 3: Button 0 is the primary trigger
          // Button 1 is the grip button, so we only check button 0
          const triggerButton = gamepad.buttons[0];
          if (!triggerButton) continue;

          const triggerPressed = triggerButton.pressed;
          const lastState = this.lastTriggerState.get(inputSource) || false;

          // Detect trigger press (transition from not pressed to pressed)
          // Only trigger if cooldown has expired
          if (triggerPressed && !lastState && this.triggerCooldown <= 0) {
            console.log(
              `[Panel] 🎮 Trigger button pressed on ${inputSource.handedness || "unknown"} controller - summoning panel`,
            );
            this.summonPanelInFront();
            this.triggerCooldown = this.TRIGGER_COOLDOWN_TIME;
          }

          // Update last state
          this.lastTriggerState.set(inputSource, triggerPressed);
        }
      } catch (error) {
        console.debug("[Panel] Error checking controller input:", error);
      }

      // Continue frame loop
      if (this.xrSession) {
        this.frameCallbackId = this.xrSession.requestAnimationFrame(onXRFrame);
      }
    };

    // Start the frame loop
    this.frameCallbackId = this.xrSession.requestAnimationFrame(onXRFrame);
    console.log(
      "[Panel] ✅ Meta Quest 3 trigger detection active - press trigger to summon panel",
    );
  }

  private summonPanelInFront(): void {
    const welcomeEntity = (globalThis as any).__welcomePanelEntity;
    if (!welcomeEntity?.object3D) {
      console.warn("[Panel] Welcome panel entity not found");
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
    welcomeEntity.object3D.position.set(targetX, targetY, targetZ);

    // Make panel face the camera
    welcomeEntity.object3D.lookAt(camera.position);

    // Make panel visible
    welcomeEntity.object3D.visible = true;

    console.log("[Panel] ✅ Panel summoned in front of user");
  }
}
