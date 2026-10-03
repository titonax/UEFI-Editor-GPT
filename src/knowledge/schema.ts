import type {
  AmiGenerationAssessment,
  AmiSetupLayout,
  FirmwareContainer,
  FirmwareFamily,
} from "../components/scripts/amiFirmwareImage";
import type { FirmwareBrand } from "../components/scripts/brandKnowledge";
import type { CorpusNavigationMechanism } from "../components/scripts/corpusTypes";

export const firmwareKnowledgeVersion = "1.0.0";
export const firmwareFingerprintVersion = "1.0.0";

/** Missing fields mean unmeasured, whereas zero and false are observations. */
export interface FirmwareStructure {
  family?: FirmwareFamily;
  container?: FirmwareContainer;
  intelDescriptor?: boolean;
  firmwareVolumeCount?: number;
  ffs2VolumeCount?: number;
  ffs3VolumeCount?: number;
  outerSetupCount?: number;
  outerAmitseCount?: number;
  guidedLzmaSectionCount?: number;
  formSetCount?: number;
  formCount?: number;
  layout?: AmiSetupLayout;
  navigation?: CorpusNavigationMechanism;
  legacyModuleCount?: number;
}

export interface FirmwareFingerprint {
  schemaVersion: typeof firmwareFingerprintVersion;
  sha256: string | null;
  size: number | null;
  structure: Readonly<FirmwareStructure>;
  /** Canonical observations, not an image hash or an edit authorization. */
  structuralKey: string;
}

/** Reviewed observations of one exact input, not rules for a manufacturer. */
export interface FirmwareCase {
  id: string;
  label: string;
  sha256: string;
  size: number;
  fileNames: readonly string[];
  brand?: FirmwareBrand;
  source: string;
  generation?: AmiGenerationAssessment;
  structure: Readonly<FirmwareStructure>;
  regressionTests: readonly string[];
  limitations: readonly string[];
}

export interface FirmwareCaseMatch {
  caseId: string;
  basis: "exact-sha256" | "structural-similarity";
  matchedFields: (keyof FirmwareStructure)[];
  missingFields: (keyof FirmwareStructure)[];
  conflictingFields: (keyof FirmwareStructure | "size")[];
}

export interface FirmwareCaseMatchResult {
  knowledgeVersion: typeof firmwareKnowledgeVersion;
  status: "known" | "similar" | "novel" | "insufficient-evidence" | "conflict";
  matches: FirmwareCaseMatch[];
}
