import { FirmwareError } from "./errors";
import type {
  CheckBoxPrompt,
  Data,
  Default,
  Form,
  FormChild,
  FormChildren,
  Menu,
  NumericPrompt,
  Offsets,
  OneOfPrompt,
  RefPrompt,
  StringPrompt,
  Suppression,
  VarStores,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return value === undefined || isStringArray(value);
}

function isOffsets(value: unknown): value is Offsets {
  return (
    isRecord(value) &&
    isString(value.accessLevel) &&
    isString(value.failsafe) &&
    isString(value.optimal) &&
    isOptionalString(value.pageId)
  );
}

function isMenu(value: unknown): value is Menu {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        isString(entry.name) &&
        isString(entry.formId) &&
        isNullableString(entry.offset) &&
        isOptionalString(entry.formSetGuid) &&
        (entry.source === undefined ||
          entry.source === "amitse" ||
          entry.source === "setupdata" ||
          entry.source === "formset") &&
        isOptionalString(entry.pageMask) &&
        isOptionalString(entry.pageInfoOffset),
    )
  );
}

function isDefault(value: unknown): value is Default {
  return isRecord(value) && isString(value.defaultId) && isString(value.value);
}

function isDefaults(value: unknown): value is Default[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isDefault));
}

function isFormChildBase(value: UnknownRecord): value is UnknownRecord & FormChild {
  return (
    isString(value.name) &&
    isString(value.description) &&
    isString(value.questionId) &&
    isString(value.varStoreId) &&
    isOptionalString(value.varStoreName) &&
    isNullableString(value.accessLevel) &&
    isNullableString(value.failsafe) &&
    isNullableString(value.optimal) &&
    (value.offsets === null || isOffsets(value.offsets)) &&
    isOptionalStringArray(value.suppressIf) &&
    isOptionalStringArray(value.conditions)
  );
}

function isRefPrompt(value: UnknownRecord): value is UnknownRecord & RefPrompt {
  return (
    value.type === "Ref" &&
    isFormChildBase(value) &&
    isString(value.formId) &&
    isOptionalString(value.targetFormSetGuid) &&
    isNullableString(value.pageId)
  );
}

function isNumericPrompt(value: UnknownRecord): value is UnknownRecord & NumericPrompt {
  return (
    value.type === "Numeric" &&
    isFormChildBase(value) &&
    isString(value.varOffset) &&
    isString(value.size) &&
    isString(value.min) &&
    isString(value.max) &&
    isString(value.step) &&
    isDefaults(value.defaults)
  );
}

function isCheckBoxPrompt(
  value: UnknownRecord,
): value is UnknownRecord & CheckBoxPrompt {
  return (
    value.type === "CheckBox" &&
    isFormChildBase(value) &&
    isString(value.varOffset) &&
    isString(value.flags) &&
    isDefaults(value.defaults)
  );
}

function isOneOfPrompt(value: UnknownRecord): value is UnknownRecord & OneOfPrompt {
  return (
    value.type === "OneOf" &&
    isFormChildBase(value) &&
    isString(value.varOffset) &&
    isString(value.size) &&
    Array.isArray(value.options) &&
    value.options.every(
      (option) => isRecord(option) && isString(option.option) && isString(option.value),
    ) &&
    isDefaults(value.defaults)
  );
}

function isStringPrompt(value: UnknownRecord): value is UnknownRecord & StringPrompt {
  return value.type === "String" && isFormChildBase(value);
}

function isFormChild(value: unknown): value is FormChildren {
  return (
    isRecord(value) &&
    (isRefPrompt(value) ||
      isNumericPrompt(value) ||
      isCheckBoxPrompt(value) ||
      isOneOfPrompt(value) ||
      isStringPrompt(value))
  );
}

function isForm(value: unknown): value is Form {
  return (
    isRecord(value) &&
    value.type === "Form" &&
    isString(value.name) &&
    isString(value.formId) &&
    isOptionalString(value.formSetGuid) &&
    isOptionalString(value.formSetTitle) &&
    isStringArray(value.referencedIn) &&
    Array.isArray(value.children) &&
    value.children.every(isFormChild)
  );
}

function isVarStores(value: unknown): value is VarStores {
  return (
    Array.isArray(value) &&
    value.every(
      (varStore) =>
        isRecord(varStore) &&
        isString(varStore.varStoreId) &&
        isString(varStore.size) &&
        isString(varStore.name) &&
        isOptionalString(varStore.formSetGuid),
    )
  );
}

const conditionKinds = new Set(["SuppressIf", "GrayOutIf", "DisableIf"]);
const conditionSources = new Set([
  "setup",
  "hardware",
  "access",
  "ui",
  "runtime",
  "constant",
  "unknown",
]);

function isSuppression(value: unknown): value is Suppression {
  return (
    isRecord(value) &&
    isString(value.offset) &&
    isBoolean(value.active) &&
    isString(value.start) &&
    isString(value.end) &&
    (value.kind === undefined || conditionKinds.has(value.kind as string)) &&
    isOptionalString(value.expression) &&
    isOptionalStringArray(value.questionIds) &&
    isOptionalStringArray(value.varStoreIds) &&
    isOptionalStringArray(value.varStoreNames) &&
    (value.source === undefined || conditionSources.has(value.source as string)) &&
    (value.constant === undefined ||
      value.constant === null ||
      isBoolean(value.constant)) &&
    isOptionalString(value.formSetGuid)
  );
}

function isHashes(value: unknown): value is Data["hashes"] {
  return (
    isRecord(value) &&
    isString(value.setupTxt) &&
    isString(value.setupSct) &&
    isString(value.amitseSct) &&
    isString(value.setupdataBin) &&
    isString(value.offsetChecksum)
  );
}

function invalidData(message: string): never {
  throw new FirmwareError("INVALID_INPUT", `data.json ${message}.`);
}

export function parseDataFile(text: string): Data {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new FirmwareError("INVALID_INPUT", "data.json is not valid JSON.");
  }

  if (!isRecord(value)) {
    invalidData("does not contain an object");
  }
  if (value.firmwareFamily !== "aptio-v" && value.firmwareFamily !== "aptio-iv") {
    invalidData("has an invalid firmwareFamily");
  }
  if (!isString(value.version)) {
    invalidData("is missing version");
  }
  if (!isMenu(value.menu)) {
    invalidData("has an invalid menu");
  }
  if (value.formSetRoots !== undefined && !isMenu(value.formSetRoots)) {
    invalidData("has invalid formSetRoots");
  }
  if (!Array.isArray(value.forms) || !value.forms.every(isForm)) {
    invalidData("has invalid forms");
  }
  if (!isVarStores(value.varStores)) {
    invalidData("has invalid varStores");
  }
  if (!Array.isArray(value.suppressions) || !value.suppressions.every(isSuppression)) {
    invalidData("has invalid suppressions");
  }
  if (!isHashes(value.hashes)) {
    invalidData("has invalid hashes");
  }

  return {
    firmwareFamily: value.firmwareFamily,
    menu: value.menu,
    formSetRoots: value.formSetRoots,
    forms: value.forms,
    varStores: value.varStores,
    suppressions: value.suppressions,
    version: value.version,
    hashes: value.hashes,
  };
}
