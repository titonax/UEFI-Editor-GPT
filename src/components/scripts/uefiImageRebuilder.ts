import { FirmwareError } from "./errors";
import { inspectFirmwareImageLayout } from "./firmwareImageContainer";
import {
  encapsulatedFirmwareSection,
  readFirmwareSection,
  type FirmwareCompression,
} from "./firmwareSections";
import { align, readUint24, readUint32, readUint64AsNumber } from "./binaryReader";
import type {
  FirmwareArtifactKind,
  FirmwareArtifactLocation,
  FirmwareEncapsulationEdge,
  FirmwareFileReference,
  FirmwareProvenanceGraph,
} from "./firmwareProvenance";

export type FirmwareArtifactReplacements = Partial<
  Record<FirmwareArtifactKind, Uint8Array>
>;

/** Fixed-size patch in the decoded buffer owned by a retained artifact branch. */
export interface FirmwareBufferPatch {
  artifactKind: FirmwareArtifactKind;
  bufferId: number;
  /** Select one FFS when several HII modules share the same decoded buffer. */
  sourceFileStart?: number;
  offset: number;
  expected: Uint8Array;
  replacement: Uint8Array;
}

export interface FirmwareCompressedSpace {
  parentBufferId: number;
  sectionStart: number;
  compression: FirmwareCompression;
  originalPackedBytes: number;
  rebuiltPackedBytes: number;
  verifiedCapacityBytes: number;
  remainingBytes: number;
  capacityBasis: "original-payload" | "verified-terminal-padding";
}

export interface FirmwareSpaceReport {
  biosStart: number;
  biosEnd: number;
  preservedOutsideBiosBytes: number;
  affectedRanges: { start: number; end: number }[];
  compressedSections: FirmwareCompressedSpace[];
}

export interface UefiImageBuildResult {
  image: Uint8Array;
  spaceReport: FirmwareSpaceReport;
  replacedArtifacts: FirmwareArtifactKind[];
  changedByteCount: number;
  changedStart: number;
  changedEnd: number;
}

/** A section-body codec. The caller must supply a format-compatible encoder. */
export interface FirmwareSectionCodec {
  compression: Exclude<FirmwareCompression, "none">;
  compress(decoded: Uint8Array): Uint8Array | Promise<Uint8Array>;
  decompress(packed: Uint8Array): Uint8Array | Promise<Uint8Array>;
}

export type FirmwareSectionCodecOption =
  | FirmwareSectionCodec
  | ((originalPacked: Uint8Array, originalDecoded: Uint8Array) => FirmwareSectionCodec);

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((byte, i) => byte === right[i]);
}

function volumeEraseByte(source: Uint8Array, file: FirmwareFileReference) {
  const start = file.volumeStart;
  if (
    start < 0 ||
    start + 0x38 > file.volumeEnd ||
    file.volumeEnd > source.length ||
    String.fromCharCode(...source.subarray(start + 0x28, start + 0x2c)) !== "_FVH" ||
    readUint64AsNumber(source, start + 0x20) !== file.volumeEnd - start
  ) {
    throw new FirmwareError("INTEGRITY_MISMATCH", "FFS erase polarity is not proven.");
  }
  const fill = (readUint32(source, start + 0x2c) & 0x800) !== 0 ? 0xff : 0x00;
  const next = start + align(file.end - start, 8);
  if (
    next > file.volumeEnd ||
    !source.subarray(file.end, next).every((byte) => byte === fill)
  ) {
    throw new FirmwareError("INTEGRITY_MISMATCH", "FFS alignment erase bytes changed.");
  }
  return fill;
}

function terminalSectionPadding(
  parent: Uint8Array,
  sourceParent: Uint8Array,
  edge: FirmwareEncapsulationEdge,
  newEnd: number,
) {
  const file = edge.ownerFile;
  if (!file) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Compressed section has no proven FFS allocation.",
    );
  }
  if (
    file.bufferId !== edge.parentBufferId ||
    file.fileStart < file.volumeStart ||
    file.fileStart + 24 > file.volumeEnd ||
    file.bodyStart !== file.fileStart + file.headerSize ||
    file.end > file.volumeEnd ||
    file.volumeEnd > sourceParent.length ||
    edge.sectionStart < file.bodyStart ||
    edge.sectionEnd > file.end
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Compressed section has no proven FFS allocation.",
    );
  }
  const size24 = readUint24(sourceParent, file.fileStart + 20);
  const extended = size24 === 0xffffff;
  if (
    file.headerSize !== (extended ? 32 : 24) ||
    (extended && file.fileStart + 32 > file.end) ||
    file.end - file.fileStart !==
      (extended ? readUint64AsNumber(sourceParent, file.fileStart + 24) : size24)
  ) {
    throw new FirmwareError("INTEGRITY_MISMATCH", "The enclosing FFS size changed.");
  }
  let cursor = file.bodyStart;
  while (cursor < edge.sectionStart) {
    const previous = readFirmwareSection(sourceParent, cursor, file.end);
    if (!previous || previous.end > edge.sectionStart) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        "The enclosing FFS section chain is incomplete.",
      );
    }
    cursor = align(previous.end, 4);
  }
  if (cursor !== edge.sectionStart || edge.sectionEnd > file.end) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Compressed section has no trailing FFS padding.",
    );
  }
  if (edge.sectionEnd === file.end) {
    if (newEnd >= file.end) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "Compressed section cannot grow beyond its FFS allocation.",
      );
    }
    return { end: file.end, fill: volumeEraseByte(sourceParent, file) };
  }
  const fill = sourceParent[edge.sectionEnd];
  if (
    (fill !== 0xff && fill !== 0x00) ||
    !sourceParent.subarray(edge.sectionEnd, file.end).every((byte) => byte === fill) ||
    !sameBytes(
      parent.subarray(edge.sectionEnd, file.end),
      sourceParent.subarray(edge.sectionEnd, file.end),
    )
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The trailing FFS allocation is not untouched erase padding.",
    );
  }
  return { end: file.end, fill };
}

