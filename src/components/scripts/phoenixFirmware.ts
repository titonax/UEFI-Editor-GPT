import { readGuid, readUint16, readUint24, readUint32 } from "./binaryReader";

export interface PhoenixModule {
  name: string;
  kind: string;
  offset: number;
  size: number;
  compression: "lh5" | "none" | "unknown";
  packedSize?: number;
  unpackedSize?: number;
}

export interface PhoenixLegacyInventory {
  format: "phoenix-ffv" | "phoenix-module-chain";
  buildCode: string;
  buildDate: string;
  compressionAlgorithm: number | null;
  directoryOffset: number | null;
  volumeCount: number;
  modules: PhoenixModule[];
  warnings: string[];
}

export interface PhoenixUefiInventory {
  secureCore: boolean;
  debugModules: string[];
}

const names: Record<string, string> = {
  A: "ACPI",
  B: "BIOSCOD",
  C: "UPDATE",
  D: "DISPLAY",
  E: "SETUP",
  G: "DECOMPCODE",
  L: "LOGO",
  M: "MISER",
  R: "OPROM",
  S: "STRINGS",
  T: "TEMPLAT",
  X: "ROMEXEC",
};
const ffvGuid = "FED91FBA-D37B-4EEA-8729-2EF29FB37A78";

function matches(bytes: Uint8Array, offset: number, value: string) {
  if (offset < 0 || offset + value.length > bytes.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false;
  }
  return true;
}

