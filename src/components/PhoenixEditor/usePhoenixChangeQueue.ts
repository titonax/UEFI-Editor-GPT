import React from "react";
import {
  analyzeChangeQueue,
  moveChangeQueueEntry,
  setChangeQueueEntryEnabled,
  toggleChangeQueueEntry,
  type ChangeQueueEntry,
} from "../scripts/changeQueue";
import {
  phoenixShowChange,
  phoenixTemplatBufferId,
  type PhoenixVisibilityPayload,
} from "../scripts/phoenixChangeQueue";
import type { PhoenixSetupInventory } from "../scripts/phoenixSetupMenu";
import type { PhoenixSetupItem } from "../scripts/phoenixSetupTable";

export function usePhoenixChangeQueue(inventory: PhoenixSetupInventory | null) {
  const [entries, setEntries] = React.useState<
    ChangeQueueEntry<PhoenixVisibilityPayload>[]
  >([]);
  const [appliedFingerprint, setAppliedFingerprint] = React.useState<string | null>(
    null,
  );
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

  const invalidate = React.useCallback(() => {
    setAppliedFingerprint(null);
  }, []);
  const toggleItem = React.useCallback(
    (item: PhoenixSetupItem) => {
      setEntries((current) => toggleChangeQueueEntry(current, phoenixShowChange(item)));
      invalidate();
    },
    [invalidate],
  );
  const toggleEnabled = React.useCallback(
    (id: string, enabled: boolean) => {
      setEntries((current) => setChangeQueueEntryEnabled(current, id, enabled));
      invalidate();
    },
    [invalidate],
  );
  const remove = React.useCallback(
    (id: string) => {
      setEntries((current) => current.filter((entry) => entry.id !== id));
      invalidate();
    },
    [invalidate],
  );
  const move = React.useCallback((id: string, direction: -1 | 1) => {
    setEntries((current) => moveChangeQueueEntry(current, id, direction));
    setAppliedFingerprint(null);
  }, []);
  const clear = React.useCallback(() => {
    setEntries([]);
    setAppliedFingerprint(null);
  }, []);
  const apply = React.useCallback(() => {
    if (analysis.canApply) setAppliedFingerprint(analysis.fingerprint);
  }, [analysis]);

  return {
    entries,
    analysis,
    appliedFingerprint,
    appliedItems,
    toggleItem,
    toggleEnabled,
    remove,
    move,
    clear,
    apply,
  };
}
