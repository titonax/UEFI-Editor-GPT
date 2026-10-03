import type { AmiFirmwareImageReport } from "../components/scripts/amiFirmwareImage";
import {
  firmwareFingerprintVersion,
  type FirmwareFingerprint,
  type FirmwareStructure,
} from "./schema";

export const firmwareStructureFields: readonly (keyof FirmwareStructure)[] = [
  "family",
  "container",
  "intelDescriptor",
  "firmwareVolumeCount",
  "ffs2VolumeCount",
  "ffs3VolumeCount",
  "outerSetupCount",
  "outerAmitseCount",
  "guidedLzmaSectionCount",
  "formSetCount",
  "formCount",
  "layout",
  "navigation",
  "legacyModuleCount",
];

function measured(value: FirmwareStructure[keyof FirmwareStructure]) {
  return (
    value !== undefined &&
    value !== "unknown" &&
    value !== "unresolved" &&
    value !== "unidentified" &&
    value !== "uefi-unidentified" &&
    value !== "menu-evidence-only"
  );
}

export function normalizeFirmwareHash(sha256?: string | null): string | null {
  if (sha256 === undefined || sha256 === null || sha256 === "") return null;
  if (!/^[a-f\d]{64}$/i.test(sha256)) throw new Error("Invalid firmware SHA-256");
  return sha256.toLowerCase();
}

export function createFirmwareFingerprint(input: {
  sha256?: string | null;
  size?: number | null;
  structure?: FirmwareStructure;
}): FirmwareFingerprint {
  const size = input.size ?? null;
  if (size !== null && (!Number.isSafeInteger(size) || size <= 0)) {
    throw new Error("Invalid firmware size");
  }
  const entries = firmwareStructureFields.flatMap((field) => {
    const value = input.structure?.[field];
    if (!measured(value)) return [];
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`Invalid firmware structural count: ${field}`);
    }
    return [[field, value] as const];
  });
  const structure: FirmwareStructure = Object.fromEntries(entries);
  return {
    schemaVersion: firmwareFingerprintVersion,
    sha256: normalizeFirmwareHash(input.sha256),
    size,
    structure,
    structuralKey: `${firmwareFingerprintVersion}:${JSON.stringify(structure)}`,
  };
}

/** Preflight observations only; do not invent HII results from absent outer GUIDs. */
export function fingerprintFirmwareImage(
  report: AmiFirmwareImageReport,
  sha256?: string,
): FirmwareFingerprint {
  return createFirmwareFingerprint({
    sha256,
    size: report.size,
    structure: {
      family:
        report.family.confidence === "confirmed" && !report.family.conflict
          ? report.family.family
          : undefined,
      container: report.container,
      intelDescriptor: report.intelDescriptor,
      firmwareVolumeCount: report.firmwareVolumes.length,
      ffs2VolumeCount: report.ffs2Volumes.length,
      ffs3VolumeCount: report.ffs3Volumes.length,
      outerSetupCount: report.setupFfs.length,
      outerAmitseCount: report.amitseFfs.length,
      guidedLzmaSectionCount: report.guidedLzmaSections.length,
      legacyModuleCount:
        report.awardLegacy?.modules.length ?? report.phoenixLegacy?.modules.length,
    },
  });
}
