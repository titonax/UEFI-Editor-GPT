import type { PopulatedFiles } from "../FileUploads/fileModel";
import { calculateJsonChecksum, hashFile } from "./checksum";
import { FirmwareError } from "./errors";
import { decimalToHex as decToHexString, hexToBytes } from "./hex";
import { determineCondition, enrichConditions } from "./ifrConditions";
import { analyzeIfrBinary } from "./ifrBinary";
import type {
  CheckBoxPrompt,
  ConditionKind,
  Data,
  Form,
  FormChildren,
  Forms,
  Menu,
  NumericPrompt,
  Offsets,
  OneOfPrompt,
  RefPrompt,
  Scopes,
  StringPrompt,
  Suppression,
  VarStores,
} from "./types";

export const version = "0.4.0";
export { calculateJsonChecksum } from "./checksum";
export { validateByteInput } from "./hex";
export { analyzeIfrBinary, parseIfrOpcodeStream } from "./ifrBinary";
export { applyIfrBytePatches, planIfrReferenceRetarget } from "./ifrEditing";
export { downloadModifiedFiles } from "./patcher";
const wantedIFRExtractorVersions = ["1.6.1"];

function hasScope(hexString: string) {
  const header = hexString.split(" ")[1];

  return parseInt(header, 16).toString(2).padStart(8, "0").startsWith("1");
}

function formReferenceKey(formId: string, formSetGuid?: string) {
  return `${formSetGuid ?? ""}:${String(parseInt(formId))}`;
}

function reversedHexBytes(value: string) {
  return value.match(/../g)?.reverse().join("") ?? "";
}

function guidToUefiHex(value: string) {
  const parts = value.split("-");
  if (parts.length !== 5) {
    return "";
  }
  return (
    reversedHexBytes(parts[0]) +
    reversedHexBytes(parts[1]) +
    reversedHexBytes(parts[2]) +
    parts[3] +
    parts[4]
  ).toUpperCase();
}

function littleEndianUint32(value: string) {
  const normalized = reversedHexBytes(value);
  return normalized.length === 8 ? parseInt(normalized, 16) : Number.NaN;
}

function isPageMask(value: number) {
  return value === 0 || (value > 0 && (value & (value - 1)) === 0);
}

function discoverSetupDataMenu(formSetRoots: Menu, setupData: string): Menu {
  const candidates: {
    entry: Menu[number];
    start: number;
    mask: number;
  }[] = [];

  for (const entry of formSetRoots) {
    if (!entry.formSetGuid) {
      continue;
    }
    const encodedGuid = guidToUefiHex(entry.formSetGuid);
    let guidIndex = setupData.indexOf(encodedGuid);
    while (guidIndex !== -1) {
      if (guidIndex >= 8) {
        const start = guidIndex - 8;
        const mask = littleEndianUint32(setupData.slice(start, guidIndex));
        if (isPageMask(mask)) {
          candidates.push({ entry, start, mask });
        }
      }
      guidIndex = setupData.indexOf(encodedGuid, guidIndex + 2);
    }
  }

  candidates.sort((left, right) => left.start - right.start);
  const runs: (typeof candidates)[] = [];
  for (const candidate of candidates) {
    if (runs.length === 0) {
      runs.push([candidate]);
      continue;
    }
    const current = runs[runs.length - 1];
    const previous = current[current.length - 1];
    if (candidate.start === previous.start + 40) {
      current.push(candidate);
    } else {
      runs.push([candidate]);
    }
  }

  if (runs.length === 0) {
    return [];
  }
  const pageList = runs.sort((left, right) => right.length - left.length)[0];
  if (pageList.length < 3) {
    return [];
  }

  return pageList.map(({ entry, start, mask }) => ({
    ...entry,
    offset: null,
    source: "setupdata",
    pageMask: decToHexString(mask),
    pageInfoOffset: decToHexString(start / 2),
  }));
}

function findVarStoreName(
  varStores: VarStores,
  varStoreId: string,
  formSetGuid?: string,
) {
  return (
    varStores.find(
      (varStore) =>
        varStore.formSetGuid === formSetGuid &&
        parseInt(varStore.varStoreId) === parseInt(varStoreId),
    ) ??
    varStores.find((varStore) => parseInt(varStore.varStoreId) === parseInt(varStoreId))
  )?.name;
}

const conditionKinds = new Set<ConditionKind>(["SuppressIf", "GrayOutIf", "DisableIf"]);

