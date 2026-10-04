import { describe, expect, it } from "vitest";
import { FirmwareError } from "./errors";
import { createStandardSectionCodec } from "./standardSectionCodec";

function packet(decoded: Uint8Array) {
  const packed = new Uint8Array(decoded.length + 8);
  const view = new DataView(packed.buffer);
  view.setUint32(0, decoded.length, true);
  view.setUint32(4, decoded.length, true);
  packed.set(decoded, 8);
  return packed;
}

describe("standard EFI/Tiano section codec", () => {
  it("selects the original variant and round-trips only matching decoded bytes", async () => {
    const source = Uint8Array.from([1, 2, 3, 4]);
    const modified = Uint8Array.from([1, 2, 8, 4]);
    const modes: string[] = [];
    const run = (bytes: Uint8Array, mode: string) => {
      modes.push(mode);
      if (mode === "tiano")
        return Promise.resolve(new Uint8Array(source.length).fill(0));
      if (mode === "efi") return Promise.resolve(bytes.slice(8));
      if (mode === "compress-efi") return Promise.resolve(packet(bytes));
      throw new Error(`Unexpected mode ${mode}`);
    };
    const codec = createStandardSectionCodec(packet(source), source, run);
    expect(await codec.decompress(packet(source))).toEqual(source);
    const encoded = await codec.compress(modified);
    expect(await codec.decompress(encoded)).toEqual(modified);
    expect(modes).toEqual(["tiano", "efi", "efi", "compress-efi", "efi"]);
    await expect(codec.compress(new Uint8Array(5))).rejects.toThrow(/length changed/);
  });

  it("rejects malformed sizes and contradictory provenance", async () => {
    const source = Uint8Array.from([1, 2, 3]);
    const encoded = packet(source);
    expect(() => createStandardSectionCodec(encoded.subarray(0, 7), source)).toThrow(
      /header/,
    );
    expect(() => createStandardSectionCodec(encoded, source.subarray(0, 2))).toThrow(
      /provenance/,
    );
    const oversized = encoded.slice();
    new DataView(oversized.buffer).setUint32(0, 0xffffffff, true);
    expect(() => createStandardSectionCodec(oversized, source)).toThrow(/size fields/);
    const run = () =>
      Promise.reject<Uint8Array>(
        new FirmwareError("INVALID_COMPRESSED_SECTION", "bad variant"),
      );
    const codec = createStandardSectionCodec(encoded, source, run);
    await expect(codec.decompress(encoded)).rejects.toThrow(/Neither EFI nor Tiano/);
  });
});
