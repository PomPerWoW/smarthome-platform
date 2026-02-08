export const config = {
  BACKEND_URL: process.env.VITE_BACKEND_URL || "https://localhost:5500",
  DASHBOARD_URL: process.env.VITE_DASHBOARD_URL || "http://localhost:3000",
} as const;
