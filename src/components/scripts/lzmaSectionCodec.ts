import lzma from "lzma/src/lzma_worker.js";
import { FirmwareError } from "./errors";
import type { FirmwareSectionCodec } from "./uefiImageRebuilder";

const maxDecodedSize = 64 * 1024 * 1024;
const modesByDictionary = new Map([
  [1 << 16, 1],
  [1 << 19, 3],
  [1 << 20, 2],
  [1 << 21, 5],
  [1 << 22, 6],
  [1 << 23, 7],
  [1 << 24, 8],
  [1 << 25, 9],
]);

function header(bytes: Uint8Array) {
  if (bytes.length < 13 || bytes[0] !== 0x5d) {
    throw new FirmwareError(
      "INVALID_COMPRESSED_SECTION",
      "Unsupported LZMA-alone header.",
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dictionary = view.getUint32(1, true);
  const size = view.getUint32(5, true);
  if (
    view.getUint32(9, true) !== 0 ||
    size === 0 ||
    size > maxDecodedSize ||
    !modesByDictionary.has(dictionary)
  ) {
    throw new FirmwareError(
      "INVALID_COMPRESSED_SECTION",
      "This LZMA section has unsupported size or dictionary parameters.",
    );
  }
  return { dictionary, size };
}

function compress(input: Uint8Array, mode: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    lzma.LZMA.compress(input, mode, (result, error) => {
      if (error || !result) {
        reject(
          new FirmwareError("PATCH_FAILED", `LZMA encoding failed: ${String(error)}`),
        );
      } else {
        resolve(Uint8Array.from(result));
      }
    });
  });
}

function decompress(input: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    lzma.LZMA.decompress(input, (result, error) => {
      if (error || result === null) {
        reject(
          new FirmwareError(
            "INVALID_COMPRESSED_SECTION",
            `LZMA decoding failed: ${String(error)}`,
          ),
        );
      } else {
        resolve(
          typeof result === "string"
            ? new TextEncoder().encode(result)
            : Uint8Array.from(result),
        );
      }
    });
  });
}

/** Restricts the encoder to the source section's LZMA1 properties and size. */
export function createLzmaSectionCodec(
  originalPacked: Uint8Array,
): FirmwareSectionCodec {
  const source = header(originalPacked);
  const mode = modesByDictionary.get(source.dictionary);
  if (!mode)
    throw new FirmwareError("PATCH_FAILED", "LZMA dictionary mode is missing.");
  return {
    compression: "lzma",
    async compress(decoded) {
      if (decoded.length !== source.size) {
        throw new FirmwareError("PATCH_FAILED", "LZMA decoded length changed.");
      }
      const packed = await compress(decoded, mode);
      const next = header(packed);
      if (next.dictionary !== source.dictionary || next.size !== source.size) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "LZMA properties changed during encoding.",
        );
      }
      return packed;
    },
    async decompress(packed) {
      const next = header(packed);
      if (next.dictionary !== source.dictionary || next.size !== source.size) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "LZMA properties do not match the source section.",
        );
      }
      const decoded = await decompress(packed);
      if (decoded.length !== source.size) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "LZMA decoded size does not match its header.",
        );
      }
      return decoded;
    },
  };
}
