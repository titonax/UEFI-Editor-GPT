export interface AwardLhaModule {
  name: string;
  offset: number;
  dataOffset: number;
  compressedSize: number;
  unpackedSize: number;
  method: string;
  headerLevel: number;
}

export interface AwardLegacyInventory {
  format: "Award Legacy";
  bootBlockOffset: number;
  decompressorOffset: number;
  resetVectorOffset: number;
  boardId: string | null;
  modules: AwardLhaModule[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("ascii");

function ascii(text: string) {
  return encoder.encode(text);
}

function bytesEqual(bytes: Uint8Array, offset: number, expected: Uint8Array) {
  if (offset < 0 || offset + expected.length > bytes.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function findAscii(bytes: Uint8Array, text: string) {
  const expected = ascii(text);
  for (let offset = 0; offset + expected.length <= bytes.length; offset += 1) {
    if (bytesEqual(bytes, offset, expected)) return offset;
  }
  return -1;
}

function readUint32(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function printableName(bytes: Uint8Array, offset: number, length: number) {
  if (length === 0 || length > 96 || offset + length > bytes.length) return null;
  const nameBytes = bytes.subarray(offset, offset + length);
  if (!nameBytes.every((value) => value >= 0x20 && value <= 0x7e)) return null;
  return decoder.decode(nameBytes);
}

/**
 * Inventories checksum-valid level-0/1 LHA members used by Award modular BIOS.
 * Payload decompression is deliberately separate: recognition never treats an
 * unbounded `-lh5-` string as an archive member.
 */
export function inspectAwardLhaModules(bytes: Uint8Array): AwardLhaModule[] {
  const modules: AwardLhaModule[] = [];
  for (let offset = 0; offset + 24 <= bytes.length; offset += 1) {
    if (
      bytes[offset + 2] !== 0x2d ||
      bytes[offset + 3] !== 0x6c ||
      bytes[offset + 4] !== 0x68 ||
      ![0x30, 0x34, 0x35, 0x36, 0x37].includes(bytes[offset + 5]) ||
      bytes[offset + 6] !== 0x2d
    ) {
      continue;
    }
    const method = decoder.decode(bytes.subarray(offset + 2, offset + 7));

    const headerSize = bytes[offset];
    const headerEnd = offset + 2 + headerSize;
    const headerLevel = bytes[offset + 20];
    const nameLength = bytes[offset + 21];
    const name = printableName(bytes, offset + 22, nameLength);
    const compressedSize = readUint32(bytes, offset + 7);
    const unpackedSize = readUint32(bytes, offset + 11);
    if (
      headerSize < 22 + nameLength ||
      headerEnd > bytes.length ||
      (headerLevel !== 0 && headerLevel !== 1) ||
      !name ||
      compressedSize === null ||
      unpackedSize === null ||
      compressedSize === 0 ||
      unpackedSize === 0 ||
      headerEnd + compressedSize > bytes.length
    ) {
      continue;
    }

    let checksum = 0;
    for (let cursor = offset + 2; cursor < headerEnd; cursor += 1) {
      checksum = (checksum + bytes[cursor]) & 0xff;
    }
    if (checksum !== bytes[offset + 1]) continue;

    modules.push({
      name,
      offset,
      dataOffset: headerEnd,
      compressedSize,
      unpackedSize,
      method,
      headerLevel,
    });
  }
  return modules;
}

function readBoardId(bytes: Uint8Array, resetVectorOffset: number) {
  const start = resetVectorOffset - 8;
  if (start < 0) return null;
  return printableName(bytes, start, 8);
}

/**
 * Confirms an Award legacy image from independent bounded structures: a final
 * boot-block banner, the decompression core, an x86 far-jump reset vector and
 * at least two checksum-valid modular LHA members.
 */
export function inspectAwardLegacyFirmware(
  bytes: Uint8Array,
): AwardLegacyInventory | null {
  if (bytes.length < 0x10000) return null;
  const bootBlockOffset = findAscii(bytes, "Award BootBlock BIOS v1.0");
  const decompressorOffset = findAscii(bytes, "= Award Decompression Bios =");
  const resetVectorOffset = bytes.length - 16;
  const resetSegment =
    bytes[resetVectorOffset + 3] | (bytes[resetVectorOffset + 4] << 8);
  if (
    bootBlockOffset < Math.max(0, bytes.length - 0x20000) ||
    decompressorOffset < 0 ||
    decompressorOffset >= bootBlockOffset ||
    bytes[resetVectorOffset] !== 0xea ||
    resetSegment < 0xf000
  ) {
    return null;
  }

  const modules = inspectAwardLhaModules(bytes);
  if (modules.length < 2) return null;
  return {
    format: "Award Legacy",
    bootBlockOffset,
    decompressorOffset,
    resetVectorOffset,
    boardId: readBoardId(bytes, resetVectorOffset),
    modules,
  };
}
