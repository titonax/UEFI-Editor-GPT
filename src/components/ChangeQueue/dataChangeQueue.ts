import type { ChangeQueueAnalysis, ChangeQueueEntry } from "../scripts/changeQueue";
import type { Data } from "../scripts/types";

type DataPathPart = string | number;

export interface DataValuePatch {
  path: DataPathPart[];
  expectedExists: boolean;
  expected?: unknown;
  replacementExists: boolean;
  replacement?: unknown;
}

export interface DataChangePayload {
  patches: DataValuePatch[];
}

export interface DataQueueProjection {
  data: Data;
  analysis: ChangeQueueAnalysis<DataChangePayload>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: object, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => equal(value, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key) => hasOwn(right, key) && equal(left[key], right[key]))
    );
  }
  return false;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function diffValues(
  before: unknown,
  after: unknown,
  path: DataPathPart[],
  patches: DataValuePatch[],
) {
  if (equal(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    for (let index = 0; index < before.length; index += 1) {
      diffValues(before[index], after[index], [...path, index], patches);
    }
    return;
  }
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const beforeExists = hasOwn(before, key);
      const afterExists = hasOwn(after, key);
      if (!beforeExists || !afterExists) {
        patches.push({
          path: [...path, key],
          expectedExists: beforeExists,
          expected: beforeExists ? clone(before[key]) : undefined,
          replacementExists: afterExists,
          replacement: afterExists ? clone(after[key]) : undefined,
        });
      } else {
        diffValues(before[key], after[key], [...path, key], patches);
      }
    }
    return;
  }
  patches.push({
    path,
    expectedExists: true,
    expected: clone(before),
    replacementExists: true,
    replacement: clone(after),
  });
}

export function diffData(before: Data, after: Data): DataValuePatch[] {
  const patches: DataValuePatch[] = [];
  diffValues(before, after, [], patches);
  return patches;
}

function pathLabel(path: DataPathPart[]) {
  return path.map(String).join(".");
}

function readPath(root: unknown, path: DataPathPart[]) {
  let current = root;
  for (const part of path) {
    if (!isObject(current) || !hasOwn(current, part)) {
      return { exists: false, value: undefined };
    }
    current = current[part as keyof typeof current];
  }
  return { exists: true, value: current };
}

function writePath(root: unknown, patch: DataValuePatch) {
  if (patch.path.length === 0) {
    throw new Error("A queued data operation cannot replace the editor root.");
  }
  let parent = root;
  for (const part of patch.path.slice(0, -1)) {
    if (!isObject(parent) || !hasOwn(parent, part)) {
      throw new Error(`The queued path ${pathLabel(patch.path)} no longer exists.`);
    }
    parent = parent[part as keyof typeof parent];
  }
  if (!isObject(parent)) {
    throw new Error(`The queued path ${pathLabel(patch.path)} has no parent.`);
  }
  const key = patch.path[patch.path.length - 1];
  if (key === undefined) throw new Error("The queued path is empty.");
  if (patch.replacementExists) {
    parent[key] = clone(patch.replacement);
  } else if (Array.isArray(parent) && typeof key === "number") {
    parent.splice(key, 1);
  } else {
    Reflect.deleteProperty(parent, key);
  }
}

function operationDescription(patches: DataValuePatch[], after: Data) {
  const paths = patches.map((patch) => pathLabel(patch.path));
  if (paths.some((path) => path.startsWith("rootVisibilityEdits"))) {
    const edit = after.rootVisibilityEdits?.[after.rootVisibilityEdits.length - 1];
    return {
      operation: "Visibility",
      title: edit?.description ?? "AMI root visibility",
    };
  }
  if (paths.some((path) => path.startsWith("ifrEdits"))) {
    const edit = after.ifrEdits?.[after.ifrEdits.length - 1];
    return {
      operation: "Structure",
      title: edit?.description ?? "HII menu structure",
    };
  }
  if (paths.some((path) => path.startsWith("uefiHiiVisibilityEdits"))) {
    return { operation: "Visibility", title: "UEFI HII menu visibility" };
  }
  if (paths.some((path) => path.startsWith("suppressions"))) {
    const activePatch = patches.find(
      (patch) =>
        patch.path[0] === "suppressions" &&
        typeof patch.path[1] === "number" &&
        patch.path[2] === "active",
    );
    const index = activePatch?.path[1];
    const condition = typeof index === "number" ? after.suppressions[index] : undefined;
    return {
      operation: "Visibility",
      title: condition
        ? `${condition.active ? "Restore" : "Show content guarded by"} SuppressIf ${condition.offset}`
        : "HII suppression state",
    };
  }
  const questionPatch = patches.find((patch) =>
    /^forms\.\d+\.children\.\d+\.(accessLevel|failsafe|optimal)$/.test(
      pathLabel(patch.path),
    ),
  );
  if (questionPatch) {
    const formIndex = questionPatch.path[1];
    const childIndex = questionPatch.path[3];
    const field = questionPatch.path[4];
    const child =
      typeof formIndex === "number" && typeof childIndex === "number"
        ? after.forms[formIndex]?.children[childIndex]
        : undefined;
    return {
      operation: "Value",
      title: `${child?.name ?? "Setup question"} · ${String(field)}`,
    };
  }
  if (paths.some((path) => path.startsWith("menu"))) {
    return { operation: "Navigation", title: "AMI root menu mapping" };
  }
  return { operation: "Edit", title: "Firmware editor state" };
}

