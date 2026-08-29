import { FirmwareError } from "./errors";
import { IFR_OPCODE, type IfrOpcodeSpan } from "./ifrBinary";

export interface IfrBytePatch {
  offset: number;
  expected: number[];
  replacement: number[];
  description: string;
}

function littleEndian16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function validateUint16(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
    throw new FirmwareError(
      "INVALID_INPUT",
      `${label} must be an unsigned 16-bit integer.`,
    );
  }
}

function sameBytes(source: Uint8Array, offset: number, expected: number[]) {
  return expected.every((byte, index) => source[offset + index] === byte);
}

export function planIfrReferenceRetarget(
  source: Uint8Array,
  reference: IfrOpcodeSpan,
  targetFormId: number,
): IfrBytePatch {
  validateUint16(targetFormId, "Target FormId");
  if (reference.opcode !== IFR_OPCODE.REF || reference.length < 15) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Only a decoded IFR Ref opcode can be retargeted.",
    );
  }
  if (
    reference.offset < 0 ||
    reference.end !== reference.offset + reference.length ||
    reference.end > source.length
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The IFR Ref span points outside its source buffer.",
    );
  }

  const encodedLength = source[reference.offset + 1] & 0x7f;
  if (
    source[reference.offset] !== IFR_OPCODE.REF ||
    encodedLength !== reference.length
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The source bytes no longer match the decoded IFR Ref span.",
    );
  }

  const targetOffset = reference.offset + 13;
  const expected = Array.from(source.slice(targetOffset, targetOffset + 2));
  return {
    offset: targetOffset,
    expected,
    replacement: littleEndian16(targetFormId),
    description: `Retarget Ref at 0x${reference.offset
      .toString(16)
      .toUpperCase()} to FormId 0x${targetFormId.toString(16).toUpperCase()}`,
  };
}

export function applyIfrBytePatches(
  source: Uint8Array,
  patches: readonly IfrBytePatch[],
): Uint8Array {
  const claimedOffsets = new Set<number>();
  for (const patch of patches) {
    if (
      !Number.isSafeInteger(patch.offset) ||
      patch.offset < 0 ||
      patch.expected.length !== patch.replacement.length ||
      patch.offset + patch.expected.length > source.length
    ) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "An IFR byte patch has invalid bounds or changes the source length.",
      );
    }
    for (let index = 0; index < patch.expected.length; index++) {
      const offset = patch.offset + index;
      if (claimedOffsets.has(offset)) {
        throw new FirmwareError("PATCH_FAILED", "IFR byte patches overlap.");
      }
      claimedOffsets.add(offset);
    }
    if (!sameBytes(source, patch.offset, patch.expected)) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `IFR patch precondition failed at 0x${patch.offset
          .toString(16)
          .toUpperCase()}.`,
      );
    }
  }

  const result = source.slice();
  for (const patch of patches) result.set(patch.replacement, patch.offset);
  return result;
}
