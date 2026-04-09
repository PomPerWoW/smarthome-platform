import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/utils/device.utils.ts",
        "src/utils/type-guards.ts",
        "src/api/deviceMapper.ts",
        "src/entities/BaseDevice.ts",
        "src/entities/DeviceFactory.ts",
        "src/entities/Lightbulb.ts",
        "src/entities/Television.ts",
        "src/entities/Fan.ts",
        "src/entities/AirConditioner.ts",
        "src/entities/Chair.ts",
        "src/entities/SmartMeter.ts",
        "src/store/DeviceStore.ts",
      ],
      exclude: ["src/systems/**", "src/index.ts"],
    },
  },
  resolve: {
    alias: {
      three: "three",
    },
  },
});
