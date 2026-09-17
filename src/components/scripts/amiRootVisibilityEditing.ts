import { FirmwareError } from "./errors";
import type {
  AmiRootVisibilityEdit,
  AmiRootVisibilityEntry,
  AmiRootVisibilityReport,
  Data,
} from "./types";

type RootVisibilityState = Pick<Data, "rootVisibility" | "rootVisibilityEdits">;
type DetectedRootVisibilityReport = AmiRootVisibilityReport & {
  status: "detected";
  vector: NonNullable<AmiRootVisibilityReport["vector"]>;
};

function sameGuid(left?: string, right?: string) {
  return (left ?? "").toLowerCase() === (right ?? "").toLowerCase();
}

function detectedReport(data: RootVisibilityState): DetectedRootVisibilityReport {
  const report = data.rootVisibility;
  if (report?.status !== "detected" || !report.vector) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Root visibility cannot be changed without a unique code-corroborated vector.",
    );
  }
  return report as DetectedRootVisibilityReport;
}

function editForRoot(edits: AmiRootVisibilityEdit[] | undefined, rootIndex: number) {
  return edits?.find((edit) => edit.rootIndex === rootIndex);
}

export function desiredAmiRootVisibility(
  data: RootVisibilityState,
  entry: AmiRootVisibilityEntry,
): 0 | 1 {
  return (
    editForRoot(data.rootVisibilityEdits, entry.rootIndex)?.replacement ?? entry.value
  );
}

export function toggleAmiRootVisibility(
  data: RootVisibilityState,
  rootIndex: number,
): AmiRootVisibilityEdit[] | undefined {
  const report = detectedReport(data);
  assertAmiRootVisibilityEditsMatch(data.rootVisibilityEdits, report);
  const entry = report.entries.find((candidate) => candidate.rootIndex === rootIndex);
  if (!entry) {
    throw new FirmwareError(
      "PATCH_FAILED",
      `Root visibility entry ${String(rootIndex)} was not found.`,
    );
  }

  const currentDesired = desiredAmiRootVisibility(data, entry);
  const replacement: 0 | 1 = currentDesired === 1 ? 0 : 1;
  const remaining = (data.rootVisibilityEdits ?? []).filter(
    (edit) => edit.rootIndex !== rootIndex,
  );
  if (replacement === entry.value) {
    return remaining.length > 0 ? remaining : undefined;
  }

  const edit: AmiRootVisibilityEdit = {
    kind: "set-root-visibility",
    rootIndex: entry.rootIndex,
    formId: entry.formId,
    formSetGuid: entry.formSetGuid,
    bufferId: report.vector.bufferId,
    bufferOffset: entry.bufferOffset,
    expected: entry.value,
    replacement,
    description: `${replacement === 1 ? "Show" : "Hide"} root FormSet ${entry.name}`,
  };
  return [...remaining, edit].sort((left, right) => left.rootIndex - right.rootIndex);
}

export function assertAmiRootVisibilityEditsMatch(
  edits: AmiRootVisibilityEdit[] | undefined,
  report: AmiRootVisibilityReport | undefined,
): void {
  if (!edits || edits.length === 0) return;
  if (report?.status !== "detected" || !report.vector) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Saved root visibility changes do not have a detected vector in the opened firmware.",
    );
  }

  const seenRoots = new Set<number>();
  for (const edit of edits) {
    if (seenRoots.has(edit.rootIndex)) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        `Saved root visibility changes contain duplicate root ${String(edit.rootIndex)}.`,
      );
    }
    seenRoots.add(edit.rootIndex);

    const entry = report.entries.find(
      (candidate) => candidate.rootIndex === edit.rootIndex,
    );
    if (
      !entry ||
      edit.kind !== "set-root-visibility" ||
      edit.bufferId !== report.vector.bufferId ||
      edit.bufferOffset !== entry.bufferOffset ||
      edit.formId !== entry.formId ||
      !sameGuid(edit.formSetGuid, entry.formSetGuid) ||
      edit.expected !== entry.value ||
      edit.replacement === edit.expected
    ) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        `Saved root visibility change ${String(edit.rootIndex)} does not match the opened firmware.`,
      );
    }
  }
}
