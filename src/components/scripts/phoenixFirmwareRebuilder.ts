import { FirmwareError } from "./errors";
import {
  findNamedPhoenixModule,
  inspectPhoenixLegacyBytes,
  type PhoenixModule,
} from "./phoenixFirmware";
import { replacePhoenixFfvLh5Payload } from "./phoenixFfvRebuilder";
import { phoenixLh5Codec } from "./phoenixLh5";
import {
  inspectPhoenixSetupMenu,
  type PhoenixSetupInventory,
} from "./phoenixSetupMenu";
import { forceItemsVisible, type PhoenixSetupItem } from "./phoenixSetupTable";

export interface PhoenixFirmwareBuildResult {
  image: Uint8Array;
  compressedSize: number;
  allocationSize: number;
  changedOffset: number;
  changedLength: number;
  verifiedItemCount: number;
}

function locateTemplatModule(source: Uint8Array): PhoenixModule | null {
  const legacy = inspectPhoenixLegacyBytes(source);
  return (
    legacy?.modules.find(
      (module) =>
        /^TEMPLAT\d+\.ROM$/i.test(module.name) && module.compression === "lh5",
    ) ?? findNamedPhoenixModule(source, "TEMPLAT0.ROM")
  );
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return (
    left.length === right.length && left.every((byte, index) => byte === right[index])
  );
}

function verifyUnchangedOutsideAllocation(
  source: Uint8Array,
  rebuilt: Uint8Array,
  changedOffset: number,
  changedLength: number,
) {
  return (
    source.length === rebuilt.length &&
    equalBytes(source.subarray(0, changedOffset), rebuilt.subarray(0, changedOffset)) &&
    equalBytes(
      source.subarray(changedOffset + changedLength),
      rebuilt.subarray(changedOffset + changedLength),
    )
  );
}

/**
 * Builds and then independently re-opens a complete Phoenix firmware image.
 * Only the existing TEMPLAT LH5 payload allocation may change; module, section
 * and outer-image boundaries remain byte-for-byte identical.
 */
export async function rebuildPhoenixFirmware(
  source: Uint8Array,
  inventory: PhoenixSetupInventory,
  forcedVisibleItems: PhoenixSetupItem[],
): Promise<PhoenixFirmwareBuildResult> {
  if (forcedVisibleItems.length === 0) {
    throw new FirmwareError("INVALID_INPUT", "No applied Phoenix changes to build.");
  }
  const module = locateTemplatModule(source);
  if (!module) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The compressed Phoenix TEMPLAT module can no longer be located.",
    );
  }

  const modifiedTemplat = forceItemsVisible(inventory.templat, forcedVisibleItems);
  const replacement = await replacePhoenixFfvLh5Payload(
    source,
    module,
    modifiedTemplat,
    phoenixLh5Codec,
  );
  if (
    !verifyUnchangedOutsideAllocation(
      source,
      replacement.image,
      replacement.changedOffset,
      replacement.changedLength,
    )
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Phoenix reconstruction changed bytes outside the TEMPLAT allocation.",
    );
  }

  const reopened = await inspectPhoenixSetupMenu(replacement.image);
  if (!reopened) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The rebuilt image did not yield a readable Phoenix Setup menu.",
    );
  }
  const reopenedItems = new Map(
    reopened.menu.sections
      .flatMap((section) => section.items)
      .map((item) => [item.offset, item]),
  );
  for (const applied of forcedVisibleItems) {
    const verified = reopenedItems.get(applied.offset);
    if (!verified || verified.visibilityPatch?.hiddenImmediate !== 0) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `Phoenix item at 0x${applied.offset.toString(16)} was not visible after re-opening the rebuilt image.`,
      );
    }
  }

  return {
    ...replacement,
    verifiedItemCount: forcedVisibleItems.length,
  };
}

export function phoenixModifiedFileName(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0
    ? `${fileName.slice(0, dot)}-modified${fileName.slice(dot)}`
    : `${fileName}-modified.bin`;
}
