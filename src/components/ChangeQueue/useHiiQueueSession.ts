import React from "react";
import { loadHiiQueueSession, saveHiiQueueSession } from "../scripts/hiiQueueSession";
import type { DataChangeQueueController } from "./useDataChangeQueue";
import type { QueueSessionAdapter } from "./QueueSessionControls";

export function useHiiQueueSession(
  queue: DataChangeQueueController,
  sourceBytes: Uint8Array | undefined,
  originalSetupSct: string,
  ownershipKey: string,
  owner: object,
): QueueSessionAdapter | undefined {
  const context = React.useMemo(
    () => ({
      owner,
      sourceBytes,
      originalSetupSct,
      ownershipKey,
      base: queue.baseData,
      entries: queue.entries,
      revision: queue.revision,
    }),
    [
      sourceBytes,
      originalSetupSct,
      ownershipKey,
      owner,
      queue.baseData,
      queue.entries,
      queue.revision,
    ],
  );
  if (!context.sourceBytes?.length) return undefined;
  const input = { ...context, sourceBytes: context.sourceBytes };
  return {
    context,
    description: "AMI/HII queue session · individual Ref moves only.",
    save: () => saveHiiQueueSession(input, context.entries),
    load: async (text) => {
      const restored = await loadHiiQueueSession(text, input);
      return () => {
        queue.restoreEntries(restored);
      };
    },
  };
}
