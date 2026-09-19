import type {
  AmiGenerationAssessment,
  AmiSetupLayout,
  FirmwareContainer,
  FirmwareFamilyAssessment,
  FrameworkIfrInventory,
  IfrExtractionMode,
} from "./amiFirmwareImage";
import type { FirmwareArtifactCoherence } from "./firmwareProvenance";
import type { PhoenixLegacyInventory, PhoenixUefiInventory } from "./phoenixFirmware";
import type { BrandClassification, FirmwareBrand } from "./brandKnowledge";
import type {
  AmiRootVisibilityStatus,
  AmiSingleFormSetNavigationStatus,
  ConditionKind,
  ConditionSource,
} from "./types";

export const corpusReportSchemaVersion = "0.5.0";
export const MAX_CORPUS_FILE_BYTES = 512 * 1024 * 1024;

export type CorpusFileStatus = "recognized" | "partial" | "unsupported" | "failed";
export type CorpusStageStatus = "passed" | "warning" | "failed" | "blocked" | "not-run";
export type CorpusStageId =
  "preflight" | "extraction" | "hii" | "navigation" | "editability" | "reconstruction";
export type CorpusProgressStage =
  | "reading"
  | "preflight"
  | "extraction"
  | "hii"
  | "navigation"
  | "editability"
  | "complete";

export interface CorpusStageResult {
  id: CorpusStageId;
  status: CorpusStageStatus;
  detail: string;
}

export interface CorpusOuterImageSummary {
  container: FirmwareContainer;
  family: FirmwareFamilyAssessment;
  amiAptioCandidate: boolean;
  intelDescriptor: boolean;
  firmwareVolumeOffsets: number[];
  ffs2VolumeOffsets: number[];
  ffs3VolumeOffsets: number[];
  outerSetupOffsets: number[];
  outerAmitseOffsets: number[];
  guidedLzmaSectionOffsets: number[];
  deepScanRequired: boolean;
}

export interface CorpusVisibilityCounts {
  visible: number;
  hidden: number;
  conditional: number;
  unknown: number;
  orphaned: number;
  broken: number;
}

export interface CorpusConditionCounts {
  total: number;
  byKind: Record<ConditionKind, number>;
  bySource: Record<ConditionSource, number>;
}

export interface CorpusHiiSummary {
  packageCount: number;
  formSetCount: number;
  formCount: number;
  questionCount: number;
  referenceCount: number;
  rootCount: number;
  profileCount: number;
  detachedFormCount: number;
  externalReferenceCount: number;
  unresolvedReferenceCount: number;
  conditions: CorpusConditionCounts;
  visibility: CorpusVisibilityCounts;
}

export type CorpusNavigationMechanism =
  | "multi-formset-root-vector"
  | "single-formset-ifr-hub"
  | "menu-evidence-only"
  | "unresolved";

export interface CorpusNavigationSummary {
  mechanism: CorpusNavigationMechanism;
  resolved: boolean;
  rootVisibilityStatus: AmiRootVisibilityStatus | "not-run";
  rootVisibilityReason: string;
  singleFormSetStatus: AmiSingleFormSetNavigationStatus | "not-run";
  singleFormSetReason: string;
}

export type CorpusEditKind = "hide" | "show" | "move";
export type CorpusEditMechanism =
  "root-vector" | "single-formset-ref" | "ifr-ref-move" | "unresolved";

export interface CorpusEditCapability {
  pageName: string;
  formId: string;
  formSetGuid?: string;
  kind: CorpusEditKind;
  mechanism: CorpusEditMechanism;
  available: boolean;
  safeDestinationCount?: number;
  requiresRef3DestinationCount?: number;
  reason: string;
}

export interface CorpusEditSummary {
  hideAvailable: number;
  showAvailable: number;
  moveAvailable: number;
  blocked: number;
  fullImageReady: false;
  actions: CorpusEditCapability[];
}

export interface CorpusReconstructionSummary {
  traceComplete: boolean;
  writeEnabled: false;
  compressions: string[];
  blockers: string[];
}

