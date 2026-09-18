import { calculateJsonChecksum } from "./checksum";
import { readUint24, readUint32 } from "./binaryReader";
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
  planIfrReferenceScopeMove,
  type IfrBytePatch,
  type IfrReferenceMove,
} from "./ifrEditing";
import type { Data, Form, RefPrompt } from "./types";
import { refreshSingleFormSetNavigation } from "./singleFormSetNavigation";

export interface MenuReferenceMoveRequest {
  sourceFormIndex: number;
  referenceChildIndex: number;
  destinationFormIndex: number;
}

export interface TopLevelTabVisibilityRequest {
  sourceFormIndex: number;
  referenceChildIndex: number;
  visible: boolean;
}

export interface TopLevelTabVisibilityAvailability {
  available: boolean;
  reason: string;
}

export type MenuMoveCompatibility =
  "safe-same-package" | "safe-cross-package" | "requires-ref3" | "unavailable";

export interface MenuMoveDestination {
  formIndex: number;
  compatibility: MenuMoveCompatibility;
  reason: string;
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

function littleEndian(value: number, width: 3 | 4) {
  return Array.from({ length: width }, (_, index) => (value >>> (index * 8)) & 0xff);
}

function planLengthPatch(
  source: Uint8Array,
  offset: number,
  width: 3 | 4,
  delta: number,
  description: string,
): IfrBytePatch {
  const current = width === 3 ? readUint24(source, offset) : readUint32(source, offset);
  const replacement = current + delta;
  const maximum = width === 3 ? 0xffffff : 0xffffffff;
  if (
    !Number.isSafeInteger(replacement) ||
    replacement < (width === 3 ? 4 : 20) ||
    replacement > maximum
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      `${description} would produce an invalid container length.`,
    );
  }
  return {
    offset,
    expected: littleEndian(current, width),
    replacement: littleEndian(replacement, width),
    description,
  };
}

function addContainerLengthPatches(
  source: Uint8Array,
  move: IfrReferenceMove,
  sourcePackage: IfrFormPackage,
  destinationPackage: IfrFormPackage,
): IfrReferenceMove {
  if (sourcePackage === destinationPackage) return move;

  const sourceListOffset = sourcePackage.packageListOffset;
  const destinationListOffset = destinationPackage.packageListOffset;
  if ((sourceListOffset === null) !== (destinationListOffset === null)) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The Forms Packages have incompatible container provenance.",
    );
  }

  const movedLength = move.sourceEnd - move.sourceOffset;
  const containerPatches: IfrBytePatch[] = [
    planLengthPatch(
      source,
      sourcePackage.offset,
      3,
      -movedLength,
      "Shrink source Forms Package",
    ),
    planLengthPatch(
      source,
      destinationPackage.offset,
      3,
      movedLength,
      "Grow destination Forms Package",
    ),
  ];

  if (
    sourceListOffset !== null &&
    destinationListOffset !== null &&
    sourceListOffset !== destinationListOffset
  ) {
    containerPatches.push(
      planLengthPatch(
        source,
        sourceListOffset + 16,
        4,
        -movedLength,
        "Shrink source HII Package List",
      ),
      planLengthPatch(
        source,
        destinationListOffset + 16,
        4,
        movedLength,
        "Grow destination HII Package List",
      ),
    );
  }

  return {
    ...move,
    containerPatches,
    description: `${move.description} across HII Forms Packages`,
  };
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
      span.ownerFormId === sourceForm.formId &&
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

interface PlannedMenuMove {
  destinationForm: Form;
  referenceSpan: IfrOpcodeSpan;
  destinationSpan: IfrOpcodeSpan;
  sourcePackage: IfrFormPackage;
  destinationPackage: IfrFormPackage;
  move: IfrReferenceMove;
}

interface PlannedTabVisibilityMove {
  sourceForm: Form;
  destinationForm: Form;
  sourceFormIndex: number;
  destinationFormIndex: number;
  referenceSpan: IfrOpcodeSpan;
  destinationContainer: IfrOpcodeSpan;
  destinationChildIndex?: number;
  move: IfrReferenceMove;
  suppressionOffset?: string;
}

