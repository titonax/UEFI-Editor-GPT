import {
  ConsoleStdout,
  File as WasiFile,
  OpenFile,
  PreopenDirectory,
  WASI,
} from "@bjorn3/browser_wasi_shim";
import {
  align,
  readGuid,
  readUint16,
  readUint24,
  readUint64AsNumber,
} from "./binaryReader";
import { FirmwareError } from "./errors";
import {
  encapsulatedFirmwareSection,
  readFirmwareSection,
  type FirmwareSection,
} from "./firmwareSections";
import type {
  FirmwareArtifactKind,
  FirmwareArtifactCoherence,
  FirmwareArtifactLocation,
  FirmwareArtifactSetSummary,
  FirmwareBufferNode,
  FirmwareFileReference,
  FirmwareProvenanceGraph,
} from "./firmwareProvenance";

const setupGuid = "899407D7-99FE-43D8-9A21-79EC328CAC21";
const amitseGuid = "B1DA0ADF-4F77-4070-A88E-BFFE1C60529A";
const hiiGuid = "97E409E6-4CC1-11D9-81F6-000000000000";
const setupDataGuid = "FE612B72-203C-47B1-8560-A66D946EB371";

export interface AptioIvArtifacts {
  hii: Uint8Array;
  ifrText: string;
  amitse?: Uint8Array;
  setupData?: Uint8Array;
  formPackageCount: number;
  extractionDepth: number;
  artifactSets: FirmwareArtifactSetSummary[];
  selectedArtifactSetId: string;
  provenance: FirmwareProvenanceGraph;
}

export interface AptioIvExtractionOptions {
  artifactSetId?: string;
}

const decompressorModules = new Map<string, Promise<WebAssembly.Module>>();

function loadDecompressor(name: string) {
  let pending = decompressorModules.get(name);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}${name}`).then((response) => {
      if (!response.ok) {
        throw new FirmwareError(
          "PARSE_FAILED",
          `Firmware decompressor WebAssembly could not be loaded (${String(response.status)}).`,
        );
      }
      return WebAssembly.compileStreaming(response);
    });
    decompressorModules.set(name, pending);
  }
  return pending;
}

async function runFirmwareDecompress(
  input: Uint8Array,
  wasmName: string,
  mode: "lzma" | "tiano" | "efi",
) {
  const directory = new Map<string, WasiFile>();
  directory.set("input.bin", new WasiFile(input));
  const messages: string[] = [];
  const wasi = new WASI(
    [wasmName, "input.bin", "output.bin", mode],
    [],
    [
      new OpenFile(new WasiFile([])),
      ConsoleStdout.lineBuffered((line) => messages.push(line)),
      ConsoleStdout.lineBuffered((line) => messages.push(line)),
      new PreopenDirectory(".", directory),
    ],
  );
  const module = await loadDecompressor(wasmName);
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  const exitCode = wasi.start(
    instance as WebAssembly.Instance & {
      exports: { memory: WebAssembly.Memory; _start: () => unknown };
    },
  );
  const output = directory.get("output.bin");
  if (exitCode !== 0 || !output) {
    throw new FirmwareError(
      "PARSE_FAILED",
      messages.join("\n") || `Firmware decompressor exited with ${String(exitCode)}.`,
    );
  }
  return output.data;
}

async function firmwareDecompress(input: Uint8Array, mode: "lzma" | "standard") {
  if (mode === "lzma") {
    return runFirmwareDecompress(input, "firmware-decompress.wasm", "lzma");
  }

  const failures: string[] = [];
  for (const algorithm of ["tiano", "efi"] as const) {
    try {
      return await runFirmwareDecompress(input, "tiano-decompress.wasm", algorithm);
    } catch (error) {
      failures.push(
        `${algorithm}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new FirmwareError(
    "PARSE_FAILED",
    `EFI/Tiano decompression failed (${failures.join("; ")}).`,
  );
}

