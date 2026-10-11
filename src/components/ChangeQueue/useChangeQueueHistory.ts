import React from "react";
import type { ChangeQueueEntry } from "../scripts/changeQueue";

// Retain entry references, not copies of firmware or projected Data snapshots.
const historyLimit = 50;
interface QueueState<T> {
  source: unknown;
  entries: ChangeQueueEntry<T>[];
  past: ChangeQueueEntry<T>[][];
  future: ChangeQueueEntry<T>[][];
  appliedFingerprint: string | null;
  revision: number;
}
function emptyState<T>(source: unknown, revision = 0): QueueState<T> {
  return {
    source,
    entries: [],
    past: [],
    future: [],
    appliedFingerprint: null,
    revision,
  };
}

export function useChangeQueueHistory<T>(source: unknown) {
  const [state, setState] = React.useState(() => emptyState<T>(source));
  // Reset before children render against a different inventory, including sources
  // with identical bytes. Clear queue remains an undoable operation within a source.
  if (state.source !== source) setState(emptyState<T>(source, state.revision + 1));

  const update = React.useCallback(
    (edit: (entries: ChangeQueueEntry<T>[]) => ChangeQueueEntry<T>[]) => {
      setState((current) => {
        const entries = edit(current.entries);
        if (
          entries.length === current.entries.length &&
          entries.every((entry, index) => entry === current.entries[index])
        )
          return current;
        return {
          ...current,
          entries,
          past: [...current.past, current.entries].slice(-historyLimit),
          future: [],
          appliedFingerprint: null,
          revision: current.revision + 1,
        };
      });
    },
    [],
  );
  const undo = React.useCallback(() => {
    setState((current) => {
      if (!current.past.length) return current;
      return {
        ...current,
        entries: current.past[current.past.length - 1],
        past: current.past.slice(0, -1),
        future: [current.entries, ...current.future],
        appliedFingerprint: null,
        revision: current.revision + 1,
      };
    });
  }, []);
  const redo = React.useCallback(() => {
    setState((current) => {
      if (!current.future.length) return current;
      return {
        ...current,
        entries: current.future[0],
        past: [...current.past, current.entries].slice(-historyLimit),
        future: current.future.slice(1),
        appliedFingerprint: null,
        revision: current.revision + 1,
      };
    });
  }, []);
  const clear = React.useCallback(() => {
    update(() => []);
  }, [update]);
  const apply = React.useCallback((fingerprint: string) => {
    setState((current) => ({ ...current, appliedFingerprint: fingerprint }));
  }, []);
  return {
    entries: state.entries,
    appliedFingerprint: state.appliedFingerprint,
    revision: state.revision,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    update,
    undo,
    redo,
    clear,
    apply,
  };
}
