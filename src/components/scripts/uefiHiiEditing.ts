import { FirmwareError } from "./errors";
import {
  analyzeTopLevelTabVisibilityToggle,
  toggleTopLevelTabVisibility,
  type TopLevelTabVisibilityAvailability,
  type TopLevelTabVisibilityRequest,
} from "./menuEditing";
import { remapIfrOffset } from "./ifrEditing";
import type {
  AmiSingleFormSetNavigationReport,
  Data,
  Form,
  RefPrompt,
  UefiHiiReferenceIdentity,
  UefiHiiVisibilityEdit,
} from "./types";

function normalizedGuid(value?: string) {
  return (value ?? "").replace(/[{}\s]/g, "").toLowerCase();
}

function normalizedId(value: string) {
  const parsed = Number.parseInt(value);
  return Number.isNaN(parsed) ? value.toLowerCase() : String(parsed);
}

function sameIdentity(left: UefiHiiReferenceIdentity, right: UefiHiiReferenceIdentity) {
  return (
    left.sourceModuleId === right.sourceModuleId &&
    normalizedId(left.questionId) === normalizedId(right.questionId) &&
    normalizedId(left.targetFormId) === normalizedId(right.targetFormId) &&
    normalizedGuid(left.targetFormSetGuid) === normalizedGuid(right.targetFormSetGuid)
  );
}

function targetModuleId(data: Data, owner: Form, reference: RefPrompt) {
  const targetGuid = reference.targetFormSetGuid ?? owner.formSetGuid;
  return data.forms.find(
    (form) =>
      normalizedId(form.formId) === normalizedId(reference.formId) &&
      normalizedGuid(form.formSetGuid) === normalizedGuid(targetGuid),
  )?.sourceModuleId;
}

function referenceIdentity(
  data: Data,
  owner: Form,
  reference: RefPrompt,
): UefiHiiReferenceIdentity {
  return {
    sourceModuleId: targetModuleId(data, owner, reference),
    questionId: reference.questionId,
    targetFormId: reference.formId,
    targetFormSetGuid: reference.targetFormSetGuid ?? owner.formSetGuid,
  };
}

function isActivelyHidden(data: Data, reference: RefPrompt) {
  return (reference.suppressIf ?? []).some((offset) =>
    data.suppressions.some(
      (condition) =>
        condition.offset === offset &&
        condition.active &&
        condition.constant === true &&
        (condition.kind ?? "SuppressIf") === "SuppressIf",
    ),
  );
}

function nextDirectReferenceIdentity(
  data: Data,
  owner: Form,
  referenceChildIndex: number,
) {
  const next = owner.children
    .slice(referenceChildIndex + 1)
    .find(
      (child): child is RefPrompt =>
        child.type === "Ref" && !isActivelyHidden(data, child),
    );
  return next ? referenceIdentity(data, owner, next) : undefined;
}

function findFormIndex(data: Data, formId: string, formSetGuid?: string) {
  return data.forms.findIndex(
    (form) =>
      normalizedId(form.formId) === normalizedId(formId) &&
      normalizedGuid(form.formSetGuid) === normalizedGuid(formSetGuid),
  );
}

function nextDirectOpcodeOffset(
  data: Data,
  sourceFormIndex: number,
  referenceChildIndex: number,
) {
  const model = data.ifrBinary;
  const form = data.forms[sourceFormIndex];
  const reference = form?.children[referenceChildIndex];
  if (!model || !form?.ifrOffset || reference?.type !== "Ref" || !reference.ifrOffset) {
    return undefined;
  }
  const formOffset = Number.parseInt(form.ifrOffset, 16);
  const referenceOffset = Number.parseInt(reference.ifrOffset, 16);
  const spans = model.packages.flatMap((pkg) => pkg.opcodes);
  const referenceSpan = spans.find((span) => span.offset === referenceOffset);
  if (!referenceSpan) return undefined;
  const next = spans
    .filter(
      (span) => span.offset >= referenceSpan.end && span.parentOffset === formOffset,
    )
    .sort((left, right) => left.offset - right.offset)[0];
  return next ? `0x${next.offset.toString(16).toUpperCase()}` : undefined;
}

function currentRestoreOffset(data: Data, edit: UefiHiiVisibilityEdit) {
  if (!edit.restoreBeforeOffset) return undefined;
  let offset = Number.parseInt(edit.restoreBeforeOffset, 16);
  for (const move of (data.ifrEdits ?? []).slice(edit.editCount)) {
    offset = remapIfrOffset(move, offset);
  }
  return `0x${offset.toString(16).toUpperCase()}`;
}

function syntheticNavigation(
  destination: Form,
  reference: RefPrompt,
  nextSibling?: UefiHiiReferenceIdentity,
): AmiSingleFormSetNavigationReport {
  const formSetGuid = destination.formSetGuid ?? "";
  return {
    status: "detected",
    mechanism: "single-formset-ifr-hub",
    confidence: "ifr-only",
    reason: "Transient vendor-neutral HII visibility plan.",
    formSetGuid,
    hubFormId: destination.formId,
    hubName: destination.name,
    pages: [
      {
        name: reference.name,
        formId: reference.formId,
        formSetGuid: reference.targetFormSetGuid ?? formSetGuid,
        role: "suppressed-tab",
        registeredInAmitse: false,
        registrationOffsets: [],
        parentFormIds: [destination.formId],
      },
      ...(nextSibling
        ? [
            {
              name: "Next menu",
              formId: nextSibling.targetFormId,
              formSetGuid: nextSibling.targetFormSetGuid ?? formSetGuid,
              role: "direct-tab" as const,
              registeredInAmitse: false,
              registrationOffsets: [],
              parentFormIds: [destination.formId],
            },
          ]
        : []),
    ],
  };
}