function validVolume(bytes: Uint8Array, start: number) {
  if (start + 0x38 > bytes.length) return false;
  const length = readUint64AsNumber(bytes, start + 0x20);
  const headerLength = readUint16(bytes, start + 0x30);
  return (
    bytes[start + 0x28] === 0x5f &&
    bytes[start + 0x29] === 0x46 &&
    bytes[start + 0x2a] === 0x56 &&
    bytes[start + 0x2b] === 0x48 &&
    length >= headerLength &&
    start + length <= bytes.length
  );
}

function findVolumes(bytes: Uint8Array) {
  const volumes: number[] = [];
  for (let signature = 0x28; signature + 4 <= bytes.length; signature += 4) {
    const start = signature - 0x28;
    if (validVolume(bytes, start)) volumes.push(start);
  }
  return volumes;
}

interface LocatedFile {
  bufferId: number;
  guid: string;
  volumeStart: number;
  volumeEnd: number;
  fileStart: number;
  bodyStart: number;
  end: number;
  headerSize: number;
  depth: number;
}

interface FirmwareFileBounds {
  bodyStart: number;
  end: number;
  size: number;
  headerSize: number;
}

function firmwareFileBounds(
  bytes: Uint8Array,
  fileStart: number,
  volumeEnd: number,
): FirmwareFileBounds | null {
  if (fileStart + 24 > volumeEnd) return null;
  const size24 = readUint24(bytes, fileStart + 20);
  const extended = size24 === 0xffffff;
  const headerSize = extended ? 32 : 24;
  if (fileStart + headerSize > volumeEnd) return null;
  const size = extended ? readUint64AsNumber(bytes, fileStart + 24) : size24;
  if (size < headerSize || fileStart + size > volumeEnd) return null;
  return {
    bodyStart: fileStart + headerSize,
    end: fileStart + size,
    size,
    headerSize,
  };
}

/**
 * A valid FV embedded in an FFS body must be reached through that file's
 * encapsulation section. Treating it as a peer volume would lose the outer
 * section and checksum ownership required by a future bottom-up rebuild.
 */
function findTopLevelVolumes(bytes: Uint8Array) {
  const volumes = findVolumes(bytes);
  const nested = new Set<number>();
  for (const parentStart of volumes) {
    const parentEnd = parentStart + readUint64AsNumber(bytes, parentStart + 0x20);
    let fileStart = parentStart + align(readUint16(bytes, parentStart + 0x30), 8);
    while (fileStart + 24 <= parentEnd) {
      if (bytes.slice(fileStart, fileStart + 24).every((byte) => byte === 0xff)) break;
      const file = firmwareFileBounds(bytes, fileStart, parentEnd);
      if (!file) break;
      for (const candidateStart of volumes) {
        if (candidateStart === parentStart) continue;
        const candidateEnd =
          candidateStart + readUint64AsNumber(bytes, candidateStart + 0x20);
        if (candidateStart >= file.bodyStart && candidateEnd <= file.end) {
          nested.add(candidateStart);
        }
      }
      fileStart = parentStart + align(fileStart - parentStart + file.size, 8);
    }
  }
  return volumes.filter((start) => !nested.has(start));
}

interface ExtractionGraph {
  nodes: Map<number, FirmwareBufferNode>;
  decodedSections: Map<string, number>;
  nextId: number;
}

function createExtractionGraph(image: Uint8Array): ExtractionGraph {
  return {
    nodes: new Map([[0, { id: 0, bytes: image, depth: 0 }]]),
    decodedSections: new Map(),
    nextId: 1,
  };
}

function nodeBytes(graph: ExtractionGraph, bufferId: number) {
  const node = graph.nodes.get(bufferId);
  if (!node) {
    throw new FirmwareError(
      "PARSE_FAILED",
      `Decoded firmware buffer ${String(bufferId)} is unavailable.`,
    );
  }
  return node.bytes;
}

function fileReference(file: LocatedFile): FirmwareFileReference {
  return {
    bufferId: file.bufferId,
    guid: file.guid,
    volumeStart: file.volumeStart,
    volumeEnd: file.volumeEnd,
    fileStart: file.fileStart,
    bodyStart: file.bodyStart,
    end: file.end,
    headerSize: file.headerSize,
  };
}

