import React from "react";
import {
  analyzeChangeQueue,
  moveChangeQueueEntry,
  setChangeQueueEntryEnabled,
  toggleChangeQueueEntry,
} from "../scripts/changeQueue";
import {
  phoenixShowChange,
  phoenixTemplatBufferId,
  type PhoenixVisibilityPayload,
} from "../scripts/phoenixChangeQueue";
import type { PhoenixSetupInventory } from "../scripts/phoenixSetupMenu";
import type { PhoenixSetupItem } from "../scripts/phoenixSetupTable";

import { useChangeQueueHistory } from "../ChangeQueue/useChangeQueueHistory";

export function usePhoenixChangeQueue(inventory: PhoenixSetupInventory | null) {
  const history = useChangeQueueHistory<PhoenixVisibilityPayload>(inventory);
  const {
    entries,
    appliedFingerprint,
    update: setEntries,
    apply: markApplied,
  } = history;
  const analysis = React.useMemo(
    () =>
      analyzeChangeQueue(entries, {
        [phoenixTemplatBufferId]: inventory?.templat ?? new Uint8Array(),
      }),
    [entries, inventory],
  );
  const planApplied = analysis.canApply && appliedFingerprint === analysis.fingerprint;
  const itemsByOffset = React.useMemo(
    () =>
      new Map(
        (inventory?.menu.sections ?? [])
          .flatMap((section) => section.items)
          .map((item) => [item.offset, item] as const),
      ),
    [inventory],
  );
  const appliedItems = React.useMemo(
    () =>
      planApplied
        ? analysis.selectedEntries.flatMap((entry) => {
            const item = itemsByOffset.get(entry.payload.itemOffset);
            return item ? [item] : [];
          })
        : [],
    [planApplied, analysis.selectedEntries, itemsByOffset],
  );

  const toggleItem = React.useCallback(
    (item: PhoenixSetupItem) => {
      setEntries((current) => toggleChangeQueueEntry(current, phoenixShowChange(item)));
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
    if (analysis.canApply) markApplied(analysis.fingerprint);
  }, [analysis, markApplied]);

  const restoreEntries = React.useCallback(
    (restored: typeof entries) => {
      setEntries(() => restored);
    },
    [setEntries],
  );

  return {
    entries,
    analysis,
    appliedFingerprint,
    appliedItems,
    toggleItem,
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
    restoreEntries,
  };
}
