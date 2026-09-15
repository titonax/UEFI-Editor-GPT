import { describe, expect, it } from "vitest";
import {
  encapsulatedFirmwareSection,
  lzmaCustomDecompressGuid,
  readFirmwareSection,
} from "./firmwareSections";

function writeGuid(bytes: Uint8Array, offset: number, guid: string) {
  const [data1, data2, data3, data4, data5] = guid.split("-");
  const view = new DataView(bytes.buffer);
  view.setUint32(offset, Number.parseInt(data1, 16), true);
  view.setUint16(offset + 4, Number.parseInt(data2, 16), true);
  view.setUint16(offset + 6, Number.parseInt(data3, 16), true);
  bytes.set(
    Uint8Array.from(`${data4}${data5}`.match(/../g) ?? [], (pair) =>
      Number.parseInt(pair, 16),
    ),
    offset + 8,
  );
}

describe("firmware section parsing", () => {
  it("preserves the standard PI compression-section layout", () => {
    const bytes = new Uint8Array(12);
    bytes.set([12, 0, 0, 0x01]);
    new DataView(bytes.buffer).setUint32(4, 3, true);
    bytes[8] = 1;
    bytes.set([0xaa, 0xbb, 0xcc], 9);

    const section = readFirmwareSection(bytes, 0, bytes.length);
    if (!section) throw new Error("Expected a valid section.");
    expect(encapsulatedFirmwareSection(bytes, section)).toEqual({
      bytes: new Uint8Array([0xaa, 0xbb, 0xcc]),
      compression: "standard",
      payloadStart: 9,
      payloadEnd: 12,
    });
  });

  it("opens an LZMA GUID-defined section at its declared DataOffset", () => {
    const bytes = new Uint8Array(28);
    bytes.set([28, 0, 0, 0x02]);
    writeGuid(bytes, 4, lzmaCustomDecompressGuid);
    new DataView(bytes.buffer).setUint16(20, 24, true);
    new DataView(bytes.buffer).setUint16(22, 1, true);
    bytes.set([0x11, 0x22, 0x33, 0x44], 24);

    const section = readFirmwareSection(bytes, 0, bytes.length);
    expect(section).not.toBeNull();
    if (!section) throw new Error("Expected a valid section.");
    expect(encapsulatedFirmwareSection(bytes, section)).toEqual({
      bytes: new Uint8Array([0x11, 0x22, 0x33, 0x44]),
      compression: "lzma",
      payloadStart: 24,
      payloadEnd: 28,
      definitionGuid: lzmaCustomDecompressGuid,
      attributes: 1,
    });
  });

  it("supports the extended PI section header layout", () => {
    const bytes = new Uint8Array(31);
    bytes.set([0xff, 0xff, 0xff, 0x02]);
    new DataView(bytes.buffer).setUint32(4, bytes.length, true);
    writeGuid(bytes, 8, lzmaCustomDecompressGuid);
    new DataView(bytes.buffer).setUint16(24, 28, true);
    new DataView(bytes.buffer).setUint16(26, 1, true);
    bytes.set([0xaa, 0xbb, 0xcc], 28);

    const section = readFirmwareSection(bytes, 0, bytes.length);
    expect(section?.headerSize).toBe(8);
    if (!section) throw new Error("Expected a valid section.");
    expect(encapsulatedFirmwareSection(bytes, section)).toEqual({
      bytes: new Uint8Array([0xaa, 0xbb, 0xcc]),
      compression: "lzma",
      payloadStart: 28,
      payloadEnd: 31,
      definitionGuid: lzmaCustomDecompressGuid,
      attributes: 1,
    });
  });

  it("does not open an unknown processor when processing is required", () => {
    const bytes = new Uint8Array(25);
    bytes.set([25, 0, 0, 0x02]);
    writeGuid(bytes, 4, "11111111-2222-3333-4444-555555555555");
    new DataView(bytes.buffer).setUint16(20, 24, true);
    new DataView(bytes.buffer).setUint16(22, 1, true);

    const section = readFirmwareSection(bytes, 0, bytes.length);
    if (!section) throw new Error("Expected a valid section.");
    expect(encapsulatedFirmwareSection(bytes, section)).toBeNull();
  });

  it("opens an unknown GUID-defined wrapper when processing is not required", () => {
    const bytes = new Uint8Array(26);
    bytes.set([26, 0, 0, 0x02]);
    writeGuid(bytes, 4, "11111111-2222-3333-4444-555555555555");
    new DataView(bytes.buffer).setUint16(20, 24, true);
    bytes.set([0x5a, 0xa5], 24);

    const section = readFirmwareSection(bytes, 0, bytes.length);
    if (!section) throw new Error("Expected a valid section.");
    expect(encapsulatedFirmwareSection(bytes, section)).toEqual({
      bytes: new Uint8Array([0x5a, 0xa5]),
      compression: "none",
      payloadStart: 24,
      payloadEnd: 26,
      definitionGuid: "11111111-2222-3333-4444-555555555555",
      attributes: 0,
    });
  });
});