function isConditionKind(value: Scopes[number]["type"]): value is ConditionKind {
  return conditionKinds.has(value as ConditionKind);
}

function checkConditions(scopes: Scopes, formChild: FormChildren) {
  const conditions = scopes
    .filter((scope) => isConditionKind(scope.type))
    .flatMap((scope) => (scope.offset ? [scope.offset] : []));

  if (conditions.length !== 0) {
    formChild.conditions = [...conditions];
    const suppressions = scopes
      .filter((scope) => scope.type === "SuppressIf")
      .flatMap((scope) => (scope.offset ? [scope.offset] : []));
    if (suppressions.length !== 0) {
      formChild.suppressIf = suppressions;
    }
  }
}

function getAdditionalData(
  bytes: string,
  hexSetupdataBin: string,
  isRef: boolean,
): {
  pageId: string | null;
  accessLevel: string | null;
  failsafe: string | null;
  optimal: string | null;
  offsets: Offsets | null;
} {
  const byteArray = bytes.split(" ");
  const regex = new RegExp(
    byteArray[6] +
      byteArray[7] +
      ".{20}(....).{4}(..).{6}" +
      byteArray[4] +
      byteArray[5] +
      ".{52}" +
      byteArray[2] +
      byteArray[3] +
      ".{4}(..)(..)",
    "g",
  );

  const matches = [...hexSetupdataBin.matchAll(regex)].filter(
    (element) => element.index % 2 === 0,
  );

  if (matches.length === 1) {
    const match = matches[0];
    const index = match.index;

    const offsets: Offsets = {
      accessLevel: decToHexString((index + 32) / 2),
      failsafe: decToHexString((index + 104) / 2),
      optimal: decToHexString((index + 106) / 2),
    };

    if (isRef) {
      offsets.pageId = decToHexString((index + 24) / 2);
    }

    return {
      pageId: match[1],
      accessLevel: match[2],
      failsafe: match[3],
      optimal: match[4],
      offsets,
    };
  }

  return {
    pageId: null,
    accessLevel: null,
    failsafe: null,
    optimal: null,
    offsets: null,
  };
}

