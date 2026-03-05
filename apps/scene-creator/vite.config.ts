import { optimizeGLTF } from "@iwsdk/vite-plugin-gltf-optimizer";
import { injectIWER } from "@iwsdk/vite-plugin-iwer";

import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { defineConfig, loadEnv, type Plugin } from "vite";
import mkcert from "vite-plugin-mkcert";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import fs from "node:fs";
import path from "node:path";

function roomScanSavePlugin(): Plugin {
  return {
    name: "room-scan-save",
    configureServer(server) {
      server.middlewares.use("/api/save-room-scan", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const body = Buffer.concat(chunks);

            // Parse multipart form data to extract the .glb file
            const contentType = req.headers["content-type"] || "";
            let filename = `room-scan-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.glb`;
            let fileData: Buffer = body;

            if (contentType.includes("multipart/form-data")) {
              const boundary = contentType.split("boundary=")[1];
              if (boundary) {
                const boundaryBuf = Buffer.from(`--${boundary}`);
                const parts = splitBuffer(body, boundaryBuf);
                for (const part of parts) {
                  const headerEnd = part.indexOf("\r\n\r\n");
                  if (headerEnd === -1) continue;
                  const headers = part.subarray(0, headerEnd).toString();
                  if (headers.includes("filename=")) {
                    const match = headers.match(/filename="([^"]+)"/);
                    if (match) filename = match[1];
                    // Strip trailing \r\n before next boundary
                    let dataEnd = part.length;
                    if (
                      part[part.length - 2] === 0x0d &&
                      part[part.length - 1] === 0x0a
                    ) {
                      dataEnd -= 2;
                    }
                    fileData = part.subarray(headerEnd + 4, dataEnd);
                    break;
                  }
                }
              }
            }

            const outDir = path.resolve(process.cwd(), "room-scans");
            if (!fs.existsSync(outDir))
              fs.mkdirSync(outDir, { recursive: true });

            const outPath = path.join(outDir, filename);
            fs.writeFileSync(outPath, fileData);

            console.log(
              `[room-scan-save] ✅ Saved ${filename} (${(fileData.length / 1024).toFixed(1)} KB) → ${outPath}`,
            );

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(
              JSON.stringify({ ok: true, filename, size: fileData.length }),
            );
          } catch (err) {
            console.error("[room-scan-save] ❌ Error:", err);
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(err) }));
          }
        });
      });

      // Handle CORS preflight
      server.middlewares.use("/api/save-room-scan", (req, res, next) => {
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.statusCode = 204;
          res.end();
          return;
        }
        next();
      });
    },
  };
}

function splitBuffer(buf: Buffer, boundary: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  while (true) {
    const idx = buf.indexOf(boundary, start);
    if (idx === -1) {
      if (start < buf.length) parts.push(buf.subarray(start));
      break;
    }
    if (idx > start) parts.push(buf.subarray(start, idx));
    start = idx + boundary.length;
  }
  return parts;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      wasm(),
      topLevelAwait(),
      mkcert({
        hosts: ["localhost", "127.0.0.1", env.VITE_HOST_IP].filter(
          Boolean,
        ) as string[],
      }),
      injectIWER({
        device: "metaQuest3",
        activation: "localhost",
        verbose: true,
        sem: {
          defaultScene: "living_room",
        },
      }),

      compileUIKit({ sourceDir: "ui", outputDir: "public/ui", verbose: true }),
      optimizeGLTF({
        level: "medium",
      }),
      roomScanSavePlugin(),
    ],
    resolve: {
      alias: {
        three: "three",
      },
      dedupe: ["three", "@pmndrs/uikit"],
    },
    server: { host: "0.0.0.0", port: 8081, open: false },
    build: {
      outDir: "dist",
      sourcemap: process.env.NODE_ENV !== "production",
      target: "esnext",
      rollupOptions: { input: "./index.html" },
    },
    esbuild: { target: "esnext" },
    optimizeDeps: {
      exclude: ["@babylonjs/havok"],
      esbuildOptions: { target: "esnext" },
    },
    publicDir: "public",
    base: "./",
    define: {
      "process.env.VITE_BACKEND_URL": JSON.stringify(
        env.VITE_BACKEND_URL || "https://localhost:5500",
      ),
      "process.env.VITE_FRONTEND_URL": JSON.stringify(
        env.VITE_FRONTEND_URL || "https://localhost:5173",
      ),
    },
  };
});
