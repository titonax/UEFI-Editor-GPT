import { analyzeIfrBinary, IFR_OPCODE } from "./ifrBinary";
import { replayIfrEdits } from "./menuEditing";
import {
  applyUefiHiiSuppressionEdits,
  toggleUefiHiiSuppressions,
} from "./uefiHiiSuppressionEditing";
import type { Data } from "./types";

export interface SuppressionSessionChange {
  conditionIndex: number;
  active: boolean;
}
function invalid(message: string): never {
  throw new Error(`Queue session ${message}.`);
}
function offset(value: string) {
  if (!/^0x[0-9a-f]+$/i.test(value)) invalid("contains an invalid condition mapping");
  const result = Number.parseInt(value, 16);
  if (!Number.isSafeInteger(result)) invalid("contains an unsafe condition mapping");
  return result;
}
export async function regenerateSessionSuppressions(
  before: Data,
  originalSource: string,
  changes: SuppressionSessionChange[],
) {
  if (
    !["aptio-v", "aptio-iv", "ami-aptio", "uefi-hii"].includes(
      before.firmwareFamily ?? "",
    )
  )
    invalid("requires a supported AMI/HII condition workspace");
  const source = replayIfrEdits(before, originalSource);
  const model = analyzeIfrBinary(source);
  let next = structuredClone(before);
  const selectedOffsets: string[] = [];
  for (const change of changes) {
    const condition = next.suppressions[change.conditionIndex];
    if (!condition || (condition.kind ?? "SuppressIf") !== "SuppressIf")
      invalid("targets a missing or read-only condition");
    const conditionOffset = offset(condition.offset);
    const start = offset(condition.start);
    const end = offset(condition.end);
    if (
      next.suppressions.filter(
        (candidate) => offset(candidate.offset) === conditionOffset,
      ).length !== 1
    )
      invalid("targets an ambiguous condition");
    const matches = model.packages
      .filter((pkg) => pkg.valid)
      .flatMap((pkg) =>
        pkg.opcodes
          .filter((span) => span.offset === conditionOffset)
          .map((span) => ({ pkg, span })),
      );
    const match = matches[0];
    if (
      matches.length !== 1 ||
      match?.span.opcode !== IFR_OPCODE.SUPPRESS_IF ||
      !match.span.scope ||
      match.span.matchingEndOffset !== end ||
      start < match.span.end ||
      start > end ||
      !match.pkg.opcodes.some((span) => span.offset === start) ||
      source[end] !== IFR_OPCODE.END ||
      source[end + 1] !== 2
    )
      invalid("does not match a proven SuppressIf scope and closing End");
    if (
      condition.formSetGuid &&
      condition.formSetGuid.replace(/[{}\s]/g, "").toLowerCase() !==
        match.span.ownerFormSetGuid?.toLowerCase()
    )
      invalid("has contradictory condition ownership");
    selectedOffsets.push(condition.offset);
    if (before.firmwareFamily === "uefi-hii") {
      next = await toggleUefiHiiSuppressions(next, [condition.offset], change.active);
    } else {
      condition.active = change.active;
    }
  }
  // Restoring or pausing an operation cannot conceal bad scope evidence. Prove
  // each selected suppression can be disabled too, using the existing bounded
  // closing-End relocation and structural re-read on a disposable clone.
  const validation = structuredClone(next);
  for (const condition of validation.suppressions) {
    if (selectedOffsets.includes(condition.offset)) condition.active = false;
  }
  applyUefiHiiSuppressionEdits(validation, source);
  return next;
}
