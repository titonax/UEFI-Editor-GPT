import { FirmwareError } from "./errors";
import { inspectFirmwareImageLayout } from "./firmwareImageContainer";
import type {
  FirmwareArtifactKind,
  FirmwareArtifactLocation,
  FirmwareFileReference,
  FirmwareProvenanceGraph,
} from "./firmwareProvenance";

export type FirmwareArtifactReplacements = Partial<
  Record<FirmwareArtifactKind, Uint8Array>
>;

export interface UefiImageBuildResult {
  image: Uint8Array;
  replacedArtifacts: FirmwareArtifactKind[];
  changedByteCount: number;
  changedStart: number;
  changedEnd: number;
}

function checksum8(bytes: Uint8Array, start: number, end: number) {
  let checksum = 0;
  for (let offset = start; offset < end; offset += 1) {
    checksum = (checksum + bytes[offset]) & 0xff;
  }
  return -checksum & 0xff;
}

function repairFfsChecksums(bytes: Uint8Array, file: FirmwareFileReference) {
  if (
    file.fileStart < file.volumeStart ||
    file.headerSize < 24 ||
    file.bodyStart !== file.fileStart + file.headerSize ||
    file.end < file.bodyStart ||
    file.end > file.volumeEnd ||
    file.volumeEnd > bytes.length
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      `FFS ${file.guid} no longer matches its recorded bounds.`,
    );
  }
  const headerChecksumOffset = file.fileStart + 16;
  const fileChecksumOffset = file.fileStart + 17;
  const attributesOffset = file.fileStart + 19;
  const stateOffset = file.fileStart + 23;
  const state = bytes[stateOffset];
  const hasDataChecksum = (bytes[attributesOffset] & 0x40) !== 0;
  bytes[fileChecksumOffset] = hasDataChecksum
    ? checksum8(bytes, file.bodyStart, file.end)
    : 0xaa;

  const fileChecksum = bytes[fileChecksumOffset];
  bytes[headerChecksumOffset] = 0;
  bytes[fileChecksumOffset] = 0;
  bytes[stateOffset] = 0;
  bytes[headerChecksumOffset] = checksum8(
    bytes,
    file.fileStart,
    file.fileStart + file.headerSize,
  );
  bytes[fileChecksumOffset] = fileChecksum;
  bytes[stateOffset] = state;
}

function fileKey(file: FirmwareFileReference) {
  return `${String(file.bufferId)}:${String(file.fileStart)}:${String(file.end)}`;
}

function rootAllowedRange(
  graph: FirmwareProvenanceGraph,
  artifact: FirmwareArtifactLocation,
) {
  const nodes = new Map(graph.buffers.map((node) => [node.id, node]));
  if (artifact.bufferId === graph.rootBufferId) {
    return {
      start: artifact.sourceFile.fileStart,
      end: artifact.sourceFile.end,
    };
  }
  let currentId = artifact.bufferId;
  const visited = new Set<number>();
  while (currentId !== graph.rootBufferId && !visited.has(currentId)) {
    visited.add(currentId);
    const edge = nodes.get(currentId)?.parent;
    if (!edge) break;
    if (edge.parentBufferId === graph.rootBufferId) {
      return edge.ownerFile
        ? { start: edge.ownerFile.fileStart, end: edge.ownerFile.end }
        : { start: edge.sectionStart, end: edge.sectionEnd };
    }
    currentId = edge.parentBufferId;
  }
  throw new FirmwareError(
    "INTEGRITY_MISMATCH",
    `${artifact.kind} does not have a complete path to the source image.`,
  );
}