function writeSectionSize(
  parent: Uint8Array,
  edge: FirmwareEncapsulationEdge,
  size: number,
) {
  if (edge.sectionHeaderSize === 4) {
    if (size >= 0xffffff) {
      throw new FirmwareError(
        "PATCH_FAILED",
        "Compressed section would require an extended header.",
      );
    }
    parent[edge.sectionStart] = size & 0xff;
    parent[edge.sectionStart + 1] = (size >>> 8) & 0xff;
    parent[edge.sectionStart + 2] = (size >>> 16) & 0xff;
  } else {
    new DataView(parent.buffer, parent.byteOffset, parent.byteLength).setUint32(
      edge.sectionStart + 4,
      size,
      true,
    );
  }
}

async function rebuildCompressedPayload(
  parent: Uint8Array,
  sourceParent: Uint8Array,
  edge: FirmwareEncapsulationEdge,
  originalDecoded: Uint8Array,
  modifiedDecoded: Uint8Array,
  codecs: Partial<Record<"lzma" | "standard", FirmwareSectionCodecOption>>,
) {
  const option = edge.compression === "none" ? undefined : codecs[edge.compression];
  if (!option) {
    throw new FirmwareError(
      "PATCH_FAILED",
      `${edge.compression.toUpperCase()} recompression is not enabled for this case yet.`,
    );
  }
  const section = readFirmwareSection(sourceParent, edge.sectionStart, edge.sectionEnd);
  const encapsulated = section && encapsulatedFirmwareSection(sourceParent, section);
  if (
    !section ||
    !encapsulated ||
    section.end !== edge.sectionEnd ||
    section.headerSize !== edge.sectionHeaderSize ||
    section.type !== edge.sectionType ||
    encapsulated.payloadStart !== edge.payloadStart ||
    encapsulated.payloadEnd !== edge.payloadEnd ||
    encapsulated.compression !== edge.compression ||
    encapsulated.definitionGuid !== edge.definitionGuid ||
    encapsulated.attributes !== edge.attributes ||
    (section.type === 1 &&
      readUint32(sourceParent, section.start + section.headerSize) !==
        originalDecoded.length) ||
    edge.payloadStart < edge.sectionStart ||
    edge.payloadEnd > sourceParent.length
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Compressed section provenance changed.",
    );
  }
  const codec =
    typeof option === "function" ? option(encapsulated.bytes, originalDecoded) : option;
  if (codec.compression !== edge.compression) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Compressed section codec type does not match its provenance.",
    );
  }
  const original = await codec.decompress(encapsulated.bytes);
  if (!sameBytes(original, originalDecoded)) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Compressed source does not match its decoded provenance.",
    );
  }
  const packed = await codec.compress(modifiedDecoded);
  const verified = await codec.decompress(packed);
  if (!sameBytes(verified, modifiedDecoded)) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Compressed section failed its encoding round-trip.",
    );
  }
  let capacityEnd = edge.payloadEnd;
  let capacityBasis: FirmwareCompressedSpace["capacityBasis"] = "original-payload";
  if (packed.length !== encapsulated.bytes.length) {
    const newEnd = edge.payloadStart + packed.length;
    const padding = terminalSectionPadding(parent, sourceParent, edge, newEnd);
    if (
      packed.length === 0 ||
      newEnd > padding.end ||
      newEnd - edge.sectionStart > 0xffffffff
    ) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `Compressed section needs ${String(packed.length)} bytes but its proven FFS allocation ends at ${String(padding.end)}.`,
      );
    }
    capacityEnd = padding.end;
    capacityBasis = "verified-terminal-padding";
    writeSectionSize(parent, edge, newEnd - edge.sectionStart);
    parent.fill(padding.fill, newEnd, padding.end);
  }
  parent.set(packed, edge.payloadStart);
  return {
    parentBufferId: edge.parentBufferId,
    sectionStart: edge.sectionStart,
    compression: edge.compression,
    originalPackedBytes: encapsulated.bytes.length,
    rebuiltPackedBytes: packed.length,
    verifiedCapacityBytes: capacityEnd - edge.payloadStart,
    remainingBytes: capacityEnd - edge.payloadStart - packed.length,
    capacityBasis,
  } satisfies FirmwareCompressedSpace;
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
 * Rebuilds fixed-size PI encapsulation paths from leaves to the source image.
 * Compressed paths require an explicitly supplied, round-trip verified codec.
 */
