import {
  decodeFirmwareBuffers,
  inventoryFirmwareFiles,
  type DecodedFirmwareInventory,
  type FirmwareFileInventoryEntry,
} from "./aptioIvExtractor";
import { analyzeIfrBinary, IFR_OPCODE, type IfrFormPackage } from "./ifrBinary";
import type { FirmwareBufferNode } from "./firmwareProvenance";

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

  for (const { node, duplicateIds } of unique) {
    for (const file of inventoryFirmwareFiles(node)) {
      const bytes = node.bytes.slice(file.bodyStart, file.end);
      const packages = analyzeIfrBinary(bytes).packages.filter((pkg) => pkg.valid);
      if (packages.length === 0) continue;
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
    decodeFailures: [...decoded.decodeFailures],
  };
}

export async function discoverUefiHiiModules(
  image: Uint8Array,
): Promise<UefiHiiInventory> {
  return inventoryUefiHiiModules(await decodeFirmwareBuffers(image));
}
