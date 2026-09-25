import type { PhoenixSetupItem } from "../phoenixSetupTable";
import type { BehaviorTrace } from "./types";
import { analyzeX86RealModeControlFlow } from "./x86ControlFlow";
import { createX86RealModeDecoder } from "./x86RealModeDecoder";

export type PhoenixCallbackAnalysis =
  | { status: "not-applicable"; reason: string }
  | { status: "analyzed"; trace: BehaviorTrace };

export async function analyzePhoenixSetupCallback(
  templat: Uint8Array,
  item: PhoenixSetupItem,
): Promise<PhoenixCallbackAnalysis> {
  if (!item.visibilityPatch) {
    return {
      status: "not-applicable",
      reason: "This item has no structurally verified visibility callback.",
    };
  }
  const decoder = await createX86RealModeDecoder();
  try {
    return {
      status: "analyzed",
      trace: analyzeX86RealModeControlFlow(
        templat,
        item.visibilityPatch.callbackOffset,
        decoder,
      ),
    };
  } finally {
    decoder.close();
  }
}
