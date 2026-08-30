import { calculateJsonChecksum } from "./checksum";
import { FirmwareError } from "./errors";
import { decimalToHex, hexToBytes } from "./hex";
import {
  analyzeIfrBinary,
  IFR_OPCODE,
  type IfrBinaryModel,
  type IfrFormPackage,
  type IfrOpcodeSpan,
} from "./ifrBinary";
import {
  applyIfrStructuralMove,
  applyIfrStructuralMoves,
  planIfrReferenceMove,
} from "./ifrEditing";
import type { Data, Form, RefPrompt } from "./types";

export interface MenuReferenceMoveRequest {
  sourceFormIndex: number;
  referenceChildIndex: number;
  destinationFormIndex: number;
}

function sameGuid(left?: string, right?: string) {
  const normalize = (value?: string) =>
    (value ?? "").replace(/[{}\s]/g, "").toLowerCase();
  return normalize(left) === normalize(right);
}

function parsedId(value: string, label: string) {
  const parsed = Number.parseInt(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0xffff) {
    throw new FirmwareError("INVALID_INPUT", `${label} is not a valid FormId.`);
  }
  return parsed;
}

function parsedOffset(value: string, label: string) {
  const parsed = Number.parseInt(value, 16);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new FirmwareError("INVALID_INPUT", `${label} is not a valid IFR offset.`);
  }
  return parsed;
}

function packageForSpan(model: IfrBinaryModel, span: IfrOpcodeSpan) {
  return model.packages.find((pkg) => pkg.opcodes.includes(span));
}

function uniqueSpan(matches: IfrOpcodeSpan[], label: string): IfrOpcodeSpan {
  if (matches.length !== 1) {
    throw new FirmwareError(
      "PATCH_FAILED",
      matches.length === 0
        ? `${label} could not be matched to the binary IFR stream.`
        : `${label} is ambiguous in the binary IFR stream.`,
    );
  }
  return matches[0];
}

function findFormSpan(model: IfrBinaryModel, form: Form, label: string) {
  const formId = parsedId(form.formId, label);
  const idMatches = model.packages.flatMap((pkg) =>
    pkg.valid
      ? pkg.opcodes.filter(
          (span) => span.opcode === IFR_OPCODE.FORM && span.formId === formId,
        )
      : [],
  );
  if (form.ifrOffset !== undefined) {
    const offset = parsedOffset(form.ifrOffset, `${label} offset`);
    const offsetMatches = idMatches.filter((span) => span.offset === offset);
    if (offsetMatches.length > 0) return uniqueSpan(offsetMatches, label);
  }
  const guidMatches = idMatches.filter((span) =>
    sameGuid(span.ownerFormSetGuid, form.formSetGuid),
  );
  if (guidMatches.length > 0) return uniqueSpan(guidMatches, label);
  return uniqueSpan(idMatches, label);
}

function findReferenceSpan(
  pkg: IfrFormPackage,
  sourceForm: IfrOpcodeSpan,
  reference: RefPrompt,
) {
  const questionId = parsedId(reference.questionId, "Reference QuestionId");
  const targetFormId = parsedId(reference.formId, "Reference target FormId");
  const label = `Ref QuestionId ${reference.questionId}`;
  const semanticMatches = pkg.opcodes.filter(
    (span) =>
      span.opcode === IFR_OPCODE.REF &&
      span.parentOffset === sourceForm.offset &&
      span.questionId === questionId &&
      span.formId === targetFormId,
  );
  if (reference.ifrOffset !== undefined) {
    const offset = parsedOffset(reference.ifrOffset, `${label} offset`);
    const offsetMatches = semanticMatches.filter((span) => span.offset === offset);
    if (offsetMatches.length > 0) return uniqueSpan(offsetMatches, label);
  }
  const guidMatches = semanticMatches.filter((span) =>
    sameGuid(span.targetFormSetGuid, reference.targetFormSetGuid),
  );
  if (guidMatches.length > 0) return uniqueSpan(guidMatches, label);
  return uniqueSpan(semanticMatches, label);
}

function findFormIndex(data: Data, formId: string, formSetGuid?: string) {
  const normalizedId = parsedId(formId, "Reference target FormId");
  return data.forms.findIndex(
    (candidate) =>
      parsedId(candidate.formId, "FormId") === normalizedId &&
      sameGuid(candidate.formSetGuid, formSetGuid),
  );
}

function targetIndexForReference(data: Data, owner: Form, reference: RefPrompt) {
  return findFormIndex(
    data,
    reference.formId,
    reference.targetFormSetGuid ?? owner.formSetGuid,
  );
}

function destinationWouldCreateCycle(
  data: Data,
  movedTargetIndex: number,
  destinationFormIndex: number,
) {
  const pending = [movedTargetIndex];
  const visited = new Set<number>();
  while (pending.length > 0) {
    const formIndex = pending.pop();
    if (formIndex === undefined || visited.has(formIndex)) continue;
    if (formIndex === destinationFormIndex) return true;
    visited.add(formIndex);
    const form = data.forms[formIndex];
    for (const child of form.children) {
      if (child.type !== "Ref") continue;
      const childTarget = targetIndexForReference(data, form, child);
      if (childTarget >= 0) pending.push(childTarget);
    }
  }
  return false;
}

