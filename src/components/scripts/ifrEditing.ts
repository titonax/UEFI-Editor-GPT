import { FirmwareError } from "./errors";
import { IFR_OPCODE, type IfrOpcodeSpan } from "./ifrBinary";

export interface IfrBytePatch {
  offset: number;
  expected: number[];
  replacement: number[];
  description: string;
}

export interface IfrReferenceMove {
  kind: "move-ref";
  sourceOffset: number;
  sourceEnd: number;
  destinationOffset: number;
  expected: number[];
  destinationExpected: number[];
  description: string;
}

export interface IfrStructuralMoveResult {
  bytes: Uint8Array;
  remapOffset: (offset: number) => number;
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

export function planIfrReferenceMove(
  source: Uint8Array,
  reference: IfrOpcodeSpan,
  sourceForm: IfrOpcodeSpan,
  destinationForm: IfrOpcodeSpan,
): IfrReferenceMove {
  if (reference.opcode !== IFR_OPCODE.REF || reference.scope || reference.length < 15) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Only a non-scoped IFR Ref opcode can be moved.",
    );
  }
  if (
    sourceForm.opcode !== IFR_OPCODE.FORM ||
    reference.parentOffset !== sourceForm.offset
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The IFR Ref must be a direct child of its source Form.",
    );
  }
  if (
    destinationForm.opcode !== IFR_OPCODE.FORM ||
    destinationForm.matchingEndOffset === null
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The destination Form does not have a proven closing End opcode.",
    );
  }
  if (
    sourceForm.ownerFormSetGuid !== destinationForm.ownerFormSetGuid &&
    reference.targetFormSetGuid === undefined
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "A Ref without an explicit FormSetGuid cannot move to another FormSet.",
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

  const destinationOffset = destinationForm.matchingEndOffset;
  if (
    destinationOffset < 0 ||
    destinationOffset + 2 > source.length ||
    source[destinationOffset] !== IFR_OPCODE.END ||
    (source[destinationOffset + 1] & 0x7f) !== 2
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The destination Form End opcode no longer matches the binary model.",
    );
  }
  if (destinationOffset >= reference.offset && destinationOffset <= reference.end) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The destination overlaps the Ref being moved.",
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

  return {
    kind: "move-ref",
    sourceOffset: reference.offset,
    sourceEnd: reference.end,
    destinationOffset,
    expected: Array.from(source.slice(reference.offset, reference.end)),
    destinationExpected: Array.from(
      source.slice(destinationOffset, destinationOffset + 2),
    ),
    description: `Move Ref at 0x${reference.offset
      .toString(16)
      .toUpperCase()} from FormId 0x${(sourceForm.formId ?? 0)
      .toString(16)
      .toUpperCase()} to FormId 0x${(destinationForm.formId ?? 0)
      .toString(16)
      .toUpperCase()}`,
  };
}

export function remapIfrOffset(move: IfrReferenceMove, offset: number): number {
  const length = move.sourceEnd - move.sourceOffset;
  if (offset >= move.sourceOffset && offset < move.sourceEnd) {
    const insertionOffset =
      move.sourceOffset < move.destinationOffset
        ? move.destinationOffset - length
        : move.destinationOffset;
    return insertionOffset + (offset - move.sourceOffset);
  }

  if (move.sourceOffset < move.destinationOffset) {
    return offset >= move.sourceEnd && offset < move.destinationOffset
      ? offset - length
      : offset;
  }

  return offset >= move.destinationOffset && offset < move.sourceOffset
    ? offset + length
    : offset;
}

export function applyIfrStructuralMove(
  source: Uint8Array,
  move: IfrReferenceMove,
): IfrStructuralMoveResult {
  const length = move.sourceEnd - move.sourceOffset;
  if (
    move.kind !== "move-ref" ||
    !Number.isSafeInteger(move.sourceOffset) ||
    !Number.isSafeInteger(move.sourceEnd) ||
    !Number.isSafeInteger(move.destinationOffset) ||
    length <= 0 ||
    move.sourceOffset < 0 ||
    move.sourceEnd > source.length ||
    move.destinationOffset < 0 ||
    move.destinationOffset + move.destinationExpected.length > source.length ||
    move.expected.length !== length ||
    (move.destinationOffset >= move.sourceOffset &&
      move.destinationOffset <= move.sourceEnd)
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "An IFR structural move has invalid bounds.",
    );
  }
  if (!sameBytes(source, move.sourceOffset, move.expected)) {
    throw new FirmwareError(
      "PATCH_FAILED",
      `IFR move precondition failed at 0x${move.sourceOffset
        .toString(16)
        .toUpperCase()}.`,
    );
  }
  if (!sameBytes(source, move.destinationOffset, move.destinationExpected)) {
    throw new FirmwareError(
      "PATCH_FAILED",
      `IFR move destination precondition failed at 0x${move.destinationOffset
        .toString(16)
        .toUpperCase()}.`,
    );
  }

  const result = new Uint8Array(source.length);
  const moved = source.slice(move.sourceOffset, move.sourceEnd);
  if (move.sourceOffset < move.destinationOffset) {
    result.set(source.slice(0, move.sourceOffset), 0);
    result.set(source.slice(move.sourceEnd, move.destinationOffset), move.sourceOffset);
    result.set(moved, move.destinationOffset - length);
    result.set(source.slice(move.destinationOffset), move.destinationOffset);
  } else {
    result.set(source.slice(0, move.destinationOffset), 0);
    result.set(moved, move.destinationOffset);
    result.set(
      source.slice(move.destinationOffset, move.sourceOffset),
      move.destinationOffset + length,
    );
    result.set(source.slice(move.sourceEnd), move.sourceEnd);
  }

  return {
    bytes: result,
    remapOffset: (offset) => remapIfrOffset(move, offset),
  };
}

export function applyIfrStructuralMoves(
  source: Uint8Array,
  moves: readonly IfrReferenceMove[],
): Uint8Array {
  return moves.reduce(
    (current, move) => applyIfrStructuralMove(current, move).bytes,
    source,
  );
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