export async function rebuildUefiImage(
  graph: FirmwareProvenanceGraph,
  replacements: FirmwareArtifactReplacements,
  codecs: Partial<Record<"lzma" | "standard", FirmwareSectionCodecOption>> = {},
  bufferPatches: readonly FirmwareBufferPatch[] = [],
): Promise<UefiImageBuildResult> {
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
  if (artifacts.length === 0 && bufferPatches.length === 0) {
    throw new FirmwareError("NO_CHANGES", "No firmware artifacts need rebuilding.");
  }
  const compressedSections: FirmwareCompressedSpace[] = [];
  const modified = new Set<number>();
  const repairs = new Map<number, Map<string, FirmwareFileReference>>();
  const requestRepair = (file: FirmwareFileReference) => {
    const files =
      repairs.get(file.bufferId) ?? new Map<string, FirmwareFileReference>();
    files.set(fileKey(file), file);
    repairs.set(file.bufferId, files);
  };

  const patchAnchors: FirmwareArtifactLocation[] = [];
  const occupied = new Map<number, Set<number>>();
  for (const patch of bufferPatches) {
    const anchors = graph.artifacts.filter(
      (artifact) =>
        artifact.kind === patch.artifactKind &&
        artifact.bufferId === patch.bufferId &&
        (patch.sourceFileStart === undefined ||
          artifact.sourceFile.fileStart === patch.sourceFileStart),
    );
    const node = nodes.get(patch.bufferId);
    const anchor = anchors[0];
    const end = patch.offset + patch.expected.length;
    if (
      anchors.length !== 1 ||
      !node ||
      !Number.isSafeInteger(patch.offset) ||
      patch.offset < 0 ||
      patch.expected.length === 0 ||
      patch.expected.length !== patch.replacement.length ||
      end > node.bytes.length ||
      (anchor.sourceFile.bufferId === node.id
        ? patch.offset < anchor.sourceFile.bodyStart || end > anchor.sourceFile.end
        : !node.parent?.ownerFile)
    ) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        "Decoded patch has no bounded artifact ownership.",
      );
    }
    const touched = occupied.get(node.id) ?? new Set<number>();
    for (let offset = patch.offset; offset < end; offset++) {
      if (
        touched.has(offset) ||
        artifacts.some(
          (artifact) =>
            artifact.bufferId === node.id &&
            offset >= artifact.payloadStart &&
            offset < artifact.payloadEnd,
        )
      ) {
        throw new FirmwareError(
          "PATCH_FAILED",
          "Decoded patches overlap another requested edit.",
        );
      }
      if (node.bytes[offset] !== patch.expected[offset - patch.offset]) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "Decoded patch expected bytes changed.",
        );
      }
      touched.add(offset);
    }
    patchAnchors.push(anchor);
    occupied.set(node.id, touched);
    node.bytes.set(patch.replacement, patch.offset);
    modified.add(node.id);
    if (anchor.sourceFile.bufferId === node.id) requestRepair(anchor.sourceFile);
  }

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
    if (
      edge.compression === "none" &&
      node.bytes.length !== edge.payloadEnd - edge.payloadStart
    ) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `Decoded buffer ${String(node.id)} no longer fits its original encapsulation.`,
      );
    }
    if (edge.compression === "none") {
      parent.bytes.set(node.bytes, edge.payloadStart);
    } else {
      const sourceParent = graph.buffers.find((buffer) => buffer.id === parent.id);
      const sourceChild = graph.buffers.find((buffer) => buffer.id === node.id);
      if (!sourceParent || !sourceChild) {
        throw new FirmwareError(
          "INTEGRITY_MISMATCH",
          "Compressed source buffers are missing.",
        );
      }
      compressedSections.push(
        await rebuildCompressedPayload(
          parent.bytes,
          sourceParent.bytes,
          edge,
          sourceChild.bytes,
          node.bytes,
          codecs,
        ),
      );
    }
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
  const allowed = [...artifacts, ...patchAnchors].map((artifact) =>
    rootAllowedRange(graph, artifact),
  );
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
    spaceReport: {
      biosStart: layout.biosStart,
      biosEnd: layout.biosEnd,
      preservedOutsideBiosBytes:
        root.bytes.length - (layout.biosEnd - layout.biosStart),
      affectedRanges: [
        ...new Map(
          allowed.map((range) => [
            `${String(range.start)}:${String(range.end)}`,
            range,
          ]),
        ).values(),
      ],
      compressedSections,
    },
    replacedArtifacts: [
      ...new Set([
        ...artifacts.map((artifact) => artifact.kind),
        ...bufferPatches.map((patch) => patch.artifactKind),
      ]),
    ],
    changedByteCount,
    changedStart,
    changedEnd,
  };
}