function findFiles(node: FirmwareBufferNode, wantedGuids: Set<string>) {
  const bytes = node.bytes;
  const found: LocatedFile[] = [];
  for (const volumeStart of findTopLevelVolumes(bytes)) {
    const volumeEnd = volumeStart + readUint64AsNumber(bytes, volumeStart + 0x20);
    let fileStart = volumeStart + align(readUint16(bytes, volumeStart + 0x30), 8);
    while (fileStart + 24 <= volumeEnd) {
      if (bytes.slice(fileStart, fileStart + 24).every((byte) => byte === 0xff)) break;
      const file = firmwareFileBounds(bytes, fileStart, volumeEnd);
      if (!file) break;
      const guid = readGuid(bytes, fileStart);
      if (wantedGuids.has(guid)) {
        found.push({
          bufferId: node.id,
          guid,
          volumeStart,
          volumeEnd,
          fileStart,
          bodyStart: file.bodyStart,
          end: file.end,
          headerSize: file.headerSize,
          depth: node.depth,
        });
      }
      fileStart = volumeStart + align(fileStart - volumeStart + file.size, 8);
    }
  }
  return found;
}

async function decodeEncapsulation(
  graph: ExtractionGraph,
  parent: FirmwareBufferNode,
  section: FirmwareSection,
  ownerFile?: LocatedFile,
) {
  const cacheKey = `${String(parent.id)}:${String(section.start)}:${String(section.end)}`;
  const cachedId = graph.decodedSections.get(cacheKey);
  if (cachedId !== undefined) return graph.nodes.get(cachedId) ?? null;

  const encapsulated = encapsulatedFirmwareSection(parent.bytes, section);
  if (!encapsulated) return null;
  const bytes =
    encapsulated.compression === "none"
      ? encapsulated.bytes
      : firmwareDecompress(encapsulated.bytes, encapsulated.compression);
  const decoded = await bytes;
  const node: FirmwareBufferNode = {
    id: graph.nextId++,
    bytes: decoded,
    depth: parent.depth + 1,
    parent: {
      parentBufferId: parent.id,
      sectionStart: section.start,
      sectionEnd: section.end,
      sectionHeaderSize: section.headerSize,
      sectionType: section.type,
      payloadStart: encapsulated.payloadStart,
      payloadEnd: encapsulated.payloadEnd,
      compression: encapsulated.compression,
      definitionGuid: encapsulated.definitionGuid,
      attributes: encapsulated.attributes,
      ownerFile: ownerFile ? fileReference(ownerFile) : undefined,
    },
  };
  graph.nodes.set(node.id, node);
  graph.decodedSections.set(cacheKey, node.id);
  return node;
}

async function nestedBuffers(graph: ExtractionGraph, node: FirmwareBufferNode) {
  const bytes = node.bytes;
  const nested: FirmwareBufferNode[] = [];
  for (const volumeStart of findTopLevelVolumes(bytes)) {
    const volumeEnd = volumeStart + readUint64AsNumber(bytes, volumeStart + 0x20);
    let fileStart = volumeStart + align(readUint16(bytes, volumeStart + 0x30), 8);
    while (fileStart + 24 <= volumeEnd) {
      if (bytes.slice(fileStart, fileStart + 24).every((byte) => byte === 0xff)) break;
      const file = firmwareFileBounds(bytes, fileStart, volumeEnd);
      if (!file) break;
      const ownerFile: LocatedFile = {
        bufferId: node.id,
        guid: readGuid(bytes, fileStart),
        volumeStart,
        volumeEnd,
        fileStart,
        bodyStart: file.bodyStart,
        end: file.end,
        headerSize: file.headerSize,
        depth: node.depth,
      };
      let sectionStart = file.bodyStart;
      while (sectionStart + 4 <= file.end) {
        const section = readFirmwareSection(bytes, sectionStart, file.end);
        if (!section) break;
        const child = await decodeEncapsulation(graph, node, section, ownerFile);
        if (child) nested.push(child);
        sectionStart = align(section.end, 4);
      }
      fileStart = volumeStart + align(fileStart - volumeStart + file.size, 8);
    }
  }
  return nested;
}

