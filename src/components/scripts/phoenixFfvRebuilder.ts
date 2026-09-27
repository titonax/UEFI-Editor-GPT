import { readUint24 } from "./binaryReader";
import { FirmwareError } from "./errors";
import type { PhoenixCompressionCodec } from "./phoenixCompressionCodec";
import type { PhoenixModule } from "./phoenixFirmware";

export interface PhoenixFfvReplacement {
  image: Uint8Array;
  compressedSize: number;
  allocationSize: number;
  changedOffset: number;
  changedLength: number;
}

function requireLh5FfvModule(
  source: Uint8Array,
  module: PhoenixModule,
): { payloadOffset: number; packedSize: number; unpackedSize: number } {
  const { payloadOffset, packedSize, unpackedSize } = module;
  if (
    module.kind !== "section" ||
    module.compression !== "lh5" ||
    payloadOffset === undefined ||
    packedSize === undefined ||
    unpackedSize === undefined
  ) {
    throw new FirmwareError(
      "INVALID_COMPRESSED_SECTION",
      `${module.name} is not a bounded Phoenix LH5 FFV section.`,
    );
  }

  const sectionOffset = payloadOffset - 12;
  if (
    module.offset < 0 ||
    module.size < 36 ||
    module.offset + module.size > source.length ||
    source[module.offset] !== 0xf8 ||
    source[module.offset + 7] !== 2 ||
    readUint24(source, module.offset + 4) !== module.size ||
    sectionOffset !== module.offset + 24 ||
    source[sectionOffset + 3] !== 1 ||
    readUint24(source, sectionOffset + 4) !== packedSize ||
    readUint24(source, sectionOffset + 8) !== unpackedSize ||
    payloadOffset + packedSize > module.offset + module.size
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      `${module.name} no longer matches the inventoried Phoenix FFV structure.`,
    );
  }

  return { payloadOffset, packedSize, unpackedSize };
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length && left.every((byte, index) => byte === right[index])
  );
}

/**
 * Replaces only the existing compressed payload allocation of a Phoenix FFV
 * module. Header sizes stay unchanged and unused payload bytes become zero
 * padding, which LH5 readers accept after the completed bitstream.
 *
 * This is intentionally not a complete-image approval step: format-specific
 * checksum validation belongs to the enclosing FFV reconstruction layer.
 */
export async function replacePhoenixFfvLh5Payload(
  source: Uint8Array,
  module: PhoenixModule,
  modifiedBody: Uint8Array,
  codec: PhoenixCompressionCodec,
): Promise<PhoenixFfvReplacement> {
  const { payloadOffset, packedSize, unpackedSize } = requireLh5FfvModule(
    source,
    module,
  );
  if (modifiedBody.length !== unpackedSize) {
    throw new FirmwareError(
      "INVALID_INPUT",
      `${module.name} must remain ${String(unpackedSize)} decoded bytes; received ${String(modifiedBody.length)}.`,
    );
  }

  const compressed = await codec.compress(modifiedBody);
  if (compressed.length > packedSize) {
    throw new FirmwareError(
      "PATCH_FAILED",
      `${module.name} needs ${String(compressed.length)} compressed bytes but its allocation is ${String(packedSize)} bytes.`,
    );
  }
  const decoded = await codec.decompress(compressed, modifiedBody.length);
  if (!equalBytes(decoded, modifiedBody)) {
    throw new FirmwareError(
      "PATCH_FAILED",
      `${module.name} failed the mandatory LH5 compression round-trip.`,
    );
  }

  const image = source.slice();
  image.fill(0, payloadOffset, payloadOffset + packedSize);
  image.set(compressed, payloadOffset);
  return {
    image,
    compressedSize: compressed.length,
    allocationSize: packedSize,
    changedOffset: payloadOffset,
    changedLength: packedSize,
  };
}
