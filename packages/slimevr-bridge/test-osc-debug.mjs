/**
 * test-osc-debug.mjs — Detailed diagnostic for SlimeVR OSC output
 *
 * Logs ALL unique OSC addresses ever seen, checks whether values change,
 * and reports which trackers are "alive" vs "frozen".
 *
 * Usage: node test-osc-debug.mjs
 * (stop server.mjs first — they share port 9000)
 */

import dgram from "node:dgram";
import { fromBuffer } from "osc-min";

const OSC_PORT = Number(process.env.SLIMEVR_OSC_PORT || 9000);

/** Track every unique address with first-seen, last-seen, count, and value history */
const addressLog = new Map();
let totalPackets = 0;
let startTime = Date.now();

function oscArgsToFloats(args) {
  if (!Array.isArray(args)) return [];
  return args
    .filter((a) => a && typeof a === "object" && typeof a.value === "number")
    .map((a) => a.value);
}

function processMessage(decoded) {
  const address = decoded?.address;
  if (typeof address !== "string") return;

  const floats = oscArgsToFloats(decoded.args);
  const now = Date.now();

  let entry = addressLog.get(address);
  if (!entry) {
    entry = {
      firstSeen: now,
      lastSeen: now,
      count: 0,
      firstValue: [...floats],
      lastValue: [...floats],
      hasChanged: false,
      minValues: floats.map((v) => v),
      maxValues: floats.map((v) => v),
    };
    addressLog.set(address, entry);
    console.log(`  🆕 NEW address: ${address}  values: [${floats.map((v) => v.toFixed(4)).join(", ")}]`);
  }

  entry.count++;
  entry.lastSeen = now;

  // Check if any value changed from the last reading
  for (let i = 0; i < floats.length; i++) {
    if (entry.lastValue[i] !== undefined && Math.abs(floats[i] - entry.lastValue[i]) > 0.0001) {
      if (!entry.hasChanged) {
        console.log(`  ⚡ VALUES CHANGING on: ${address}`);
      }
      entry.hasChanged = true;
    }
    // Track min/max
    if (entry.minValues[i] === undefined || floats[i] < entry.minValues[i]) entry.minValues[i] = floats[i];
    if (entry.maxValues[i] === undefined || floats[i] > entry.maxValues[i]) entry.maxValues[i] = floats[i];
  }

  entry.lastValue = [...floats];
}

function walkPacket(packet) {
  if (!packet || typeof packet !== "object") return;
  if (packet.oscType === "bundle" && Array.isArray(packet.elements)) {
    for (const el of packet.elements) walkPacket(el);
    return;
  }
  if (packet.oscType === "message") processMessage(packet);
}

// ── UDP socket ───────────────────────────────────────────────────────────────

const udp = dgram.createSocket("udp4");

udp.on("message", (msg) => {
  totalPackets++;
  try {
    walkPacket(fromBuffer(msg));
  } catch (e) {
    console.warn("  [parse error]", e.message);
  }
});

udp.on("error", (err) => {
  console.error("[test-osc-debug] UDP error:", err.message);
  if (err.code === "EADDRINUSE") {
    console.error(`\n⚠️  Port ${OSC_PORT} in use. Stop server.mjs first.\n`);
    process.exit(1);
  }
});

udp.bind(OSC_PORT, () => {
  console.log("┌───────────────────────────────────────────────────────────────────────┐");
  console.log(`│  SlimeVR OSC Debug — listening on UDP 0.0.0.0:${String(OSC_PORT).padEnd(5)}                    │`);
  console.log("│  Will log: all unique OSC addresses, which ones change, value ranges  │");
  console.log("│  Let it run 10-20 seconds while moving trackers, then Ctrl+C          │");
  console.log("└───────────────────────────────────────────────────────────────────────┘\n");
});

// ── Periodic report ──────────────────────────────────────────────────────────

