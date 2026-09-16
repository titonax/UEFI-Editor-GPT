import { align, readUint32, readUint64AsNumber } from "./binaryReader";
import { readFirmwareSection } from "./firmwareSections";
import type {
  FirmwareArtifactLocation,
  FirmwareBufferNode,
  FirmwareProvenanceGraph,
} from "./firmwareProvenance";
import type { AmiRootVisibilityEntry, AmiRootVisibilityReport, Menu } from "./types";

const PE_MACHINE_X64 = 0x8664;
const PE32_PLUS_MAGIC = 0x20b;
const PE_SECTION_HEADER_SIZE = 40;
const PE_MEM_EXECUTE = 0x20000000;
const PE_MEM_WRITE = 0x80000000;
const PAGE_RECORD_STRIDE = 0x20;
const AMITSE_USER_PASSWORD_VALID_GUID = Uint8Array.from([
  0xee, 0x2e, 0x20, 0x71, 0x53, 0x5f, 0xd9, 0x40, 0xab, 0x3d, 0x9e, 0x0c, 0x26, 0xd9,
  0x66, 0x57,
]);

interface PeSection {
  name: string;
  virtualAddress: number;
  virtualSize: number;
  rawStart: number;
  rawSize: number;
  characteristics: number;
}

interface PeImage {
  start: number;
  end: number;
  imageBase: number;
  sections: PeSection[];
}

interface RootVectorCandidate {
  bufferId: number;
  vectorOffset: number;
  codeOffset: number;
  pageTableOffset: number;
  values: number[];
  countEvidence: "immediate" | "data";
  landmarkOffset?: number;
}

function readUint16Unchecked(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32Unchecked(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    true,
  );
}

function readInt32Unchecked(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(
    offset,
    true,
  );
}

function sectionName(bytes: Uint8Array, offset: number) {
  const end = Math.min(offset + 8, bytes.length);
  let name = "";
  for (let index = offset; index < end && bytes[index] !== 0; index += 1) {
    name += String.fromCharCode(bytes[index]);
  }
  return name;
}

function parsePeImage(bytes: Uint8Array, start: number, end: number): PeImage | null {
  if (
    start < 0 ||
    end > bytes.length ||
    start + 0x40 > end ||
    bytes[start] !== 0x4d ||
    bytes[start + 1] !== 0x5a
  ) {
    return null;
  }

  const peHeader = start + readUint32Unchecked(bytes, start + 0x3c);
  if (
    peHeader + 24 > end ||
    bytes[peHeader] !== 0x50 ||
    bytes[peHeader + 1] !== 0x45 ||
    bytes[peHeader + 2] !== 0 ||
    bytes[peHeader + 3] !== 0 ||
    readUint16Unchecked(bytes, peHeader + 4) !== PE_MACHINE_X64
  ) {
    return null;
  }

  const sectionCount = readUint16Unchecked(bytes, peHeader + 6);
  const optionalHeaderSize = readUint16Unchecked(bytes, peHeader + 20);
  const optionalHeader = peHeader + 24;
  const sectionTable = optionalHeader + optionalHeaderSize;
  if (
    optionalHeader + optionalHeaderSize > end ||
    optionalHeaderSize < 32 ||
    readUint16Unchecked(bytes, optionalHeader) !== PE32_PLUS_MAGIC ||
    sectionCount === 0 ||
    sectionCount > 96 ||
    sectionTable + sectionCount * PE_SECTION_HEADER_SIZE > end
  ) {
    return null;
  }

  const imageBase = readUint64AsNumber(bytes, optionalHeader + 24);
  if (imageBase === 0) return null;

  const sections: PeSection[] = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const header = sectionTable + index * PE_SECTION_HEADER_SIZE;
    const rawSize = readUint32Unchecked(bytes, header + 16);
    const rawPointer = readUint32Unchecked(bytes, header + 20);
    const rawStart = start + rawPointer;
    if (rawSize === 0 || rawStart < start || rawStart + rawSize > end) continue;
    sections.push({
      name: sectionName(bytes, header),
      virtualSize: readUint32Unchecked(bytes, header + 8),
      virtualAddress: readUint32Unchecked(bytes, header + 12),
      rawStart,
      rawSize,
      characteristics: readUint32Unchecked(bytes, header + 36),
    });
  }

  return sections.length > 0 ? { start, end, imageBase, sections } : null;
}

