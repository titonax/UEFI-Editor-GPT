import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/firmware-acceptance.test.mjs"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
