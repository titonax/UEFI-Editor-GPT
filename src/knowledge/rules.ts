import type { FirmwareCaseMatchResult } from "./schema";

export const firmwareRuleRegistryVersion = "1.0.0";

/** Documentation of proven implementations, not a feature or writer switch. */
export interface FirmwareRule {
  id: string;
  label: string;
  evidence: "reviewed-samples" | "single-sample" | "synthetic-only";
  caseIds: readonly string[];
  implementation: { path: string; symbol: string };
  regressionTests: readonly string[];
  prerequisites: readonly string[];
  scope: string;
  limitations: readonly string[];
}

export const firmwareRules: readonly FirmwareRule[] = [
  {
    id: "ami-single-formset-ifr-hub",
    label: "AMI single-FormSet IFR hub navigation",
    evidence: "reviewed-samples",
    caseIds: [
      "intel-nuc10i5fnh-0067",
      "asus-prime-z370-p-3004",
      "asus-rog-strix-z390-e",
    ],
    implementation: {
      path: "src/components/scripts/singleFormSetNavigation.ts",
      symbol: "inspectSingleFormSetNavigation",
    },
    regressionTests: ["src/components/scripts/singleFormSetNavigation.test.ts"],
    prerequisites: [
      "A coherent parsed HII context has exactly one FormSet.",
      "IFR references prove the hub and parent-child navigation graph.",
    ],
    scope: "Navigation evidence for a parsed AMI Setup context.",
    limitations: [
      "An AMITSE registration alone does not establish a visible tab.",
      "Navigation evidence does not prove that the complete image can be written.",
    ],
  },
  {
    id: "award-legacy-lha-inventory",
    label: "Award legacy bounded LHA inventory",
    evidence: "single-sample",
    caseIds: ["emachines-el1200-r01a2"],
    implementation: {
      path: "src/components/scripts/awardFirmware.ts",
      symbol: "inspectAwardLegacyFirmware",
    },
    regressionTests: ["src/components/scripts/awardFirmware.test.ts"],
    prerequisites: [
      "Boot-block, reset-vector and decompression signatures identify Award Legacy.",
      "Each module is size-bounded and checksum-validated independently.",
    ],
    scope: "Read-only legacy module inventory.",
    limitations: ["Setup editing and complete-image reconstruction are unsupported."],
  },
  {
    id: "phoenix-fixed-allocation-lh5",
    label: "Phoenix fixed-allocation TEMPLAT LH5 reconstruction",
    evidence: "single-sample",
    caseIds: ["phoenix-acer-z03-20140701"],
    implementation: {
      path: "src/components/scripts/phoenixFirmwareRebuilder.ts",
      symbol: "rebuildPhoenixFirmware",
    },
    regressionTests: [
      "src/components/scripts/phoenixFfvRebuilder.test.ts",
      "src/components/scripts/phoenixFirmwareRebuilder.test.ts",
    ],
    prerequisites: [
      "A verified TEMPLAT visibility edit is applied to the original image.",
      "LH5 encoding round-trips and fits inside the original allocation.",
      "The complete result re-opens with the intended change and every byte outside the allocation preserved.",
    ],
    scope: "Only an already inventoried Phoenix TEMPLAT allocation.",
    limitations: [
      "Allocation growth and unverified menu edits remain blocked.",
      "Re-opening is not a physical flash test.",
    ],
  },
  {
    id: "uefi-fixed-uncompressed-image",
    label: "UEFI fixed-size uncompressed image reconstruction",
    evidence: "synthetic-only",
    caseIds: [],
    implementation: {
      path: "src/components/scripts/uefiImageRebuilder.ts",
      symbol: "rebuildUefiImage",
    },
    regressionTests: ["src/components/scripts/uefiImageRebuilder.test.ts"],
    prerequisites: [
      "Every edited artifact has complete provenance to the source image.",
      "All enclosing sections are uncompressed and replacements have the original length.",
      "FFS checksums are repaired and every byte outside the owned BIOS allocation remains unchanged.",
    ],
    scope: "Fixed-size uncompressed PI paths, including full SPI input preservation.",
    limitations: [
      "LZMA and EFI/Tiano compressed ancestors remain blocked.",
      "Synthetic reconstruction tests are not acceptance on a real image.",
    ],
  },
];

/** Exact reviewed identity provides a reference, never automatic rule applicability. */
export function referenceRulesForMatch(match: FirmwareCaseMatchResult): FirmwareRule[] {
  if (match.status !== "known") return [];
  const ids = new Set(
    match.matches
      .filter(
        (candidate) =>
          candidate.basis === "exact-sha256" &&
          candidate.conflictingFields.length === 0,
      )
      .map((candidate) => candidate.caseId),
  );
  return firmwareRules.filter((rule) => rule.caseIds.some((id) => ids.has(id)));
}
