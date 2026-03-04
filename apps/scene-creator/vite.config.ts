import { optimizeGLTF } from "@iwsdk/vite-plugin-gltf-optimizer";
import { injectIWER } from "@iwsdk/vite-plugin-iwer";

import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { defineConfig, loadEnv } from "vite";
import mkcert from "vite-plugin-mkcert";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

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
    ],
    resolve: {
      alias: {
        three: "three", // standard alias, path based looked complex and might be fragile if not needed
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