async function locateFirmwareFiles(bytes: Uint8Array, wantedGuids: string[]) {
  const graph = createExtractionGraph(bytes);
  const root = graph.nodes.get(0);
  if (!root) throw new FirmwareError("PARSE_FAILED", "Source image is unavailable.");
  const queue = [root];
  const wanted = new Set(wantedGuids);
  const located = new Map(wantedGuids.map((guid) => [guid, [] as LocatedFile[]]));
  for (let index = 0; index < queue.length && index < 64; index++) {
    const current = queue[index];
    const found = findFiles(current, wanted);
    for (const file of found) {
      located.get(file.guid)?.push(file);
    }
    const children = await nestedBuffers(graph, current);
    queue.push(...children);
  }
  return { graph, located };
}

interface CompanionMatch {
  file?: LocatedFile;
  coherence?: Exclude<FirmwareArtifactCoherence, "setup-only">;
  warning?: string;
}

const coherenceRank: Record<
  Exclude<FirmwareArtifactCoherence, "setup-only">,
  number
> = {
  "same-firmware-volume": 0,
  "same-decoded-buffer": 1,
  "shared-encapsulation-branch": 2,
};

function bufferLineage(graph: ExtractionGraph, bufferId: number) {
  const lineage: number[] = [];
  const visited = new Set<number>();
  let currentId = bufferId;
  while (!visited.has(currentId)) {
    visited.add(currentId);
    lineage.push(currentId);
    const parent = graph.nodes.get(currentId)?.parent;
    if (!parent) break;
    currentId = parent.parentBufferId;
  }
  return lineage.reverse();
}

function sharedLineageDepth(
  graph: ExtractionGraph,
  leftBufferId: number,
  rightBufferId: number,
) {
  const left = bufferLineage(graph, leftBufferId);
  const right = bufferLineage(graph, rightBufferId);
  let depth = 0;
  while (depth < left.length && depth < right.length && left[depth] === right[depth]) {
    depth++;
  }
  return depth;
}

function companionRelationship(
  graph: ExtractionGraph,
  setup: LocatedFile,
  candidate: LocatedFile,
) {
  if (
    setup.bufferId === candidate.bufferId &&
    setup.volumeStart === candidate.volumeStart
  ) {
    return {
      coherence: "same-firmware-volume" as const,
      sharedDepth: Number.MAX_SAFE_INTEGER,
    };
  }
  if (setup.bufferId === candidate.bufferId) {
    return {
      coherence: "same-decoded-buffer" as const,
      sharedDepth: Number.MAX_SAFE_INTEGER,
    };
  }
  return {
    coherence: "shared-encapsulation-branch" as const,
    sharedDepth: sharedLineageDepth(graph, setup.bufferId, candidate.bufferId),
  };
}

function selectCompanion(
  graph: ExtractionGraph,
  setup: LocatedFile,
  candidates: LocatedFile[],
  label: string,
): CompanionMatch {
  if (candidates.length === 0) {
    return { warning: `${label} was not found for this Setup context.` };
  }
  const ranked = candidates
    .map((file) => ({ file, ...companionRelationship(graph, setup, file) }))
    .filter(
      (candidate) =>
        candidate.coherence !== "shared-encapsulation-branch" ||
        candidate.sharedDepth > 1,
    )
    .sort(
      (left, right) =>
        coherenceRank[left.coherence] - coherenceRank[right.coherence] ||
        right.sharedDepth - left.sharedDepth,
    );
  if (ranked.length === 0) {
    return {
      warning: `${label} does not share a decoded buffer or encapsulation branch with this Setup context.`,
    };
  }
  const best = ranked[0];
  const tied = ranked.filter(
    (candidate) =>
      candidate.coherence === best.coherence &&
      candidate.sharedDepth === best.sharedDepth,
  );
  if (tied.length !== 1) {
    return {
      warning: `${label} has ${String(tied.length)} equally plausible matches; none was attached across firmware contexts.`,
    };
  }
  return {
    file: best.file,
    coherence: best.coherence,
    warning:
      best.coherence === "same-decoded-buffer"
        ? `${label} is the only buffer-level match outside this Setup firmware volume; verify the selected firmware context before editing.`
        : best.coherence === "shared-encapsulation-branch"
          ? `${label} is the only branch-level match; verify the selected firmware context before editing.`
          : undefined,
  };
}

