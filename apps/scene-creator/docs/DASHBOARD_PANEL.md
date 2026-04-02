# Dashboard panel (XR): position and toggles

The smart-home dashboard is a spatial UI panel driven by `DashboardPanelSystem` (`src/ui/DashboardPanelSystem.ts`). In immersive WebXR (Quest Browser), you can move it, show or hide it, and switch whether it follows your head — using **controllers**, **hand tracking** (when available), or **keyboard** helpers.

## Panel distance

The panel is placed **about 1.4 m** in front of the camera along the view direction (constants `DASHBOARD_PANEL_DISTANCE_M`, `DASHBOARD_PANEL_Y_OFFSET_SUMMON`, `DASHBOARD_PANEL_Y_OFFSET_FOLLOW`). Summon and head-follow use the same forward distance so the panel does not jump when follow mode changes.

To change comfort (closer/farther), edit those constants in `DashboardPanelSystem.ts`.

## Controllers (Meta Quest Touch)

Mappings follow the **Meta Quest Touch** WebXR gamepad layout used elsewhere in this app:

| Input | Action |
|--------|--------|
| **Squeeze / grip** (button index `1`) | Toggle **head-follow** vs **fixed** position |
| **Thumbstick press** (button index `3`) | Toggle dashboard **visible** / **hidden** |

Both hands behave the same: either controller can trigger either action. A short cooldown avoids double triggers (~0.45 s).

## Hand tracking (optional)

When the XR session exposes **hand tracking** and the runtime provides `frame.getHandPose` (same path as `WelcomePanelGestureSystem`), **index–thumb pinch** is detected when the tips are closer than ~**4.2 cm** (`HAND_PINCH_DISTANCE_M`).

| Hand | Action |
|------|--------|
| **Left** pinch | Toggle **head-follow** (same as controller grip) |
| **Right** pinch | Toggle dashboard **visibility** (same as thumbstick click) |

**Notes:**

- Hand routing uses **left vs right** `handedness**. If the system reports `none`, hand pinch is ignored for that source.
- Left-handed users who prefer the opposite mapping can use **controllers** for the same actions on either hand, or use the keyboard follow toggle (below).
- If pinch never fires, confirm **hand tracking** is enabled for the session and that the browser exposes hand poses (Quest Browser typically does when the feature is granted).

## Keyboard (2D / dev)

| Key | Action |
|-----|--------|
| **T** | Toggle head-follow (ignored when focus is in a text field) |

## Programmatic / debug

Globals set when the dashboard entity is ready:

- `__toggleDashboardPanel()` — show / hide the panel
- `__summonDashboardPanel()` — place the panel in front of the camera and show it
- `__toggleDashboardFollowMode()` — same as grip / left-hand pinch

## IWSDK / WebXR context

The dashboard is a **PanelUI** + **UIKit** document (`./ui/dashboard.json`). Input is polled on the immersive session’s `requestAnimationFrame` loop; it is not part of the generic XR input manager abstraction but follows the same WebXR **gamepad** and **hand** APIs described in the Immersive Web SDK documentation for Quest Browser experiences.
