import { runStandardSectionCodec } from "./aptioIvExtractor";
import { FirmwareError } from "./errors";
import type { FirmwareSectionCodec } from "./uefiImageRebuilder";

const maxDecodedSize = 64 * 1024 * 1024;
type Mode = "tiano" | "efi";
type Runner = typeof runStandardSectionCodec;

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}

function declaredLength(packed: Uint8Array) {
  if (packed.length < 8) {
    throw new FirmwareError(
      "INVALID_COMPRESSED_SECTION",
      "EFI/Tiano header is missing.",
    );
  }
  const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
  const compressedSize = view.getUint32(0, true);
  const decodedSize = view.getUint32(4, true);
  if (
    compressedSize === 0 ||
    compressedSize > packed.length - 8 ||
    decodedSize === 0 ||
    decodedSize > maxDecodedSize
  ) {
    throw new FirmwareError(
      "INVALID_COMPRESSED_SECTION",
      "EFI/Tiano section has unsupported size fields.",
    );
  }
  return decodedSize;
}

/** Selects the source's EFI or Tiano variant using its immutable decoded bytes. */
export function createStandardSectionCodec(
  originalPacked: Uint8Array,
  originalDecoded: Uint8Array,
  run: Runner = runStandardSectionCodec,
): FirmwareSectionCodec {
  const size = declaredLength(originalPacked);
  if (originalDecoded.length !== size) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "EFI/Tiano decoded provenance does not match its header.",
    );
  }
  const mode = (async (): Promise<Mode> => {
    for (const candidate of ["tiano", "efi"] as const) {
      try {
        const decoded = await run(originalPacked, candidate);
        if (equalBytes(decoded, originalDecoded)) return candidate;
      } catch (error) {
        if (
          !(error instanceof FirmwareError) ||
          error.code !== "INVALID_COMPRESSED_SECTION"
        ) {
          throw error;
        }
      }
    }
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Neither EFI nor Tiano decoding matches the source section.",
    );
  })();
  return {
    compression: "standard",
    async compress(decoded) {
      if (decoded.length !== size) {
        throw new FirmwareError("PATCH_FAILED", "EFI/Tiano decoded length changed.");
      }
      const packed = await run(decoded, `compress-${await mode}`);
      if (declaredLength(packed) !== size) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "EFI/Tiano encoder changed the decoded size.",
        );
      }
      return packed;
    },
    async decompress(packed) {
      if (declaredLength(packed) !== size) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "EFI/Tiano size does not match its source.",
        );
      }
      const decoded = await run(packed, await mode);
      if (decoded.length !== size) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "EFI/Tiano decoded size changed.",
        );
      }
      return decoded;
    },
  };
}
