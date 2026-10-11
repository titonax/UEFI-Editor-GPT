import type { Data } from "../scripts/types";
import type { ChangeQueueAnalysis } from "../scripts/changeQueue";
import { type DataQueueProjection, type DataValuePatch } from "./dataChangeQueue";

export interface QueueComparisonRow {
  key: string;
  target: string;
  field: string;
  before: string;
  after: string;
}
export interface QueueComparison {
  kind: "logical" | "binary";
  valid: boolean;
  rows: QueueComparisonRow[];
  totalRows: number;
}
const rowLimit = 100;

// Bounded display summaries only: never stringify complete byte buffers or Data.
function summary(value: unknown, depth = 0): string {
  if (value === undefined) return "Not set";
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string")
    return value.length > 160
      ? `${value.slice(0, 160)}… (${String(value.length)} characters)`
      : value;
  if (typeof value === "number") return String(value);
  if (value instanceof Uint8Array)
    return `${String(value.length)} bytes (contents omitted)`;
  if (Array.isArray(value)) {
    if (depth >= 3) return `${String(value.length)} items`;
    const values = value.slice(0, 4).map((item: unknown) => summary(item, depth + 1));
    return `[${values.join("; ")}${value.length > 4 ? `; … ${String(value.length - 4)} more` : ""}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (depth >= 3) return `${String(entries.length)} fields`;
    return `{${entries
      .slice(0, 4)
      .map(([key, item]: [string, unknown]) => `${key}: ${summary(item, depth + 1)}`)
      .join(
        "; ",
      )}${entries.length > 4 ? `; … ${String(entries.length - 4)} more fields` : ""}}`;
  }
  return "Unsupported display value";
}

function dataTarget(base: Data, patch: DataValuePatch) {
  const [section, index, children, childIndex] = patch.path;
  if (section === "forms" && typeof index === "number") {
    const form = base.forms[index];
    if (form) {
      const child =
        children === "children" && typeof childIndex === "number"
          ? form.children[childIndex]
          : undefined;
      return `${child?.name ? `${child.name} · ` : ""}${form.name} (Form ${form.formId}${form.formSetGuid ? ` · ${form.formSetGuid}` : ""}${form.sourceModuleId ? ` · ${form.sourceModuleId}` : ""})`;
    }
  }
  if (section === "suppressions" && typeof index === "number") {
    const condition = base.suppressions[index];
    if (condition) return `${condition.kind ?? "SuppressIf"} ${condition.offset}`;
  }
  return "Editor plan";
}

export function dataQueueComparison(
  base: Data,
  projection: DataQueueProjection,
): QueueComparison {
  const valid = !projection.analysis.issues.some((issue) => issue.severity === "error");
  if (!valid) return { kind: "logical", valid, rows: [], totalRows: 0 };
  const patches = projection.netPatches;
  return {
    kind: "logical",
    valid,
    totalRows: patches.length,
    rows: patches.slice(0, rowLimit).map((patch) => ({
      key: JSON.stringify(patch.path),
      target: dataTarget(base, patch),
      field: patch.path.map(String).join("."),
      before: patch.expectedExists ? summary(patch.expected) : "Not present",
      after: patch.replacementExists ? summary(patch.replacement) : "Not present",
    })),
  };
}

function hexSummary(bytes: Uint8Array) {
  return (
    Array.from(bytes.subarray(0, 16), (value) =>
      value.toString(16).padStart(2, "0").toUpperCase(),
    ).join(" ") + (bytes.length > 16 ? ` … (${String(bytes.length)} bytes)` : "")
  );
}

export function binaryQueueComparison(analysis: ChangeQueueAnalysis): QueueComparison {
  const valid = !analysis.issues.some((issue) => issue.severity === "error");
  if (!valid) return { kind: "binary", valid, rows: [], totalRows: 0 };
  const patches = analysis.patches.filter((patch) =>
    patch.expected.some((value, index) => value !== patch.replacement[index]),
  );
  return {
    kind: "binary",
    valid,
    totalRows: patches.length,
    rows: patches.slice(0, rowLimit).map((patch) => ({
      key: `${patch.bufferId}:${String(patch.offset)}:${String(patch.expected.length)}`,
      target: patch.bufferId,
      field: `0x${patch.offset.toString(16).toUpperCase()} · ${String(patch.expected.length)} bytes`,
      before: hexSummary(patch.expected),
      after: hexSummary(patch.replacement),
    })),
  };
}