function planMenuMove(
  data: Data,
  currentBytes: Uint8Array,
  model: IfrBinaryModel,
  request: MenuReferenceMoveRequest,
): PlannedMenuMove {
  const { sourceForm, destinationForm, reference } = validateRequest(data, request);
  const sourceSpan = findFormSpan(model, sourceForm, "Source Form");
  const destinationSpan = findFormSpan(model, destinationForm, "Destination Form");
  const sourcePackage = packageForSpan(model, sourceSpan);
  const destinationPackage = packageForSpan(model, destinationSpan);
  if (!sourcePackage || !destinationPackage) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The source or destination Forms Package could not be proven.",
    );
  }
  const referenceSpan = findReferenceSpan(sourcePackage, sourceSpan, reference);
  const baseMove = planIfrReferenceMove(
    currentBytes,
    referenceSpan,
    sourceSpan,
    destinationSpan,
  );
  return {
    destinationForm,
    referenceSpan,
    destinationSpan,
    sourcePackage,
    destinationPackage,
    move: addContainerLengthPatches(
      currentBytes,
      baseMove,
      sourcePackage,
      destinationPackage,
    ),
  };
}

function activeConstantSuppression(data: Data, offset: string) {
  return data.suppressions.find(
    (condition) =>
      condition.offset === offset &&
      (condition.kind ?? "SuppressIf") === "SuppressIf" &&
      condition.active &&
      condition.constant === true,
  );
}

function directTrueSuppressionHost(
  pkg: IfrFormPackage,
  condition: IfrOpcodeSpan,
  ownerForm: IfrOpcodeSpan,
) {
  if (
    condition.opcode !== IFR_OPCODE.SUPPRESS_IF ||
    condition.parentOffset !== ownerForm.offset ||
    condition.matchingEndOffset === null
  ) {
    return false;
  }
  const expression = pkg.opcodes.find(
    (span) => span.parentOffset === condition.offset && span.offset === condition.end,
  );
  const containsReference = pkg.opcodes.some(
    (span) => span.opcode === IFR_OPCODE.REF && span.parentOffset === condition.offset,
  );
  return expression?.opcode === IFR_OPCODE.TRUE && containsReference;
}