function mapAddressToOffset(pe: PeImage, address: number) {
  const rva = address - pe.imageBase;
  if (!Number.isSafeInteger(rva) || rva < 0) return null;
  for (const section of pe.sections) {
    const mappedSize = Math.max(section.virtualSize, section.rawSize);
    if (rva < section.virtualAddress || rva >= section.virtualAddress + mappedSize) {
      continue;
    }
    const delta = rva - section.virtualAddress;
    if (delta >= section.rawSize) return null;
    return section.rawStart + delta;
  }
  return null;
}

function sectionContaining(pe: PeImage, offset: number) {
  return pe.sections.find(
    (section) =>
      offset >= section.rawStart && offset < section.rawStart + section.rawSize,
  );
}

function resolveRipRelativeTarget(
  bytes: Uint8Array,
  pe: PeImage,
  instructionOffset: number,
) {
  const instructionSection = sectionContaining(pe, instructionOffset);
  if (!instructionSection || instructionOffset + 7 > pe.end) return null;
  const instructionRva =
    instructionSection.virtualAddress + instructionOffset - instructionSection.rawStart;
  const nextAddress = pe.imageBase + instructionRva + 7;
  return mapAddressToOffset(
    pe,
    nextAddress + readInt32Unchecked(bytes, instructionOffset + 3),
  );
}

