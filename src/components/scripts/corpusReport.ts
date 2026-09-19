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
  const hashes = files.flatMap((file) => (file.sha256 ? [file.sha256] : []));
  const uniqueFiles = new Set(hashes).size + files.length - hashes.length;
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
): CorpusRunReport {
  return {
    schemaVersion: corpusReportSchemaVersion,
    createdAt,
    privacy: "metadata-only-no-firmware-bytes",
    summary: summarizeCorpusRun(files),
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
    size: file.size,
    lastModified: file.lastModified,
    sha256: "",
    durationMs: 0,
    status: "failed",
    outer: {
      container: "unknown",
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
      stage("preflight", "failed", message),
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
    "failure_stage",
    "failure",
  ];
  const rows = report.files.map((file) => {
    const contexts = file.contexts;
    return [
      file.fileName,
      file.sha256,
      file.size,
      file.status,
      file.outer.container,
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
      file.failure?.stage ?? "",
      file.failure?.message ?? "",
    ];
  });
  return [header, ...rows]
    .map((row) => row.map((cell) => csvCell(cell)).join(","))
    .join("\n");
}