interface VisibilityPlan {
  prepared: Data;
  request: TopLevelTabVisibilityRequest;
  reference: RefPrompt;
  identity: UefiHiiReferenceIdentity;
  pending?: UefiHiiVisibilityEdit;
  origin?: UefiHiiVisibilityEdit;
  previousNavigation: Data["singleFormSetNavigation"];
}

function prepareVisibilityPlan(
  data: Data,
  sourceFormIndex: number,
  referenceChildIndex: number,
  visible: boolean,
): VisibilityPlan {
  if (data.firmwareFamily !== "uefi-hii") {
    throw new FirmwareError(
      "INVALID_INPUT",
      "Vendor-neutral HII visibility editing requires a UEFI HII workspace.",
    );
  }
  const owner = data.forms[sourceFormIndex];
  const reference = owner?.children[referenceChildIndex];
  if (!owner || reference?.type !== "Ref") {
    throw new FirmwareError("INVALID_INPUT", "The selected menu Ref no longer exists.");
  }
  if (!owner.sourceModuleId) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The selected menu has no proven source-module ownership.",
    );
  }
  const identity = referenceIdentity(data, owner, reference);
  const pending = data.uefiHiiVisibilityEdits?.find((edit) =>
    sameIdentity(edit.reference, identity),
  );
  const destinationIndex =
    visible && pending
      ? findFormIndex(
          data,
          pending.originalParentFormId,
          pending.originalParentFormSetGuid,
        )
      : sourceFormIndex;
  const destination = data.forms[destinationIndex];
  if (!destination) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The original parent Form is no longer present in the HII graph.",
    );
  }
  if (destination.sourceModuleId !== owner.sourceModuleId) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The Ref cannot cross independently owned HII modules.",
    );
  }
  const nextSibling = visible
    ? (pending?.nextSibling ??
      nextDirectReferenceIdentity(data, owner, referenceChildIndex))
    : nextDirectReferenceIdentity(data, owner, referenceChildIndex);
  const prepared = structuredClone(data);
  const previousNavigation = prepared.singleFormSetNavigation;
  prepared.singleFormSetNavigation = syntheticNavigation(
    destination,
    reference,
    nextSibling,
  );
  const request: TopLevelTabVisibilityRequest = {
    sourceFormIndex,
    referenceChildIndex,
    visible,
  };
  if (visible && pending) {
    request.destinationBeforeOffset = currentRestoreOffset(data, pending);
  }
  return {
    prepared,
    request,
    reference,
    identity,
    pending,
    origin: visible
      ? undefined
      : {
          reference: identity,
          originalParentFormId: owner.formId,
          originalParentFormSetGuid: owner.formSetGuid,
          nextSibling,
          restoreBeforeOffset: nextDirectOpcodeOffset(
            data,
            sourceFormIndex,
            referenceChildIndex,
          ),
          editCount: data.ifrEdits?.length ?? 0,
        },
    previousNavigation,
  };
}

export function analyzeUefiHiiMenuVisibility(
  data: Data,
  originalSource: string,
  sourceFormIndex: number,
  referenceChildIndex: number,
  visible: boolean,
): TopLevelTabVisibilityAvailability {
  try {
    const plan = prepareVisibilityPlan(
      data,
      sourceFormIndex,
      referenceChildIndex,
      visible,
    );
    return analyzeTopLevelTabVisibilityToggle(
      plan.prepared,
      originalSource,
      plan.request,
    );
  } catch (reason) {
    return {
      available: false,
      reason: reason instanceof Error ? reason.message : String(reason),
    };
  }
}

export async function toggleUefiHiiMenuVisibility(
  data: Data,
  originalSource: string,
  sourceFormIndex: number,
  referenceChildIndex: number,
  visible: boolean,
) {
  const plan = prepareVisibilityPlan(
    data,
    sourceFormIndex,
    referenceChildIndex,
    visible,
  );
  const next = await toggleTopLevelTabVisibility(
    plan.prepared,
    originalSource,
    plan.request,
  );
  next.singleFormSetNavigation = plan.previousNavigation;
  const edits = (data.uefiHiiVisibilityEdits ?? []).filter(
    (edit) => !sameIdentity(edit.reference, plan.identity),
  );
  if (visible) {
    next.uefiHiiVisibilityEdits = edits;
  } else {
    if (!plan.origin) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "The original HII menu position was not retained.",
      );
    }
    const newlyAppliedMoves = (next.ifrEdits ?? []).slice(plan.origin.editCount);
    let restoreBeforeOffset = plan.origin.restoreBeforeOffset
      ? Number.parseInt(plan.origin.restoreBeforeOffset, 16)
      : undefined;
    if (restoreBeforeOffset !== undefined) {
      for (const move of newlyAppliedMoves) {
        restoreBeforeOffset = remapIfrOffset(move, restoreBeforeOffset);
      }
    }
    next.uefiHiiVisibilityEdits = [
      ...edits,
      {
        ...plan.origin,
        restoreBeforeOffset:
          restoreBeforeOffset === undefined
            ? undefined
            : `0x${restoreBeforeOffset.toString(16).toUpperCase()}`,
        editCount: next.ifrEdits?.length ?? 0,
      },
    ];
  }
  return next;
}