function indexOfSequence(
  bytes: Uint8Array,
  sequence: ArrayLike<number>,
  start: number,
  end: number,
) {
  const limit = Math.min(end, bytes.length) - sequence.length;
  outer: for (let offset = Math.max(0, start); offset <= limit; offset += 1) {
    for (let index = 0; index < sequence.length; index += 1) {
      if (bytes[offset + index] !== sequence[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

function findAll(bytes: Uint8Array, needle: Uint8Array, start: number, end: number) {
  const matches: number[] = [];
  let cursor = start;
  while (cursor + needle.length <= end) {
    const match = indexOfSequence(bytes, needle, cursor, end);
    if (match < 0) break;
    matches.push(match);
    cursor = match + 1;
  }
  return matches;
}

function hasBackwardBranch(bytes: Uint8Array, start: number, end: number) {
  for (let offset = start; offset + 2 <= end; offset += 1) {
    if (
      (bytes[offset] === 0x72 || bytes[offset] === 0x75) &&
      (bytes[offset + 1] & 0x80) !== 0
    ) {
      return true;
    }
    if (
      offset + 6 <= end &&
      bytes[offset] === 0x0f &&
      (bytes[offset + 1] === 0x82 || bytes[offset + 1] === 0x85) &&
      readInt32Unchecked(bytes, offset + 2) < 0
    ) {
      return true;
    }
  }
  return false;
}

function immediateCountEvidence(
  bytes: Uint8Array,
  rootCount: number,
  textStart: number,
  vectorLea: number,
) {
  const start = Math.max(textStart, vectorLea - 192);
  for (let offset = start; offset + 5 <= vectorLea; offset += 1) {
    if (
      bytes[offset] >= 0xb8 &&
      bytes[offset] <= 0xbf &&
      readUint32Unchecked(bytes, offset + 1) === rootCount
    ) {
      return true;
    }
  }
  return false;
}

function dataCountEvidence(
  bytes: Uint8Array,
  pe: PeImage,
  rootCount: number,
  start: number,
  end: number,
) {
  for (
    let offset = Math.max(0, start);
    offset + 6 <= Math.min(end, pe.end);
    offset += 1
  ) {
    const modRm = bytes[offset + 1];
    if (bytes[offset] !== 0x8b || (modRm & 0xc7) !== 0x05) continue;
    const instructionSection = sectionContaining(pe, offset);
    if (!instructionSection) continue;
    const instructionRva =
      instructionSection.virtualAddress + offset - instructionSection.rawStart;
    const address =
      pe.imageBase + instructionRva + 6 + readInt32Unchecked(bytes, offset + 2);
    const target = mapAddressToOffset(pe, address);
    if (
      target !== null &&
      target + 4 <= pe.end &&
      readUint32(bytes, target) === rootCount
    ) {
      return true;
    }
  }
  return false;
}

function nearestLandmark(bytes: Uint8Array, pe: PeImage, vectorOffset: number) {
  const writableSections = pe.sections.filter(
    (section) => (section.characteristics & PE_MEM_WRITE) !== 0,
  );
  const matches = writableSections.flatMap((section) =>
    findAll(
      bytes,
      AMITSE_USER_PASSWORD_VALID_GUID,
      section.rawStart,
      section.rawStart + section.rawSize,
    ),
  );
  const nearby = matches
    .map((offset) => ({ offset, distance: Math.abs(offset - vectorOffset) }))
    .filter(({ distance }) => distance <= 0x400)
    .sort((left, right) => left.distance - right.distance);
  return nearby[0]?.offset;
}

function scanPeForRootVector(
  bytes: Uint8Array,
  pe: PeImage,
  bufferId: number,
  rootCount: number,
) {
  const candidates: RootVectorCandidate[] = [];
  for (const text of pe.sections.filter(
    (section) => (section.characteristics & PE_MEM_EXECUTE) !== 0,
  )) {
    const textEnd = text.rawStart + text.rawSize;
    for (let vectorLea = text.rawStart; vectorLea + 14 <= textEnd; vectorLea += 1) {
      const vectorModRm = bytes[vectorLea + 2];
      if (
        bytes[vectorLea] !== 0x48 ||
        bytes[vectorLea + 1] !== 0x8d ||
        (vectorModRm & 0xc7) !== 0x05
      ) {
        continue;
      }
      const vectorRegister = (vectorModRm >> 3) & 0x07;
      const tableLea = vectorLea + 7;
      const tableModRm = bytes[tableLea + 2];
      if (
        bytes[tableLea] !== 0x48 ||
        bytes[tableLea + 1] !== 0x8d ||
        (tableModRm & 0xc7) !== 0x05
      ) {
        continue;
      }
      const tableRegister = (tableModRm >> 3) & 0x07;
      if (tableRegister === vectorRegister) continue;

      const vectorOffset = resolveRipRelativeTarget(bytes, pe, vectorLea);
      const pageTableOffset = resolveRipRelativeTarget(bytes, pe, tableLea);
      if (vectorOffset === null || pageTableOffset === null) continue;
      const vectorSection = sectionContaining(pe, vectorOffset);
      const tableSection = sectionContaining(pe, pageTableOffset);
      if (
        !vectorSection ||
        !tableSection ||
        (vectorSection.characteristics & PE_MEM_WRITE) === 0 ||
        (tableSection.characteristics & PE_MEM_WRITE) === 0 ||
        vectorOffset + rootCount > vectorSection.rawStart + vectorSection.rawSize ||
        pageTableOffset + (rootCount - 1) * PAGE_RECORD_STRIDE + 8 >
          tableSection.rawStart + tableSection.rawSize
      ) {
        continue;
      }

      const values = [...bytes.slice(vectorOffset, vectorOffset + rootCount)];
      if (values.length !== rootCount || !values.every((value) => value <= 1)) {
        continue;
      }
      if (!values.includes(1)) continue;

      const loopStart = tableLea + 7;
      const loopEnd = Math.min(loopStart + 96, textEnd);
      const comparison = indexOfSequence(
        bytes,
        [0x80, 0x38 | vectorRegister, 0x00],
        loopStart,
        loopEnd,
      );
      const vectorIncrement = indexOfSequence(
        bytes,
        [0x48, 0xff, 0xc0 | vectorRegister],
        comparison < 0 ? loopStart : comparison,
        loopEnd,
      );
      const tableStride = indexOfSequence(
        bytes,
        [0x48, 0x83, 0xc0 | tableRegister, PAGE_RECORD_STRIDE],
        comparison < 0 ? loopStart : comparison,
        loopEnd,
      );
      if (
        comparison < 0 ||
        vectorIncrement < comparison ||
        tableStride < comparison ||
        !hasBackwardBranch(bytes, Math.max(vectorIncrement, tableStride), loopEnd)
      ) {
        continue;
      }

      let countEvidence: RootVectorCandidate["countEvidence"] | null = null;
      if (immediateCountEvidence(bytes, rootCount, text.rawStart, vectorLea)) {
        countEvidence = "immediate";
      } else if (dataCountEvidence(bytes, pe, rootCount, vectorLea - 96, loopEnd)) {
        countEvidence = "data";
      }
      if (!countEvidence) continue;

      candidates.push({
        bufferId,
        vectorOffset,
        codeOffset: vectorLea,
        pageTableOffset,
        values,
        countEvidence,
        landmarkOffset: nearestLandmark(bytes, pe, vectorOffset),
      });
    }
  }
  return candidates;
}

function setupSectionStream(
  node: FirmwareBufferNode,
  artifact: FirmwareArtifactLocation,
) {
  return artifact.bufferId === artifact.sourceFile.bufferId
    ? { start: artifact.sourceFile.bodyStart, end: artifact.sourceFile.end }
    : { start: 0, end: node.bytes.length };
}

function setupPeImages(node: FirmwareBufferNode, artifact: FirmwareArtifactLocation) {
  const stream = setupSectionStream(node, artifact);
  const images: PeImage[] = [];
  let cursor = stream.start;
  while (cursor + 4 <= stream.end) {
    const section = readFirmwareSection(node.bytes, cursor, stream.end);
    if (!section) break;
    if (section.type === 0x10) {
      const pe = parsePeImage(
        node.bytes,
        section.start + section.headerSize,
        section.end,
      );
      if (pe) images.push(pe);
    }
    cursor = align(section.end, 4);
  }
  return images;
}

function entriesFor(
  roots: Menu,
  candidate: RootVectorCandidate,
): AmiRootVisibilityEntry[] {
  return roots.map((root, index) => ({
    rootIndex: index,
    name: root.name,
    formId: root.formId,
    formSetGuid: root.formSetGuid,
    value: candidate.values[index] as 0 | 1,
    visible: candidate.values[index] === 1,
    bufferOffset: candidate.vectorOffset + index,
  }));
}

function unresolved(reason: string): AmiRootVisibilityReport {
  return {
    status: "unresolved",
    mechanism: "setup-pe32-root-byte-vector",
    confidence: "unresolved",
    reason,
    entries: [],
  };
}

/**
 * Finds the AMI multi-FormSet root-page byte vector by following the x86-64
 * Setup executable loop that consumes one byte per page and advances the
 * companion page table by 0x20 bytes. GUID adjacency is supporting evidence
 * only: corpus samples place the same GUID before, after or away from the
 * vector, so a GUID-only byte search would be unsafe.
 */
export function inspectAmiRootVisibility(
  roots: Menu,
  provenance: FirmwareProvenanceGraph,
): AmiRootVisibilityReport {
  if (roots.length <= 1) {
    return {
      status: "not-applicable",
      mechanism: "setup-pe32-root-byte-vector",
      confidence: "corroborated",
      reason:
        "The HII uses one FormSet. Its menus are Forms inside that FormSet, so no per-FormSet root vector is required. This describes the HII layout; it does not identify or exclude an Aptio generation.",
      entries: [],
    };
  }

  const artifact = provenance.artifacts.find(
    (candidate) => candidate.kind === "setup-hii",
  );
  const node = provenance.buffers.find(
    (candidate) => candidate.id === artifact?.bufferId,
  );
  if (!artifact || !node) {
    return unresolved("The Setup HII provenance branch is incomplete.");
  }

  let candidates: RootVectorCandidate[] = [];
  try {
    candidates = setupPeImages(node, artifact).flatMap((pe) =>
      scanPeForRootVector(node.bytes, pe, node.id, roots.length),
    );
  } catch {
    return unresolved("The Setup PE32 layout could not be validated safely.");
  }

  const uniqueCandidates = [
    ...new Map(
      candidates.map((candidate) => [
        String(candidate.bufferId) + ":" + String(candidate.vectorOffset),
        candidate,
      ]),
    ).values(),
  ];
  if (uniqueCandidates.length === 0) {
    return unresolved(
      "No code-referenced Boolean vector matched the FormSet count and the 0x20-byte page-table loop.",
    );
  }
  if (uniqueCandidates.length > 1) {
    return {
      status: "ambiguous",
      mechanism: "setup-pe32-root-byte-vector",
      confidence: "unresolved",
      reason:
        String(uniqueCandidates.length) +
        " code-referenced vectors matched; no root state was selected.",
      entries: [],
    };
  }

  const candidate = uniqueCandidates[0];
  return {
    status: "detected",
    mechanism: "setup-pe32-root-byte-vector",
    confidence: "corroborated",
    reason:
      "Setup code consumes one Boolean byte per IFR FormSet and removes pages whose byte is zero.",
    vector: {
      bufferId: candidate.bufferId,
      offset: candidate.vectorOffset,
      length: roots.length,
      codeReferenceOffset: candidate.codeOffset,
      pageTableOffset: candidate.pageTableOffset,
      countEvidence: candidate.countEvidence,
      landmarkOffset: candidate.landmarkOffset,
    },
    entries: entriesFor(roots, candidate),
  };
}
