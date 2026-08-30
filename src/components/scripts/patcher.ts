import { saveAs } from "file-saver";
import type { PopulatedFiles } from "../FileUploads/fileModel";
import { FirmwareError } from "./errors";
import {
  bytesToHex,
  decimalToHex,
  hexToBytes,
  offsetToHexIndex,
  replaceHex,
} from "./hex";
import { replayIfrEdits } from "./menuEditing";
import type { Data, Form, Suppression } from "./types";

interface PatchSources {
  setupSct: string;
  amitseSct: string;
  setupdataBin: string;
}

export interface PatchedFirmware {
  setupSct?: Uint8Array;
  amitseSct?: Uint8Array;
  setupdataBin?: Uint8Array;
  changeLog: string;
}

function formName(forms: Form[], formId: string): string {
  return (
    forms.find((form) => Number.parseInt(form.formId) === Number.parseInt(formId))
      ?.name ?? `Unknown form ${formId}`
  );
}

function patchSuppressions(data: Data, source: string): { hex?: string; log: string } {
  let modified = source;
  let log = "";
  const conditions: Suppression[] = structuredClone(data.suppressions);

  for (const condition of conditions) {
    if ((condition.kind ?? "SuppressIf") !== "SuppressIf" || condition.active) {
      continue;
    }

    const endIndex = offsetToHexIndex(condition.end);
    if (modified.slice(endIndex, endIndex + 4) !== "2902") {
      throw new FirmwareError(
        "PATCH_FAILED",
        `SuppressIf at ${condition.offset} has no matching End opcode at ${condition.end}.`,
      );
    }

    modified = replaceHex(modified, endIndex, 4, "");
    modified = replaceHex(modified, offsetToHexIndex(condition.start), 0, "2902");

    for (const nested of conditions) {
      if (nested.offset === condition.offset) continue;
      if (
        Number.parseInt(condition.start, 16) < Number.parseInt(nested.start, 16) &&
        Number.parseInt(nested.start, 16) < Number.parseInt(condition.end, 16)
      ) {
        nested.start = decimalToHex((offsetToHexIndex(nested.start) + 8) / 2);
      }
      if (
        Number.parseInt(condition.start, 16) < Number.parseInt(nested.end, 16) &&
        Number.parseInt(nested.end, 16) < Number.parseInt(condition.end, 16)
      ) {
        nested.end = decimalToHex((offsetToHexIndex(nested.end) + 8) / 2);
      }
    }
    log += `Unsuppressed ${condition.offset}\n`;
  }

  return { hex: modified === source ? undefined : modified, log };
}

function patchMenu(data: Data, source: string): { hex?: string; log: string } {
  let modified = source;
  let log = "";

  for (const entry of data.menu) {
    if (entry.offset === null) continue;
    const formId = entry.formId.replace(/^0x/i, "").padStart(4, "0");
    const replacement = formId.slice(2) + formId.slice(0, 2);
    const index = offsetToHexIndex(entry.offset);
    const previous = modified.slice(index, index + 4);
    if (previous === replacement) continue;

    modified = replaceHex(modified, index, 4, replacement);
    const oldFormId = decimalToHex(
      Number.parseInt(previous.slice(-2) + previous.slice(-4, -2), 16),
    );
    log += `${formName(data.forms, oldFormId)} | FormId ${oldFormId} -> ${formName(
      data.forms,
      entry.formId,
    )} | FormId ${entry.formId}\n`;
  }

  return { hex: modified === source ? undefined : modified, log };
}

function patchSetupData(data: Data, source: string): { hex?: string; log: string } {
  let modified = source;
  let log = "";

  for (const form of data.forms) {
    for (const child of form.children) {
      if (
        child.offsets === null ||
        child.accessLevel === null ||
        child.failsafe === null ||
        child.optimal === null
      ) {
        continue;
      }

      for (const [label, offset, value] of [
        ["Access Level", child.offsets.accessLevel, child.accessLevel],
        ["Failsafe", child.offsets.failsafe, child.failsafe],
        ["Optimal", child.offsets.optimal, child.optimal],
      ] as const) {
        const index = offsetToHexIndex(offset);
        const previous = modified.slice(index, index + 2);
        const replacement = value.padStart(2, "0");
        if (previous === replacement) continue;
        modified = replaceHex(modified, index, 2, replacement);
        log += `${child.name} | QuestionId ${child.questionId}: ${label} ${previous} -> ${replacement}\n`;
      }
    }
  }

  return { hex: modified === source ? undefined : modified, log };
}

export function buildFirmwarePatches(
  data: Data,
  sources: PatchSources,
): PatchedFirmware {
  const structuralBytes = replayIfrEdits(data, sources.setupSct);
  const structuralHex = bytesToHex(structuralBytes);
  const structuralLog = (data.ifrEdits ?? [])
    .map((edit) => `${edit.description}\n`)
    .join("");
  const setup = patchSuppressions(data, structuralHex);
  const setupChanged = structuralLog.length > 0 || setup.hex !== undefined;
  const menu = patchMenu(data, sources.amitseSct);
  const setupData = patchSetupData(data, sources.setupdataBin);
  const sections = [
    setupChanged
      ? `========== Setup HII ==========\n\n${structuralLog}${setup.log}`
      : "",
    menu.hex ? `========== AMITSE ==========\n\n${menu.log}` : "",
    setupData.hex ? `========== SetupData ==========\n\n${setupData.log}` : "",
  ].filter(Boolean);

  return {
    setupSct: setupChanged ? hexToBytes(setup.hex ?? structuralHex) : undefined,
    amitseSct: menu.hex ? hexToBytes(menu.hex) : undefined,
    setupdataBin: setupData.hex ? hexToBytes(setupData.hex) : undefined,
    changeLog: sections.join("\n\n"),
  };
}

export function downloadModifiedFiles(data: Data, files: PopulatedFiles): void {
  const result = buildFirmwarePatches(data, {
    setupSct: files.setupSctContainer.textContent,
    amitseSct: files.amitseSctContainer.textContent,
    setupdataBin: files.setupdataBinContainer.textContent,
  });

  const artifacts = [
    [result.setupSct, files.setupSctContainer.file.name],
    [result.amitseSct, files.amitseSctContainer.file.name],
    [result.setupdataBin, files.setupdataBinContainer.file.name],
  ] as const;
  const changed = artifacts.filter(
    (artifact): artifact is readonly [Uint8Array, string] => artifact[0] !== undefined,
  );
  if (changed.length === 0) {
    throw new FirmwareError("NO_CHANGES", "No firmware modifications have been made.");
  }

  for (const [bytes, fileName] of changed) {
    saveAs(new Blob([bytes], { type: "application/octet-stream" }), fileName);
  }
  saveAs(new Blob([result.changeLog], { type: "text/plain" }), "changelog.txt");
}
