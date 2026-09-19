import type {
  CorpusDashboard,
  CorpusDashboardBlocker,
  CorpusDashboardCohort,
  CorpusDashboardFailureCode,
  CorpusDashboardStage,
  CorpusFileReport,
  CorpusRecognitionBlocker,
  CorpusStageId,
} from "./corpusTypes";
import { firmwareFamilyLabels } from "./amiFirmwareImage";

const stages: CorpusStageId[] = [
  "preflight",
  "extraction",
  "hii",
  "navigation",
  "editability",
  "reconstruction",
];

const blockers: CorpusRecognitionBlocker[] = [
  "reading",
  "preflight",
  "extraction",
  "hii",
  "navigation",
  "none",
];

// Preserve every input that could not be hashed: two failed reads cannot be
// assumed to contain identical firmware merely because both hashes are empty.
export function distinctCorpusCases(files: CorpusFileReport[]) {
  const hashes = new Set<string>();
  return files.filter((file) => {
    if (!file.sha256) return true;
    const normalized = file.sha256.toLowerCase();
    if (hashes.has(normalized)) return false;
    hashes.add(normalized);
    return true;
  });
}

function passed(file: CorpusFileReport, id: CorpusStageId) {
  return file.stages.find((stage) => stage.id === id)?.status === "passed";
}

export function firstRecognitionBlocker(
  file: CorpusFileReport,
): CorpusRecognitionBlocker {
  if (file.failure?.stage === "reading") return "reading";
  for (const id of ["preflight", "extraction", "hii", "navigation"] as const) {
    if (!passed(file, id)) return id;
  }
  return "none";
}

function eligible(file: CorpusFileReport, id: CorpusStageId) {
  if (id === "preflight") return true;
  if (id === "extraction") return passed(file, "preflight");
  if (id === "hii") return passed(file, "extraction");
  return passed(file, "hii");
}

function stageBreakdown(files: CorpusFileReport[]): CorpusDashboardStage[] {
  return stages.map((id) => {
    const stage: CorpusDashboardStage = {
      id,
      eligible: 0,
      passed: 0,
      warning: 0,
      failed: 0,
      blocked: 0,
      notRun: 0,
    };
    for (const file of files) {
      if (!eligible(file, id)) continue;
      stage.eligible += 1;
      const status = file.stages.find((item) => item.id === id)?.status ?? "not-run";
      if (status === "not-run") stage.notRun += 1;
      else stage[status] += 1;
    }
    return stage;
  });
}

function recognizedNavigation(file: CorpusFileReport) {
  return (
    file.contexts.length > 0 &&
    file.contexts.every((context) => context.navigation.resolved)
  );
}

function hiiEditable(file: CorpusFileReport) {
  return file.contexts.some(
    (context) =>
      context.editing.hideAvailable +
        context.editing.showAvailable +
        context.editing.moveAvailable >
      0,
  );
}

function fullImageReady(file: CorpusFileReport) {
  return (
    file.contexts.length > 0 &&
    file.contexts.every((context) => context.editing.fullImageReady)
  );
}

function cohortBreakdown(
  files: CorpusFileReport[],
  labelFor: (file: CorpusFileReport) => string,
): CorpusDashboardCohort[] {
  const byLabel = new Map<string, CorpusDashboardCohort>();
  for (const file of files) {
    const label = labelFor(file);
    const cohort = byLabel.get(label) ?? {
      label,
      cases: 0,
      extracted: 0,
      navigationResolved: 0,
      hiiEditable: 0,
      fullImageReady: 0,
    };
    cohort.cases += 1;
    if (passed(file, "extraction")) cohort.extracted += 1;
    if (recognizedNavigation(file)) cohort.navigationResolved += 1;
    if (hiiEditable(file)) cohort.hiiEditable += 1;
    if (fullImageReady(file)) cohort.fullImageReady += 1;
    byLabel.set(label, cohort);
  }
  return [...byLabel.values()].sort(
    (a, b) => b.cases - a.cases || a.label.localeCompare(b.label),
  );
}

function recognitionBreakdown(files: CorpusFileReport[]): CorpusDashboardBlocker[] {
  return blockers.map((category) => {
    const fileNames = files
      .filter((file) => firstRecognitionBlocker(file) === category)
      .map((file) => file.fileName);
    return { category, cases: fileNames.length, fileNames };
  });
}

function failureCodeBreakdown(files: CorpusFileReport[]): CorpusDashboardFailureCode[] {
  const byCode = new Map<string, CorpusDashboardFailureCode>();
  for (const file of files) {
    if (!file.failure) continue;
    const stage = file.failure.stage;
    const code = file.failure.code ?? "NO_CODE";
    const key = `${stage}:${code}`;
    const entry = byCode.get(key) ?? {
      stage,
      code,
      cases: 0,
      example: file.failure.message,
    };
    entry.cases += 1;
    byCode.set(key, entry);
  }
  return [...byCode.values()].sort(
    (a, b) => b.cases - a.cases || a.stage.localeCompare(b.stage),
  );
}

export function buildCorpusDashboard(
  files: CorpusFileReport[],
  selected = files.length,
): CorpusDashboard {
  const unique = distinctCorpusCases(files);
  return {
    selected,
    completed: files.length,
    uniqueCases: unique.length,
    duplicateHashes: files.length - unique.length,
    unhashedCases: unique.filter((file) => !file.sha256).length,
    stages: stageBreakdown(unique),
    recognitionBlockers: recognitionBreakdown(unique),
    failureCodes: failureCodeBreakdown(unique),
    manufacturers: cohortBreakdown(
      unique,
      (file) =>
        file.brand.brand ?? (file.brand.basis === "conflict" ? "Conflict" : "Unknown"),
    ),
    families: cohortBreakdown(unique, (file) =>
      file.family.conflict
        ? `${firmwareFamilyLabels[file.family.family]} · conflicting evidence`
        : firmwareFamilyLabels[file.family.family],
    ),
    ifrFormats: cohortBreakdown(unique, (file) => file.ifrFormat),
    containers: cohortBreakdown(unique, (file) => file.outer.container),
    generations: cohortBreakdown(unique, (file) =>
      file.generation.conflict ? "conflict" : file.generation.generation,
    ),
    noHiiEdit: unique.filter((file) => file.contexts.length > 0 && !hiiEditable(file))
      .length,
    fullImageBlocked: unique.filter(
      (file) => file.contexts.length > 0 && !fullImageReady(file),
    ).length,
    incompleteProvenance: unique.filter((file) =>
      file.contexts.some((context) => !context.reconstruction.traceComplete),
    ).length,
    unknownManufacturer: unique.filter((file) => file.brand.brand === null).length,
  };
}