export async function parseData(files: PopulatedFiles) {
  const [setupTxtHash, setupSctHash, amitseSctHash, setupdataBinHash] =
    await Promise.all([
      hashFile(files.setupTxtContainer.file),
      hashFile(files.setupSctContainer.file),
      hashFile(files.amitseSctContainer.file),
      hashFile(files.setupdataBinContainer.file),
    ]);

  let setupTxt = files.setupTxtContainer.textContent;
  const amitseSct = files.amitseSctContainer.textContent;
  const setupdataBin = files.setupdataBinContainer.textContent;

  if (
    !wantedIFRExtractorVersions.some((version) =>
      setupTxt.includes(`Program version: ${version}`),
    )
  ) {
    throw new FirmwareError(
      "INCOMPATIBLE_IFR",
      `Wrong IFRExtractor-RS version. Compatible versions: ${wantedIFRExtractorVersions.join(
        ", ",
      )}.`,
    );
  }

  if (!setupTxt.includes("Extraction mode: UEFI")) {
    throw new FirmwareError(
      "INCOMPATIBLE_IFR",
      "Only UEFI extraction mode is supported.",
    );
  }

  if (!/\{ .* \}/.test(setupTxt)) {
    throw new FirmwareError(
      "INCOMPATIBLE_IFR",
      'Use the "verbose" option of IFRExtractor.',
    );
  }

  if (!setupTxt.includes(`SHA256: ${setupSctHash}`)) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Setup SCT and IFR Extractor output TXT SHA256 mismatch.",
    );
  }

  setupTxt = setupTxt.replace(/[\r\n|\n|\r](?!0x[0-9A-F]{3})/g, "<br>");

  const formSetIds = new Set<string>();
  const formSetMetadata = new Map<string, { guid: string; title: string }>();
  const formSetRoots: Menu = [];
  let pendingFormSetTitle: string | null = null;
  let currentFormSetGuid: string | undefined;
  let currentFormSetTitle: string | undefined;
  const varStores: VarStores = [];
  const forms: Forms = [];
  const suppressions: Suppression[] = [];
  const scopes: Scopes = [];
  let currentForm: Form = {} as Form;
  let currentString: StringPrompt = {} as StringPrompt;
  let currentOneOf: OneOfPrompt = {} as OneOfPrompt;
  let currentNumeric: NumericPrompt = {} as NumericPrompt;
  let currentCheckBox: CheckBoxPrompt = {} as CheckBoxPrompt;

  const currentSuppressions: Omit<Suppression, "end">[] = [];

  const references: Record<string, Set<string>> = {};

  const setupTxtArray = setupTxt.split("\n");

  for (const [index, line] of setupTxtArray.entries()) {
    const formSet = /FormSet Guid: (.*)-(.*)-(.*)-(.*)-(.*), Title: "(.*)", Help:/.exec(
      line,
    );
    const varStore =
      /VarStore Guid: (.*), VarStoreId: (.*), Size: (.*), Name: "(.*)" \{/.exec(line);
    const form = /Form FormId: (.*), Title: "(.*)" \{ (.*) \}/.exec(line);
    const condition = /\b(SuppressIf|GrayOutIf|DisableIf)\b.*\{ [0-9A-F ]+ \}/.exec(
      line,
    );
    const ref =
      /Ref Prompt: "(.*)", Help: "(.*)", QuestionFlags: ([^,]*), QuestionId: ([^,]*), VarStoreId: ([^,]*), VarStoreInfo: ([^,{]*)(.*?) \{ ([0-9A-F ]+) \}/.exec(
        line,
      );
    const refFormId = ref ? /(?:^|, )FormId: ([^, {]+)/.exec(ref[7]) : null;
    const refFormSetGuid = ref ? /(?:^|, )FormSetGuid: ([^, {]+)/.exec(ref[7]) : null;
    const string =
      /String Prompt: "(.*)", Help: "(.*)", QuestionFlags: (.*), QuestionId: (.*), VarStoreId: (.*), VarStoreInfo: (.*), MinSize: (.*), MaxSize: (.*), Flags: (.*) \{ (.*) \}/.exec(
        line,
      );
    const numeric =
      /Numeric Prompt: "(.*)", Help: "(.*)", QuestionFlags: (.*), QuestionId: (.*), VarStoreId: (.*), VarOffset: (.*), Flags: (.*), Size: (.*), Min: (.*), Max: (.*), Step: (.*) \{ (.*) \}/.exec(
        line,
      );
    const checkBox =
      /CheckBox Prompt: "(.*)", Help: "(.*)", QuestionFlags: (.*), QuestionId: (.*), VarStoreId: (.*), VarOffset: (.*), Flags: (.*) \{ (.*) \}/.exec(
        line,
      );
    const oneOf =
      /OneOf Prompt: "(.*)", Help: "(.*)", QuestionFlags: (.*), QuestionId: (.*), VarStoreId: (.*), VarOffset: (.*), Flags: (.*), Size: (.*), Min: (.*), Max: (.*), Step: (.*) \{ (.*) \}/.exec(
        line,
      );
    const oneOfOption = /OneOfOption Option: "(.*)" Value: (.*) \{/.exec(line);
    const defaultId = /Default DefaultId: (.*) Value: (.*) \{/.exec(line);
    const end = /\{ 29 02 \}/.exec(line);
    const indentations = (line.match(/\t/g) ?? []).length;
    const offset = line.split(" ")[0].slice(0, -1);
    const currentScope = scopes[scopes.length - 1];

    if (formSet) {
      const formSetId = formSet[4] + formSet[5];
      currentFormSetGuid = [
        formSet[1],
        formSet[2],
        formSet[3],
        formSet[4],
        formSet[5],
      ].join("-");
      currentFormSetTitle = formSet[6];
      formSetIds.add(formSetId);
      formSetMetadata.set(formSetId, {
        guid: currentFormSetGuid,
        title: currentFormSetTitle,
      });
      pendingFormSetTitle = currentFormSetTitle;
    }

    if (varStore) {
      varStores.push({
        varStoreId: varStore[2],
        size: varStore[3],
        name: varStore[4],
        formSetGuid: currentFormSetGuid,
      });
    }

    if (form) {
      if (pendingFormSetTitle !== null) {
        formSetRoots.push({
          name: pendingFormSetTitle,
          formId: form[1],
          offset: null,
          formSetGuid: currentFormSetGuid,
          source: "formset",
        });
        pendingFormSetTitle = null;
      }

      currentForm = {
        name: form[2],
        type: "Form",
        formId: form[1],
        formSetGuid: currentFormSetGuid,
        formSetTitle: currentFormSetTitle,
        referencedIn: [],
        children: [],
      };

      if (hasScope(form[3])) {
        scopes.push({ type: "Form", indentations });
      }
    }

    if (condition) {
      const kind = condition[1] as ConditionKind;
      const conditionInfo = determineCondition(setupTxtArray, index);
      scopes.push({
        type: kind,
        indentations,
        offset,
      });

      currentSuppressions.push({
        offset,
        kind,
        active: true,
        start: conditionInfo.start,
        expression: conditionInfo.expression,
        questionIds: conditionInfo.questionIds,
        varStoreIds: conditionInfo.varStoreIds,
        constant: conditionInfo.constant,
        formSetGuid: currentFormSetGuid,
      });
    }

    if (ref && refFormId) {
      const formId = refFormId[1];
      const targetFormSetGuid = refFormSetGuid?.[1];

      const currentRef: RefPrompt = {
        name: ref[1],
        description: ref[2],
        type: "Ref",
        questionId: ref[4],
        varStoreId: ref[5],
        varStoreName: findVarStoreName(varStores, ref[5], currentFormSetGuid),
        formId,
        targetFormSetGuid,
        ...getAdditionalData(ref[8], setupdataBin, true),
      };

      checkConditions(scopes, currentRef);

      currentForm.children.push(currentRef);

      const referenceKey = formReferenceKey(
        formId,
        targetFormSetGuid ?? currentForm.formSetGuid,
      );
      if (referenceKey in references) {
        references[referenceKey].add(currentForm.formId);
      } else {
        references[referenceKey] = new Set([currentForm.formId]);
      }
    }

    if (string) {
      const { accessLevel, failsafe, optimal, offsets } = getAdditionalData(
        string[10],
        setupdataBin,
        false,
      );

      currentString = {
        name: string[1],
        description: string[2],
        type: "String",
        questionId: string[4],
        varStoreId: string[5],
        varStoreName: findVarStoreName(varStores, string[5], currentFormSetGuid),
        accessLevel,
        failsafe,
        optimal,
        offsets,
      };

      checkConditions(scopes, currentString);

      if (hasScope(string[10])) {
        scopes.push({ type: "String", indentations });
      }
    }

    if (numeric) {
      const { accessLevel, failsafe, optimal, offsets } = getAdditionalData(
        numeric[12],
        setupdataBin,
        false,
      );

      currentNumeric = {
        name: numeric[1],
        description: numeric[2],
        type: "Numeric",
        questionId: numeric[4],
        varStoreId: numeric[5],
        varStoreName: findVarStoreName(varStores, numeric[5], currentFormSetGuid),
        varOffset: numeric[6],
        size: numeric[8],
        min: numeric[9],
        max: numeric[10],
        step: numeric[11],
        accessLevel,
        failsafe,
        optimal,
        offsets,
      };

      checkConditions(scopes, currentNumeric);

      if (hasScope(numeric[12])) {
        scopes.push({ type: "Numeric", indentations });
      }
    }

    if (checkBox) {
      const { accessLevel, failsafe, optimal, offsets } = getAdditionalData(
        checkBox[8],
        setupdataBin,
        false,
      );

      currentCheckBox = {
        name: checkBox[1],
        description: checkBox[2],
        type: "CheckBox",
        questionId: checkBox[4],
        varStoreId: checkBox[5],
        varStoreName: findVarStoreName(varStores, checkBox[5], currentFormSetGuid),
        varOffset: checkBox[6],
        flags: checkBox[7],
        accessLevel,
        failsafe,
        optimal,
        offsets,
      };

      checkConditions(scopes, currentCheckBox);

      if (hasScope(checkBox[8])) {
        scopes.push({ type: "CheckBox", indentations });
      }
    }

    if (oneOf) {
      const { accessLevel, failsafe, optimal, offsets } = getAdditionalData(
        oneOf[12],
        setupdataBin,
        false,
      );

      currentOneOf = {
        name: oneOf[1],
        description: oneOf[2],
        type: "OneOf",
        questionId: oneOf[4],
        varStoreId: oneOf[5],
        varStoreName: findVarStoreName(varStores, oneOf[5], currentFormSetGuid),
        varOffset: oneOf[6],
        size: oneOf[8],
        options: [],
        accessLevel,
        failsafe,
        optimal,
        offsets,
      };

      checkConditions(scopes, currentOneOf);

      if (hasScope(oneOf[12])) {
        scopes.push({ type: "OneOf", indentations });
      }
    }

    if (
      oneOfOption &&
      (currentScope.type === "OneOf" || isConditionKind(currentScope.type))
    ) {
      currentOneOf.options.push({
        option: oneOfOption[1],
        value: oneOfOption[2],
      });
    }

    if (scopes.length !== 0) {
      if (defaultId) {
        const oneDefault = {
          defaultId: defaultId[1],
          value: defaultId[2],
        };

        if (currentScope.type === "Numeric") {
          currentNumeric.defaults ??= [];
          currentNumeric.defaults.push(oneDefault);
        } else if (currentScope.type === "CheckBox") {
          currentCheckBox.defaults ??= [];
          currentCheckBox.defaults.push(oneDefault);
        } else if (currentScope.type === "OneOf") {
          currentOneOf.defaults ??= [];
          currentOneOf.defaults.push(oneDefault);
        }
      }

      if (end && currentScope.indentations === indentations) {
        const scopeType = currentScope.type;

        if (scopeType === "Form") {
          forms.push(currentForm);
        } else if (scopeType === "Numeric") {
          currentForm.children.push(currentNumeric);
        } else if (scopeType === "CheckBox") {
          currentForm.children.push(currentCheckBox);
        } else if (scopeType === "OneOf") {
          currentForm.children.push(currentOneOf);
        } else if (scopeType === "String") {
          currentForm.children.push(currentString);
        } else {
          const latestSuppression = currentSuppressions.pop();

          if (!latestSuppression) {
            throw new FirmwareError(
              "PARSE_FAILED",
              `Condition scope ending at ${offset} has no matching opening opcode.`,
            );
          }

          suppressions.push({ ...latestSuppression, end: offset });
        }

        scopes.pop();
      }
    }
  }

  if (scopes.length !== 0 || currentSuppressions.length !== 0) {
    throw new FirmwareError(
      "PARSE_FAILED",
      "The IFR ended with unclosed form or condition scopes.",
    );
  }

  enrichConditions(forms, varStores, suppressions);

  const matches = [...formSetIds].flatMap((formSetId) =>
    [...amitseSct.matchAll(new RegExp(formSetId + "(.{4})", "g"))].map((match) => ({
      match,
      formSetId,
    })),
  );
  const discoveredMenu: Menu = matches
    .map(({ match, formSetId }) => {
      const hexEntry = decToHexString(
        parseInt(match[1].slice(2) + match[1].slice(0, 2), 16),
      );
      const formSet = formSetMetadata.get(formSetId);
      const matchedForm =
        forms.find(
          (form) =>
            form.formSetGuid === formSet?.guid &&
            parseInt(form.formId) === parseInt(hexEntry),
        ) ?? forms.find((form) => parseInt(form.formId) === parseInt(hexEntry));
      return {
        name: matchedForm?.name ?? formSet?.title ?? "",
        formId: hexEntry,
        offset: decToHexString((match.index + formSetId.length) / 2),
        formSetGuid: formSet?.guid,
        source: "amitse" as const,
      };
    })
    .filter((x) => x.name);
  const setupDataMenu = discoverSetupDataMenu(formSetRoots, setupdataBin).map(
    (entry) => {
      const executableEntry = discoveredMenu.find(
        (candidate) =>
          candidate.formSetGuid?.toLowerCase() === entry.formSetGuid?.toLowerCase(),
      );
      return {
        ...entry,
        offset: executableEntry?.offset ?? null,
      };
    },
  );
  const menu =
    setupDataMenu.length > 0
      ? setupDataMenu
      : discoveredMenu.length > 0
        ? discoveredMenu
        : formSetRoots;

  for (const form of forms) {
    const referenceKey = formReferenceKey(form.formId, form.formSetGuid);
    if (referenceKey in references) {
      form.referencedIn = [...references[referenceKey]];
    }
  }

  const dataJson: Data = {
    firmwareFamily: setupdataBin.startsWith("24535046") ? "aptio-iv" : "aptio-v",
    menu,
    formSetRoots,
    forms,
    varStores,
    suppressions,
    ifrBinary: analyzeIfrBinary(hexToBytes(files.setupSctContainer.textContent)),
    version,
    hashes: {
      setupTxt: setupTxtHash,
      setupSct: setupSctHash,
      amitseSct: amitseSctHash,
      setupdataBin: setupdataBinHash,
      offsetChecksum: await calculateJsonChecksum(menu, forms, suppressions),
    },
  };

  return Promise.resolve(dataJson);
}
