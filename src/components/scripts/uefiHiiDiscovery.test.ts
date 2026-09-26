import { describe, expect, it } from "vitest";
import type { DecodedFirmwareInventory } from "./aptioIvExtractor";
import { inventoryUefiHiiModules } from "./uefiHiiDiscovery";

function writeUint24(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

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

function section(type: number, payload: Uint8Array) {
  const bytes = new Uint8Array(4 + payload.length);
  writeUint24(bytes, 0, bytes.length);
  bytes[3] = type;
  bytes.set(payload, 4);
  return bytes;
}

function formsPackage() {
  const formSetGuid = "E14F04FA-8706-4353-92F2-9C2424746F9F";
  const payload = new Uint8Array(23 + 6 + 15 + 2 + 2);
  payload.set([0x0e, 0x80 | 23], 0);
  writeGuid(payload, 2, formSetGuid);
  payload.set([0x01, 0x80 | 6, 0x01, 0x10, 0x01, 0x00], 23);
  payload.set(
    [0x0f, 15, 0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0, 0, 0, 0, 0, 0x02, 0x10],
    29,
  );
  payload.set([0x29, 0x02, 0x29, 0x02], 44);
  const bytes = new Uint8Array(4 + payload.length);
  writeUint24(bytes, 0, bytes.length);
  bytes[3] = 0x02;
  bytes.set(payload, 4);
  return bytes;
}

function firmwareVolume(name: string) {
  const encoder = new TextEncoder();
  const nameAscii = encoder.encode(name);
  const nameUtf16 = new Uint8Array((nameAscii.length + 1) * 2);
  for (const [index, byte] of nameAscii.entries()) nameUtf16[index * 2] = byte;
  const ui = section(0x15, nameUtf16);
  const pe32 = section(0x10, formsPackage());
  const bodyLength = (ui.length + 3) & ~3;
  const fileSize = 24 + bodyLength + pe32.length;
  const volumeSize = (0x48 + fileSize + 0x3f) & ~7;
  const bytes = new Uint8Array(volumeSize).fill(0xff);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0x20, BigInt(volumeSize), true);
  bytes.set([0x5f, 0x46, 0x56, 0x48], 0x28);
  view.setUint16(0x30, 0x48, true);
  writeGuid(bytes, 0x48, "E6A7A1CE-5881-4B49-80BE-69C91811685C");
  bytes[0x48 + 18] = 0x07;
  writeUint24(bytes, 0x48 + 20, fileSize);
  bytes.set(ui, 0x48 + 24);
  bytes.set(pe32, 0x48 + 24 + bodyLength);
  return bytes;
}

describe("vendor-neutral UEFI HII discovery", () => {
  it("finds a Forms package by PI/IFR structure and deduplicates mirrored buffers", () => {
    const bytes = firmwareVolume("Setup");
    const decoded: DecodedFirmwareInventory = {
      buffers: [
        { id: 0, bytes, depth: 1 },
        { id: 1, bytes: bytes.slice(), depth: 1 },
      ],
      decodeFailures: [],
    };

    const inventory = inventoryUefiHiiModules(decoded);

    expect(inventory.decodedBufferCount).toBe(2);
    expect(inventory.uniqueBufferCount).toBe(1);
    expect(inventory.modules).toHaveLength(1);
    expect(inventory.modules[0]).toMatchObject({
      name: "Setup",
      bufferId: 0,
      duplicateBufferIds: [1],
      formCount: 1,
      referenceCount: 1,
      formSetGuids: ["E14F04FA-8706-4353-92F2-9C2424746F9F"],
    });
  });

  it("does not treat arbitrary PE32 bytes as HII", () => {
    const bytes = firmwareVolume("Setup");
    bytes.fill(0, 0x48 + 24 + 20);
    const decoded: DecodedFirmwareInventory = {
      buffers: [{ id: 0, bytes, depth: 0 }],
      decodeFailures: [],
    };

    expect(inventoryUefiHiiModules(decoded).modules).toEqual([]);
  });
});