function planTopLevelTabVisibility(
  data: Data,
  currentBytes: Uint8Array,
  model: IfrBinaryModel,
  request: TopLevelTabVisibilityRequest,
): PlannedTabVisibilityMove {
  const navigation = data.singleFormSetNavigation;
  if (
    navigation?.status !== "detected" ||
    !navigation.formSetGuid ||
    !navigation.hubFormId
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "A proven single-FormSet navigation hub is required.",
    );
  }
  const sourceForm = data.forms[request.sourceFormIndex];
  const reference = sourceForm?.children[request.referenceChildIndex];
  if (!sourceForm || reference?.type !== "Ref") {
    throw new FirmwareError("INVALID_INPUT", "The selected tab Ref no longer exists.");
  }
  const sourceFormSpan = findFormSpan(model, sourceForm, "Source Form");
  const sourcePackage = packageForSpan(model, sourceFormSpan);
  if (!sourcePackage) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The source Forms Package could not be proven.",
    );
  }
  const referenceSpan = findReferenceSpan(sourcePackage, sourceFormSpan, reference);

  if (request.visible) {
    const suppressionOffset = (reference.suppressIf ?? []).find((offset) =>
      Boolean(activeConstantSuppression(data, offset)),
    );
    if (!suppressionOffset) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "This Ref is not inside a proven constant-true SuppressIf scope.",
      );
    }
    const sourceContainer = sourcePackage.opcodes.find(
      (span) => span.offset === parsedOffset(suppressionOffset, "Suppression offset"),
    );
    if (
      sourceContainer?.opcode !== IFR_OPCODE.SUPPRESS_IF ||
      referenceSpan.parentOffset !== sourceContainer.offset
    ) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "The hidden Ref could not be matched to its SuppressIf scope.",
      );
    }
    const destinationFormIndex = findFormIndex(
      data,
      navigation.hubFormId,
      navigation.formSetGuid,
    );
    const destinationForm = data.forms[destinationFormIndex];
    if (!destinationForm) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "The navigation hub Form could not be resolved.",
      );
    }
    const duplicate = destinationForm.children.some(
      (child) =>
        child.type === "Ref" &&
        targetIndexForReference(data, destinationForm, child) ===
          targetIndexForReference(data, sourceForm, reference),
    );
    if (duplicate) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "The navigation hub already contains a Ref to this page.",
      );
    }
    const destinationContainer = findFormSpan(model, destinationForm, "Navigation hub");
    if (packageForSpan(model, destinationContainer) !== sourcePackage) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "The hidden Ref and navigation hub are not in the same Forms Package.",
      );
    }
    const hiddenPageIndex = navigation.pages.findIndex(
      (page) =>
        parsedId(page.formId, "Navigation page") ===
          parsedId(reference.formId, "Reference target FormId") &&
        sameGuid(
          page.formSetGuid,
          reference.targetFormSetGuid ?? sourceForm.formSetGuid,
        ),
    );
    const nextDirectPage =
      hiddenPageIndex < 0
        ? undefined
        : navigation.pages
            .slice(hiddenPageIndex + 1)
            .find((page) => page.role === "direct-tab");
    let destinationChildIndex: number | undefined;
    let destinationBefore: IfrOpcodeSpan | undefined;
    if (nextDirectPage) {
      destinationChildIndex = destinationForm.children.findIndex(
        (child) =>
          child.type === "Ref" &&
          parsedId(child.formId, "Reference target FormId") ===
            parsedId(nextDirectPage.formId, "Navigation page") &&
          sameGuid(
            child.targetFormSetGuid ?? destinationForm.formSetGuid,
            nextDirectPage.formSetGuid,
          ),
      );
      const anchor = destinationForm.children[destinationChildIndex];
      if (destinationChildIndex < 0 || anchor?.type !== "Ref") {
        throw new FirmwareError(
          "PATCH_FAILED",
          "The original tab position could not be matched to the navigation hub.",
        );
      }
      destinationBefore = findReferenceSpan(
        sourcePackage,
        destinationContainer,
        anchor,
      );
    }
    return {
      sourceForm,
      destinationForm,
      sourceFormIndex: request.sourceFormIndex,
      destinationFormIndex,
      referenceSpan,
      destinationContainer,
      destinationChildIndex,
      move: planIfrReferenceScopeMove(
        currentBytes,
        referenceSpan,
        sourceContainer,
        destinationContainer,
        destinationBefore,
      ),
    };
  }

  if (
    !sameGuid(sourceForm.formSetGuid, navigation.formSetGuid) ||
    parsedId(sourceForm.formId, "Source Form") !==
      parsedId(navigation.hubFormId, "Navigation hub") ||
    referenceSpan.parentOffset !== sourceFormSpan.offset
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Only a direct Ref of the proven navigation hub can be hidden.",
    );
  }

  const targetIndex = targetIndexForReference(data, sourceForm, reference);
  const candidates = data.suppressions.flatMap((condition) => {
    if (
      (condition.kind ?? "SuppressIf") !== "SuppressIf" ||
      !condition.active ||
      condition.constant !== true ||
      !sameGuid(condition.formSetGuid, navigation.formSetGuid)
    ) {
      return [];
    }
    const conditionSpan = sourcePackage.opcodes.find(
      (span) => span.offset === parsedOffset(condition.offset, "Suppression offset"),
    );
    if (conditionSpan?.ownerFormId === undefined) return [];
    const destinationFormIndex = findFormIndex(
      data,
      decimalToHex(conditionSpan.ownerFormId),
      conditionSpan.ownerFormSetGuid,
    );
    const destinationForm = data.forms[destinationFormIndex];
    if (
      !destinationForm ||
      destinationFormIndex === targetIndex ||
      destinationFormIndex === request.sourceFormIndex
    ) {
      return [];
    }
    const destinationFormSpan = findFormSpan(
      model,
      destinationForm,
      "Suppression host Form",
    );
    if (!directTrueSuppressionHost(sourcePackage, conditionSpan, destinationFormSpan)) {
      return [];
    }
    const duplicate = destinationForm.children.some(
      (child) =>
        child.type === "Ref" &&
        targetIndexForReference(data, destinationForm, child) === targetIndex,
    );
    return duplicate
      ? []
      : [
          {
            condition,
            conditionSpan,
            destinationForm,
            destinationFormIndex,
          },
        ];
  });
  const host = candidates.sort(
    (left, right) => left.conditionSpan.offset - right.conditionSpan.offset,
  )[0];
  if (!host) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "No existing constant-true SuppressIf scope used for hidden Refs is available in this Forms Package.",
    );
  }

  return {
    sourceForm,
    destinationForm: host.destinationForm,
    sourceFormIndex: request.sourceFormIndex,
    destinationFormIndex: host.destinationFormIndex,
    referenceSpan,
    destinationContainer: host.conditionSpan,
    suppressionOffset: host.condition.offset,
    move: planIfrReferenceScopeMove(
      currentBytes,
      referenceSpan,
      sourceFormSpan,
      host.conditionSpan,
    ),
  };
}

function reasonMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function remapDataOffsetsAfterMove(
  data: Data,
  remapOffset: (offset: number) => number,
) {
  for (const form of data.forms) {
    if (form.ifrOffset !== undefined) {
      form.ifrOffset = remapHexOffset(form.ifrOffset, remapOffset);
    }
    for (const child of form.children) {
      if (child.type === "Ref" && child.ifrOffset !== undefined) {
        child.ifrOffset = remapHexOffset(child.ifrOffset, remapOffset);
      }
    }
  }

  const suppressionOffsetMap = new Map<string, string>();
  for (const suppression of data.suppressions) {
    const previousOffset = suppression.offset;
    suppression.offset = remapHexOffset(suppression.offset, remapOffset);
    suppression.start = remapHexOffset(suppression.start, remapOffset);
    suppression.end = remapHexOffset(suppression.end, remapOffset);
    suppressionOffsetMap.set(previousOffset, suppression.offset);
  }
  for (const form of data.forms) {
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
  return suppressionOffsetMap;
}

export function analyzeTopLevelTabVisibilityToggle(
  data: Data,
  originalSetupSct: string,
  request: TopLevelTabVisibilityRequest,
): TopLevelTabVisibilityAvailability {
  try {
    const currentBytes = replayIfrEdits(data, originalSetupSct);
    const model = analyzeIfrBinary(currentBytes);
    planTopLevelTabVisibility(data, currentBytes, model, request);
    return {
      available: true,
      reason: request.visible
        ? "The suppressed Ref can be returned directly to the proven navigation hub."
        : "The Ref can be parked inside an existing constant-true SuppressIf scope without changing the HII size.",
    };
  } catch (reason) {
    return { available: false, reason: reasonMessage(reason) };
  }
}

export async function toggleTopLevelTabVisibility(
  data: Data,
  originalSetupSct: string,
  request: TopLevelTabVisibilityRequest,
): Promise<Data> {
  const currentBytes = replayIfrEdits(data, originalSetupSct);
  const model = analyzeIfrBinary(currentBytes);
  const planned = planTopLevelTabVisibility(data, currentBytes, model, request);
  const targetName =
    planned.sourceForm.children[request.referenceChildIndex]?.name ||
    `Form ${planned.referenceSpan.formId?.toString(16).toUpperCase() ?? ""}`;
  const move: IfrReferenceMove = {
    ...planned.move,
    description: request.visible
      ? `Show top-level tab ${targetName} by returning its Ref to the navigation hub`
      : `Hide top-level tab ${targetName} inside an existing constant-true SuppressIf scope`,
  };
  const moved = applyIfrStructuralMove(currentBytes, move);
  const next = structuredClone(data);
  const suppressionOffsetMap = remapDataOffsetsAfterMove(next, moved.remapOffset);
  const [movedReference] = next.forms[planned.sourceFormIndex].children.splice(
    request.referenceChildIndex,
    1,
  );
  if (movedReference?.type !== "Ref") {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The selected tab Ref changed while applying the visibility edit.",
    );
  }
  if (request.visible) {
    delete movedReference.conditions;
    delete movedReference.suppressIf;
  } else {
    const suppressionOffset = planned.suppressionOffset
      ? (suppressionOffsetMap.get(planned.suppressionOffset) ??
        planned.suppressionOffset)
      : undefined;
    if (!suppressionOffset) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "The selected SuppressIf host lost its remapped offset.",
      );
    }
    movedReference.conditions = [suppressionOffset];
    movedReference.suppressIf = [suppressionOffset];
  }
  const destinationChildren = next.forms[planned.destinationFormIndex].children;
  destinationChildren.splice(
    planned.destinationChildIndex ?? destinationChildren.length,
    0,
    movedReference,
  );
  next.ifrEdits = [...(next.ifrEdits ?? []), move];
  rebuildIncomingReferences(next);
  next.ifrBinary = analyzeIfrBinary(moved.bytes);

  const movedReferenceOffset = moved.remapOffset(planned.referenceSpan.offset);
  const destinationContainerOffset = moved.remapOffset(
    planned.destinationContainer.offset,
  );
  const verifiedReference = next.ifrBinary.packages
    .flatMap((pkg) => (pkg.valid ? pkg.opcodes : []))
    .find((span) => span.offset === movedReferenceOffset);
  if (
    verifiedReference?.opcode !== IFR_OPCODE.REF ||
    verifiedReference.ownerFormId !==
      parsedId(planned.destinationForm.formId, "Destination Form") ||
    verifiedReference.parentOffset !== destinationContainerOffset
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The visibility edit did not reparse with the Ref in its proven destination scope.",
    );
  }
  refreshSingleFormSetNavigation(next, data.singleFormSetNavigation);
  next.hashes.offsetChecksum = await calculateJsonChecksum(
    next.menu,
    next.forms,
    next.suppressions,
  );
  return next;
}