function artifactSetId(file: LocatedFile) {
  return `buffer-${String(file.bufferId)}-fv-${file.volumeStart.toString(16)}-ffs-${file.fileStart.toString(16)}`;
}

function artifactSetCoherence(matches: CompanionMatch[]): FirmwareArtifactCoherence {
  const relationships = matches.flatMap((match) =>
    match.coherence ? [match.coherence] : [],
  );
  if (relationships.length === 0) return "setup-only";
  return relationships.sort(
    (left, right) => coherenceRank[right] - coherenceRank[left],
  )[0];
}

type SectionPayloadLocator = (
  bytes: Uint8Array,
  section: FirmwareSection,
) => number | null;

interface LocatedPayload {
  bytes: Uint8Array;
  location: FirmwareArtifactLocation;
}

async function locateSectionPayload(
  graph: ExtractionGraph,
  file: LocatedFile,
  artifactKind: FirmwareArtifactKind,
  locatePayload: SectionPayloadLocator,
  bufferId = file.bufferId,
  sourceFile = fileReference(file),
  recursionDepth = 0,
  isFfsStream = true,
): Promise<LocatedPayload | null> {
  const bytes = nodeBytes(graph, bufferId);
  const streamStart = bufferId === file.bufferId ? file.bodyStart : 0;
  const streamEnd = bufferId === file.bufferId ? file.end : bytes.length;
  let sectionStart = streamStart;
  while (sectionStart + 4 <= streamEnd) {
    const section = readFirmwareSection(bytes, sectionStart, streamEnd);
    if (!section) break;
    const payloadStart = locatePayload(bytes, section);
    if (payloadStart !== null && payloadStart <= section.end) {
      return {
        bytes: bytes.slice(payloadStart, section.end),
        location: {
          kind: artifactKind,
          bufferId,
          payloadStart,
          payloadEnd: section.end,
          sourceFile,
        },
      };
    }
    if (recursionDepth < 16) {
      const parent = graph.nodes.get(bufferId);
      if (!parent) {
        throw new FirmwareError("PARSE_FAILED", "Decoded section parent is missing.");
      }
      const nested = await decodeEncapsulation(
        graph,
        parent,
        section,
        isFfsStream ? file : undefined,
      );
      const result = nested
        ? await locateSectionPayload(
            graph,
            {
              ...file,
              bufferId: nested.id,
              fileStart: 0,
              bodyStart: 0,
              end: nested.bytes.length,
              headerSize: 0,
              depth: nested.depth,
            },
            artifactKind,
            locatePayload,
            nested.id,
            sourceFile,
            recursionDepth + 1,
            false,
          )
        : null;
      if (result) return result;
    }
    sectionStart = align(section.end, 4);
  }
  return null;
}

async function locateHii(graph: ExtractionGraph, file: LocatedFile) {
  return locateSectionPayload(graph, file, "setup-hii", (bytes, section) =>
    section.type === 0x18 &&
    section.size >= section.headerSize + 16 &&
    readGuid(bytes, section.start + section.headerSize) === hiiGuid
      ? section.start + section.headerSize + 16
      : null,
  );
}

async function locateFreeformSection(
  graph: ExtractionGraph,
  file: LocatedFile,
  wantedGuid: string,
) {
  return locateSectionPayload(graph, file, "setupdata", (bytes, section) =>
    section.type === 0x18 &&
    section.size >= section.headerSize + 16 &&
    readGuid(bytes, section.start + section.headerSize) === wantedGuid
      ? section.start + section.headerSize + 16
      : null,
  );
}

