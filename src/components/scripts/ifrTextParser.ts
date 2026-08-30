import { FirmwareError } from "./errors";
import { determineCondition, enrichConditions } from "./ifrConditions";
import type { FormSetMetadata } from "./menuDiscovery";
import { findVarStoreName, getAdditionalData } from "./setupData";
import type {
  CheckBoxPrompt,
  ConditionKind,
  Form,
  FormChildren,
  Forms,
  Menu,
  NumericPrompt,
  OneOfPrompt,
  RefPrompt,
  Scopes,
  StringPrompt,
  Suppression,
  VarStores,
} from "./types";

export interface ParsedIfrText {
  formSetIds: Set<string>;
  formSetMetadata: Map<string, FormSetMetadata>;
  formSetRoots: Menu;
  forms: Forms;
  varStores: VarStores;
  suppressions: Suppression[];
}

function hasScope(hexString: string) {
  const header = hexString.split(" ")[1];
  return parseInt(header, 16).toString(2).padStart(8, "0").startsWith("1");
}

function formReferenceKey(formId: string, formSetGuid?: string) {
  return `${formSetGuid ?? ""}:${String(parseInt(formId))}`;
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

export function parseIfrText(setupTxt: string, setupData: string): ParsedIfrText {
  const formSetIds = new Set<string>();
  const formSetMetadata = new Map<string, FormSetMetadata>();
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
    const offset = /^(0x[0-9a-f]+):/i.exec(line)?.[1] ?? "";
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
        ifrOffset: offset,
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
      scopes.push({ type: kind, indentations, offset });
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
        ifrOffset: offset,
        targetFormSetGuid,
        ...getAdditionalData(ref[8], setupData, true),
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
        setupData,
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
        setupData,
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
        setupData,
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
        setupData,
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
      currentScope &&
      (currentScope.type === "OneOf" || isConditionKind(currentScope.type))
    ) {
      currentOneOf.options.push({ option: oneOfOption[1], value: oneOfOption[2] });
    }

    if (currentScope) {
      if (defaultId) {
        const oneDefault = { defaultId: defaultId[1], value: defaultId[2] };
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
  for (const form of forms) {
    const referenceKey = formReferenceKey(form.formId, form.formSetGuid);
    if (referenceKey in references) {
      form.referencedIn = [...references[referenceKey]];
    }
  }

  return {
    formSetIds,
    formSetMetadata,
    formSetRoots,
    forms,
    varStores,
    suppressions,
  };
}
