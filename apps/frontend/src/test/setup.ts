import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock localStorage for Zustand persist middleware
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

// Mock matchMedia for use-mobile hook
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock import.meta.env for tests
Object.defineProperty(import.meta, "env", {
  value: {
    BASE_URL: "/smarthome/home/",
    VITE_BACKEND_URL: "https://localhost:5500",
    MODE: "test",
    DEV: false,
    PROD: false,
    SSR: false,
  },
  writable: true,
});
