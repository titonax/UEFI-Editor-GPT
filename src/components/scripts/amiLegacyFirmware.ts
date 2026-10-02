export interface AmiLegacyInventory {
  format: "AMIBIOS 8";
  signature: string;
  version: string;
  signatureOffset: number;
  bootBlockOffset: number;
  resetVectorOffset: number;
  biosDate?: string;
}

const encoder = new TextEncoder();

function findBytes(bytes: Uint8Array, needle: Uint8Array, start = 0) {
  outer: for (
    let offset = Math.max(0, start);
    offset <= bytes.length - needle.length;
    offset += 1
  ) {
    for (let index = 0; index < needle.length; index += 1) {
      if (bytes[offset + index] !== needle[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function isAsciiDigit(value: number) {
  return value >= 0x30 && value <= 0x39;
}

function findBiosDate(bytes: Uint8Array) {
  const start = Math.max(0, bytes.length - 0x100);
  for (let offset = start; offset + 8 <= bytes.length; offset += 1) {
    if (
      isAsciiDigit(bytes[offset]) &&
      isAsciiDigit(bytes[offset + 1]) &&
      bytes[offset + 2] === 0x2f &&
      isAsciiDigit(bytes[offset + 3]) &&
      isAsciiDigit(bytes[offset + 4]) &&
      bytes[offset + 5] === 0x2f &&
      isAsciiDigit(bytes[offset + 6]) &&
      isAsciiDigit(bytes[offset + 7])
    ) {
      return ascii(bytes, offset, 8);
    }
  }
  return undefined;
}

/**
 * Recognizes a bounded AMIBIOS8 legacy ROM from three independent boot-block
 * invariants. A loose `AMIBIOS` string alone is intentionally insufficient.
 */
export function inspectAmiLegacyFirmware(bytes: Uint8Array): AmiLegacyInventory | null {
  const signaturePrefix = encoder.encode("AMIBIOSC");
  const bootBlockMarker = encoder.encode("AMIBOOT ROM");
  let signatureOffset = findBytes(bytes, signaturePrefix);
  while (signatureOffset >= 0) {
    const versionOffset = signatureOffset + signaturePrefix.length;
    const versionEnd = versionOffset + 4;
    const validVersion =
      versionEnd <= bytes.length &&
      [...bytes.subarray(versionOffset, versionEnd)].every(isAsciiDigit);
    if (validVersion) {
      const bootBlockOffset = findBytes(bytes, bootBlockMarker, versionEnd);
      const resetVectorOffset = bytes.length - 16;
      const validResetVector =
        resetVectorOffset >= 0 &&
        bytes[resetVectorOffset] === 0xea &&
        bytes[resetVectorOffset + 3] === 0x00 &&
        bytes[resetVectorOffset + 4] === 0xf0;
      if (bootBlockOffset >= 0 && validResetVector) {
        const version = ascii(bytes, versionOffset, 4);
        const biosDate = findBiosDate(bytes);
        return {
          format: "AMIBIOS 8",
          signature: `AMIBIOSC${version}`,
          version,
          signatureOffset,
          bootBlockOffset,
          resetVectorOffset,
          ...(biosDate ? { biosDate } : {}),
        };
      }
    }
    signatureOffset = findBytes(bytes, signaturePrefix, signatureOffset + 1);
  }
  return null;
}
