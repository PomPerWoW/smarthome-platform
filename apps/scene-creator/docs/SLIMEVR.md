# SlimeVR with Scene Creator

This app receives full-body tracker data over **WebSocket** from the **`@smarthome/slimevr-bridge`** helper. SlimeVR Server sends **OSC (UDP)**; the browser cannot listen on UDP, so the bridge listens for OSC and forwards JSON frames.

## 1. SlimeVR Server (P0 checklist)

1. Complete hardware setup per [SlimeVR quick setup](https://docs.slimevr.dev/quick-setup.html).
2. Open **SlimeVR Server → Settings → OSC** and enable **VRChat OSC Trackers** (or equivalent tracker output).
3. Set the OSC **target address** to the machine running the bridge:
   - **Same PC as the browser (IWER / desktop):** `127.0.0.1`
   - **Quest browser, bridge on PC:** your **PC’s LAN IP** (same subnet as the headset).
4. Set the OSC **port** to match the bridge (default **9000** unless you change `SLIMEVR_OSC_PORT`).
5. In the server UI, assign body roles to each tracker (chest, thighs, ankles, hands, head) so indices match your layout. The bridge forwards **whatever OSC addresses** SlimeVR emits (e.g. `/tracking/trackers/<id>/position` and `/rotation`).

Official OSC details: [SlimeVR OSC information](https://docs.slimevr.dev/server/osc-information.html).

## 2. Run the bridge

From the monorepo root:

```bash
cd packages/slimevr-bridge
npm install
npm start
```

Defaults:

| Env variable | Default | Meaning |
|--------------|---------|---------|
| `SLIMEVR_OSC_PORT` | `9000` | UDP port the bridge listens on (point SlimeVR here). |
| `SLIMEVR_WS_PORT` | `8765` | WebSocket port for the scene-creator page. |

## 3. Open scene-creator with tracking

Append a query parameter (or set `VITE_SLIMEVR_WS` for a default in dev):

```
https://<host>:3003/smarthome/xr/?slimevrWs=ws://127.0.0.1:8765
```

On Quest, use your PC IP, e.g. `ws://192.168.1.10:8765`.

## 4. VRChat-style tracker indices (reference)

SlimeVR’s mapping to numbered trackers follows VRChat conventions (hip, chest, feet, knees, elbows, etc.). Your **exact** index→body mapping depends on how trackers are assigned in SlimeVR Server—use the server UI and, if needed, the **debug axes** in the scene to confirm which id moves which tracker.

## 5. Coordinate space

OSC positions/rotations use SlimeVR’s documented frame (Unity-style). The client applies a **fixed handedness conversion** into Three.js / WebXR (Y-up, right-handed). Fine-tune in code via `slimevr/coords.ts` if gizmos drift.
