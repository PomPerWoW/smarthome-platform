import fs from "fs";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["turing.se.kmitl.ac.th", "172.27.37.50", "localhost"],
    port: 5174,
    host: true,
    https: {
      key: fs.readFileSync(path.resolve(__dirname, "./certs/key.pem")),
      cert: fs.readFileSync(path.resolve(__dirname, "./certs/cert.pem")),
    },
  },
});
