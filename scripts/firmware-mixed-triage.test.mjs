import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { decodeFirmwareBuffers } from "../src/components/scripts/aptioIvExtractor";
import { inventoryUefiHiiModules } from "../src/components/scripts/uefiHiiDiscovery";

// Private manifest paths stay local. Reports contain identities and counts only.
const manifestPath = process.env.FIRMWARE_TRIAGE_MANIFEST;
if (!manifestPath) throw Error("Set FIRMWARE_TRIAGE_MANIFEST.");
const inputs = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > 64)
  throw Error("Expected 1–64 source identities.");
for (const input of inputs)
  if (
    !/^[a-f0-9]{64}$/.test(input.sha256) ||
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    typeof input.path !== "string"
  )
    throw Error("Invalid source identity.");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

for (const input of inputs) {
  it(`inventories mixed ownership for ${input.sha256}`, async () => {
    const wasmDirectory = process.env.FIRMWARE_ACCEPTANCE_WASM_DIR;
    if (!wasmDirectory) throw Error("Set FIRMWARE_ACCEPTANCE_WASM_DIR.");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      async (url) =>
        new Response(readFileSync(join(wasmDirectory, basename(String(url)))), {
          headers: { "Content-Type": "application/wasm" },
        }),
    );
    const image = new Uint8Array(readFileSync(input.path));
    expect(image.length).toBe(input.size);
    expect(digest(image)).toBe(input.sha256);
    const decoded = await decodeFirmwareBuffers(image);
    const inventory = inventoryUefiHiiModules(decoded);
    const mixed = inventory.modules.filter(
      (module) => module.ownership === "mixed-direct-nested",
    );
    expect(digest(image)).toBe(input.sha256);
    console.info(
      JSON.stringify({
        sourceSha256: input.sha256,
        sourceSize: input.size,
        decodedBufferCount: inventory.decodedBufferCount,
        uniqueBufferCount: inventory.uniqueBufferCount,
        hiiModuleCount: inventory.modules.length,
        mixedCarrierCount: mixed.length,
        reportedDecodeFailureCount: inventory.decodeFailures.length,
        interpretation:
          "read-only inventory; zero candidates is bounded to this source/parser run, not format-wide absence; no edit or output acceptance",
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  }, 300000);
}
