import { describe, expect, it } from "vitest";
import { inspectAwardLegacyFirmware, inspectAwardLhaModules } from "./awardFirmware";

function lhaMember(name: string, payload: number[]) {
  const encodedName = new TextEncoder().encode(name);
  const headerSize = 22 + encodedName.length;
  const bytes = new Uint8Array(2 + headerSize + payload.length);
  const view = new DataView(bytes.buffer);
  bytes[0] = headerSize;
  bytes.set(new TextEncoder().encode("-lh5-"), 2);
  view.setUint32(7, payload.length, true);
  view.setUint32(11, payload.length * 2, true);
  bytes[20] = 1;
  bytes[21] = encodedName.length;
  bytes.set(encodedName, 22);
  bytes.set(payload, 2 + headerSize);
  bytes[1] = bytes
    .subarray(2, 2 + headerSize)
    .reduce((sum, value) => (sum + value) & 0xff, 0);
  return bytes;
}

describe("Award legacy firmware inspection", () => {
  it("confirms a bounded modular Award image and inventories its members", () => {
    const bytes = new Uint8Array(0x40000).fill(0xff);
    const first = lhaMember("awardext.rom", [1, 2, 3, 4]);
    const second = lhaMember("ACPITBL.BIN", [5, 6, 7]);
    bytes.set(first, 0x10000);
    bytes.set(second, 0x11000);
    bytes.set(new TextEncoder().encode("= Award Decompression Bios ="), 0x2d000);
    bytes.set(new TextEncoder().encode("Award BootBlock BIOS v1.0"), 0x3e000);
    bytes.set(new TextEncoder().encode("6A61K00C"), bytes.length - 24);
    bytes.set([0xea, 0x5b, 0xe0, 0x00, 0xf0], bytes.length - 16);

    expect(inspectAwardLegacyFirmware(bytes)).toMatchObject({
      format: "Award Legacy",
      bootBlockOffset: 0x3e000,
      decompressorOffset: 0x2d000,
      resetVectorOffset: 0x3fff0,
      boardId: "6A61K00C",
      modules: [
        { name: "awardext.rom", offset: 0x10000, method: "-lh5-" },
        { name: "ACPITBL.BIN", offset: 0x11000, method: "-lh5-" },
      ],
    });
  });

  it("rejects loose strings and checksum-invalid LHA headers", () => {
    const loose = new TextEncoder().encode(
      "Award BootBlock BIOS v1.0 = Award Decompression Bios = -lh5-",
    );
    expect(inspectAwardLegacyFirmware(loose)).toBeNull();
    const member = lhaMember("module.rom", [1, 2, 3]);
    member[1] ^= 0xff;
    expect(inspectAwardLhaModules(member)).toEqual([]);
  });
});
