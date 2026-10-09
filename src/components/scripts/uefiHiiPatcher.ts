import { saveAs } from "file-saver";
import type { UefiHiiWorkspaceModule } from "./uefiHiiWorkspace";
import { FirmwareError } from "./errors";
import { bytesToHex } from "./hex";
import { replayIfrEdits } from "./menuEditing";
import type { Data } from "./types";
import { applyUefiHiiSuppressionEdits } from "./uefiHiiSuppressionEditing";
import {
  assertUefiHiiOwnedPackageChanges,
  createUefiHiiOwnedPackageView,
} from "./uefiHiiOwnership";
import { analyzeIfrBinary } from "./ifrBinary";

/** Reconstruct the editor view from retained original bodies and package ownership. */
export function createUefiHiiEditorBytes(
  sourceBytes: Uint8Array,
  modules: UefiHiiWorkspaceModule[],
) {
  const view = new Uint8Array(sourceBytes.length);
  const occupied: { start: number; end: number }[] = [];
  for (const module of modules) {
    if (
      !Number.isSafeInteger(module.sourceStart) ||
      !Number.isSafeInteger(module.sourceEnd) ||
      module.sourceStart < 0 ||
      module.sourceEnd <= module.sourceStart ||
      module.sourceEnd > sourceBytes.length ||
      occupied.some(
        (range) => module.sourceStart < range.end && module.sourceEnd > range.start,
      )
    )
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        "HII editor module bounds are invalid or overlap.",
      );
    occupied.push({ start: module.sourceStart, end: module.sourceEnd });
    if (!module.nestedPayloadRanges?.length) {
      view.set(
        sourceBytes.subarray(module.sourceStart, module.sourceEnd),
        module.sourceStart,
      );
      continue;
    }
    if (!module.ownedPackages?.length)
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        "Mixed HII modules require owned package bounds.",
      );
    const bytes = sourceBytes.slice(module.sourceStart, module.sourceEnd);
    const packages = analyzeIfrBinary(bytes).packages.filter((pkg) =>
      module.ownedPackages?.some(
        (range) => range.offset === pkg.offset && range.end === pkg.end,
      ),
    );
    if (packages.length !== module.ownedPackages.length)
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        "Mixed HII package bounds changed.",
      );
    view.set(
      createUefiHiiOwnedPackageView({
        bytes,
        packages,
        nestedPayloadRanges: module.nestedPayloadRanges,
      }).bytes,
      module.sourceStart,
    );
  }
  return view;
}

export interface PatchedUefiHiiModule {
  module: UefiHiiWorkspaceModule;
  bytes: Uint8Array;
  fileName: string;
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "");
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

export function buildUefiHiiModulePatches(
  data: Data,
  sourceBytes: Uint8Array,
  modules: UefiHiiWorkspaceModule[],
) {
  const editorBytes = createUefiHiiEditorBytes(sourceBytes, modules);
  const structurallyEdited = replayIfrEdits(data, bytesToHex(editorBytes));
  const modified = applyUefiHiiSuppressionEdits(data, structurallyEdited);
  if (modified.length !== sourceBytes.length) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "The edited HII workspace changed length and cannot be split safely.",
    );
  }

  for (let offset = 0; offset < sourceBytes.length; offset++) {
    if (modified[offset] === editorBytes[offset]) continue;
    const owner = modules.find(
      (module) => offset >= module.sourceStart && offset < module.sourceEnd,
    );
    if (!owner) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `A changed byte at 0x${offset.toString(16).toUpperCase()} has no module owner.`,
      );
    }
  }

  const changed: PatchedUefiHiiModule[] = [];
  for (const module of modules) {
    const original = sourceBytes.slice(module.sourceStart, module.sourceEnd);
    const patched = original.slice();
    for (let offset = module.sourceStart; offset < module.sourceEnd; offset++) {
      if (modified[offset] !== editorBytes[offset])
        patched[offset - module.sourceStart] = modified[offset];
    }
    assertUefiHiiOwnedPackageChanges(original, patched, module.ownedPackages);
    if (sameBytes(original, patched)) continue;
    changed.push({
      module,
      bytes: patched,
      fileName: `${safeFilePart(module.name) || "HII-module"}_${module.fileGuid}.bin`,
    });
  }
  if (changed.length === 0) {
    throw new FirmwareError(
      "NO_CHANGES",
      "No HII module modifications have been made.",
    );
  }
  return changed;
}

export function downloadModifiedUefiHiiModules(
  data: Data,
  sourceBytes: Uint8Array,
  modules: UefiHiiWorkspaceModule[],
) {
  const changed = buildUefiHiiModulePatches(data, sourceBytes, modules);
  if (modules.some((module) => module.nestedPayloadRanges?.length)) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Mixed HII changes require the verified complete-image download.",
    );
  }
  for (const artifact of changed) {
    saveAs(
      new Blob([artifact.bytes], { type: "application/octet-stream" }),
      artifact.fileName,
    );
  }
  const changeLog = (data.ifrEdits ?? [])
    .map((edit) => edit.description)
    .concat(
      data.suppressions
        .filter(
          (condition) =>
            !condition.active && (condition.kind ?? "SuppressIf") === "SuppressIf",
        )
        .map((condition) => `Show content guarded by SuppressIf ${condition.offset}`),
    )
    .join("\n");
  saveAs(new Blob([changeLog], { type: "text/plain" }), "uefi-hii-changelog.txt");
}
