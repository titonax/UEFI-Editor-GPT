import { FirmwareError } from "./errors";

export function assertBinaryRange(
  bytes: Uint8Array,
  offset: number,
  size: number,
  label = "Binary field",
) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size < 0 ||
    offset + size > bytes.length
  ) {
    throw new FirmwareError(
      "PARSE_FAILED",
      `${label} at 0x${offset.toString(16).toUpperCase()} exceeds its source buffer.`,
    );
  }
}

export function readUint16(bytes: Uint8Array, offset: number) {
  assertBinaryRange(bytes, offset, 2, "16-bit field");
  return bytes[offset] | (bytes[offset + 1] << 8);
}

export function readUint24(bytes: Uint8Array, offset: number) {
  assertBinaryRange(bytes, offset, 3, "24-bit field");
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function readUint32(bytes: Uint8Array, offset: number) {
  assertBinaryRange(bytes, offset, 4, "32-bit field");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    true,
  );
}

export function readUint64AsNumber(bytes: Uint8Array, offset: number) {
  assertBinaryRange(bytes, offset, 8, "64-bit field");
  const value = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getBigUint64(offset, true);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : 0;
}

export function align(value: number, alignment: number) {
  if (
    !Number.isSafeInteger(value) ||
    !Number.isSafeInteger(alignment) ||
    value < 0 ||
    alignment <= 0
  ) {
    throw new FirmwareError("PARSE_FAILED", "Invalid binary alignment request.");
  }
  return Math.ceil(value / alignment) * alignment;
}

export function formatHex(value: number, width: number) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

export function readGuid(bytes: Uint8Array, offset: number) {
  assertBinaryRange(bytes, offset, 16, "GUID");
  return `${formatHex(readUint32(bytes, offset), 8)}-${formatHex(
    readUint16(bytes, offset + 4),
    4,
  )}-${formatHex(readUint16(bytes, offset + 6), 4)}-${formatHex(
    bytes[offset + 8],
    2,
  )}${formatHex(bytes[offset + 9], 2)}-${Array.from(
    bytes.slice(offset + 10, offset + 16),
    (byte) => formatHex(byte, 2),
  ).join("")}`;
}