function validateRequest(data: Data, request: MenuReferenceMoveRequest) {
  const sourceForm = data.forms[request.sourceFormIndex];
  const destinationForm = data.forms[request.destinationFormIndex];
  const reference = sourceForm?.children[request.referenceChildIndex];
  if (
    sourceForm === undefined ||
    destinationForm === undefined ||
    reference?.type !== "Ref"
  ) {
    throw new FirmwareError(
      "INVALID_INPUT",
      "The selected source Ref or destination Form no longer exists.",
    );
  }
  if (request.sourceFormIndex === request.destinationFormIndex) {
    throw new FirmwareError("INVALID_INPUT", "The Ref is already in that Form.");
  }

  const targetIndex = targetIndexForReference(data, sourceForm, reference);
  if (targetIndex < 0) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The selected Ref has a missing target and cannot be moved safely.",
    );
  }
  if (destinationWouldCreateCycle(data, targetIndex, request.destinationFormIndex)) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Moving this Ref there would create a cycle in the HII menu graph.",
    );
  }

  const duplicate = destinationForm.children.some(
    (child) =>
      child.type === "Ref" &&
      targetIndexForReference(data, destinationForm, child) === targetIndex,
  );
  if (duplicate) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The destination Form already contains a Ref to the same target.",
    );
  }
  return { sourceForm, destinationForm, reference };
}

function remapHexOffset(value: string, remapOffset: (offset: number) => number) {
  const parsed = Number.parseInt(value, 16);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new FirmwareError("PATCH_FAILED", `Invalid IFR offset ${value}.`);
  }
  return decimalToHex(remapOffset(parsed));
}

function rebuildIncomingReferences(data: Data) {
  for (const form of data.forms) form.referencedIn = [];
  const incoming = data.forms.map(() => new Set<string>());
  for (const owner of data.forms) {
    for (const child of owner.children) {
      if (child.type !== "Ref") continue;
      const targetIndex = targetIndexForReference(data, owner, child);
      if (targetIndex >= 0) incoming[targetIndex].add(owner.formId);
    }
  }
  for (const [index, form] of data.forms.entries()) {
    form.referencedIn = [...incoming[index]];
  }
}

export function replayIfrEdits(data: Data, originalSetupSct: string) {
  const originalBytes = hexToBytes(originalSetupSct);
  return applyIfrStructuralMoves(originalBytes, data.ifrEdits ?? []);
}

export function hydrateIfrBinary(data: Data, originalSetupSct: string): Data {
  const hydrated = structuredClone(data);
  hydrated.ifrBinary = analyzeIfrBinary(replayIfrEdits(hydrated, originalSetupSct));
  return hydrated;
}

export async function moveMenuReference(
  data: Data,
  originalSetupSct: string,
  request: MenuReferenceMoveRequest,
): Promise<Data> {
  const { sourceForm, destinationForm, reference } = validateRequest(data, request);
  const currentBytes = replayIfrEdits(data, originalSetupSct);
  const model = analyzeIfrBinary(currentBytes);
  if (!model.packages.some((pkg) => pkg.valid)) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "No valid HII Forms Package was found in the Setup binary stream.",
    );
  }
  const sourceSpan = findFormSpan(model, sourceForm, "Source Form");
  const destinationSpan = findFormSpan(model, destinationForm, "Destination Form");
  const sourcePackage = packageForSpan(model, sourceSpan);
  const destinationPackage = packageForSpan(model, destinationSpan);
  if (!sourcePackage || sourcePackage !== destinationPackage) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Refs can only be moved between Forms in the same HII Forms Package.",
    );
  }
  const referenceSpan = findReferenceSpan(sourcePackage, sourceSpan, reference);
  const move = planIfrReferenceMove(
    currentBytes,
    referenceSpan,
    sourceSpan,
    destinationSpan,
  );
  const moved = applyIfrStructuralMove(currentBytes, move);
  const next = structuredClone(data);

  for (const form of next.forms) {
    if (form.ifrOffset !== undefined) {
      form.ifrOffset = remapHexOffset(form.ifrOffset, moved.remapOffset);
    }
    for (const child of form.children) {
      if (child.type === "Ref" && child.ifrOffset !== undefined) {
        child.ifrOffset = remapHexOffset(child.ifrOffset, moved.remapOffset);
      }
    }
  }

  const [movedReference] = next.forms[request.sourceFormIndex].children.splice(
    request.referenceChildIndex,
    1,
  );
  next.forms[request.destinationFormIndex].children.push(movedReference);
  next.ifrEdits = [...(next.ifrEdits ?? []), move];

  const suppressionOffsetMap = new Map<string, string>();
  for (const suppression of next.suppressions) {
    const previousOffset = suppression.offset;
    suppression.offset = remapHexOffset(suppression.offset, moved.remapOffset);
    suppression.start = remapHexOffset(suppression.start, moved.remapOffset);
    suppression.end = remapHexOffset(suppression.end, moved.remapOffset);
    suppressionOffsetMap.set(previousOffset, suppression.offset);
  }
  for (const form of next.forms) {
    for (const child of form.children) {
      if (child.conditions) {
        child.conditions = child.conditions.map(
          (offset) => suppressionOffsetMap.get(offset) ?? offset,
        );
      }
      if (child.suppressIf) {
        child.suppressIf = child.suppressIf.map(
          (offset) => suppressionOffsetMap.get(offset) ?? offset,
        );
      }
    }
  }
  rebuildIncomingReferences(next);
  next.ifrBinary = analyzeIfrBinary(moved.bytes);
  next.hashes.offsetChecksum = await calculateJsonChecksum(
    next.menu,
    next.forms,
    next.suppressions,
  );
  return next;
}
