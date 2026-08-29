import { describe, expect, it } from "vitest";
import {
  align,
  readGuid,
  readUint16,
  readUint24,
  readUint32,
  readUint64AsNumber,
} from "./binaryReader";

describe("binary reader", () => {
  it("reads little-endian integers", () => {
    const bytes = new Uint8Array([0x78, 0x56, 0x34, 0x12, 0, 0, 0, 0]);
    expect(readUint16(bytes, 0)).toBe(0x5678);
    expect(readUint24(bytes, 0)).toBe(0x345678);
    expect(readUint32(bytes, 0)).toBe(0x12345678);
    expect(readUint64AsNumber(bytes, 0)).toBe(0x12345678);
  });

  it("formats UEFI GUID byte order", () => {
    const bytes = new Uint8Array([
      0x78, 0x56, 0x34, 0x12, 0xbc, 0x9a, 0xf0, 0xde, 0x11, 0x22, 0x33, 0x44, 0x55,
      0x66, 0x77, 0x88,
    ]);
    expect(readGuid(bytes, 0)).toBe("12345678-9ABC-DEF0-1122-334455667788");
  });

  it("rejects unsafe ranges and alignment requests", () => {
    expect(() => readUint32(new Uint8Array(3), 0)).toThrow(/exceeds/);
    expect(() => align(4, 0)).toThrow(/alignment/);
    expect(align(9, 8)).toBe(16);
  });
});
