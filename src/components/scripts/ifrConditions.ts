import { FirmwareError } from "./errors";
import type { FormChildren, Forms, Suppression, VarStores } from "./types";

export interface ParsedCondition {
  start: string;
  expression: string;
  questionIds: string[];
  varStoreIds: string[];
  constant: boolean | null;
}

function hasScope(hexString: string): boolean {
  const header = hexString.split(" ")[1];
  return (
    header !== undefined &&
    Number.parseInt(header, 16).toString(2).padStart(8, "0").startsWith("1")
  );
}

function readableExpressionLine(line: string): string {
  return line
    .replace(/^0x[0-9A-F]+:\s*/i, "")
    .replace(/\s*\{ [0-9A-F ]+ \}\s*$/i, "")
    .trim();
}

function expressionMetadata(expression: string) {
  return {
    questionIds: [
      ...expression.matchAll(
        /\b(?:QuestionId(?:1|2)?|OtherQuestionId):\s*(0x[0-9A-F]+)/gi,
      ),
    ].map((match) => match[1]),
    varStoreIds: [...expression.matchAll(/\bVarStoreId:\s*(0x[0-9A-F]+)/gi)].map(
      (match) => match[1],
    ),
  };
}

function humanizeExpression(expression: string): string {
  const operators: Record<string, string> = {
    And: "AND",
    Or: "OR",
    Not: "NOT",
    Equal: "==",
    NotEqual: "!=",
    GreaterThan: ">",
    GreaterEqual: ">=",
    LessThan: "<",
    LessEqual: "<=",
  };

  return expression
    .split(" → ")
    .map((part) => {
      const eqValue = /^EqIdVal\s+QuestionId:\s*(.+?),\s*Value:\s*(\S+)$/i.exec(part);
      if (eqValue) return `${eqValue[1]} == ${eqValue[2]}`;

      const eqQuestion =
        /^EqIdId\s+QuestionId:\s*(.+?),\s*OtherQuestionId:\s*(.+)$/i.exec(part);
      if (eqQuestion) return `${eqQuestion[1]} == ${eqQuestion[2]}`;

      const inList = /^EqIdValList\s+QuestionId:\s*(.+?),\s*Values:\s*(.+)$/i.exec(
        part,
      );
      if (inList) return `${inList[1]} is one of ${inList[2]}`;

      return operators[part] ?? part;
    })
    .join(" → ");
}

function offsetAt(lines: string[], index: number): string {
  const line = lines[index];
  const offset = line?.split(" ")[0]?.slice(0, -1);
  if (!offset) {
    throw new FirmwareError(
      "PARSE_FAILED",
      `IFR condition near line ${String(index + 1)} has no closing offset.`,
    );
  }
  return offset;
}

export function determineCondition(lines: string[], index: number): ParsedCondition {
  const expressionLine = lines[index + 1];
  const opcode = expressionLine ? /\{ (.*) \}/.exec(expressionLine)?.[1] : undefined;
  if (!expressionLine || !opcode) {
    throw new FirmwareError(
      "PARSE_FAILED",
      `IFR condition near line ${String(index + 1)} is truncated.`,
    );
  }

  if (!hasScope(opcode)) {
    const expression = readableExpressionLine(expressionLine);
    return {
      start: offsetAt(lines, index + 2),
      expression,
      ...expressionMetadata(expression),
      constant: /^(True)(?:\s|$)/i.test(expression)
        ? true
        : /^(False)(?:\s|$)/i.test(expression)
          ? false
          : null,
    };
  }

  let openScopes = 1;
  let currentIndex = index + 2;
  while (openScopes !== 0) {
    const line = lines[currentIndex];
    if (line === undefined) {
      throw new FirmwareError(
        "PARSE_FAILED",
        `IFR condition near line ${String(index + 1)} is not closed.`,
      );
    }
    const anyOpcode = /\{ (.*) \}/.exec(line);
    if (anyOpcode?.[1] && hasScope(anyOpcode[1])) openScopes++;
    if (line.includes("{ 29 02 }")) openScopes--;
    currentIndex++;
  }

  const expression = lines
    .slice(index + 1, currentIndex)
    .map(readableExpressionLine)
    .filter((line) => line.length > 0 && !/^End(?:\s|$)/i.test(line))
    .join(" → ");
  return {
    start: offsetAt(lines, currentIndex),
    expression,
    ...expressionMetadata(expression),
    constant: /^(True)(?:\s|$)/i.test(expression)
      ? true
      : /^(False)(?:\s|$)/i.test(expression)
        ? false
        : null,
  };
}

