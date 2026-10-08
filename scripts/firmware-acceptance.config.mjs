import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const uiAcceptance = process.env.FIRMWARE_ACCEPTANCE_SCENARIO === "uefi-hii-ui";

export default defineConfig({
  plugins: uiAcceptance ? [react()] : [],
  test: {
    environment: uiAcceptance ? "jsdom" : "node",
    setupFiles: uiAcceptance ? ["./src/test/setup.ts"] : [],
    include: [
      uiAcceptance
        ? "scripts/firmware-uefi-hii-ui-acceptance.test.mjs"
        : process.env.FIRMWARE_ACCEPTANCE_SCENARIO === "uefi-hii-mirrors"
          ? "scripts/firmware-uefi-hii-acceptance.test.mjs"
          : ["nested-lzma", "nested-lzma-setupdata", "nested-lzma-queue"].includes(
                process.env.FIRMWARE_ACCEPTANCE_SCENARIO,
              )
            ? "scripts/firmware-nested-lzma-acceptance.test.mjs"
            : process.env.FIRMWARE_ACCEPTANCE_SCENARIO === "queue"
              ? "scripts/firmware-queue-acceptance.test.mjs"
              : "scripts/firmware-acceptance.test.mjs",
    ],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
