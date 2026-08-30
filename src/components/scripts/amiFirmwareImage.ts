import { readUint16, readUint64AsNumber } from "./binaryReader";

export type AmiFirmwareGeneration = "aptio-iv" | "aptio-v" | "unresolved";
export type DetectionConfidence = "confirmed" | "probable" | "unresolved";
export type FirmwareContainer =
  "intel-flash" | "firmware-volume-image" | "vendor-image" | "unknown";

export interface FirmwareEvidence {
  code: string;
  summary: string;
  detail: string;
  supports: "uefi" | "ami-aptio" | "aptio-iv" | "aptio-v" | "container";
  strength: "strong" | "supporting" | "context";
}

export interface AmiFirmwareImageReport {
  size: number;
  container: FirmwareContainer;
  intelDescriptor: boolean;
  firmwareVolumes: number[];
  ffs2Volumes: number[];
  ffs3Volumes: number[];
  setupFfs: number[];
  amitseFfs: number[];
  setupDataProfiles: number[];
  nestedFirmwareCandidate: boolean;
  deepScanRequired: boolean;
  amiAptioCandidate: boolean;
  generation: AmiFirmwareGeneration;
  confidence: DetectionConfidence;
  evidence: FirmwareEvidence[];
}

interface SignatureDefinition {
  name: string;
  bytes: Uint8Array;
  alignment?: number;
  insensitiveAscii?: boolean;
}

const signatures: SignatureDefinition[] = [
  { name: "firmwareVolume", bytes: ascii("_FVH") },
  {
    name: "setupFfs",
    bytes: hex("D7079489FE99D8439A2179EC328CAC21"),
    alignment: 8,
  },
  {
    name: "amitseFfs",
    bytes: hex("DF0ADAB1774F7040A88EBFFE1C60529A"),
    alignment: 8,
  },
  {
    name: "setupDataGuid",
    bytes: hex("722B61FE3C20B1478560A66D946EB371"),
  },
  { name: "amitseSetup", bytes: ascii("AMITSESetup") },
  { name: "nvar", bytes: ascii("NVAR") },
  { name: "setupDataProfile", bytes: ascii("$SPF") },
  {
    name: "americanMegatrends",
    bytes: ascii("American Megatrends"),
    insensitiveAscii: true,
  },
  { name: "aptioIv", bytes: ascii("Aptio IV"), insensitiveAscii: true },
  { name: "aptio4", bytes: ascii("Aptio 4"), insensitiveAscii: true },
  { name: "aptioV", bytes: ascii("Aptio V"), insensitiveAscii: true },
  { name: "aptio5", bytes: ascii("Aptio 5"), insensitiveAscii: true },
];

const ffs2Guid = hex("78E58C8C3D8A1C4F9935896185C32DD3");
const ffs3Guid = hex("7AC07354CB3DCA4DBD6F1E9689E7349A");
const intelDescriptorSignature = hex("5AA5F00F");

function ascii(value: string) {
  return new TextEncoder().encode(value);
}

