import React from "react";
import { loadHiiQueueSession, saveHiiQueueSession } from "../scripts/hiiQueueSession";
import type { DataChangeQueueController } from "./useDataChangeQueue";
import type { QueueSessionAdapter } from "./QueueSessionControls";
import type { FirmwareProvenanceGraph } from "../scripts/firmwareProvenance";

export function useHiiQueueSession(
  queue: DataChangeQueueController,
  sourceBytes: Uint8Array | undefined,
  originalSetupSct: string,
  ownershipKey: string,
  owner: object,
  originalSetupData?: string,
  provenance?: FirmwareProvenanceGraph,
  originalAmitse?: string,
): QueueSessionAdapter | undefined {
  const context = React.useMemo(
    () => ({
      owner,
      originalSetupData,
      provenance,
      originalAmitse,
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
      originalSetupData,
      provenance,
      originalAmitse,
      queue.baseData,
      queue.entries,
      queue.revision,
    ],
  );
  if (!context.sourceBytes?.length) return undefined;
  const input = { ...context, sourceBytes: context.sourceBytes };
  return {
    context,
    description:
      "Queue session · Ref moves, supported menu Hide/Show, suppression overrides, mapped AMI values, proven AMI roots and AMITSE menu reassignment.",
    save: () => saveHiiQueueSession(input, context.entries),
    load: async (text) => {
      const restored = await loadHiiQueueSession(text, input);
      return () => {
        queue.restoreEntries(restored);
      };
    },
  };
}
