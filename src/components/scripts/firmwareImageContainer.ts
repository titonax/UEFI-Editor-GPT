import { readUint32 } from "./binaryReader";
import { FirmwareError } from "./errors";

export interface FirmwareImageRegion {
  name: "descriptor" | "bios" | "me" | "gbe" | "pdr" | "unknown";
  index: number;
  start: number;
  end: number;
}

export interface FirmwareImageLayout {
  kind: "bios-image" | "intel-spi";
  imageSize: number;
  biosStart: number;
  biosEnd: number;
  regions: FirmwareImageRegion[];
}

const intelDescriptorSignature = 0x0ff0a55a;
const regionNames: FirmwareImageRegion["name"][] = [
  "descriptor",
  "bios",
  "me",
  "gbe",
  "pdr",
];

function intelRegion(bytes: Uint8Array, registerOffset: number, index: number) {
  if (registerOffset + 4 > bytes.length) return null;
  const register = readUint32(bytes, registerOffset);
  const base = (register & 0x7fff) << 12;
  const limit = ((((register >>> 16) & 0x7fff) + 1) << 12) >>> 0;
  if (base >= limit || limit > bytes.length) return null;
  return {
    name: regionNames[index] ?? "unknown",
    index,
    start: base,
    end: limit,
  } satisfies FirmwareImageRegion;
}

/** Identifies only a descriptor rooted at byte zero; embedded signatures are ignored. */
export function inspectFirmwareImageLayout(bytes: Uint8Array): FirmwareImageLayout {
  if (bytes.length >= 0x20 && readUint32(bytes, 0x10) === intelDescriptorSignature) {
    const flashMap0 = readUint32(bytes, 0x14);
    const regionTable = ((flashMap0 >>> 16) & 0xff) << 4;
    const regions = Array.from({ length: 16 }, (_, index) =>
      intelRegion(bytes, regionTable + index * 4, index),
    ).filter((region): region is FirmwareImageRegion => region !== null);
    const bios = regions.find((region) => region.index === 1);
    if (!bios) {
      throw new FirmwareError(
        "PARSE_FAILED",
        "The Intel flash descriptor does not expose a bounded BIOS region.",
      );
    }
    return {
      kind: "intel-spi",
      imageSize: bytes.length,
      biosStart: bios.start,
      biosEnd: bios.end,
      regions,
    };
  }
  return {
    kind: "bios-image",
    imageSize: bytes.length,
    biosStart: 0,
    biosEnd: bytes.length,
    regions: [{ name: "bios", index: 1, start: 0, end: bytes.length }],
  };
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length && left.every((byte, index) => byte === right[index])
  );
}

/** Replaces a same-size BIOS region while proving all other SPI bytes unchanged. */
export function replaceFirmwareBiosRegion(
  source: Uint8Array,
  layout: FirmwareImageLayout,
  modifiedBios: Uint8Array,
) {
  const biosLength = layout.biosEnd - layout.biosStart;
  if (layout.imageSize !== source.length || modifiedBios.length !== biosLength) {
    throw new FirmwareError(
      "PATCH_FAILED",
      `The rebuilt BIOS region must remain ${String(biosLength)} bytes.`,
    );
  }
  const image = source.slice();
  image.set(modifiedBios, layout.biosStart);
  if (
    !equalBytes(
      source.subarray(0, layout.biosStart),
      image.subarray(0, layout.biosStart),
    ) ||
    !equalBytes(source.subarray(layout.biosEnd), image.subarray(layout.biosEnd))
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Bytes outside the BIOS region changed during SPI reconstruction.",
    );
  }
  return image;
}
