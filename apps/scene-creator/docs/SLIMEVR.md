# SlimeVR Bridge in Scene Creator

The app can connect to the **SlimeVR OSC → WebSocket bridge** to visualize tracker positions in the scene. **There is no tracker-to-avatar bone mapping or IK** in the client; the avatar always uses its normal animation clips.

## Architecture

1. **SlimeVR Server (Windows):** Aggregates physical trackers (or Joy-Cons/smartphones) and runs body emulation. Outputs OSC over UDP to `9000`.
2. **SlimeVR Bridge (Node.js):** Reads OSC UDP packets, packages them up, and broadcasts them via WebSocket on `ws://<host_ip>:8765`.
3. **Scene-Creator:** Subscribes to the WebSocket and draws **green debug markers** at each reported tracker position (after coordinate conversion in `coords.ts`).

## 1. Network Configuration & Auto-Connection

The connection to SlimeVR runs dynamically over the local network.

1. Ensure your machine's local IP address is set in `.env.network`:
   ```env
   VITE_HOST_IP=192.168.4.181
   # (Your specific IP)
   ```
2. During the Vite build, the application can inject the address: `ws://192.168.4.181:8765` so the headset will connect to the bridge correctly.

> [!NOTE]
> `?bodyTracking=off` can be attached to the URL to disable the SlimeVR WebSocket client and hide markers.

## 2. Starting the SlimeVR Bridge

In a separate terminal, start the dedicated OSC-to-WebSocket bridge:

```bash
cd packages/slimevr-bridge
npm start
```

*Wait for it to say `WebSocket server listening on port 8765`.*

## 3. OSC / tracker IDs

The bridge forwards VRChat-style OSC paths (e.g. `/tracking/trackers/1/position`) as string keys in each JSON frame. Use `node test-osc-debug.mjs` in `slimevr-bridge` if you need to see which IDs are live.

## 4. Scene visualization

`SlimeVRFullBodySystem.ts` only updates **debug markers** in the Three.js scene. It does not move the RPM avatar skeleton.

---

## Troubleshooting

- **Debug markers appear far away:** Ensure the SlimeVR Server application has performed a "Full Reset" while standing straight after connecting. The Y-plane origin must match the ground.