setInterval(() => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  ═══ Report @ ${elapsed}s — ${totalPackets} UDP packets — ${addressLog.size} unique OSC addresses ═══\n`);

  if (addressLog.size === 0) {
    console.log("  (no OSC messages received yet)\n");
    return;
  }

  // Group by tracker
  const trackers = new Map();
  const otherAddresses = [];

  for (const [addr, entry] of [...addressLog].sort()) {
    const match = addr.match(/^\/tracking\/trackers\/([^/]+)\/(.+)$/);
    if (match) {
      const [, id, kind] = match;
      if (!trackers.has(id)) trackers.set(id, {});
      trackers.get(id)[kind] = entry;
    } else {
      otherAddresses.push({ addr, entry });
    }
  }

  console.log("  ┌─────────┬──────────┬──────────┬────────────────────────────────────────────────────────┐");
  console.log("  │ Tracker │ Channel  │  Status  │ Values (first → last)                                  │");
  console.log("  ├─────────┼──────────┼──────────┼────────────────────────────────────────────────────────┤");

  for (const [id, channels] of [...trackers].sort()) {
    for (const [kind, entry] of Object.entries(channels).sort()) {
      const status = entry.hasChanged ? "✅ LIVE " : "🔴 FROZEN";
      const first = entry.firstValue.map((v) => v.toFixed(3)).join(", ");
      const last = entry.lastValue.map((v) => v.toFixed(3)).join(", ");
      const range = entry.minValues
        .map((min, i) => {
          const max = entry.maxValues[i];
          const delta = (max - min).toFixed(4);
          return `Δ${delta}`;
        })
        .join(" ");
      const valueStr = entry.hasChanged
        ? `[${first}] → [${last}]  ${range}`
        : `[${first}]  (never changed, ${entry.count} msgs)`;
      console.log(`  │ ${id.padEnd(7)} │ ${kind.padEnd(8)} │ ${status} │ ${valueStr.substring(0, 54).padEnd(54)} │`);
    }
  }

  console.log("  └─────────┴──────────┴──────────┴────────────────────────────────────────────────────────┘");

  if (otherAddresses.length > 0) {
    console.log("\n  Other (non-tracker) OSC addresses:");
    for (const { addr, entry } of otherAddresses) {
      const status = entry.hasChanged ? "LIVE" : "FROZEN";
      console.log(`    ${addr} — ${status}, ${entry.count} msgs`);
    }
  }

  // Summary
  const trackerIds = [...trackers.keys()];
  const liveTrackers = trackerIds.filter((id) => {
    const channels = trackers.get(id);
    return Object.values(channels).some((e) => e.hasChanged);
  });
  const frozenTrackers = trackerIds.filter((id) => !liveTrackers.includes(id));

  console.log(`\n  Summary: ${trackerIds.length} tracker IDs total`);
  console.log(`    Live (values changing):  ${liveTrackers.length > 0 ? liveTrackers.join(", ") : "(none)"}`);
  console.log(`    Frozen (static values):  ${frozenTrackers.length > 0 ? frozenTrackers.join(", ") : "(none)"}`);

  if (frozenTrackers.length > 0) {
    console.log(`\n  ⚠️  Frozen trackers may indicate:`);
    console.log(`     - Tracker is on but not assigned in SlimeVR Server`);
    console.log(`     - Tracker is not worn / not moving`);
    console.log(`     - Tracker battery is dead or disconnected`);
    console.log(`     - SlimeVR Server needs a reset/recalibration`);
  }

  const expectedIds = ["1", "2", "3", "4", "5", "6", "7", "8", "head"];
  const missing = expectedIds.filter((id) => !trackerIds.includes(id));
  if (missing.length > 0) {
    console.log(`\n  ⚠️  Missing tracker IDs (expected 8 + head): ${missing.join(", ")}`);
    console.log(`     - Check SlimeVR Server: these trackers may not be assigned to VRChat OSC roles`);
    console.log(`     - Or they may use different numbering — check SlimeVR OSC settings`);
  }

  console.log("");
}, 3000);
