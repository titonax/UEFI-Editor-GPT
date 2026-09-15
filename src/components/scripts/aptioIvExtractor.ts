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
  FirmwareArtifactLocation,
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
  provenance: FirmwareProvenanceGraph;
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
  const found = new Map<string, LocatedFile>();
  for (const volumeStart of findTopLevelVolumes(bytes)) {
    const volumeEnd = volumeStart + readUint64AsNumber(bytes, volumeStart + 0x20);
    let fileStart = volumeStart + align(readUint16(bytes, volumeStart + 0x30), 8);
    while (fileStart + 24 <= volumeEnd) {
      if (bytes.slice(fileStart, fileStart + 24).every((byte) => byte === 0xff)) break;
      const file = firmwareFileBounds(bytes, fileStart, volumeEnd);
      if (!file) break;
      const guid = readGuid(bytes, fileStart);
      if (wantedGuids.has(guid) && !found.has(guid)) {
        found.set(guid, {
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
  const remaining = new Set(wantedGuids);
  const located = new Map<string, LocatedFile>();
  for (let index = 0; index < queue.length && index < 64; index++) {
    const current = queue[index];
    const found = findFiles(current, remaining);
    for (const [guid, file] of found) {
      located.set(guid, file);
      remaining.delete(guid);
    }
    if (remaining.size === 0) break;
    const children = await nestedBuffers(graph, current);
    queue.push(...children);
  }
  return { graph, located };
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
): Promise<AptioIvArtifacts> {
  const { graph, located: files } = await locateFirmwareFiles(image, [
    setupGuid,
    amitseGuid,
    setupDataGuid,
  ]);
  const setup = files.get(setupGuid);
  if (!setup) {
    throw new FirmwareError(
      "PARSE_FAILED",
      "Setup FFS was not found after recursive decompression.",
    );
  }
  const hii =
    (await locateHii(graph, setup)) ?? (await locatePe32(graph, setup, "setup-hii"));
  if (!hii) {
    throw new FirmwareError(
      "PARSE_FAILED",
      "Neither a Setup HII package nor a Setup PE32 section was found.",
    );
  }
  const amitseFile = files.get(amitseGuid);
  const setupDataFile = files.get(setupDataGuid);
  const amitse = amitseFile ? await locatePe32(graph, amitseFile, "amitse") : null;
  let setupData = setupDataFile
    ? await locateFreeformSection(graph, setupDataFile, setupDataGuid)
    : null;
  if (!setupData && amitseFile) {
    setupData = await locateFreeformSection(graph, amitseFile, setupDataGuid);
  }
  const ifrText = await extractIfr(hii.bytes);
  const formPackageCount = (ifrText.match(/FormSet Guid:/g) ?? []).length;
  const locations = [hii.location, amitse?.location, setupData?.location].filter(
    (location): location is FirmwareArtifactLocation => location !== undefined,
  );
  return {
    hii: hii.bytes,
    ifrText,
    amitse: amitse?.bytes,
    setupData: setupData?.bytes,
    formPackageCount,
    extractionDepth: setup.depth,
    provenance: retainArtifactBranches(graph, locations, image.length),
  };
}

export async function extractAptioIvArtifacts(file: File): Promise<AptioIvArtifacts> {
  return extractAptioIvBytes(new Uint8Array(await file.arrayBuffer()));
}