export function enrichConditions(
  forms: Forms,
  varStores: VarStores,
  conditions: Suppression[],
): void {
  const prompts = new Map<string, FormChildren>();
  for (const form of forms) {
    for (const child of form.children) {
      prompts.set(
        `${form.formSetGuid ?? ""}:${String(Number.parseInt(child.questionId))}`,
        child,
      );
    }
  }

  for (const condition of conditions) {
    const referenced = (condition.questionIds ?? [])
      .map((questionId) =>
        prompts.get(
          `${condition.formSetGuid ?? ""}:${String(Number.parseInt(questionId))}`,
        ),
      )
      .filter((child): child is FormChildren => child !== undefined);
    const directVarStores = (condition.varStoreIds ?? []).flatMap((varStoreId) => {
      const varStore = varStores.find(
        (candidate) =>
          candidate.formSetGuid === condition.formSetGuid &&
          Number.parseInt(candidate.varStoreId) === Number.parseInt(varStoreId),
      );
      return varStore ? [{ varStoreId, varStore }] : [];
    });
    const varStoreNames = [
      ...new Set([
        ...referenced
          .map((child) => child.varStoreName)
          .filter((name): name is string => Boolean(name)),
        ...directVarStores.map(({ varStore }) => varStore.name),
      ]),
    ];
    condition.varStoreNames = varStoreNames;
    condition.source = classifySource(condition, varStoreNames);

    for (const child of referenced) {
      const pattern = new RegExp(
        `\\b${child.questionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "gi",
      );
      const offset = "varOffset" in child ? child.varOffset : undefined;
      const literal = child.name.trim()
        ? `“${child.name.trim()}” (${child.questionId})`
        : child.varStoreName
          ? `${child.varStoreName}${offset ? `[${offset}]` : ""} (${child.questionId})`
          : `Unnamed question (${child.questionId})`;
      condition.expression = (condition.expression ?? "").replace(pattern, literal);
    }
    for (const { varStoreId, varStore } of directVarStores) {
      const escaped = varStoreId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      condition.expression = (condition.expression ?? "").replace(
        new RegExp(`\\bVarStoreId:\\s*${escaped}\\b`, "gi"),
        `VarStore: “${varStore.name}” (${varStore.varStoreId})`,
      );
    }
    condition.expression = humanizeExpression(condition.expression ?? "");
  }
}

function classifySource(
  condition: Suppression,
  varStoreNames: string[],
): Suppression["source"] {
  if (condition.constant !== null && condition.constant !== undefined)
    return "constant";
  const names = varStoreNames.map((name) => name.trim().toLowerCase());
  if (names.length === 0) return "unknown";
  if (names.some((name) => ["systemaccess", "secvolatiledata"].includes(name))) {
    return "access";
  }
  if (
    names.some((name) =>
      /^(setupcpufeatures|setupsnbppmfeatures|setupdptffeatures|setupplatformdata|sbplatformdata|nbplatformdata|tdtadvancedsetupdatavar|iccadvancedsetupdatavar|usbmassdevvalid)$/.test(
        name,
      ),
    )
  ) {
    return "hardware";
  }
  if (
    names.some((name) =>
      /^(amitsesetup|amicallback|dynamicpagecount|driverhlthenable|driverhealthcount|drvhealthctrlcnt)$/.test(
        name,
      ),
    )
  ) {
    return "ui";
  }
  if (names.every((name) => name === "setup")) return "setup";
  return "runtime";
}
