import {
  corpusReportSchemaVersion,
  type CorpusFileReport,
  type CorpusRunReport,
  type CorpusRunSummary,
  type CorpusStageResult,
  type CorpusStageStatus,
  type CorpusStageId,
} from "./corpusTypes";
import { classifyBrand } from "./brandKnowledge";
import type { FirmwareBrand } from "./brandKnowledge";
import {
  buildCorpusDashboard,
  distinctCorpusCases,
  firstRecognitionBlocker,
} from "./corpusDashboard";

function stage(
  id: CorpusStageId,
  status: CorpusStageStatus,
  detail: string,
): CorpusStageResult {
  return { id, status, detail };
}

function percentage(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}

export function summarizeCorpusRun(files: CorpusFileReport[]): CorpusRunSummary {
  const uniqueFiles = distinctCorpusCases(files).length;
  const extracted = files.filter((file) => file.contexts.length > 0).length;
  const navigationResolved = files.filter(
    (file) =>
      file.contexts.length > 0 &&
      file.contexts.every((context) => context.navigation.resolved),
  ).length;
  const hiiEditable = files.filter((file) =>
    file.contexts.some(
      (context) =>
        context.editing.hideAvailable +
          context.editing.showAvailable +
          context.editing.moveAvailable >
        0,
    ),
  ).length;
  const fullImageReady = files.filter(
    (file) =>
      file.contexts.length > 0 &&
      file.contexts.every((context) => context.editing.fullImageReady),
  ).length;
  return {
    files: files.length,
    uniqueFiles,
    duplicates: files.length - uniqueFiles,
    recognized: files.filter((file) => file.status === "recognized").length,
    partial: files.filter((file) => file.status === "partial").length,
    unsupported: files.filter((file) => file.status === "unsupported").length,
    failed: files.filter((file) => file.status === "failed").length,
    extracted,
    navigationResolved,
    hiiEditable,
    fullImageReady,
    extractionRate: percentage(extracted, files.length),
    navigationRate: percentage(navigationResolved, extracted),
    hiiEditRate: percentage(hiiEditable, extracted),
    fullImageRate: percentage(fullImageReady, extracted),
  };
}

export function createCorpusRunReport(
  files: CorpusFileReport[],
  createdAt = new Date().toISOString(),
  selected = files.length,
): CorpusRunReport {
  return {
    schemaVersion: corpusReportSchemaVersion,
    createdAt,
    privacy: "metadata-only-no-firmware-bytes",
    summary: summarizeCorpusRun(files),
    dashboard: buildCorpusDashboard(files, selected),
    files,
  };
}

export function createCorpusInputFailure(
  file: Pick<File, "name" | "size" | "lastModified">,
  message: string,
  declaredBrand?: FirmwareBrand,
): CorpusFileReport {
  return {
    fileName: file.name,
    brand: classifyBrand(file.name, "", [], declaredBrand),
    family: {
      family: "unidentified",
      confidence: "unresolved",
      conflict: false,
      signals: [],
    },
    ifrFormat: "unknown",
    size: file.size,
    lastModified: file.lastModified,
    sha256: "",
    durationMs: 0,
    status: "failed",
    outer: {
      container: "unknown",
      family: {
        family: "unidentified",
        confidence: "unresolved",
        conflict: false,
        signals: [],
      },
      amiAptioCandidate: false,
      intelDescriptor: false,
      firmwareVolumeOffsets: [],
      ffs2VolumeOffsets: [],
      ffs3VolumeOffsets: [],
      outerSetupOffsets: [],
      outerAmitseOffsets: [],
      guidedLzmaSectionOffsets: [],
      deepScanRequired: false,
    },
    generation: {
      generation: "unresolved",
      confidence: "unresolved",
      conflict: false,
    },
    contexts: [],
    stages: [
      stage(
        "preflight",
        "not-run",
        "The input could not be read for firmware preflight.",
      ),
      stage("extraction", "not-run", "Deep extraction was not started."),
      stage("hii", "not-run", "No HII artifact was extracted."),
      stage("navigation", "not-run", "Navigation was not analysed."),
      stage("editability", "not-run", "Editability was not analysed."),
      stage("reconstruction", "not-run", "Reconstruction was not analysed."),
    ],
    failure: { stage: "reading", message },
  };
}

function csvCell(value: string | number | boolean) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function corpusRunToCsv(report: CorpusRunReport) {
  const header = [
    "file",
    "sha256",
    "bytes",
    "status",
    "container",
    "firmware_family",
    "family_confidence",
    "family_conflict",
    "family_evidence",
    "ifr_format",
    "framework_formsets",
    "framework_forms",
    "framework_refs",
    "phoenix_module_count",
    "phoenix_setup_module",
    "phoenix_template_module",
    "phoenix_strings_module",
    "phoenix_uefi_modules",
    "brand",
    "brand_source",
    "brand_generations",
    "brand_prior",
    "brand_outcome",
    "generation",
    "contexts",
    "forms",
    "refs",
    "navigation_resolved",
    "hide_available",
    "show_available",
    "move_available",
    "blocked_actions",
    "full_image_ready",
    "first_recognition_blocker",
    "duplicate_sha256",
    "failure_stage",
    "failure",
  ];
  const seenHashes = new Set<string>();
  const rows = report.files.map((file) => {
    const contexts = file.contexts;
    const normalizedHash = file.sha256.toLowerCase();
    const duplicate = Boolean(normalizedHash && seenHashes.has(normalizedHash));
    if (normalizedHash) seenHashes.add(normalizedHash);
    return [
      file.fileName,
      file.sha256,
      file.size,
      file.status,
      file.outer.container,
      file.family.family,
      file.family.confidence,
      file.family.conflict,
      file.family.signals.map((signal) => signal.code).join("; "),
      file.ifrFormat,
      file.frameworkInventory?.formSets ?? "",
      file.frameworkInventory?.forms ?? "",
      file.frameworkInventory?.references ?? "",
      file.phoenixLegacy?.modules.length ?? "",
      file.phoenixLegacy?.modules.some((item) => item.name.startsWith("SETUP")) ?? "",
      file.phoenixLegacy?.modules.some((item) => item.name.startsWith("TEMPLAT")) ?? "",
      file.phoenixLegacy?.modules.some((item) => item.name.startsWith("STRINGS")) ?? "",
      file.phoenixUefi?.debugModules.length ?? "",
      file.brand.brand ?? "",
      file.brand.basis,
      file.brand.observedGenerations
        .map((entry) => `${entry.generation} (${String(entry.samples)})`)
        .join("; "),
      file.brand.navigationPrior
        .map((entry) => `${entry.mechanism} (${String(entry.samples)})`)
        .join("; "),
      file.brand.navigationOutcome,
      file.generation.generation,
      contexts.length,
      contexts.reduce((total, context) => total + context.hii.formCount, 0),
      contexts.reduce((total, context) => total + context.hii.referenceCount, 0),
      contexts.length > 0 && contexts.every((context) => context.navigation.resolved),
      contexts.reduce((total, context) => total + context.editing.hideAvailable, 0),
      contexts.reduce((total, context) => total + context.editing.showAvailable, 0),
      contexts.reduce((total, context) => total + context.editing.moveAvailable, 0),
      contexts.reduce((total, context) => total + context.editing.blocked, 0),
      contexts.length > 0 &&
        contexts.every((context) => context.editing.fullImageReady),
      firstRecognitionBlocker(file),
      duplicate,
      file.failure?.stage ?? "",
      file.failure?.message ?? "",
    ];
  });
  return [header, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(","))
    .join("\n");
}