function find(bytes: Uint8Array, value: string, start = 0) {
  for (let offset = start; offset + value.length <= bytes.length; offset += 1) {
    if (bytes[offset] === value.charCodeAt(0) && matches(bytes, offset, value)) {
      return offset;
    }
  }
  return -1;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function bcpRecord(bytes: Uint8Array, name: string, minimum: number) {
  const offset = find(bytes, name);
  if (offset < 0 || offset + 10 > bytes.length) return -1;
  const length = readUint16(bytes, offset + 8);
  return length >= minimum && offset + length <= bytes.length ? offset : -1;
}

function ffvModuleName(bytes: Uint8Array, offset: number) {
  const raw = bytes.subarray(offset + 8, offset + 24);
  const decoded =
    Array.from(raw, (value) => (value === 0xff ? "" : String.fromCharCode(value)))
      .join("")
      .split("\0")[0] ?? "";
  const match = /^_([A-Z])([0-9A-F]{2})$/.exec(decoded);
  if (!match && !/^[A-Za-z0-9_.-]{1,16}$/.test(decoded)) return "Unknown FFV module";
  return match
    ? `${names[match[1]] ?? match[1]}${String(Number.parseInt(match[2], 16))}.ROM`
    : decoded;
}

function readFfvModules(
  bytes: Uint8Array,
  start: number,
  end: number,
  compressionAlgorithm: number | null,
  warnings: string[],
) {
  const modules: PhoenixModule[] = [];
  let offset = start;
  while (offset + 24 <= end && modules.length < 8192) {
    if (bytes[offset] !== 0xf8) {
      // Phoenix can leave alignment bytes between FFV modules.
      offset += 1;
      continue;
    }
    const size = readUint24(bytes, offset + 4);
    if (size < 24 || offset + size > end) {
      warnings.push(`FFV module at 0x${offset.toString(16)} exceeds its volume.`);
      break;
    }
    if (bytes[offset + 7] !== 0xf0) {
      const name = ffvModuleName(bytes, offset);
      const section = offset + 24;
      const compressed =
        bytes[offset + 7] === 2 &&
        section + 12 <= offset + size &&
        bytes[section + 3] === 1;
      const packedSize = compressed ? readUint24(bytes, section + 4) : undefined;
      const unpackedSize = compressed ? readUint24(bytes, section + 8) : undefined;
      const sectionSize = compressed ? readUint24(bytes, section) : undefined;
      const validCompression =
        compressed &&
        packedSize !== undefined &&
        unpackedSize !== undefined &&
        sectionSize !== undefined &&
        packedSize > 0 &&
        unpackedSize > 0 &&
        sectionSize >= packedSize + 12 &&
        section + sectionSize <= offset + size &&
        section + 12 + packedSize <= offset + size;
      if (compressed && !validCompression)
        warnings.push(`Compressed section in ${name} exceeds its module.`);
      modules.push({
        name,
        kind: bytes[offset + 7] === 2 ? "section" : "raw",
        offset,
        size,
        compression:
          validCompression && [2, 3].includes(compressionAlgorithm ?? -1)
            ? "lh5"
            : compressed
              ? "unknown"
              : "none",
        ...(validCompression ? { packedSize, unpackedSize } : {}),
      });
    }
    offset += size;
  }
  if (modules.length === 8192)
    warnings.push("Phoenix module inventory exceeds its safety limit.");
  return modules;
}

/** Read Phoenix 4.0 BCP and FFV metadata. Never interprets or patches Setup. */
export function inspectPhoenixLegacyBytes(
  bytes: Uint8Array,
): PhoenixLegacyInventory | null {
  if (
    find(bytes, "PhoenixBIOS") < 0 ||
    bytes.length < 0x10000 ||
    (bytes.length & (bytes.length - 1)) !== 0
  )
    return null;
  const sys = bcpRecord(bytes, "BCPSYS", 0x7b);
  const cmp = bcpRecord(bytes, "BCPCMP", 0x0c);
  if (sys < 0 || cmp < 0) return null;
  const buildCode = ascii(bytes, sys + 0x37, 8)
    .replace(/\0/g, "")
    .trim();
  const buildDate = ascii(bytes, sys + 0x0f, 8)
    .replace(/\0/g, "")
    .trim();
  const compressionAlgorithm = bytes[cmp + 0x0b] ?? null;
  const warnings: string[] = [];
  const ffv = bcpRecord(bytes, "BCPFFV", 14);
  if (ffv >= 0) {
    const offset = readUint32(bytes, ffv + 10) & (bytes.length - 1);
    if (
      offset + 32 <= bytes.length &&
      bytes[offset] === 0xf8 &&
      ffvModuleName(bytes, offset) === "volumedir.bin2"
    ) {
      const directory = offset + 24;
      const length = readUint32(bytes, directory + 4);
      const moduleEnd = offset + readUint24(bytes, offset + 4);
      if (
        length >= 8 &&
        (length - 8) % 24 === 0 &&
        directory + length <= moduleEnd &&
        moduleEnd <= bytes.length &&
        (length - 8) / 24 <= 4096
      ) {
        const modules: PhoenixModule[] = [];
        const volumeCount = (length - 8) / 24;
        for (let index = 0; index < volumeCount; index += 1) {
          const entry = directory + 8 + index * 24;
          if (readGuid(bytes, entry) !== ffvGuid) continue;
          const start = readUint32(bytes, entry + 16) & (bytes.length - 1);
          const length = readUint32(bytes, entry + 20);
          if (length === 0 || start + length > bytes.length) {
            warnings.push(`FFV volume ${String(index)} exceeds the image.`);
            continue;
          }
          modules.push(
            ...readFfvModules(
              bytes,
              start,
              start + length,
              compressionAlgorithm,
              warnings,
            ),
          );
        }
        return {
          format: "phoenix-ffv",
          buildCode,
          buildDate,
          compressionAlgorithm,
          directoryOffset: offset,
          volumeCount,
          modules,
          warnings,
        };
      }
      warnings.push("The Phoenix FFV directory is malformed or truncated.");
    }
  }

  // Older Phoenix 4.0 images link conventional modules through BCPSYS.
  let next = readUint32(bytes, sys + 0x77) & (bytes.length - 1);
  const visited = new Set<number>();
  const modules: PhoenixModule[] = [];
  while (
    next &&
    next + 27 <= bytes.length &&
    !visited.has(next) &&
    visited.size < 2048
  ) {
    visited.add(next);
    if (!matches(bytes, next + 4, "\0" + "11")) {
      warnings.push(`Invalid Phoenix module header at 0x${next.toString(16)}.`);
      break;
    }
    const headerLength = bytes[next + 9];
    const packedSize = readUint32(bytes, next + 19);
    if (headerLength < 27 || next + headerLength + packedSize > bytes.length) {
      warnings.push(`Phoenix module at 0x${next.toString(16)} exceeds the image.`);
      break;
    }
    const type = String.fromCharCode(bytes[next + 8]);
    const compression = bytes[next + 10];
    modules.push({
      name: `${names[type] ?? type}${String(bytes[next + 7])}.ROM`,
      kind: "legacy module",
      offset: next,
      size: headerLength + packedSize,
      compression: compression === 5 ? "lh5" : compression === 0 ? "none" : "unknown",
      packedSize,
      unpackedSize: readUint32(bytes, next + 15),
    });
    next = readUint32(bytes, next) & (bytes.length - 1);
  }
  if (next && visited.has(next))
    warnings.push("Phoenix module chain contains a cycle.");
  return modules.length > 0
    ? {
        format: "phoenix-module-chain",
        buildCode,
        buildDate,
        compressionAlgorithm,
        directoryOffset: null,
        volumeCount: 0,
        modules,
        warnings,
      }
    : null;
}

/** PDB debug records are module provenance, not proof of the Setup implementation. */
export function inspectPhoenixUefiBytes(
  bytes: Uint8Array,
): PhoenixUefiInventory | null {
  const modules = new Set<string>();
  let start = 0;
  while (modules.size < 64) {
    const rsds = find(bytes, "RSDS", start);
    if (rsds < 0) break;
    start = rsds + 4;
    const pathStart = rsds + 24;
    if (pathStart + 8 > bytes.length) continue;
    const end = Math.min(bytes.length, pathStart + 512);
    let terminator = pathStart;
    while (terminator < end && bytes[terminator] !== 0) terminator += 1;
    if (terminator === end) continue;
    const path = ascii(bytes, pathStart, terminator - pathStart);
    if (!/\\Phoenix\\/i.test(path) || !/\.pdb$/i.test(path)) continue;
    const pathSegments = path.split("\\");
    const moduleName = pathSegments[pathSegments.length - 1]?.replace(/\.pdb$/i, "");
    if (moduleName && /^[A-Za-z0-9_+.-]{1,80}$/.test(moduleName))
      modules.add(moduleName);
  }
  if (modules.size === 0) return null;
  return {
    secureCore: [...modules].some((name) => /^SecCore$/i.test(name)),
    debugModules: [...modules],
  };
}
