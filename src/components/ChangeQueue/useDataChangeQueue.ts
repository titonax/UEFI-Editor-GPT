import React from "react";
import { produce, type Draft } from "immer";
import type { Updater } from "use-immer";
import {
  moveChangeQueueEntry,
  setChangeQueueEntryEnabled,
  type ChangeQueueEntry,
} from "../scripts/changeQueue";
import type { Data } from "../scripts/types";
import {
  appendDataChangeEntry,
  createDataChangeEntry,
  projectDataChangeQueue,
  type DataChangePayload,
} from "./dataChangeQueue";

import { useChangeQueueHistory } from "./useChangeQueueHistory";

import { dataQueueComparison, type QueueComparison } from "./queueComparison";

export interface DataChangeQueueController {
  baseData: Data;
  entries: ChangeQueueEntry<DataChangePayload>[];
  previewData: Data;
  comparison: QueueComparison;
  appliedData: Data;
  analysis: ReturnType<typeof projectDataChangeQueue>["analysis"];
  appliedFingerprint: string | null;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  enqueueData: Updater<Data>;
  replaceBase: (data: Data) => void;
  restoreEntries: (entries: ChangeQueueEntry<DataChangePayload>[]) => void;
  toggleEnabled: (id: string, enabled: boolean) => void;
  remove: (id: string) => void;
  move: (id: string, direction: -1 | 1) => void;
  clear: () => void;
  apply: () => void;
}

export function useDataChangeQueue(initialData: Data): DataChangeQueueController {
  const [base, setBase] = React.useState(() => structuredClone(initialData));
  const history = useChangeQueueHistory<DataChangePayload>(base);
  const {
    entries,
    appliedFingerprint,
    update: setEntries,
    apply: markApplied,
  } = history;
  const nextId = React.useRef(1);
  const projection = React.useMemo(
    () => projectDataChangeQueue(base, entries),
    [base, entries],
  );

  const comparison = React.useMemo(
    () => dataQueueComparison(base, projection),
    [base, projection],
  );

  const enqueueData = React.useCallback<Updater<Data>>(
    (update) => {
      const before = projection.data;
      const after =
        typeof update === "function"
          ? produce(before, update as (draft: Draft<Data>) => void)
          : structuredClone(update);
      const entry = createDataChangeEntry(
        before,
        after,
        `firmware-change:${String(nextId.current)}`,
      );
      if (!entry) return;
      nextId.current += 1;
      setEntries((current) => appendDataChangeEntry(current, entry));
    },
    [projection.data, setEntries],
  );

  const replaceBase = React.useCallback((data: Data) => {
    setBase(structuredClone(data));
    nextId.current = 1;
  }, []);
  const restoreEntries = React.useCallback(
    (restored: ChangeQueueEntry<DataChangePayload>[]) => {
      setEntries(() => restored);
    },
    [setEntries],
  );
  const toggleEnabled = React.useCallback(
    (id: string, enabled: boolean) => {
      setEntries((current) => setChangeQueueEntryEnabled(current, id, enabled));
    },
    [setEntries],
  );
  const remove = React.useCallback(
    (id: string) => {
      setEntries((current) => current.filter((entry) => entry.id !== id));
    },
    [setEntries],
  );
  const move = React.useCallback(
    (id: string, direction: -1 | 1) => {
      setEntries((current) => moveChangeQueueEntry(current, id, direction));
    },
    [setEntries],
  );
  const apply = React.useCallback(() => {
    if (projection.analysis.canApply) markApplied(projection.analysis.fingerprint);
  }, [projection.analysis, markApplied]);
  const applied =
    projection.analysis.canApply &&
    appliedFingerprint === projection.analysis.fingerprint;

  return {
    baseData: base,
    entries,
    previewData: projection.data,
    comparison,
    appliedData: applied ? projection.data : base,
    analysis: projection.analysis,
    appliedFingerprint,
    enqueueData,
    replaceBase,
    restoreEntries,
    toggleEnabled,
    remove,
    move,
    clear: history.clear,
    revision: history.revision,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undo: history.undo,
    redo: history.redo,
    apply,
  };
}
