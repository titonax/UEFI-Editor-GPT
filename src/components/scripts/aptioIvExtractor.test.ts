import { describe, expect, it } from "vitest";
import { extractAptioIvArtifacts } from "./aptioIvExtractor";
import { FirmwareError } from "./errors";

function binaryFile(bytes: Uint8Array): File {
  return {
    name: "firmware.bin",
    arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
  } as File;
}

describe("Aptio IV extraction errors", () => {
  it("reports a typed parse failure when Setup FFS cannot be located", async () => {
    try {
      await extractAptioIvArtifacts(binaryFile(new Uint8Array(0x80)));
      throw new Error("Expected extraction to fail.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(FirmwareError);
      if (!(error instanceof FirmwareError)) {
        throw error;
      }
      expect(error.code).toBe("PARSE_FAILED");
      expect(error.message).toMatch(/Setup FFS/);
    }
  });
});
