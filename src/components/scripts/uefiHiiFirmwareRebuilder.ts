import { sha256Hex } from "./checksum";
import {
  acceptedUefiHiiLzmaImage,
  hasAcceptedUefiHiiLzmaSource,
} from "./firmwareAcceptance";
import { createLzmaSectionCodec } from "./lzmaSectionCodec";
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
  verifiedModules: {
    moduleId: string;
    name: string;
    fileGuid: string;
    physicalCopies: { bufferId: number; fileStart: number }[];
  }[];
  containerKind: "bios-image" | "intel-spi";
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}

/**
 * Complete-image builder for vendor-neutral output.
 * Re-discovers source ownership instead of trusting serialized workspace metadata.
 * Uncompressed paths and the exact accepted mirrored LZMA Setup source only.
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
  const acceptedMirroredSource = hasAcceptedUefiHiiLzmaSource(
    await sha256Hex(sourceImage),
    sourceImage.length,
  );
  const decoded = await decodeFirmwareBuffers(sourceImage);
  if (decoded.decodeFailures.length) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The original firmware has unresolved decoding failures.",
    );
  }
  const inventory = inventoryUefiHiiModules(decoded);
  if (inventory.decodeFailures.length) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The original HII inventory has unresolved ownership.",
    );
  }
  const sourceFiles = decoded.buffers.flatMap((node) =>
    inventoryFirmwareFiles(node).map((file) => ({
      file,
      bytes: node.bytes.subarray(file.bodyStart, file.end),
    })),
  );
  const copyGroups = new Map<string, typeof sourceFiles>();
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
    const copies = sourceFiles.filter(
      (candidate) =>
        candidate.file.guid === module.file.guid &&
        sameBytes(candidate.bytes, module.bytes),
    );
    const declaredBuffers = [module.bufferId, ...module.duplicateBufferIds].sort(
      (a, b) => a - b,
    );
    const actualBuffers = copies
      .map((copy) => copy.file.bufferId)
      .sort((a, b) => a - b);
    const summaryBuffers = [module.bufferId, ...summary.mirroredBufferIds].sort(
      (a, b) => a - b,
    );
    if (
      copies.length === 0 ||
      new Set(actualBuffers).size !== copies.length ||
      actualBuffers.join(",") !== declaredBuffers.join(",") ||
      summaryBuffers.join(",") !== declaredBuffers.join(",") ||
      (copies.length > 1 && !acceptedMirroredSource)
    ) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "Mirrored HII modules require accepted, complete copy ownership before reconstruction.",
      );
    }
    copyGroups.set(module.id, copies);
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
    artifacts: modules.flatMap((module) =>
      (copyGroups.get(module.id) ?? []).map((copy) => ({
        // Engine ownership label only: discovery does not assume an AMI GUID.
        kind: "setup-hii",
        bufferId: copy.file.bufferId,
        payloadStart: copy.file.bodyStart,
        payloadEnd: copy.file.end,
        sourceFile: copy.file,
      })),
    ),
  };
  const assessment = assessFirmwareReconstruction(graph);
  if (
    !assessment.traceComplete ||
    assessment.compressions.some(
      (kind) => kind !== "none" && (kind !== "lzma" || !acceptedMirroredSource),
    )
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Generic HII output requires complete uncompressed provenance; compressed output awaits separate acceptance.",
    );
  }
  const patches = buildUefiHiiModulePatches(
    data,
    workspace.sourceBytes,
    // Derive package bounds from fresh discovery, never imported workspace claims.
    workspace.modules.map((summary, index) => ({
      ...summary,
      ownedPackages: modules[index].packages.map(({ offset, end }) => ({
        offset,
        end,
      })),
    })),
  );
  if (
    assessment.compressions.includes("lzma") &&
    patches.some((patch) => patch.module.fileGuid !== acceptedUefiHiiLzmaImage.fileGuid)
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Only the accepted Setup FFS has generic compressed HII edit acceptance for this source.",
    );
  }
  const rebuilt = await rebuildUefiImage(
    graph,
    {},
    { lzma: createLzmaSectionCodec },
    patches.flatMap((patch) => {
      const module = modules.find((candidate) => candidate.id === patch.module.id);
      if (!module) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "A modified HII module has no source owner.",
        );
      }
      return (copyGroups.get(module.id) ?? []).map((copy) => ({
        artifactKind: "setup-hii" as const,
        bufferId: copy.file.bufferId,
        sourceFileStart: copy.file.fileStart,
        offset: copy.file.bodyStart,
        expected: copy.bytes,
        replacement: patch.bytes,
      }));
    }),
  );
  const reopenedDecoded = await decodeFirmwareBuffers(rebuilt.image);
  const reopened = inventoryUefiHiiModules(reopenedDecoded);
  const reopenedFiles = reopenedDecoded.buffers.flatMap((node) =>
    inventoryFirmwareFiles(node).map((file) => ({
      file,
      bytes: node.bytes.subarray(file.bodyStart, file.end),
    })),
  );
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
  for (const original of inventory.modules) {
    const expected =
      patches.find((patch) => patch.module.id === original.id)?.bytes ?? original.bytes;
    const copies = sourceFiles.filter(
      (copy) =>
        copy.file.guid === original.file.guid && sameBytes(copy.bytes, original.bytes),
    );
    for (const copy of copies) {
      const actual = reopenedFiles.find(
        (candidate) =>
          candidate.file.guid === copy.file.guid &&
          candidate.file.bufferId === copy.file.bufferId &&
          candidate.file.fileStart === copy.file.fileStart &&
          candidate.file.end === copy.file.end,
      );
      if (!actual || !sameBytes(actual.bytes, expected)) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "A physical HII copy did not match after re-opening the image.",
        );
      }
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
    verifiedModules: patches.map((patch) => ({
      moduleId: patch.module.id,
      name: patch.module.name,
      fileGuid: patch.module.fileGuid,
      physicalCopies: (copyGroups.get(patch.module.id) ?? []).map((copy) => ({
        bufferId: copy.file.bufferId,
        fileStart: copy.file.fileStart,
      })),
    })),
  };
}
