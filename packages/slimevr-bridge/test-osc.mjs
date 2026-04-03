/**
 * test-osc.mjs — Quick smoke-test for SlimeVR OSC output
 *
 * Run with: node test-osc.mjs
 * (Make sure SlimeVR Server "OSC Router" target is set to this machine's IP, port 9000)
 *
 * Override port: SLIMEVR_OSC_PORT=9001 node test-osc.mjs
 *
 * What it does:
 *  - Listens for every UDP/OSC datagram SlimeVR sends
 *  - Prints raw OSC address + floats for EVERY message
 *  - Prints a compact tracker summary table every second
 */

import dgram from "node:dgram";
import { fromBuffer } from "osc-min";

const OSC_PORT = Number(process.env.SLIMEVR_OSC_PORT || 9000);

/** @type {Map<string, { position?: number[], rotation?: number[], lastSeen: number }>} */
const trackers = new Map();
let totalMessages = 0;
let lastMessageTime = null;

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt3(arr) {
  if (!arr) return "  (none)        ";
  return arr.map((v) => v.toFixed(4).padStart(9)).join("  ");
}

function oscArgsToFloats(args) {
  if (!Array.isArray(args)) return [];
  return args
    .filter((a) => a && typeof a === "object" && typeof a.value === "number")
    .map((a) => a.value);
}

function applyMessage(decoded) {
  const address = decoded?.address;
  if (typeof address !== "string") return;

  const floats = oscArgsToFloats(decoded.args);

  // ── Print every raw message ──────────────────────────────────────
  const floatStr = floats.length ? floats.map((v) => v.toFixed(4)).join(", ") : "(no float args)";
  console.log(`  OSC  ${address.padEnd(55)} [ ${floatStr} ]`);

  // ── Aggregate /tracking/trackers/<id>/position|rotation ─────────
  const parts = address.split("/").filter(Boolean);
  if (parts.length >= 4 && parts[0] === "tracking" && parts[1] === "trackers") {
    const id = parts[2];
    const kind = parts[3]; // "position" | "rotation"
    if (floats.length >= 3) {
      let entry = trackers.get(id);
      if (!entry) {
        entry = { lastSeen: 0 };
        trackers.set(id, entry);
      }
      entry.lastSeen = Date.now();
      if (kind === "position") entry.position = floats.slice(0, 3);
      else if (kind === "rotation") entry.rotation = floats.slice(0, 3);
    }
  }
}

function walkPacket(packet) {
  if (!packet || typeof packet !== "object") return;
  if (packet.oscType === "bundle" && Array.isArray(packet.elements)) {
    for (const el of packet.elements) walkPacket(el);
    return;
  }
  if (packet.oscType === "message") applyMessage(packet);
}

// ── UDP socket ───────────────────────────────────────────────────────────────

const udp = dgram.createSocket("udp4");

udp.on("message", (msg) => {
  totalMessages++;
  lastMessageTime = Date.now();
  try {
    walkPacket(fromBuffer(msg));
  } catch (e) {
    console.warn("  [parse error]", e.message);
  }
});

udp.on("error", (err) => {
  console.error("[test-osc] UDP error:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n⚠️  Port ${OSC_PORT} is already in use.\n` +
        "   → Stop the main server.mjs first (it also listens on this port).\n" +
        "   → Or run with: SLIMEVR_OSC_PORT=<other_port> node test-osc.mjs\n" +
        "     and point SlimeVR to that other port.\n"
    );
    process.exit(1);
  }
});

udp.bind(OSC_PORT, () => {
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log(`│  SlimeVR OSC Test — listening on UDP 0.0.0.0:${String(OSC_PORT).padEnd(5)}              │`);
  console.log("│  Point SlimeVR Server → OSC Router → this machine's IP          │");
  console.log("│  Press Ctrl+C to stop                                           │");
  console.log("└─────────────────────────────────────────────────────────────────┘\n");
});

// ── Summary table every second ───────────────────────────────────────────────

setInterval(() => {
  if (trackers.size === 0) {
    const elapsed = lastMessageTime ? ((Date.now() - lastMessageTime) / 1000).toFixed(1) : "—";
    console.log(`\n  [${new Date().toLocaleTimeString()}] No trackers yet. Total OSC msgs: ${totalMessages}  (last msg: ${elapsed}s ago)\n`);
    return;
  }

  console.log(`\n  ┌── Tracker Snapshot [${new Date().toLocaleTimeString()}]  msgs: ${totalMessages} ──`);
  console.log("  │  ID              │  position (x, y, z)                │  rotation (x, y, z)");
  console.log("  │─────────────────────────────────────────────────────────────────────────────");
  for (const [id, data] of [...trackers].sort()) {
    const age = ((Date.now() - data.lastSeen) / 1000).toFixed(1);
    const posStr = data.position ? fmt3(data.position) : "    —    ".padEnd(29);
    const rotStr = data.rotation ? fmt3(data.rotation) : "    —";
    console.log(`  │  ${id.padEnd(16)}│  ${posStr}  │  ${rotStr}   (${age}s ago)`);
  }
  console.log("  └──\n");
}, 1000);
