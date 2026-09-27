import { describe, expect, it } from "vitest";
import { inspectPhoenixLegacyBytes, type PhoenixModule } from "./phoenixFirmware";
import { replacePhoenixFfvLh5Payload } from "./phoenixFfvRebuilder";
import { phoenixLh5Codec } from "./phoenixLh5";

function ffvFixture(packedSize = 16, unpackedSize = 32) {
  const bytes = new Uint8Array(24 + 12 + packedSize).fill(0xcc);
  bytes[0] = 0xf8;
  bytes[4] = bytes.length;
  bytes[5] = 0;
  bytes[6] = 0;
  bytes[7] = 2;
  bytes.set(new TextEncoder().encode("_T00"), 8);
  bytes[16] = 0xff;
  bytes[24] = 12 + packedSize;
  bytes[25] = 0;
  bytes[26] = 0;
  bytes[27] = 1;
  bytes[28] = packedSize;
  bytes[29] = 0;
  bytes[30] = 0;
  bytes[32] = unpackedSize;
  bytes[33] = 0;
  bytes[34] = 0;
  const module: PhoenixModule = {
    name: "TEMPLAT0.ROM",
    kind: "section",
    offset: 0,
    size: bytes.length,
    compression: "lh5",
    packedSize,
    unpackedSize,
    payloadOffset: 36,
  };
  return { bytes, module };
}

describe("replacePhoenixFfvLh5Payload", () => {
  it("round-trips and changes only the fixed compressed allocation", async () => {
    const { bytes, module } = ffvFixture();
    const original = bytes.slice();
    const modifiedBody = new Uint8Array(32).fill(0x5a);

    const result = await replacePhoenixFfvLh5Payload(
      bytes,
      module,
      modifiedBody,
      phoenixLh5Codec,
    );

    expect(result).toMatchObject({
      compressedSize: 8,
      allocationSize: 16,
      changedOffset: 36,
      changedLength: 16,
    });
    expect(bytes).toEqual(original);
    expect(result.image.subarray(0, 36)).toEqual(original.subarray(0, 36));
    await expect(
      phoenixLh5Codec.decompress(result.image.subarray(36, 52), 32),
    ).resolves.toEqual(modifiedBody);
  });

  it("rejects growth beyond the original packed allocation", async () => {
    const { bytes, module } = ffvFixture(8, 2);

    await expect(
      replacePhoenixFfvLh5Payload(
        bytes,
        module,
        Uint8Array.of(0x12, 0x34),
        phoenixLh5Codec,
      ),
    ).rejects.toThrow(/needs .* allocation/);
  });

  it("rejects stale inventory before compression", async () => {
    const { bytes, module } = ffvFixture();
    bytes[28] = 15;

    await expect(
      replacePhoenixFfvLh5Payload(bytes, module, new Uint8Array(32), phoenixLh5Codec),
    ).rejects.toThrow(/no longer matches/);
  });

  it("keeps the FFV header structurally readable", async () => {
    const { bytes, module } = ffvFixture();
    const result = await replacePhoenixFfvLh5Payload(
      bytes,
      module,
      new Uint8Array(32).fill(0x20),
      phoenixLh5Codec,
    );

    // A standalone fixture has no PhoenixBIOS/BCP directory, so the legacy
    // inventory correctly remains null. Header bytes themselves are preserved
    // byte-for-byte; full-image re-inventory is covered once the Z03 arrives.
    expect(inspectPhoenixLegacyBytes(result.image)).toBeNull();
    expect(result.image.subarray(0, 36)).toEqual(bytes.subarray(0, 36));
  });
});
