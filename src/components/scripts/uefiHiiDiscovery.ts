import {
  decodeFirmwareBuffers,
  inventoryFirmwareFiles,
  type DecodedFirmwareInventory,
  type FirmwareFileInventoryEntry,
} from "./aptioIvExtractor";
import { analyzeIfrBinary, IFR_OPCODE, type IfrFormPackage } from "./ifrBinary";
import type { FirmwareBufferNode } from "./firmwareProvenance";
import { encapsulatedFirmwareSection, readFirmwareSection } from "./firmwareSections";

export interface UefiHiiModule {
  id: string;
  bufferId: number;
  duplicateBufferIds: number[];
  depth: number;
  file: FirmwareFileInventoryEntry;
  name: string;
  bytes: Uint8Array;
  packages: IfrFormPackage[];
  formSetGuids: string[];
  formCount: number;
  referenceCount: number;
  /** Own packages are inventoried, but the body also contains nested FFS owners. */
  ownership?: "mixed-direct-nested";
  /** Body-relative identity payload envelopes; excluded only in analysis views. */
  nestedPayloadRanges?: { offset: number; end: number }[];
}

export interface UefiHiiInventory {
  modules: UefiHiiModule[];
  decodedBufferCount: number;
  uniqueBufferCount: number;
  decodeFailures: string[];
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

interface UniqueBuffer {
  node: FirmwareBufferNode;
  duplicateIds: number[];
}

function uniqueBuffers(buffers: FirmwareBufferNode[]): UniqueBuffer[] {
  const unique: UniqueBuffer[] = [];
  for (const node of buffers) {
    const duplicate = unique.find(({ node: candidate }) =>
      equalBytes(candidate.bytes, node.bytes),
    );
    if (duplicate) duplicate.duplicateIds.push(node.id);
    else unique.push({ node, duplicateIds: [] });
  }
  return unique;
}

function moduleName(file: FirmwareFileInventoryEntry) {
  return file.uiNames[0] ?? `FFS ${file.guid}`;
}

function moduleRank(module: UefiHiiModule) {
  const name = module.name.toLowerCase();
  const nameRank = name === "setup" ? 1_000_000 : name.includes("setup") ? 500_000 : 0;
  return nameRank + module.formCount * 100 + module.referenceCount;
}

/** Identity payloads and their independently inventoried physical FFS bodies. */
function nestedFilePayloads(
  node: FirmwareBufferNode,
  file: FirmwareFileInventoryEntry,
  buffers: FirmwareBufferNode[],
  files: Map<number, FirmwareFileInventoryEntry[]>,
) {
  return buffers.flatMap((child) => {
    const edge = child.parent;
    const owner = edge?.ownerFile;
    if (
      edge?.compression !== "none" ||
      edge.parentBufferId !== node.id ||
      owner?.bufferId !== file.bufferId ||
      owner.guid !== file.guid ||
      owner.fileStart !== file.fileStart ||
      owner.end !== file.end ||
      edge.sectionStart < file.bodyStart ||
      edge.sectionEnd > file.end
    )
      return [];
    const section = readFirmwareSection(node.bytes, edge.sectionStart, file.end);
    const payload = section ? encapsulatedFirmwareSection(node.bytes, section) : null;
    if (
      section?.end !== edge.sectionEnd ||
      section.headerSize !== edge.sectionHeaderSize ||
      section.type !== edge.sectionType ||
      payload?.compression !== "none" ||
      payload.payloadStart !== edge.payloadStart ||
      payload.payloadEnd !== edge.payloadEnd ||
      !equalBytes(payload.bytes, child.bytes)
    )
      return [];
    const innerFiles = files.get(child.id) ?? [];
    if (innerFiles.length === 0) return [];
    return [
      {
        start: edge.payloadStart - file.bodyStart,
        end: edge.payloadEnd - file.bodyStart,
        bodies: innerFiles.map((inner) => ({
          start: edge.payloadStart + inner.bodyStart - file.bodyStart,
          end: edge.payloadStart + inner.end - file.bodyStart,
        })),
      },
    ];
  });
}

/**
 * Builds a vendor-neutral HII inventory from already decoded PI buffers.
 * Raw Forms packages embedded in PE32 sections are accepted only after the
 * IFR scope parser validates them, which avoids relying on vendor GUIDs.
 */
export function inventoryUefiHiiModules(
  decoded: DecodedFirmwareInventory,
): UefiHiiInventory {
  const unique = uniqueBuffers(decoded.buffers);
  const modules: UefiHiiModule[] = [];
  const files = new Map(
    decoded.buffers.map((node) => [node.id, inventoryFirmwareFiles(node)]),
  );
  const decodeFailures = [...decoded.decodeFailures];

  for (const { node, duplicateIds } of unique) {
    for (const file of files.get(node.id) ?? []) {
      const bytes = node.bytes.slice(file.bodyStart, file.end);
      let packages = analyzeIfrBinary(bytes).packages.filter((pkg) => pkg.valid);
      if (packages.length === 0) continue;
      const nestedPayloads = nestedFilePayloads(node, file, decoded.buffers, files);
      const nestedPackages = packages.filter((pkg) =>
        nestedPayloads.some((range) => pkg.offset < range.end && pkg.end > range.start),
      );
      let ownership: UefiHiiModule["ownership"];
      if (nestedPayloads.length) {
        if (
          nestedPackages.some(
            (pkg) =>
              !nestedPayloads.some((payload) =>
                payload.bodies.some(
                  (range) => pkg.offset >= range.start && pkg.end <= range.end,
                ),
              ),
          )
        ) {
          decodeFailures.push(
            `${moduleName(file)} has crossing or unowned HII packages inside a nested FFS payload; the enclosing module was not joined.`,
          );
          continue;
        }
        // Retain only the carrier's own package metadata. Nested packages belong
        // to the independently inventoried inner drivers, never both owners.
        packages = packages.filter((pkg) => !nestedPackages.includes(pkg));
        if (packages.length === 0) continue;
        ownership = "mixed-direct-nested";
      }
      const repeatedModule = modules.find(
        (candidate) =>
          candidate.file.guid === file.guid && equalBytes(candidate.bytes, bytes),
      );
      if (repeatedModule) {
        repeatedModule.duplicateBufferIds = [
          ...new Set([...repeatedModule.duplicateBufferIds, node.id, ...duplicateIds]),
        ].filter((id) => id !== repeatedModule.bufferId);
        continue;
      }
      const opcodes = packages.flatMap((pkg) => pkg.opcodes);
      const formSetGuids = [
        ...new Set(
          opcodes.flatMap((opcode) =>
            opcode.opcode === IFR_OPCODE.FORM_SET && opcode.formSetGuid
              ? [opcode.formSetGuid]
              : [],
          ),
        ),
      ];
      modules.push({
        id: `${String(node.id)}:${file.guid}:${file.fileStart.toString(16)}`,
        bufferId: node.id,
        duplicateBufferIds: [...duplicateIds],
        depth: node.depth,
        file,
        name: moduleName(file),
        bytes,
        packages,
        formSetGuids,
        formCount: opcodes.filter((opcode) => opcode.opcode === IFR_OPCODE.FORM).length,
        referenceCount: opcodes.filter((opcode) => opcode.opcode === IFR_OPCODE.REF)
          .length,
        ...(ownership
          ? {
              ownership,
              nestedPayloadRanges: nestedPayloads.map(({ start, end }) => ({
                offset: start,
                end,
              })),
            }
          : {}),
      });
    }
  }

  modules.sort(
    (left, right) =>
      moduleRank(right) - moduleRank(left) ||
      left.file.fileStart - right.file.fileStart,
  );
  return {
    modules,
    decodedBufferCount: decoded.buffers.length,
    uniqueBufferCount: unique.length,
    decodeFailures,
  };
}

export async function discoverUefiHiiModules(
  image: Uint8Array,
): Promise<UefiHiiInventory> {
  return inventoryUefiHiiModules(await decodeFirmwareBuffers(image));
}
