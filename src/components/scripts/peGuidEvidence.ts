import { readGuid, readUint16, readUint32 } from "./binaryReader";

export interface PeEvidenceSection {
  name: string;
  start: number;
  end: number;
  rva: number;
  executable: boolean;
}

/** Bounded x64 PE32+ file layout for read-only research, not a loader or CFG. */
export function readPeEvidenceSections(
  bytes: Uint8Array,
  start: number,
  end: number,
): PeEvidenceSection[] {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end > bytes.length ||
    start + 64 > end ||
    bytes[start] !== 0x4d ||
    bytes[start + 1] !== 0x5a
  )
    return [];
  const header = start + readUint32(bytes, start + 60);
  if (
    header + 24 > end ||
    readUint32(bytes, header) !== 0x4550 ||
    readUint16(bytes, header + 4) !== 0x8664
  )
    return [];
  const count = readUint16(bytes, header + 6);
  const optionalSize = readUint16(bytes, header + 20);
  const table = header + 24 + optionalSize;
  if (
    count === 0 ||
    count > 96 ||
    optionalSize < 112 ||
    table + count * 40 > end ||
    readUint16(bytes, header + 24) !== 0x20b
  )
    return [];
  const sections: PeEvidenceSection[] = [];
  for (let index = 0; index < count; index++) {
    const entry = table + index * 40;
    const size = readUint32(bytes, entry + 16);
    if (size === 0) continue;
    const rawStart = start + readUint32(bytes, entry + 20);
    const rva = readUint32(bytes, entry + 12);
    if (
      rawStart < table + count * 40 ||
      rawStart + size > end ||
      rva + size > 0x100000000
    )
      return [];
    if (
      sections.some(
        (section) =>
          (rawStart < section.end && rawStart + size > section.start) ||
          (rva < section.rva + section.end - section.start && rva + size > section.rva),
      )
    )
      return [];
    sections.push({
      name: String.fromCharCode(...bytes.slice(entry, entry + 8)).split("\0")[0],
      start: rawStart,
      end: rawStart + size,
      rva,
      executable: Boolean(readUint32(bytes, entry + 36) & 0x20000000),
    });
  }
  return sections;
}

export interface PeGuidEvidence {
  guid: string;
  offset: number;
  sectionName: string;
  /** Exact seven-byte REX.W LEA patterns only; instruction boundaries are unproven. */
  leaByteCandidates: number[];
}

function encodedGuid(guid: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid))
    throw new Error("Invalid GUID landmark.");
  const hex = guid.replace(/-/g, "");
  const bytes = Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
  return [
    bytes[3],
    bytes[2],
    bytes[1],
    bytes[0],
    bytes[5],
    bytes[4],
    bytes[7],
    bytes[6],
    ...bytes.slice(8),
  ];
}

/** Finds landmarks and bounded RIP-relative LEA candidates; never infers protocol calls. */
export function findPeGuidEvidence(
  bytes: Uint8Array,
  sections: PeEvidenceSection[],
  guids: string[],
): PeGuidEvidence[] {
  if (
    sections.some(
      (section) =>
        !Number.isSafeInteger(section.start) ||
        !Number.isSafeInteger(section.end) ||
        !Number.isSafeInteger(section.rva) ||
        section.start < 0 ||
        section.end > bytes.length ||
        section.end <= section.start ||
        section.rva < 0 ||
        section.rva + section.end - section.start > 0x100000000,
    )
  )
    throw new Error("Invalid PE evidence bounds.");
  for (const [index, section] of sections.entries()) {
    if (
      sections
        .slice(0, index)
        .some(
          (previous) =>
            (section.start < previous.end && section.end > previous.start) ||
            (section.rva < previous.rva + previous.end - previous.start &&
              section.rva + section.end - section.start > previous.rva),
        )
    )
      throw new Error("Ambiguous PE evidence mapping.");
  }
  const hits: PeGuidEvidence[] = [];
  for (const guid of new Set(guids.map((guid) => guid.toUpperCase()))) {
    const target = encodedGuid(guid);
    for (const section of sections) {
      for (let offset = section.start; offset + 16 <= section.end; offset++) {
        if (
          bytes[offset] !== target[0] ||
          !target.every((byte, index) => bytes[offset + index] === byte)
        )
          continue;
        const targetRva = section.rva + offset - section.start;
        const candidates: number[] = [];
        for (const code of sections.filter((section) => section.executable)) {
          for (let at = code.start; at + 7 <= code.end; at++) {
            if (
              (bytes[at] !== 0x48 && bytes[at] !== 0x4c) ||
              bytes[at + 1] !== 0x8d ||
              (bytes[at + 2] & 0xc7) !== 0x05
            )
              continue;
            const displacement = new DataView(
              bytes.buffer,
              bytes.byteOffset + at + 3,
              4,
            ).getInt32(0, true);
            if (code.rva + at - code.start + 7 + displacement === targetRva)
              candidates.push(at);
          }
        }
        hits.push({
          guid: readGuid(bytes, offset),
          offset,
          sectionName: section.name,
          leaByteCandidates: candidates,
        });
      }
    }
  }
  return hits;
}