export function analyzeMenuMoveDestinations(
  data: Data,
  originalSetupSct: string,
  sourceFormIndex: number,
  referenceChildIndex: number,
): MenuMoveDestination[] {
  let currentBytes: Uint8Array;
  let model: IfrBinaryModel;
  try {
    currentBytes = replayIfrEdits(data, originalSetupSct);
    model = analyzeIfrBinary(currentBytes);
    if (!model.packages.some((pkg) => pkg.valid)) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "No valid HII Forms Package was found in the Setup binary stream.",
      );
    }
  } catch (reason) {
    return data.forms.map((_, formIndex) => ({
      formIndex,
      compatibility: "unavailable",
      reason: reasonMessage(reason),
    }));
  }

  return data.forms.map((_, destinationFormIndex) => {
    if (destinationFormIndex === sourceFormIndex) {
      return {
        formIndex: destinationFormIndex,
        compatibility: "unavailable",
        reason: "The Ref is already in this Form.",
      };
    }
    try {
      const planned = planMenuMove(data, currentBytes, model, {
        sourceFormIndex,
        referenceChildIndex,
        destinationFormIndex,
      });
      const crossPackage = planned.sourcePackage !== planned.destinationPackage;
      return {
        formIndex: destinationFormIndex,
        compatibility: crossPackage ? "safe-cross-package" : "safe-same-package",
        reason: crossPackage
          ? "Safe fixed-size move; Forms Package lengths will be rebalanced."
          : "Safe fixed-size move inside the existing Forms Package.",
      };
    } catch (reason) {
      const message = reasonMessage(reason);
      return {
        formIndex: destinationFormIndex,
        compatibility: message.includes(
          "without an explicit FormSetGuid cannot move to another FormSet",
        )
          ? "requires-ref3"
          : "unavailable",
        reason: message.includes(
          "without an explicit FormSetGuid cannot move to another FormSet",
        )
          ? "This REF/REF2 needs conversion to REF3 before it can cross FormSets."
          : message,
      };
    }
  });
}

export async function moveMenuReference(
  data: Data,
  originalSetupSct: string,
  request: MenuReferenceMoveRequest,
): Promise<Data> {
  const currentBytes = replayIfrEdits(data, originalSetupSct);
  const model = analyzeIfrBinary(currentBytes);
  if (!model.packages.some((pkg) => pkg.valid)) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "No valid HII Forms Package was found in the Setup binary stream.",
    );
  }
  const { referenceSpan, destinationForm, destinationSpan, move } = planMenuMove(
    data,
    currentBytes,
    model,
    request,
  );
  const moved = applyIfrStructuralMove(currentBytes, move);
  const next = structuredClone(data);
  remapDataOffsetsAfterMove(next, moved.remapOffset);

  const [movedReference] = next.forms[request.sourceFormIndex].children.splice(
    request.referenceChildIndex,
    1,
  );
  next.forms[request.destinationFormIndex].children.push(movedReference);
  next.ifrEdits = [...(next.ifrEdits ?? []), move];

  rebuildIncomingReferences(next);
  next.ifrBinary = analyzeIfrBinary(moved.bytes);
  const movedReferenceOffset = moved.remapOffset(referenceSpan.offset);
  const verifiedReference = next.ifrBinary.packages
    .flatMap((pkg) => (pkg.valid ? pkg.opcodes : []))
    .find((span) => span.offset === movedReferenceOffset);
  if (
    verifiedReference?.opcode !== IFR_OPCODE.REF ||
    verifiedReference.ownerFormId !==
      parsedId(destinationForm.formId, "Destination Form") ||
    verifiedReference.parentOffset !== moved.remapOffset(destinationSpan.offset)
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The moved HII stream could not be reparsed with the Ref in its destination Form.",
    );
  }
  refreshSingleFormSetNavigation(next, data.singleFormSetNavigation);
  next.hashes.offsetChecksum = await calculateJsonChecksum(
    next.menu,
    next.forms,
    next.suppressions,
  );
  return next;
}