async function locatePe32(
  graph: ExtractionGraph,
  file: LocatedFile,
  artifactKind: Extract<FirmwareArtifactKind, "setup-hii" | "amitse">,
) {
  return locateSectionPayload(graph, file, artifactKind, (_bytes, section) =>
    section.type === 0x10 ? section.start + section.headerSize : null,
  );
}

interface LocatedArtifactSet {
  summary: FirmwareArtifactSetSummary;
  setup: LocatedFile;
  hii: LocatedPayload;
  amitse: LocatedPayload | null;
  setupData: LocatedPayload | null;
}

async function locateArtifactSets(
  graph: ExtractionGraph,
  files: Map<string, LocatedFile[]>,
) {
  const setups = [...(files.get(setupGuid) ?? [])].sort(
    (left, right) =>
      left.depth - right.depth ||
      left.bufferId - right.bufferId ||
      left.volumeStart - right.volumeStart ||
      left.fileStart - right.fileStart,
  );
  const sets: LocatedArtifactSet[] = [];
  for (const setup of setups) {
    const hii =
      (await locateHii(graph, setup)) ?? (await locatePe32(graph, setup, "setup-hii"));
    if (!hii) continue;

    const amitseMatch = selectCompanion(
      graph,
      setup,
      files.get(amitseGuid) ?? [],
      "AMITSE",
    );
    let setupDataMatch = selectCompanion(
      graph,
      setup,
      files.get(setupDataGuid) ?? [],
      "SetupData",
    );
    const warnings = [amitseMatch.warning].filter((warning): warning is string =>
      Boolean(warning),
    );
    const amitse = amitseMatch.file
      ? await locatePe32(graph, amitseMatch.file, "amitse")
      : null;
    if (amitseMatch.file && !amitse) {
      warnings.push("The paired AMITSE FFS does not contain a PE32 section.");
    }
    let setupData = setupDataMatch.file
      ? await locateFreeformSection(graph, setupDataMatch.file, setupDataGuid)
      : null;
    if (!setupData && amitseMatch.file) {
      const embedded = await locateFreeformSection(
        graph,
        amitseMatch.file,
        setupDataGuid,
      );
      if (embedded) {
        setupData = embedded;
        setupDataMatch = {
          file: amitseMatch.file,
          coherence: amitseMatch.coherence,
        };
      }
    }
    if (setupDataMatch.warning && !setupData) warnings.push(setupDataMatch.warning);
    if (setupDataMatch.warning && setupData) {
      warnings.push(setupDataMatch.warning);
    }
    if (setupDataMatch.file && !setupData) {
      warnings.push(
        "The paired SetupData source does not contain the expected freeform section.",
      );
    }
    const id = artifactSetId(setup);
    const coherence = artifactSetCoherence([amitseMatch, setupDataMatch]);
    sets.push({
      summary: {
        id,
        label: "",
        coherence,
        setupFile: fileReference(setup),
        amitseFile: amitse ? amitse.location.sourceFile : undefined,
        setupDataFile: setupData ? setupData.location.sourceFile : undefined,
        warnings,
      },
      setup,
      hii,
      amitse,
      setupData,
    });
  }
  for (const [index, set] of sets.entries()) {
    set.summary.label = `Firmware context ${String(index + 1)} · layer ${String(set.setup.depth)} · buffer ${String(set.setup.bufferId)} · FV 0x${set.setup.volumeStart.toString(16).toUpperCase()}`;
  }
  return sets;
}

