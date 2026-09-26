export interface PlannedBinaryPatch {
  bufferId: string;
  offset: number;
  expected: Uint8Array;
  replacement: Uint8Array;
}

export interface ChangeQueueEntry<TPayload = unknown> {
  id: string;
  family: string;
  operation: string;
  targetKey: string;
  title: string;
  description: string;
  enabled: boolean;
  patches: PlannedBinaryPatch[];
  payload: TPayload;
  dependsOn?: string[];
  conflictsWith?: string[];
}

export interface ChangeQueueIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  entryIds: string[];
}

export interface ChangeQueueAnalysis<TPayload = unknown> {
  selectedEntries: ChangeQueueEntry<TPayload>[];
  patches: PlannedBinaryPatch[];
  issues: ChangeQueueIssue[];
  fingerprint: string;
  canApply: boolean;
  stats: {
    selectedChanges: number;
    patchSpans: number;
    changedBytes: number;
    buffers: number;
    deduplicatedSpans: number;
  };
}

export type ChangeQueueBuffers = Readonly<Record<string, Uint8Array>>;

function bytesKey(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function patchKey(patch: PlannedBinaryPatch) {
  return [
    patch.bufferId,
    String(patch.offset),
    bytesKey(patch.expected),
    bytesKey(patch.replacement),
  ].join(":");
}

function entryFingerprint(entry: ChangeQueueEntry) {
  return [entry.id, ...entry.patches.map(patchKey)].join("|");
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

export function toggleChangeQueueEntry<TPayload>(
  entries: ChangeQueueEntry<TPayload>[],
  entry: ChangeQueueEntry<TPayload>,
) {
  const exists = entries.some((candidate) => candidate.id === entry.id);
  return exists
    ? entries.filter((candidate) => candidate.id !== entry.id)
    : [...entries, entry];
}

export function setChangeQueueEntryEnabled<TPayload>(
  entries: ChangeQueueEntry<TPayload>[],
  id: string,
  enabled: boolean,
) {
  return entries.map((entry) => (entry.id === id ? { ...entry, enabled } : entry));
}

export function analyzeChangeQueue<TPayload>(
  entries: ChangeQueueEntry<TPayload>[],
  buffers: ChangeQueueBuffers,
): ChangeQueueAnalysis<TPayload> {
  const issues: ChangeQueueIssue[] = [];
  const allIds = new Set<string>();
  for (const entry of entries) {
    if (allIds.has(entry.id)) {
      issues.push({
        severity: "error",
        code: "duplicate-entry-id",
        message: `The queue contains the operation ${entry.id} more than once.`,
        entryIds: [entry.id],
      });
    }
    allIds.add(entry.id);
  }

  const selectedEntries = entries.filter((entry) => entry.enabled);
  const selectedIds = new Set(selectedEntries.map((entry) => entry.id));
  for (const entry of selectedEntries) {
    const missingDependencies = (entry.dependsOn ?? []).filter(
      (dependency) => !selectedIds.has(dependency),
    );
    if (missingDependencies.length > 0) {
      issues.push({
        severity: "error",
        code: "missing-dependency",
        message: `${entry.title} requires ${missingDependencies.join(", ")}.`,
        entryIds: [entry.id, ...missingDependencies],
      });
    }
    const activeConflicts = (entry.conflictsWith ?? []).filter((conflict) =>
      selectedIds.has(conflict),
    );
    if (activeConflicts.length > 0) {
      issues.push({
        severity: "error",
        code: "declared-conflict",
        message: `${entry.title} conflicts with ${activeConflicts.join(", ")}.`,
        entryIds: [entry.id, ...activeConflicts],
      });
    }
  }

  const uniquePatches = new Map<string, PlannedBinaryPatch>();
  const patchOwners = new Map<string, string[]>();
  const occupiedBytes = new Map<
    string,
    { expected: number; replacement: number; entryId: string }
  >();
  let totalSpans = 0;

  for (const entry of selectedEntries) {
    for (const patch of entry.patches) {
      totalSpans += 1;
      const source = buffers[patch.bufferId];
      if (!source) {
        issues.push({
          severity: "error",
          code: "missing-buffer",
          message: `${entry.title} targets an unavailable buffer (${patch.bufferId}).`,
          entryIds: [entry.id],
        });
        continue;
      }
      if (
        patch.offset < 0 ||
        !Number.isSafeInteger(patch.offset) ||
        patch.expected.length === 0 ||
        patch.expected.length !== patch.replacement.length ||
        patch.offset + patch.expected.length > source.length
      ) {
        issues.push({
          severity: "error",
          code: "invalid-patch-range",
          message: `${entry.title} has an invalid or length-changing binary patch.`,
          entryIds: [entry.id],
        });
        continue;
      }
      const actual = source.subarray(
        patch.offset,
        patch.offset + patch.expected.length,
      );
      if (!bytesEqual(actual, patch.expected)) {
        issues.push({
          severity: "error",
          code: "stale-source",
          message: `${entry.title} no longer matches the source bytes at 0x${patch.offset.toString(16).toUpperCase()}.`,
          entryIds: [entry.id],
        });
      }

      const key = patchKey(patch);
      if (!uniquePatches.has(key)) uniquePatches.set(key, patch);
      patchOwners.set(key, [...(patchOwners.get(key) ?? []), entry.id]);

      patch.expected.forEach((expected, index) => {
        const byteKey = `${patch.bufferId}:${String(patch.offset + index)}`;
        const occupied = occupiedBytes.get(byteKey);
        const replacement = patch.replacement[index];
        if (
          occupied &&
          (occupied.expected !== expected || occupied.replacement !== replacement)
        ) {
          issues.push({
            severity: "error",
            code: "overlapping-patches",
            message: `${entry.title} overlaps another operation with incompatible bytes at 0x${(patch.offset + index).toString(16).toUpperCase()}.`,
            entryIds: [occupied.entryId, entry.id],
          });
        } else if (!occupied) {
          occupiedBytes.set(byteKey, { expected, replacement, entryId: entry.id });
        }
      });
    }
  }

  for (const [key, owners] of patchOwners) {
    if (owners.length > 1) {
      const patch = uniquePatches.get(key);
      issues.push({
        severity: "warning",
        code: "deduplicated-patch",
        message: `${String(owners.length)} operations share the same patch at 0x${patch?.offset.toString(16).toUpperCase() ?? "?"}; it will be written once.`,
        entryIds: owners,
      });
    }
  }

  const patches = [...uniquePatches.values()].sort(
    (left, right) =>
      left.bufferId.localeCompare(right.bufferId) || left.offset - right.offset,
  );
  const fingerprint = selectedEntries.map(entryFingerprint).sort().join(";");
  const changedBytes = new Set(
    patches.flatMap((patch) =>
      Array.from(
        { length: patch.replacement.length },
        (_, index) => `${patch.bufferId}:${String(patch.offset + index)}`,
      ),
    ),
  ).size;
  return {
    selectedEntries,
    patches,
    issues,
    fingerprint,
    canApply:
      selectedEntries.length > 0 && !issues.some((issue) => issue.severity === "error"),
    stats: {
      selectedChanges: selectedEntries.length,
      patchSpans: patches.length,
      changedBytes,
      buffers: new Set(patches.map((patch) => patch.bufferId)).size,
      deduplicatedSpans: totalSpans - patches.length,
    },
  };
}

export function applyAnalyzedChangeQueue(
  analysis: ChangeQueueAnalysis,
  buffers: ChangeQueueBuffers,
) {
  if (!analysis.canApply)
    throw new Error("The change queue has not passed validation.");
  const output: Record<string, Uint8Array> = {};
  for (const [bufferId, source] of Object.entries(buffers)) {
    output[bufferId] = new Uint8Array(source);
  }
  for (const patch of analysis.patches) {
    output[patch.bufferId]?.set(patch.replacement, patch.offset);
  }
  return output;
}
