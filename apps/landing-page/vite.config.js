import fs from "fs";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    server: {
      port: 5174,
      host: "0.0.0.0", // Allows binding to all local IPs so `.env` override works cleanly
      https: {
      },
    },
  };
});
