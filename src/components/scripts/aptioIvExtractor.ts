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
  bytes: Uint8Array;
  bodyStart: number;
  end: number;
  depth: number;
}

interface FirmwareFileBounds {
  bodyStart: number;
  end: number;
  size: number;
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
  };
}

function findFiles(bytes: Uint8Array, wantedGuids: Set<string>, depth: number) {
  const found = new Map<string, LocatedFile>();
  for (const volumeStart of findVolumes(bytes)) {
    const volumeEnd = volumeStart + readUint64AsNumber(bytes, volumeStart + 0x20);
    let fileStart = volumeStart + align(readUint16(bytes, volumeStart + 0x30), 8);
    while (fileStart + 24 <= volumeEnd) {
      if (bytes.slice(fileStart, fileStart + 24).every((byte) => byte === 0xff)) break;
      const file = firmwareFileBounds(bytes, fileStart, volumeEnd);
      if (!file) break;
      const guid = readGuid(bytes, fileStart);
      if (wantedGuids.has(guid) && !found.has(guid)) {
        found.set(guid, {
          bytes,
          bodyStart: file.bodyStart,
          end: file.end,
          depth,
        });
      }
      fileStart = volumeStart + align(fileStart - volumeStart + file.size, 8);
    }
  }
  return found;
}

async function decodeEncapsulation(bytes: Uint8Array, section: FirmwareSection) {
  const encapsulated = encapsulatedFirmwareSection(bytes, section);
  if (!encapsulated) return null;
  return encapsulated.compression === "none"
    ? encapsulated.bytes
    : firmwareDecompress(encapsulated.bytes, encapsulated.compression);
}

async function nestedBuffers(bytes: Uint8Array) {
  const nested: Uint8Array[] = [];
  for (const volumeStart of findVolumes(bytes)) {
    const volumeEnd = volumeStart + readUint64AsNumber(bytes, volumeStart + 0x20);
    let fileStart = volumeStart + align(readUint16(bytes, volumeStart + 0x30), 8);
    while (fileStart + 24 <= volumeEnd) {
      if (bytes.slice(fileStart, fileStart + 24).every((byte) => byte === 0xff)) break;
      const file = firmwareFileBounds(bytes, fileStart, volumeEnd);
      if (!file) break;
      let sectionStart = file.bodyStart;
      while (sectionStart + 4 <= file.end) {
        const section = readFirmwareSection(bytes, sectionStart, file.end);
        if (!section) break;
        const child = await decodeEncapsulation(bytes, section);
        if (child) nested.push(child);
        sectionStart = align(section.end, 4);
      }
      fileStart = volumeStart + align(fileStart - volumeStart + file.size, 8);
    }
  }
  return nested;
}

async function locateFirmwareFiles(bytes: Uint8Array, wantedGuids: string[]) {
  const queue = [{ bytes, depth: 0 }];
  const remaining = new Set(wantedGuids);
  const located = new Map<string, LocatedFile>();
  for (let index = 0; index < queue.length && index < 64; index++) {
    const current = queue[index];
    const found = findFiles(current.bytes, remaining, current.depth);
    for (const [guid, file] of found) {
      located.set(guid, file);
      remaining.delete(guid);
    }
    if (remaining.size === 0) break;
    const children = await nestedBuffers(current.bytes);
    queue.push(
      ...children.map((child) => ({ bytes: child, depth: current.depth + 1 })),
    );
  }
  return located;
}

type SectionPayloadLocator = (
  bytes: Uint8Array,
  section: FirmwareSection,
) => number | null;

async function locateSectionPayload(
  file: LocatedFile,
  locatePayload: SectionPayloadLocator,
  recursionDepth = 0,
): Promise<Uint8Array | null> {
  let sectionStart = file.bodyStart;
  while (sectionStart + 4 <= file.end) {
    const section = readFirmwareSection(file.bytes, sectionStart, file.end);
    if (!section) break;
    const payloadStart = locatePayload(file.bytes, section);
    if (payloadStart !== null && payloadStart <= section.end) {
      return file.bytes.slice(payloadStart, section.end);
    }
    if (recursionDepth < 16) {
      const nested = await decodeEncapsulation(file.bytes, section);
      const result = nested
        ? await locateSectionPayload(
            {
              bytes: nested,
              bodyStart: 0,
              end: nested.length,
              depth: file.depth,
            },
            locatePayload,
            recursionDepth + 1,
          )
        : null;
      if (result) return result;
    }
    sectionStart = align(section.end, 4);
  }
  return null;
}

async function locateHii(file: LocatedFile) {
  return locateSectionPayload(file, (bytes, section) =>
    section.type === 0x18 &&
    section.size >= section.headerSize + 16 &&
    readGuid(bytes, section.start + section.headerSize) === hiiGuid
      ? section.start + section.headerSize + 16
      : null,
  );
}

async function locateFreeformSection(file: LocatedFile, wantedGuid: string) {
  return locateSectionPayload(file, (bytes, section) =>
    section.type === 0x18 &&
    section.size >= section.headerSize + 16 &&
    readGuid(bytes, section.start + section.headerSize) === wantedGuid
      ? section.start + section.headerSize + 16
      : null,
  );
}

async function locatePe32(file: LocatedFile) {
  return locateSectionPayload(file, (_bytes, section) =>
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

export async function extractAptioIvBytes(
  image: Uint8Array,
): Promise<AptioIvArtifacts> {
  const files = await locateFirmwareFiles(image, [
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
  const hii = (await locateHii(setup)) ?? (await locatePe32(setup));
  if (!hii) {
    throw new FirmwareError(
      "PARSE_FAILED",
      "Neither a Setup HII package nor a Setup PE32 section was found.",
    );
  }
  const amitseFile = files.get(amitseGuid);
  const setupDataFile = files.get(setupDataGuid);
  const amitse = amitseFile ? await locatePe32(amitseFile) : null;
  let setupData = setupDataFile
    ? await locateFreeformSection(setupDataFile, setupDataGuid)
    : null;
  if (!setupData && amitseFile) {
    setupData = await locateFreeformSection(amitseFile, setupDataGuid);
  }
  const ifrText = await runIfrExtractor(hii);
  const formPackageCount = (ifrText.match(/FormSet Guid:/g) ?? []).length;
  return {
    hii,
    ifrText,
    amitse: amitse ?? undefined,
    setupData: setupData ?? undefined,
    formPackageCount,
    extractionDepth: setup.depth,
  };
}

export async function extractAptioIvArtifacts(file: File): Promise<AptioIvArtifacts> {
  return extractAptioIvBytes(new Uint8Array(await file.arrayBuffer()));
}
