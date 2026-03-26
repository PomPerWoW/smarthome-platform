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
  private welcomeObject3D: any = null;

  init() {
    this.queries.welcomePanel.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        return;
      }
      this.welcomeObject3D = entity.object3D;

      const store = getStore();
      const auth = getAuth();
      const user = auth.getUser();

      const toggleExclusiveRightPanel = (target: "placement") => {
        const placementEntity = (globalThis as any).__placementPanelEntity;

        const placementObj = placementEntity?.object3D;
        const targetObj = target === "placement" ? placementObj : undefined;
        const otherObj = undefined;

        if (!targetObj) return;

        const shouldOpen = !targetObj.visible;
        if (otherObj) otherObj.visible = false;
        targetObj.visible = shouldOpen;
      };

      const railIds = [
        "rail-home-btn",
        "rail-devices-btn",
        "rail-refresh-btn",
        "rail-mic-btn",
        "rail-xr-btn",
      ];

      const setActiveRail = (activeId: string) => {
        for (const id of railIds) {
          const btn = document.getElementById(id) as any;
          if (!btn) continue;
          btn.setProperties?.({
            backgroundColor:
              id === activeId
                ? "rgba(37, 99, 235, 0.34)"
                : "rgba(255, 255, 255, 0.22)",
            borderColor:
              id === activeId
                ? "rgba(37, 99, 235, 0.56)"
                : "rgba(255, 255, 255, 0.35)",
          });
        }
      };

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
      const handleXrClick = async () => {
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
      };

      const xrButton = document.getElementById("xr-button") as UIKit.Text;
      if (xrButton) {
        xrButton.addEventListener("click", handleXrClick);

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
      const railXrButton = document.getElementById("rail-xr-btn") as UIKit.Text;
      if (railXrButton) {
        railXrButton.addEventListener("click", () => {
          setActiveRail("rail-xr-btn");
          handleXrClick();
        });
      }

      const railMicButton = document.getElementById("rail-mic-btn") as UIKit.Text;
      if (railMicButton) {
        railMicButton.addEventListener("click", () => {
          setActiveRail("rail-mic-btn");
          const fn = (globalThis as any).__triggerVoiceAssistant as
            | (() => void)
            | undefined;
          if (fn) fn();
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
      const railRefreshButton = document.getElementById(
        "rail-refresh-btn",
      ) as UIKit.Text;
      if (railRefreshButton) {
        railRefreshButton.addEventListener("click", async () => {
          setActiveRail("rail-refresh-btn");
          await store.refreshDevices();
          setActiveRail("rail-home-btn");
        });
      }

      // Devices Button → toggle placement panel
      const devicesButton = document.getElementById(
        "devices-button",
      ) as UIKit.Text;
      if (devicesButton) {
        devicesButton.addEventListener("click", () => {
          console.log("[Panel] Toggling placement panel");
          toggleExclusiveRightPanel("placement");
        });
      }
      const railDevicesButton = document.getElementById(
        "rail-devices-btn",
      ) as UIKit.Text;
      if (railDevicesButton) {
        railDevicesButton.addEventListener("click", () => {
          setActiveRail("rail-devices-btn");
          toggleExclusiveRightPanel("placement");
          const placementEntity = (globalThis as any).__placementPanelEntity;
          if (!placementEntity?.object3D?.visible) setActiveRail("rail-home-btn");
        });
      }

      // Room alignment is unplugged from current workflow.
      const alignButton = document.getElementById(
        "align-room-button",
      ) as UIKit.Text;
      if (alignButton) {
        alignButton.setProperties?.({ display: "none" });
      }
      const railAlignButton = document.getElementById(
        "rail-align-room-btn",
      ) as UIKit.Text;
      if (railAlignButton) {
        railAlignButton.setProperties?.({ display: "none" });
      }

      const railHomeButton = document.getElementById(
        "rail-home-btn",
      ) as UIKit.Text;
      if (railHomeButton) {
        railHomeButton.addEventListener("click", () => {
          setActiveRail("rail-home-btn");
          const placementEntity = (globalThis as any).__placementPanelEntity;
          if (placementEntity?.object3D) placementEntity.object3D.visible = false;
          showWelcomePanel();
        });
      }
      setActiveRail("rail-home-btn");

      // ── Welcome Panel Toggle Function ────────────────────────────────────
      const toggleWelcomePanel = () => {
        const welcomeEntity = (globalThis as any).__welcomePanelEntity;
        if (welcomeEntity?.object3D) {
          const isVisible = welcomeEntity.object3D.visible;
          welcomeEntity.object3D.visible = !isVisible;
          console.log(
            `[Panel] Welcome panel ${!isVisible ? "shown" : "hidden"}`,
          );

          const portalBtn = document.getElementById(
            "welcome-panel-toggle-btn",
          ) as HTMLButtonElement | null;
          if (portalBtn) {
            const nowOpen = !isVisible;
            portalBtn.title = nowOpen
              ? "Hide main portal"
              : "Show main portal";
            portalBtn.style.backgroundColor = nowOpen
              ? "rgba(124, 58, 237, 0.92)"
              : "rgba(37, 99, 235, 0.92)";
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

          const portalBtn = document.getElementById(
            "welcome-panel-toggle-btn",
          ) as HTMLButtonElement | null;
          if (portalBtn) {
            portalBtn.title = "Hide main portal";
            portalBtn.style.backgroundColor = "rgba(124, 58, 237, 0.92)";
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

      // ── Floating portal + voice controls (always on screen) ───────────────
      const glassButtonBase = (el: HTMLButtonElement) => {
        el.style.width = "52px";
        el.style.height = "52px";
        el.style.borderRadius = "50%";
        el.style.cursor = "pointer";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.boxShadow =
          "0 16px 48px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)";
        el.style.transition = "all 0.2s ease";
        el.style.color = "white";
        el.style.outline = "none";
        el.style.border = "1px solid rgba(255, 255, 255, 0.14)";
        el.style.backdropFilter = "blur(40px)";
        el.style.webkitBackdropFilter = "blur(40px)";
        el.style.backgroundColor = "rgba(15, 23, 42, 0.88)";
      };

      const createFloatingButton = () => {
        const existing = document.getElementById(
          "welcome-panel-toggle-container",
        );
        if (existing) existing.remove();

        const container = document.createElement("div");
        container.id = "welcome-panel-toggle-container";
        container.style.position = "fixed";
        container.style.top = "20px";
        container.style.right = "20px";
        container.style.zIndex = "99999";
        container.style.pointerEvents = "auto";
        container.style.display = "flex";
        container.style.flexDirection = "row";
        container.style.alignItems = "flex-start";
        container.style.gap = "12px";

        const voiceBtn = document.createElement("button");
        voiceBtn.id = "voice-assistant-float-btn";
        voiceBtn.title = "Voice assistant";
        voiceBtn.setAttribute("aria-label", "Voice assistant");
        glassButtonBase(voiceBtn);
        voiceBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>`;
        voiceBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const fn = (globalThis as any).__triggerVoiceAssistant as
            | (() => void)
            | undefined;
          if (fn) fn();
        });
        voiceBtn.addEventListener("mouseenter", () => {
          voiceBtn.style.backgroundColor = "rgba(37, 99, 235, 0.95)";
          voiceBtn.style.transform = "scale(1.06)";
        });
        voiceBtn.addEventListener("mouseleave", () => {
          voiceBtn.style.backgroundColor = "rgba(15, 23, 42, 0.88)";
          voiceBtn.style.transform = "scale(1)";
        });

        const button = document.createElement("button");
        button.id = "welcome-panel-toggle-btn";
        button.title = "Main portal";
        glassButtonBase(button);
        button.style.backgroundColor = "rgba(37, 99, 235, 0.92)";
        button.setAttribute("aria-label", "Toggle main portal");

        button.addEventListener("mouseenter", () => {
          button.style.backgroundColor = "#1d4ed8";
          button.style.transform = "scale(1.06)";
        });
        button.addEventListener("mouseleave", () => {
          const welcomeEntity = (globalThis as any).__welcomePanelEntity;
          const isVisible = welcomeEntity?.object3D?.visible ?? false;
          button.style.backgroundColor = isVisible
            ? "rgba(124, 58, 237, 0.92)"
            : "rgba(37, 99, 235, 0.92)";
          button.style.transform = "scale(1)";
        });

        button.addEventListener("mousedown", () => {
          button.style.transform = "scale(0.96)";
        });
        button.addEventListener("mouseup", () => {
          button.style.transform = "scale(1.04)";
        });

        button.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWelcomePanel();
        });

        button.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        `;

        const labelsCol = document.createElement("div");
        labelsCol.style.display = "flex";
        labelsCol.style.flexDirection = "column";
        labelsCol.style.alignItems = "flex-end";
        labelsCol.style.gap = "6px";

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.flexDirection = "row";
        row.style.gap = "10px";
        row.appendChild(voiceBtn);
        row.appendChild(button);

        const label = document.createElement("div");
        label.style.color = "#e2e8f0";
        label.style.fontSize = "11px";
        label.style.fontWeight = "600";
        label.style.textAlign = "right";
        label.style.pointerEvents = "none";
        label.style.userSelect = "none";
        label.style.textShadow = "0 1px 3px rgba(0,0,0,0.6)";
        label.style.fontFamily =
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        label.textContent = "Voice · Portal";

        labelsCol.appendChild(row);
        labelsCol.appendChild(label);
        container.appendChild(labelsCol);
        document.body.appendChild(container);

        console.log(
          "[Panel] ✅ Floating voice + portal controls created (always accessible)",
        );
      };

      // Create the floating button immediately and also after a delay as fallback
      createFloatingButton();
      setTimeout(() => {
        if (
          !document.getElementById("welcome-panel-toggle-btn") ||
          !document.getElementById("voice-assistant-float-btn")
        ) {
          createFloatingButton();
        }
      }, 500);

      const observer = new MutationObserver(() => {
        if (
          !document.getElementById("welcome-panel-toggle-btn") ||
          !document.getElementById("voice-assistant-float-btn")
        ) {
          console.log("[Panel] Floating controls missing, recreating...");
          createFloatingButton();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // ── XR Controller Input Detection (Meta Quest 3 Trigger) ────────────────
      this.setupXRControllerInput();

      console.log("[Panel] Main portal toggle & summon shortcuts active");
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

  update(dt: number): void {
    const panel = this.welcomeObject3D;
    const camera = this.world.camera;
    if (!panel || !camera || !panel.visible) return;

    // Keep the portal floating in front of user at all times.
    const forward = new Vector3();
    camera.getWorldDirection(forward);
    const targetX = camera.position.x + forward.x * 0.85;
    const targetY = camera.position.y - 0.18;
    const targetZ = camera.position.z + forward.z * 0.85;

    const t = Math.min(1, 4.5 * dt);
    panel.position.x += (targetX - panel.position.x) * t;
    panel.position.y += (targetY - panel.position.y) * t;
    panel.position.z += (targetZ - panel.position.z) * t;
    panel.lookAt(camera.position);
  }
}