function hex(value: string) {
  return Uint8Array.from(value.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function bytesEqual(
  bytes: Uint8Array,
  offset: number,
  expected: Uint8Array,
  insensitiveAscii = false,
) {
  if (offset < 0 || offset + expected.length > bytes.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const actual = bytes[offset + index];
    const wanted = expected[index];
    if (actual === wanted) continue;
    if (
      !insensitiveAscii ||
      actual === undefined ||
      wanted === undefined ||
      actual < 0x41 ||
      actual > 0x7a ||
      (actual | 0x20) !== (wanted | 0x20)
    ) {
      return false;
    }
  }
  return true;
}

function scanSignatures(bytes: Uint8Array) {
  const results = new Map<string, number[]>();
  const byFirstByte = new Map<number, SignatureDefinition[]>();
  for (const signature of signatures) {
    results.set(signature.name, []);
    const first = signature.bytes[0];
    if (first === undefined) continue;
    const keys = signature.insensitiveAscii ? [first & ~0x20, first | 0x20] : [first];
    for (const key of new Set(keys)) {
      const group = byFirstByte.get(key) ?? [];
      group.push(signature);
      byFirstByte.set(key, group);
    }
  }

  for (let offset = 0; offset < bytes.length; offset += 1) {
    const value = bytes[offset];
    if (value === undefined) continue;
    for (const signature of byFirstByte.get(value) ?? []) {
      if (
        offset % (signature.alignment ?? 1) === 0 &&
        bytesEqual(bytes, offset, signature.bytes, signature.insensitiveAscii)
      ) {
        results.get(signature.name)?.push(offset);
      }
    }
  }
  return results;
}

function isValidFirmwareVolume(bytes: Uint8Array, start: number) {
  if (start < 0 || start + 0x38 > bytes.length || start % 8 !== 0) return false;
  const volumeLength = readUint64AsNumber(bytes, start + 0x20);
  const headerLength = readUint16(bytes, start + 0x30);
  if (
    headerLength < 0x38 ||
    headerLength % 2 !== 0 ||
    volumeLength < headerLength ||
    start + volumeLength > bytes.length
  ) {
    return false;
  }

  let checksum = 0;
  for (let offset = 0; offset < headerLength; offset += 2) {
    checksum = (checksum + readUint16(bytes, start + offset)) & 0xffff;
  }
  return checksum === 0;
}

function offsets(results: Map<string, number[]>, name: string) {
  return results.get(name) ?? [];
}

function has(results: Map<string, number[]>, ...names: string[]) {
  return names.some((name) => offsets(results, name).length > 0);
}

function containerOf(
  firmwareVolumes: number[],
  intelDescriptor: boolean,
): FirmwareContainer {
  if (intelDescriptor) return "intel-flash";
  if (firmwareVolumes.includes(0)) return "firmware-volume-image";
  if (firmwareVolumes.length > 0) return "vendor-image";
  return "unknown";
}

export function inspectAmiFirmwareBytes(bytes: Uint8Array): AmiFirmwareImageReport {
  const found = scanSignatures(bytes);
  const firmwareVolumes = offsets(found, "firmwareVolume")
    .map((offset) => offset - 0x28)
    .filter((offset) => isValidFirmwareVolume(bytes, offset));
  const setupFfs = offsets(found, "setupFfs");
  const amitseFfs = offsets(found, "amitseFfs");
  const setupDataProfiles = offsets(found, "setupDataProfile");
  const ffs2Volumes = firmwareVolumes.filter((offset) =>
    bytesEqual(bytes, offset + 0x10, ffs2Guid),
  );
  const ffs3Volumes = firmwareVolumes.filter((offset) =>
    bytesEqual(bytes, offset + 0x10, ffs3Guid),
  );
  const intelDescriptor = bytesEqual(bytes, 0x10, intelDescriptorSignature);
  const explicitIv = has(found, "aptioIv", "aptio4");
  const explicitV = has(found, "aptioV", "aptio5");
  const hasAmiMarkers = has(
    found,
    "amitseSetup",
    "americanMegatrends",
    "setupDataGuid",
    "setupDataProfile",
  );
  const amiAptioCandidate =
    firmwareVolumes.length > 0 &&
    (hasAmiMarkers ||
      setupFfs.length > 0 ||
      amitseFfs.length > 0 ||
      explicitIv ||
      explicitV);

  let generation: AmiFirmwareGeneration = "unresolved";
  let confidence: DetectionConfidence = "unresolved";
  if (explicitIv !== explicitV) {
    generation = explicitIv ? "aptio-iv" : "aptio-v";
    confidence = "probable";
  } else if (
    setupDataProfiles.length > 0 &&
    offsets(found, "setupDataGuid").length > 0
  ) {
    generation = "aptio-iv";
    confidence = "probable";
  }

  const evidence: FirmwareEvidence[] = [];
  if (firmwareVolumes.length > 0) {
    evidence.push({
      code: "valid-fv",
      summary: `${String(firmwareVolumes.length)} valid firmware volume(s)`,
      detail: "UEFI PI firmware volumes passed bounds and header-checksum validation.",
      supports: "uefi",
      strength: "strong",
    });
  }
  if (intelDescriptor) {
    evidence.push({
      code: "intel-descriptor",
      summary: "Intel flash descriptor",
      detail: "The input appears to be a complete Intel SPI flash image.",
      supports: "container",
      strength: "strong",
    });
  }
  if (has(found, "amitseSetup")) {
    evidence.push({
      code: "amitse-setup",
      summary: "AMITSESetup NVRAM marker",
      detail: "This supports the AMI Aptio family, but is shared by Aptio IV and V.",
      supports: "ami-aptio",
      strength: "strong",
    });
  }
  if (setupFfs.length > 0 || amitseFfs.length > 0) {
    evidence.push({
      code: "classic-ami-modules",
      summary: "AMI Setup/AMITSE module GUIDs",
      detail:
        "Classic AMI module identities were found; the attached Aptio V corpus proves that these GUIDs are not generation-specific.",
      supports: "ami-aptio",
      strength: "strong",
    });
  }
  if (has(found, "americanMegatrends")) {
    evidence.push({
      code: "ami-vendor-string",
      summary: "American Megatrends vendor string",
      detail: "Uncompressed AMI vendor metadata is present.",
      supports: "ami-aptio",
      strength: "supporting",
    });
  }
  if (ffs3Volumes.length > 0) {
    evidence.push({
      code: "ffs3",
      summary: `${String(ffs3Volumes.length)} FFS3 volume(s)`,
      detail: "FFS3 is a PI format capability and is not proof of Aptio V.",
      supports: "uefi",
      strength: "context",
    });
  }
  if (explicitIv || explicitV) {
    evidence.push({
      code: "explicit-generation",
      summary:
        explicitIv && explicitV
          ? "Conflicting Aptio generation strings"
          : `Explicit ${explicitIv ? "Aptio IV/4" : "Aptio V/5"} metadata`,
      detail:
        explicitIv && explicitV
          ? "Both generations are named, so the image cannot be classified from strings alone."
          : "An explicit generation string was found in the image.",
      supports:
        explicitIv && explicitV ? "ami-aptio" : explicitIv ? "aptio-iv" : "aptio-v",
      strength: "strong",
    });
  }
  if (setupDataProfiles.length > 0) {
    evidence.push({
      code: "spf-profile",
      summary: "$SPF SetupData profile",
      detail:
        "This matches the confirmed Aptio IV corpus, but is treated as a profile rather than a universal product marker.",
      supports: "aptio-iv",
      strength: "supporting",
    });
  }

  const deepScanRequired = firmwareVolumes.length > 0 && setupFfs.length === 0;
  return {
    size: bytes.length,
    container: containerOf(firmwareVolumes, intelDescriptor),
    intelDescriptor,
    firmwareVolumes,
    ffs2Volumes,
    ffs3Volumes,
    setupFfs,
    amitseFfs,
    setupDataProfiles,
    nestedFirmwareCandidate:
      firmwareVolumes.length > 0 && setupFfs.length === 0 && hasAmiMarkers,
    deepScanRequired,
    amiAptioCandidate,
    generation,
    confidence,
    evidence,
  };
}

export async function inspectAmiFirmwareImage(
  file: File,
): Promise<AmiFirmwareImageReport> {
  return inspectAmiFirmwareBytes(new Uint8Array(await file.arrayBuffer()));
}

export function formatHexOffset(offset: number) {
  return `0x${offset.toString(16).toUpperCase().padStart(6, "0")}`;
}
