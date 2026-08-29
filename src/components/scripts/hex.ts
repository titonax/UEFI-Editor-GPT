import { FirmwareError } from "./errors";

const HEX_BYTE = /^[0-9a-f]{2}$/i;

export function validateByteInput(value: string): boolean {
  return value.length <= 2 && (value.length === 0 || /^[0-9a-f]+$/i.test(value));
}

export function offsetToHexIndex(offset: string): number {
  const parsed = Number.parseInt(offset, 16);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new FirmwareError("INVALID_INPUT", `Invalid hexadecimal offset: ${offset}`);
  }
  return parsed * 2;
}

export function decimalToHex(decimal: number): string {
  if (!Number.isSafeInteger(decimal) || decimal < 0) {
    throw new FirmwareError(
      "INVALID_INPUT",
      `Invalid non-negative integer: ${String(decimal)}`,
    );
  }
  return `0x${decimal.toString(16).toUpperCase()}`;
}

export function replaceHex(
  source: string,
  index: number,
  length: number,
  replacement: string,
): string {
  if (
    !Number.isSafeInteger(index) ||
    !Number.isSafeInteger(length) ||
    index < 0 ||
    length < 0 ||
    index + length > source.length
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "A firmware patch points outside its source file.",
    );
  }
  return source.slice(0, index) + replacement + source.slice(index + length);
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new FirmwareError(
      "INVALID_INPUT",
      "Hexadecimal data has an odd number of characters.",
    );
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const byte = hex.slice(index, index + 2);
    if (!HEX_BYTE.test(byte)) {
      throw new FirmwareError(
        "INVALID_INPUT",
        `Invalid hexadecimal byte at character ${String(index)}.`,
      );
    }
    bytes[index / 2] = Number.parseInt(byte, 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