export function createDataChangeEntry(
  before: Data,
  after: Data,
  id: string,
): ChangeQueueEntry<DataChangePayload> | null {
  const patches = diffData(before, after);
  if (patches.length === 0) return null;
  const description = operationDescription(patches, after);
  return {
    id,
    family: after.firmwareFamily,
    operation: description.operation,
    targetKey: patches
      .map((patch) => pathLabel(patch.path))
      .sort()
      .join("|"),
    title: description.title,
    description: `${String(patches.length)} validated logical field change(s)`,
    enabled: true,
    patches: [],
    payload: { patches },
  };
}

function samePath(left: DataPathPart[], right: DataPathPart[]) {
  return (
    left.length === right.length && left.every((part, index) => part === right[index])
  );
}

export function appendDataChangeEntry(
  entries: ChangeQueueEntry<DataChangePayload>[],
  next: ChangeQueueEntry<DataChangePayload>,
) {
  const previous = entries[entries.length - 1];
  if (
    !previous?.enabled ||
    previous.payload.patches.length !== next.payload.patches.length
  ) {
    return [...entries, next];
  }
  const merged: DataValuePatch[] = [];
  for (const before of previous.payload.patches) {
    const after = next.payload.patches.find((patch) =>
      samePath(patch.path, before.path),
    );
    if (!after) return [...entries, next];
    if (
      before.replacementExists !== after.expectedExists ||
      (after.expectedExists && !equal(before.replacement, after.expected))
    ) {
      return [...entries, next];
    }
    merged.push({
      path: after.path,
      expectedExists: before.expectedExists,
      expected: clone(before.expected),
      replacementExists: after.replacementExists,
      replacement: clone(after.replacement),
    });
  }
  const effective = merged.filter(
    (patch) =>
      patch.expectedExists !== patch.replacementExists ||
      !equal(patch.expected, patch.replacement),
  );
  if (effective.length === 0) return entries.slice(0, -1);
  return [
    ...entries.slice(0, -1),
    {
      ...next,
      description: `${String(effective.length)} validated logical field change(s)`,
      payload: { patches: effective },
    },
  ];
}

export function projectDataChangeQueue(
  base: Data,
  entries: ChangeQueueEntry<DataChangePayload>[],
): DataQueueProjection {
  const data = clone(base);
  const selectedEntries = entries.filter((entry) => entry.enabled);
  const issues: ChangeQueueAnalysis<DataChangePayload>["issues"] = [];
  let logicalPatchCount = 0;

  for (const entry of selectedEntries) {
    let coherent = true;
    for (const patch of entry.payload.patches) {
      const current = readPath(data, patch.path);
      if (
        current.exists !== patch.expectedExists ||
        (current.exists && !equal(current.value, patch.expected))
      ) {
        coherent = false;
        issues.push({
          severity: "error",
          code: "stale-logical-state",
          message: `${entry.title} expects a different value at ${pathLabel(patch.path)}. It depends on a removed, paused or reordered operation.`,
          entryIds: [entry.id],
        });
        break;
      }
    }
    if (!coherent) continue;
    for (const patch of entry.payload.patches) writePath(data, patch);
    logicalPatchCount += entry.payload.patches.length;
  }

  const netPatches = diffData(base, data);
  if (selectedEntries.length > 0 && netPatches.length === 0) {
    issues.push({
      severity: "warning",
      code: "no-net-change",
      message:
        "The selected operations cancel each other; applying them would leave the firmware plan unchanged.",
      entryIds: selectedEntries.map((entry) => entry.id),
    });
  }
  const fingerprint = selectedEntries.map((entry) => entry.id).join(";");
  return {
    data,
    analysis: {
      selectedEntries,
      patches: [],
      issues,
      fingerprint,
      canApply:
        selectedEntries.length > 0 &&
        netPatches.length > 0 &&
        !issues.some((issue) => issue.severity === "error"),
      stats: {
        selectedChanges: selectedEntries.length,
        patchSpans: netPatches.length,
        changedBytes: netPatches.length,
        buffers: 0,
        deduplicatedSpans: Math.max(0, logicalPatchCount - netPatches.length),
      },
    },
  };
}
