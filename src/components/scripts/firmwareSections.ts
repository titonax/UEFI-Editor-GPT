import { readGuid, readUint16, readUint24, readUint32 } from "./binaryReader";

export const lzmaCustomDecompressGuid = "EE4E5898-3914-4259-9D6E-DC7BD79403CF";
export const tianoCustomDecompressGuid = "A31280AD-481E-41B6-95E8-127F4C984779";

export interface FirmwareSection {
  start: number;
  end: number;
  size: number;
  type: number;
  headerSize: 4 | 8;
}

export type FirmwareCompression = "none" | "standard" | "lzma";

export interface EncapsulatedFirmwareSection {
  bytes: Uint8Array;
  compression: FirmwareCompression;
}

/**
 * Reads either EFI_COMMON_SECTION_HEADER or EFI_COMMON_SECTION_HEADER2.
 * A null result means the remaining bytes are not a complete PI section.
 */
export function readFirmwareSection(
  bytes: Uint8Array,
  start: number,
  streamEnd: number,
): FirmwareSection | null {
  if (start < 0 || streamEnd > bytes.length || start + 4 > streamEnd) return null;

  const size24 = readUint24(bytes, start);
  const extended = size24 === 0xffffff;
  const headerSize = extended ? 8 : 4;
  if (start + headerSize > streamEnd) return null;

  const size = extended ? readUint32(bytes, start + 4) : size24;
  if (size < headerSize || start + size > streamEnd) return null;

  return {
    start,
    end: start + size,
    size,
    type: bytes[start + 3],
    headerSize,
  };
}

/**
 * Describes the payload of PI encapsulation sections without decompressing it.
 * Unknown GUID-defined processors are only opened when processing is not required.
 */
export function encapsulatedFirmwareSection(
  bytes: Uint8Array,
  section: FirmwareSection,
): EncapsulatedFirmwareSection | null {
  if (section.type === 0x01) {
    const metadata = section.start + section.headerSize;
    if (metadata + 5 > section.end) return null;
    const compressionType = bytes[metadata + 4];
    const compression: FirmwareCompression | null =
      compressionType === 0
        ? "none"
        : compressionType === 1
          ? "standard"
          : compressionType === 2
            ? "lzma"
            : null;
    if (!compression) return null;
    return {
      bytes: bytes.slice(metadata + 5, section.end),
      compression,
    };
  }

  if (section.type === 0x02) {
    const metadata = section.start + section.headerSize;
    if (metadata + 20 > section.end) return null;
    const definitionGuid = readGuid(bytes, metadata);
    const dataOffset = readUint16(bytes, metadata + 16);
    const attributes = readUint16(bytes, metadata + 18);
    const minimumDataOffset = section.headerSize + 20;
    if (dataOffset < minimumDataOffset || dataOffset > section.size) return null;

    let compression: FirmwareCompression | null = null;
    if (definitionGuid === lzmaCustomDecompressGuid) compression = "lzma";
    else if (definitionGuid === tianoCustomDecompressGuid) compression = "standard";
    else if ((attributes & 0x01) === 0) compression = "none";
    if (!compression) return null;

    return {
      bytes: bytes.slice(section.start + dataOffset, section.end),
      compression,
    };
  }

  if (section.type === 0x03) {
    return {
      bytes: bytes.slice(section.start + section.headerSize, section.end),
      compression: "none",
    };
  }

  return null;
}
