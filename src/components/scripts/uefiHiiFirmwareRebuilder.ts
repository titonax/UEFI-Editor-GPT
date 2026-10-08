import { decodeFirmwareBuffers, inventoryFirmwareFiles } from "./aptioIvExtractor";
import { inspectAmiFirmwareBytes } from "./amiFirmwareImage";
import { FirmwareError } from "./errors";
import { inspectFirmwareImageLayout } from "./firmwareImageContainer";
import {
  assessFirmwareReconstruction,
  type FirmwareProvenanceGraph,
} from "./firmwareProvenance";
import { inventoryUefiHiiModules } from "./uefiHiiDiscovery";
import { buildUefiHiiModulePatches } from "./uefiHiiPatcher";
import type { UefiHiiWorkspace } from "./uefiHiiWorkspace";
import { rebuildUefiImage, type UefiImageBuildResult } from "./uefiImageRebuilder";
import type { Data } from "./types";

export interface UefiHiiFirmwareBuildResult extends UefiImageBuildResult {
  modifiedModuleIds: string[];
  containerKind: "bios-image" | "intel-spi";
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}

/**
 * Internal foundation for vendor-neutral output; not yet connected to download.
 * Re-discovers source ownership instead of trusting serialized workspace metadata.
 * Direct root-image FFS modules only; encapsulated and mirrored modules await
 * separate ownership tests and real-image acceptance.
 */
export async function buildUefiHiiFirmwareImage(
  data: Data,
  workspace: UefiHiiWorkspace,
  sourceImage: Uint8Array,
): Promise<UefiHiiFirmwareBuildResult> {
  if (data.firmwareFamily !== "uefi-hii" || data.rootVisibilityEdits?.length) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Only vendor-neutral HII edits are supported.",
    );
  }
  // A raw FV rooted at zero or a descriptor-rooted SPI is required. Embedded
  // volumes in capsules/vendor wrappers do not establish a writable container.
  sourceImage = sourceImage.slice();
  workspace = {
    ...workspace,
    sourceBytes: workspace.sourceBytes.slice(),
    modules: structuredClone(workspace.modules),
  };
  data = structuredClone(data);
  const container = inspectAmiFirmwareBytes(sourceImage).container;
  if (container !== "firmware-volume-image" && container !== "intel-flash") {
    throw new FirmwareError(
      "PATCH_FAILED",
      "HII reconstruction requires a raw PI image or complete Intel SPI.",
    );
  }
  const decoded = await decodeFirmwareBuffers(sourceImage);
  if (decoded.decodeFailures.length) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The original firmware has unresolved decoding failures.",
    );
  }
  const inventory = inventoryUefiHiiModules(decoded);
  const sourceFiles = decoded.buffers.flatMap((node) =>
    inventoryFirmwareFiles(node).map((file) => ({
      file,
      bytes: node.bytes.subarray(file.bodyStart, file.end),
    })),
  );
  const occupied: { start: number; end: number }[] = [];
  const seen = new Set<string>();
  const modules = workspace.modules.map((summary) => {
    const module = inventory.modules.find((candidate) => candidate.id === summary.id);
    if (
      !module ||
      seen.has(summary.id) ||
      !Number.isSafeInteger(summary.sourceStart) ||
      !Number.isSafeInteger(summary.sourceEnd) ||
      summary.sourceStart < 0 ||
      summary.sourceEnd > workspace.sourceBytes.length ||
      summary.sourceEnd - summary.sourceStart !== module.bytes.length ||
      summary.fileGuid !== module.file.guid ||
      !sameBytes(
        module.bytes,
        workspace.sourceBytes.slice(summary.sourceStart, summary.sourceEnd),
      )
    ) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        "HII module identity or original workspace bytes changed.",
      );
    }
    if (
      module.duplicateBufferIds.length ||
      summary.mirroredBufferIds.length ||
      sourceFiles.filter(
        (candidate) =>
          candidate.file.guid === module.file.guid &&
          sameBytes(candidate.bytes, module.bytes),
      ).length !== 1
    ) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "Mirrored HII modules require explicit copy ownership before reconstruction.",
      );
    }
    if (
      occupied.some(
        (range) => summary.sourceStart < range.end && summary.sourceEnd > range.start,
      )
    ) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        "HII workspace module ranges overlap.",
      );
    }
    occupied.push({ start: summary.sourceStart, end: summary.sourceEnd });
    seen.add(summary.id);
    return module;
  });
  const graph: FirmwareProvenanceGraph = {
    rootBufferId: 0,
    sourceSize: sourceImage.length,
    buffers: decoded.buffers,
    artifacts: modules.map((module) => ({
      // Engine ownership label only: discovery does not assume an AMI GUID.
      kind: "setup-hii",
      bufferId: module.bufferId,
      payloadStart: module.file.bodyStart,
      payloadEnd: module.file.end,
      sourceFile: module.file,
    })),
  };
  const assessment = assessFirmwareReconstruction(graph);
  if (
    modules.some((module) => module.bufferId !== graph.rootBufferId) ||
    !assessment.traceComplete ||
    assessment.compressions.some((kind) => kind !== "none")
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Generic HII output requires complete uncompressed provenance in the root image; encapsulated output awaits separate acceptance.",
    );
  }
  const patches = buildUefiHiiModulePatches(
    data,
    workspace.sourceBytes,
    workspace.modules,
  );
  const rebuilt = await rebuildUefiImage(
    graph,
    {},
    {},
    patches.map((patch) => {
      const module = modules.find((candidate) => candidate.id === patch.module.id);
      if (!module) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "A modified HII module has no source owner.",
        );
      }
      return {
        artifactKind: "setup-hii" as const,
        bufferId: module.bufferId,
        sourceFileStart: module.file.fileStart,
        offset: module.file.bodyStart,
        expected: module.bytes,
        replacement: patch.bytes,
      };
    }),
  );
  const reopened = inventoryUefiHiiModules(await decodeFirmwareBuffers(rebuilt.image));
  // Re-open every discovered HII module, including alternates not selected in
  // the editor. An unchanged sibling must remain byte-identical too.
  if (
    reopened.decodeFailures.length ||
    reopened.modules.length !== inventory.modules.length
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "HII module inventory changed after re-opening the image.",
    );
  }
  for (const original of inventory.modules) {
    const actual = reopened.modules.find((module) => module.id === original.id);
    const expected =
      patches.find((patch) => patch.module.id === original.id)?.bytes ?? original.bytes;
    if (!actual || !sameBytes(actual.bytes, expected)) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        "HII module did not match after re-opening the image.",
      );
    }
  }
  const before = inspectFirmwareImageLayout(sourceImage);
  const after = inspectFirmwareImageLayout(rebuilt.image);
  if (
    before.kind !== after.kind ||
    before.imageSize !== after.imageSize ||
    before.biosStart !== after.biosStart ||
    before.biosEnd !== after.biosEnd
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "The rebuilt firmware changed its outer BIOS/SPI layout.",
    );
  }
  return {
    ...rebuilt,
    containerKind: before.kind,
    modifiedModuleIds: patches.map((patch) => patch.module.id),
  };
}
