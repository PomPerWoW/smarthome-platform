/**
 * Listens for SlimeVR / VRChat-style OSC tracker messages on UDP,
 * aggregates poses, and broadcasts JSON frames over Secure WebSocket (WSS).
 */
import dgram from "node:dgram";
import { WebSocketServer } from "ws";
import { fromBuffer } from "osc-min";
import https from "node:https"; // Added for WSS
import fs from "node:fs"; // Added to read certs

const OSC_PORT = Number(process.env.SLIMEVR_OSC_PORT || 9000);
const WS_PORT = Number(process.env.SLIMEVR_WS_PORT || 8765);
const HOST = "192.168.4.181";

const trackers = new Map();

function oscArgsToFloats(args) {
  if (!args || !Array.isArray(args)) return [];
  const out = [];
  for (const a of args) {
    if (a && typeof a === "object" && "value" in a) {
      const v = a.value;
      if (typeof v === "number") out.push(v);
    }
  }
  return out;
}

function applyTrackerMessage(decoded) {
  const address = decoded?.address;
  if (!address || typeof address !== "string") return;

  const parts = address.split("/").filter(Boolean);
  if (parts.length >= 4 && parts[0] === "tracking" && parts[1] === "trackers") {
    const id = parts[2];
    const kind = parts[3];
    const floats = oscArgsToFloats(decoded.args);
    if (floats.length < 3) return;

    let entry = trackers.get(id);
    if (!entry) {
      entry = {};
      trackers.set(id, entry);
    }
    if (kind === "position") {
      entry.position = floats.slice(0, 3);
    } else if (kind === "rotation") {
      entry.rotation = floats.slice(0, 3);
    }
  }
}

function walkOscPacket(packet) {
  if (!packet || typeof packet !== "object") return;
  if (packet.oscType === "bundle" && Array.isArray(packet.elements)) {
    for (const el of packet.elements) walkOscPacket(el);
    return;
  }
  if (packet.oscType === "message") {
    applyTrackerMessage(packet);
  }
}

function handleOscMessage(msg) {
  try {
    walkOscPacket(fromBuffer(msg));
  } catch {
    // malformed packet or unsupported type
  }
}

// --- UDP SETUP ---
const udp = dgram.createSocket("udp4");
udp.on("message", (msg) => handleOscMessage(msg));
udp.on("error", (err) => {
  console.error("[slimevr-bridge] UDP error:", err);
  if (err?.code === "EADDRINUSE") {
    console.error(`[slimevr-bridge] Port ${OSC_PORT} is in use.`);
    process.exit(1);
  }
});

udp.bind(OSC_PORT, HOST, () => {
  console.log(`[slimevr-bridge] Listening OSC UDP on ${HOST}:${OSC_PORT}`);
});

// --- SECURE WEBSOCKET (WSS) SETUP ---
// Load the fake certificates
const serverOptions = {
  key: fs.readFileSync("key.pem"),
  cert: fs.readFileSync("cert.pem"),
};

// Create an HTTPS server
const httpsServer = https.createServer(serverOptions);

// Attach WebSocket to the HTTPS server
const wss = new WebSocketServer({ server: httpsServer });

wss.on("error", (err) => {
  console.error("[slimevr-bridge] WebSocket server error:", err);
  if (err?.code === "EADDRINUSE") {
    console.error(`[slimevr-bridge] Port ${WS_PORT} is in use.`);
  }
  process.exit(1);
});

let frameSeq = 0;
const BROADCAST_HZ = 60;
const intervalMs = 1000 / BROADCAST_HZ;

function buildFrame() {
  const t = Date.now();
  const out = {};
  for (const [id, data] of trackers) {
    out[id] = {
      ...(data.position ? { position: data.position } : {}),
      ...(data.rotation ? { rotation: data.rotation } : {}),
    };
  }
  return { type: "slimevr_frame", seq: ++frameSeq, t, trackers: out };
}

wss.on("connection", (ws) => {
  console.log("[slimevr-bridge] WebSocket client connected");
  ws.send(JSON.stringify({ type: "slimevr_hello", t: Date.now() }));
  ws.on("close", () => {
    console.log("[slimevr-bridge] WebSocket client disconnected");
  });
});

setInterval(() => {
  const payload = JSON.stringify(buildFrame());
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}, intervalMs);

// Start the HTTPS server
httpsServer.listen(WS_PORT, HOST, () => {
  console.log(
    `[slimevr-bridge] Secure WebSocket server on wss://${HOST}:${WS_PORT}`,
  );
  console.log(
    `Update your query param to: ?slimevrWs=wss://${HOST}:${WS_PORT}`,
  );
});