export interface CorpusContextReport {
  id: string;
  label: string;
  coherence: FirmwareArtifactCoherence;
  warnings: string[];
  status: "recognized" | "partial";
  extractionDepth: number;
  hiiBytes: number;
  amitseFound: boolean;
  setupDataFound: boolean;
  spfPresent: boolean;
  layout: AmiSetupLayout;
  generation: AmiGenerationAssessment;
  hii: CorpusHiiSummary;
  navigation: CorpusNavigationSummary;
  editing: CorpusEditSummary;
  reconstruction: CorpusReconstructionSummary;
}

export interface CorpusFailure {
  stage: CorpusProgressStage;
  code?: string;
  message: string;
}

export interface CorpusFileReport {
  fileName: string;
  brand: BrandClassification;
  family: FirmwareFamilyAssessment;
  ifrFormat: IfrExtractionMode | "mixed";
  frameworkInventory?: FrameworkIfrInventory;
  phoenixLegacy?: PhoenixLegacyInventory;
  phoenixUefi?: PhoenixUefiInventory;
  size: number;
  lastModified: number | null;
  sha256: string;
  durationMs: number;
  status: CorpusFileStatus;
  outer: CorpusOuterImageSummary;
  generation: AmiGenerationAssessment;
  contexts: CorpusContextReport[];
  stages: CorpusStageResult[];
  failure?: CorpusFailure;
}

export interface CorpusRunSummary {
  files: number;
  uniqueFiles: number;
  duplicates: number;
  recognized: number;
  partial: number;
  unsupported: number;
  failed: number;
  extracted: number;
  navigationResolved: number;
  hiiEditable: number;
  fullImageReady: number;
  extractionRate: number;
  navigationRate: number;
  hiiEditRate: number;
  fullImageRate: number;
}

export type CorpusRecognitionBlocker =
  "reading" | "preflight" | "extraction" | "hii" | "navigation" | "none";

export interface CorpusDashboardStage {
  id: CorpusStageId;
  eligible: number;
  passed: number;
  warning: number;
  failed: number;
  blocked: number;
  notRun: number;
}

export interface CorpusDashboardCohort {
  label: string;
  cases: number;
  extracted: number;
  navigationResolved: number;
  hiiEditable: number;
  fullImageReady: number;
}

export interface CorpusDashboardBlocker {
  category: CorpusRecognitionBlocker;
  cases: number;
  fileNames: string[];
}

export interface CorpusDashboardFailureCode {
  stage: CorpusProgressStage;
  code: string;
  cases: number;
  example: string;
}

export interface CorpusDashboard {
  selected: number;
  completed: number;
  uniqueCases: number;
  duplicateHashes: number;
  unhashedCases: number;
  stages: CorpusDashboardStage[];
  recognitionBlockers: CorpusDashboardBlocker[];
  failureCodes: CorpusDashboardFailureCode[];
  manufacturers: CorpusDashboardCohort[];
  families: CorpusDashboardCohort[];
  ifrFormats: CorpusDashboardCohort[];
  containers: CorpusDashboardCohort[];
  generations: CorpusDashboardCohort[];
  noHiiEdit: number;
  fullImageBlocked: number;
  incompleteProvenance: number;
  unknownManufacturer: number;
}

export interface CorpusRunReport {
  schemaVersion: typeof corpusReportSchemaVersion;
  createdAt: string;
  privacy: "metadata-only-no-firmware-bytes";
  summary: CorpusRunSummary;
  dashboard: CorpusDashboard;
  files: CorpusFileReport[];
}

export interface CorpusProgress {
  stage: CorpusProgressStage;
  detail: string;
  contextIndex?: number;
  contextCount?: number;
}

export interface CorpusFirmwareInput {
  fileName: string;
  declaredBrand?: FirmwareBrand;
  size: number;
  lastModified?: number;
  bytes: Uint8Array;
}

export const corpusStatusLabels: Record<CorpusFileStatus, string> = {
  recognized: "Recognized",
  partial: "Partial",
  unsupported: "Unsupported",
  failed: "Failed",
};

export const corpusStageLabels: Record<CorpusProgressStage, string> = {
  reading: "Reading locally",
  preflight: "Firmware preflight",
  extraction: "Recursive extraction",
  hii: "HII parsing",
  navigation: "Navigation classification",
  editability: "Editability analysis",
  complete: "Complete",
};
