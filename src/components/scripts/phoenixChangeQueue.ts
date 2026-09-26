import type { ChangeQueueEntry } from "./changeQueue";
import type { PhoenixSetupItem } from "./phoenixSetupTable";

export const phoenixTemplatBufferId = "phoenix:TEMPLAT00.ROM";

export interface PhoenixVisibilityPayload {
  itemOffset: number;
}

function itemLabel(item: PhoenixSetupItem) {
  const normalized = item.prompt?.replace(/\r/g, " ").trim();
  return normalized && normalized.length > 0
    ? normalized
    : `Item 0x${item.offset.toString(16).toUpperCase()}`;
}

export function phoenixShowChange(
  item: PhoenixSetupItem,
): ChangeQueueEntry<PhoenixVisibilityPayload> {
  if (!item.visibilityPatch || item.visibilityPatch.hiddenImmediate === 0) {
    throw new Error("This Phoenix item has no verified hidden callback to neutralize.");
  }
  const { hidePatchOffset, hiddenImmediate } = item.visibilityPatch;
  return {
    id: `phoenix:show:${item.offset.toString(16)}`,
    family: "phoenix-legacy",
    operation: "Show",
    targetKey: `item:${item.offset.toString(16)}`,
    title: itemLabel(item),
    description: `Force visible · callback immediate 0x${hiddenImmediate.toString(16).padStart(4, "0").toUpperCase()} → 0x0000`,
    enabled: true,
    patches: [
      {
        bufferId: phoenixTemplatBufferId,
        offset: hidePatchOffset + 1,
        expected: new Uint8Array([hiddenImmediate & 0xff, hiddenImmediate >>> 8]),
        replacement: new Uint8Array([0, 0]),
      },
    ],
    payload: { itemOffset: item.offset },
  };
}
