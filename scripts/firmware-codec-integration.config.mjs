import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/firmware-codec-integration.test.mjs"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
