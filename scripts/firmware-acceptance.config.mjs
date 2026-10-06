import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      process.env.FIRMWARE_ACCEPTANCE_SCENARIO === "queue"
        ? "scripts/firmware-queue-acceptance.test.mjs"
        : "scripts/firmware-acceptance.test.mjs",
    ],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