function containsOffset(ranges: { start: number; end: number }[], offset: number) {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

/**
 * Rebuilds fixed-size, uncompressed PI encapsulation paths from leaves to the
 * complete source image. Compression codecs are deliberately separate: an
 * encountered LZMA or EFI/Tiano edge is rejected instead of approximated.
 */
export function rebuildUefiImage(
  graph: FirmwareProvenanceGraph,
  replacements: FirmwareArtifactReplacements,
): UefiImageBuildResult {
  const sourceNode = graph.buffers.find((node) => node.id === graph.rootBufferId);
  if (sourceNode?.bytes.length !== graph.sourceSize) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "The immutable source image is missing from reconstruction provenance.",
    );
  }
  const nodes = new Map(
    graph.buffers.map((node) => [node.id, { ...node, bytes: node.bytes.slice() }]),
  );
  const artifacts = graph.artifacts.filter(
    (artifact) => replacements[artifact.kind] !== undefined,
  );
  if (artifacts.length === 0) {
    throw new FirmwareError("NO_CHANGES", "No firmware artifacts need rebuilding.");
  }
  const modified = new Set<number>();
  const repairs = new Map<number, Map<string, FirmwareFileReference>>();
  const requestRepair = (file: FirmwareFileReference) => {
    const files =
      repairs.get(file.bufferId) ?? new Map<string, FirmwareFileReference>();
    files.set(fileKey(file), file);
    repairs.set(file.bufferId, files);
  };

  for (const artifact of artifacts) {
    const replacement = replacements[artifact.kind];
    const node = nodes.get(artifact.bufferId);
    if (!replacement || !node) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        `${artifact.kind} reconstruction provenance is incomplete.`,
      );
    }
    const expectedLength = artifact.payloadEnd - artifact.payloadStart;
    if (
      artifact.payloadStart < 0 ||
      artifact.payloadEnd > node.bytes.length ||
      replacement.length !== expectedLength
    ) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `${artifact.kind} must remain ${String(expectedLength)} bytes.`,
      );
    }
    node.bytes.set(replacement, artifact.payloadStart);
    modified.add(node.id);
    if (artifact.sourceFile.bufferId === node.id) requestRepair(artifact.sourceFile);
  }

  const ordered = [...nodes.values()].sort((left, right) => right.depth - left.depth);
  for (const node of ordered) {
    if (!modified.has(node.id)) continue;
    for (const file of repairs.get(node.id)?.values() ?? []) {
      repairFfsChecksums(node.bytes, file);
    }
    if (node.id === graph.rootBufferId) continue;
    const edge = node.parent;
    const parent = edge ? nodes.get(edge.parentBufferId) : undefined;
    if (!edge || !parent) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        `Decoded buffer ${String(node.id)} has no complete parent edge.`,
      );
    }
    if (edge.compression !== "none") {
      throw new FirmwareError(
        "PATCH_FAILED",
        `${edge.compression.toUpperCase()} recompression is not enabled for this case yet.`,
      );
    }
    if (node.bytes.length !== edge.payloadEnd - edge.payloadStart) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `Decoded buffer ${String(node.id)} no longer fits its original encapsulation.`,
      );
    }
    parent.bytes.set(node.bytes, edge.payloadStart);
    modified.add(parent.id);
    if (edge.ownerFile) requestRepair(edge.ownerFile);
  }

  const root = nodes.get(graph.rootBufferId);
  if (!root)
    throw new FirmwareError("PATCH_FAILED", "Rebuilt source image is missing.");
  for (const file of repairs.get(root.id)?.values() ?? []) {
    repairFfsChecksums(root.bytes, file);
  }

  const layout = inspectFirmwareImageLayout(sourceNode.bytes);
  const allowed = artifacts.map((artifact) => rootAllowedRange(graph, artifact));
  let changedByteCount = 0;
  let changedStart = root.bytes.length;
  let changedEnd = 0;
  for (let offset = 0; offset < root.bytes.length; offset += 1) {
    if (root.bytes[offset] === sourceNode.bytes[offset]) continue;
    if (
      offset < layout.biosStart ||
      offset >= layout.biosEnd ||
      !containsOffset(allowed, offset)
    ) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        `Reconstruction changed an unowned byte at 0x${offset.toString(16).toUpperCase()}.`,
      );
    }
    changedByteCount += 1;
    changedStart = Math.min(changedStart, offset);
    changedEnd = Math.max(changedEnd, offset + 1);
  }
  if (changedByteCount === 0) {
    throw new FirmwareError("NO_CHANGES", "The rebuilt image is unchanged.");
  }
  return {
    image: root.bytes,
    replacedArtifacts: artifacts.map((artifact) => artifact.kind),
    changedByteCount,
    changedStart,
    changedEnd,
  };
}
