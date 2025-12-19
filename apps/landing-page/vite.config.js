import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["turing.se.kmitl.ac.th"],
    port: 5173,
    host: true,
  },
});
