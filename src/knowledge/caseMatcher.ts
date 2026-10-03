import { firmwareCases } from "./cases";
import { createFirmwareFingerprint, firmwareStructureFields } from "./fingerprint";
import {
  firmwareFingerprintVersion,
  firmwareKnowledgeVersion,
  type FirmwareCase,
  type FirmwareCaseMatch,
  type FirmwareCaseMatchResult,
  type FirmwareFingerprint,
  type FirmwareStructure,
} from "./schema";

// Generic family/container/descriptor evidence is not distinctive enough.
const distinctiveFields = new Set<keyof FirmwareStructure>([
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
]);

function compareCase(
  fingerprint: FirmwareFingerprint,
  entry: FirmwareCase,
  basis: FirmwareCaseMatch["basis"],
): FirmwareCaseMatch {
  const observed = createFirmwareFingerprint({ structure: entry.structure }).structure;
  const result: FirmwareCaseMatch = {
    caseId: entry.id,
    basis,
    matchedFields: [],
    missingFields: [],
    conflictingFields: [],
  };
  for (const field of firmwareStructureFields) {
    const expected = observed[field];
    if (expected === undefined) continue;
    const actual = fingerprint.structure[field];
    if (actual === undefined) result.missingFields.push(field);
    else if (actual === expected) result.matchedFields.push(field);
    else result.conflictingFields.push(field);
  }
  // Different-size revisions can have the same structure. Size is an identity
  // precondition only for an exact hash, never a structural similarity criterion.
  if (
    basis === "exact-sha256" &&
    fingerprint.size !== null &&
    fingerprint.size !== entry.size
  ) {
    result.conflictingFields.push("size");
  }
  return result;
}

export function matchFirmwareCases(
  input: FirmwareFingerprint,
  catalogue: readonly FirmwareCase[] = firmwareCases,
): FirmwareCaseMatchResult {
  if (input.schemaVersion !== firmwareFingerprintVersion) {
    throw new Error("Unsupported firmware fingerprint version");
  }
  // Rebuild from measurements; never trust a supplied structuralKey.
  const fingerprint = createFirmwareFingerprint(input);
  const exact = fingerprint.sha256
    ? catalogue.filter((entry) => entry.sha256 === fingerprint.sha256)
    : [];
  if (exact.length > 0) {
    const matches = exact.map((entry) =>
      compareCase(fingerprint, entry, "exact-sha256"),
    );
    return {
      knowledgeVersion: firmwareKnowledgeVersion,
      status:
        exact.length !== 1 ||
        matches.some((match) => match.conflictingFields.length > 0)
          ? "conflict"
          : "known",
      matches,
    };
  }
  const fields = Object.keys(fingerprint.structure) as (keyof FirmwareStructure)[];
  if (fields.length < 4 || !fields.some((field) => distinctiveFields.has(field))) {
    return {
      knowledgeVersion: firmwareKnowledgeVersion,
      status: "insufficient-evidence",
      matches: [],
    };
  }
  const matches = catalogue
    .map((entry) => compareCase(fingerprint, entry, "structural-similarity"))
    .filter(
      (match) =>
        match.conflictingFields.length === 0 &&
        match.matchedFields.length >= 4 &&
        match.matchedFields.some((field) => distinctiveFields.has(field)),
    )
    .sort(
      (left, right) =>
        right.matchedFields.length - left.matchedFields.length ||
        left.missingFields.length - right.missingFields.length ||
        left.caseId.localeCompare(right.caseId),
    );
  return {
    knowledgeVersion: firmwareKnowledgeVersion,
    status: matches.length > 0 ? "similar" : "novel",
    matches,
  };
}
