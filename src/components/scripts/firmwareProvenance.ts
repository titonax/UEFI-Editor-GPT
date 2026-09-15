import type { FirmwareCompression } from "./firmwareSections";

export type FirmwareArtifactKind = "setup-hii" | "amitse" | "setupdata";

export interface FirmwareFileReference {
  bufferId: number;
  guid: string;
  volumeStart: number;
  volumeEnd: number;
  fileStart: number;
  bodyStart: number;
  end: number;
  headerSize: number;
}

export interface FirmwareEncapsulationEdge {
  parentBufferId: number;
  sectionStart: number;
  sectionEnd: number;
  sectionHeaderSize: number;
  sectionType: number;
  payloadStart: number;
  payloadEnd: number;
  compression: FirmwareCompression;
  definitionGuid?: string;
  attributes?: number;
  ownerFile?: FirmwareFileReference;
}

/**
 * A decoded byte stream and the exact encapsulation edge that produced it.
 * Buffer zero is always the untouched source image.
 */
export interface FirmwareBufferNode {
  id: number;
  bytes: Uint8Array;
  depth: number;
  parent?: FirmwareEncapsulationEdge;
}

export interface FirmwareArtifactLocation {
  kind: FirmwareArtifactKind;
  bufferId: number;
  payloadStart: number;
  payloadEnd: number;
  sourceFile: FirmwareFileReference;
}

export interface FirmwareProvenanceGraph {
  rootBufferId: 0;
  sourceSize: number;
  buffers: FirmwareBufferNode[];
  artifacts: FirmwareArtifactLocation[];
}

export interface FirmwareArtifactTrace {
  kind: FirmwareArtifactKind;
  complete: boolean;
  compressions: FirmwareCompression[];
  labels: string[];
}

export interface FirmwareReconstructionAssessment {
  traceComplete: boolean;
  writeEnabled: false;
  traces: FirmwareArtifactTrace[];
  compressions: FirmwareCompression[];
  blockers: string[];
}

const artifactLabels: Record<FirmwareArtifactKind, string> = {
  "setup-hii": "Setup HII",
  amitse: "AMITSE PE32",
  setupdata: "SetupData",
};

function hexOffset(value: number) {
  return `0x${value.toString(16).toUpperCase()}`;
}

function compressionLabel(compression: FirmwareCompression) {
  if (compression === "lzma") return "LZMA section";
  if (compression === "standard") return "EFI/Tiano section";
  return "encapsulation section";
}

function validFileReference(
  file: FirmwareFileReference,
  nodes: Map<number, FirmwareBufferNode>,
) {
  const node = nodes.get(file.bufferId);
  return Boolean(
    node &&
    file.volumeStart >= 0 &&
    file.fileStart >= file.volumeStart &&
    file.bodyStart === file.fileStart + file.headerSize &&
    file.end >= file.bodyStart &&
    file.end <= file.volumeEnd &&
    file.volumeEnd <= node.bytes.length,
  );
}

function traceArtifact(
  graph: FirmwareProvenanceGraph,
  artifact: FirmwareArtifactLocation,
): FirmwareArtifactTrace {
  const nodes = new Map(graph.buffers.map((node) => [node.id, node]));
  const reversedEdges: FirmwareEncapsulationEdge[] = [];
  const visited = new Set<number>();
  const lineage = new Set<number>();
  let currentId = artifact.bufferId;
  let complete =
    artifact.payloadStart >= 0 &&
    artifact.payloadEnd >= artifact.payloadStart &&
    artifact.payloadEnd <= (nodes.get(artifact.bufferId)?.bytes.length ?? -1);

  while (currentId !== graph.rootBufferId) {
    if (visited.has(currentId)) {
      complete = false;
      break;
    }
    visited.add(currentId);
    lineage.add(currentId);
    const node = nodes.get(currentId);
    if (!node?.parent || !nodes.has(node.parent.parentBufferId)) {
      complete = false;
      break;
    }
    const parent = nodes.get(node.parent.parentBufferId);
    if (
      !parent ||
      node.parent.sectionStart < 0 ||
      node.parent.sectionEnd > parent.bytes.length ||
      node.parent.payloadStart < node.parent.sectionStart ||
      node.parent.payloadEnd > node.parent.sectionEnd
    ) {
      complete = false;
    }
    if (
      node.parent.ownerFile &&
      (node.parent.ownerFile.bufferId !== node.parent.parentBufferId ||
        !validFileReference(node.parent.ownerFile, nodes) ||
        node.parent.sectionStart < node.parent.ownerFile.bodyStart ||
        node.parent.sectionEnd > node.parent.ownerFile.end)
    ) {
      complete = false;
    }
    reversedEdges.push(node.parent);
    currentId = node.parent.parentBufferId;
  }

  lineage.add(currentId);
  if (
    nodes.get(graph.rootBufferId)?.bytes.length !== graph.sourceSize ||
    nodes.size !== graph.buffers.length
  ) {
    complete = false;
  }
  if (
    !validFileReference(artifact.sourceFile, nodes) ||
    !lineage.has(artifact.sourceFile.bufferId) ||
    (artifact.bufferId === artifact.sourceFile.bufferId &&
      (artifact.payloadStart < artifact.sourceFile.bodyStart ||
        artifact.payloadEnd > artifact.sourceFile.end))
  ) {
    complete = false;
  }
  const edges = reversedEdges.reverse();
  return {
    kind: artifact.kind,
    complete,
    compressions: edges.map((edge) => edge.compression),
    labels: [
      "Firmware image",
      ...edges.map(
        (edge) =>
          `${compressionLabel(edge.compression)} @ ${hexOffset(edge.sectionStart)}`,
      ),
      artifactLabels[artifact.kind],
    ],
  };
}

/**
 * Reports whether all retained artifacts can be traced back to the source image.
 * Full-image writing deliberately remains disabled until the bottom-up builder,
 * deterministic compressors, checksum repair and independent verification exist.
 */
export function assessFirmwareReconstruction(
  graph: FirmwareProvenanceGraph,
): FirmwareReconstructionAssessment {
  const traces = graph.artifacts.map((artifact) => traceArtifact(graph, artifact));
  const compressions = [...new Set(traces.flatMap((trace) => trace.compressions))];
  const blockers: string[] = [];
  if (traces.length === 0 || traces.some((trace) => !trace.complete)) {
    blockers.push("At least one artifact has an incomplete path to the source image.");
  }
  if (compressions.includes("lzma")) {
    blockers.push("Deterministic LZMA recompression is not implemented yet.");
  }
  if (compressions.includes("standard")) {
    blockers.push("Deterministic EFI/Tiano recompression is not implemented yet.");
  }
  blockers.push(
    "Bottom-up section replacement, FFS checksum repair and full re-extraction verification are not implemented yet.",
  );

  return {
    traceComplete: traces.length > 0 && traces.every((trace) => trace.complete),
    writeEnabled: false,
    traces,
    compressions,
    blockers,
  };
}