async function runIfrExtractor(hii: Uint8Array) {
  const directory = new Map<string, WasiFile>();
  directory.set("setup.bin", new WasiFile(hii));
  const stdout: string[] = [];
  const wasi = new WASI(
    ["ifrextractor", "setup.bin", "verbose"],
    [],
    [
      new OpenFile(new WasiFile([])),
      ConsoleStdout.lineBuffered((line) => stdout.push(line)),
      ConsoleStdout.lineBuffered((line) => stdout.push(line)),
      new PreopenDirectory(".", directory),
    ],
  );
  const url = `${import.meta.env.BASE_URL}ifrextractor.wasm`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new FirmwareError(
      "PARSE_FAILED",
      "IFRExtractor WebAssembly is not available.",
    );
  }
  const module = await WebAssembly.compileStreaming(response);
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  const exitCode = wasi.start(
    instance as WebAssembly.Instance & {
      exports: { memory: WebAssembly.Memory; _start: () => unknown };
    },
  );
  if (exitCode !== 0)
    throw new FirmwareError(
      "PARSE_FAILED",
      stdout.join("\n") || `IFRExtractor exited with ${String(exitCode)}.`,
    );
  const outputs = [...directory.entries()].filter(([name]) =>
    name.endsWith(".ifr.txt"),
  );
  if (outputs.length === 0)
    throw new FirmwareError(
      "PARSE_FAILED",
      "IFRExtractor did not generate a verbose IFR file.",
    );
  return outputs.map(([, output]) => new TextDecoder().decode(output.data)).join("\n");
}

function retainArtifactBranches(
  graph: ExtractionGraph,
  artifacts: FirmwareArtifactLocation[],
  sourceSize: number,
): FirmwareProvenanceGraph {
  const retained = new Set<number>([0]);
  for (const artifact of artifacts) {
    let bufferId = artifact.bufferId;
    const visited = new Set<number>();
    while (!visited.has(bufferId)) {
      visited.add(bufferId);
      retained.add(bufferId);
      const parent = graph.nodes.get(bufferId)?.parent;
      if (!parent) break;
      bufferId = parent.parentBufferId;
    }
  }

  return {
    rootBufferId: 0,
    sourceSize,
    buffers: [...retained]
      .sort((left, right) => left - right)
      .flatMap((id) => {
        const node = graph.nodes.get(id);
        return node ? [node] : [];
      }),
    artifacts,
  };
}

export async function extractAptioIvBytes(
  image: Uint8Array,
  extractIfr: (hii: Uint8Array) => Promise<string> = runIfrExtractor,
  options: AptioIvExtractionOptions = {},
): Promise<AptioIvArtifacts> {
  const { graph, located: files } = await locateFirmwareFiles(image, [
    setupGuid,
    amitseGuid,
    setupDataGuid,
  ]);
  const setupFiles = files.get(setupGuid) ?? [];
  if (setupFiles.length === 0) {
    throw new FirmwareError(
      "PARSE_FAILED",
      "Setup FFS was not found after recursive decompression.",
    );
  }
  const sets = await locateArtifactSets(graph, files);
  if (sets.length === 0) {
    throw new FirmwareError(
      "PARSE_FAILED",
      "No Setup context contains a usable HII package or Setup PE32 section.",
    );
  }
  const selected = options.artifactSetId
    ? sets.find((set) => set.summary.id === options.artifactSetId)
    : sets[0];
  if (!selected) {
    throw new FirmwareError(
      "INVALID_INPUT",
      "The selected firmware context no longer exists in this image.",
    );
  }
  const ifrText = await extractIfr(selected.hii.bytes);
  const formPackageCount = (ifrText.match(/FormSet Guid:/g) ?? []).length;
  const locations = [
    selected.hii.location,
    selected.amitse?.location,
    selected.setupData?.location,
  ].filter((location): location is FirmwareArtifactLocation => location !== undefined);
  return {
    hii: selected.hii.bytes,
    ifrText,
    amitse: selected.amitse?.bytes,
    setupData: selected.setupData?.bytes,
    formPackageCount,
    extractionDepth: selected.setup.depth,
    artifactSets: sets.map((set) => set.summary),
    selectedArtifactSetId: selected.summary.id,
    provenance: retainArtifactBranches(graph, locations, image.length),
  };
}

export async function extractAptioIvArtifacts(
  file: File,
  options: AptioIvExtractionOptions = {},
): Promise<AptioIvArtifacts> {
  return extractAptioIvBytes(
    new Uint8Array(await file.arrayBuffer()),
    runIfrExtractor,
    options,
  );
}
