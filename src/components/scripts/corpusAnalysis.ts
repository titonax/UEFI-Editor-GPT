import { buildMenuTree, type MenuTreeNode } from "../Navigation/menuTree";
import type { PopulatedFiles } from "../firmwareFiles";
import {
  inspectAmiFirmwareBytes,
  inspectAmiSetupProfile,
  reconcileAmiGeneration,
  type AmiFirmwareImageReport,
  type AmiGenerationAssessment,
  type AmiSetupProfileReport,
} from "./amiFirmwareImage";
import {
  extractAmiFirmwareBytes,
  type AmiFirmwareArtifacts,
} from "./amiFirmwareExtractor";
import { sha256Hex } from "./checksum";
import { classifyBrand, compareBrandNavigation } from "./brandKnowledge";
import type {
  CorpusConditionCounts,
  CorpusContextReport,
  CorpusEditCapability,
  CorpusEditSummary,
  CorpusFileReport,
  CorpusFirmwareInput,
  CorpusHiiSummary,
  CorpusNavigationSummary,
  CorpusOuterImageSummary,
  CorpusProgress,
  CorpusProgressStage,
  CorpusStageId,
  CorpusStageResult,
  CorpusStageStatus,
  CorpusVisibilityCounts,
} from "./corpusTypes";
import { errorMessage, FirmwareError } from "./errors";
import { assessFirmwareReconstruction } from "./firmwareProvenance";
import { bytesToHex } from "./hex";
import {
  analyzeMenuMoveDestinations,
  analyzeTopLevelTabVisibilityToggle,
} from "./menuEditing";
import { parseData } from "./scripts";
import type { AmiSingleFormSetPage, Data, RefPrompt } from "./types";
import { childVisibility } from "./visibility";

interface CorpusAnalysisDependencies {
  inspect: typeof inspectAmiFirmwareBytes;
  extract: typeof extractAmiFirmwareBytes;
  parseArtifacts: (fileName: string, artifacts: AmiFirmwareArtifacts) => Promise<Data>;
  hash: (bytes: Uint8Array) => Promise<string>;
  now: () => number;
}

const defaultDependencies: CorpusAnalysisDependencies = {
  inspect: inspectAmiFirmwareBytes,
  extract: extractAmiFirmwareBytes,
  parseArtifacts,
  hash: sha256Hex,
  now: () => performance.now(),
};

function emptyVisibilityCounts(): CorpusVisibilityCounts {
  return {
    visible: 0,
    hidden: 0,
    conditional: 0,
    unknown: 0,
    orphaned: 0,
    broken: 0,
  };
}

function emptyConditionCounts(): CorpusConditionCounts {
  return {
    total: 0,
    byKind: { SuppressIf: 0, GrayOutIf: 0, DisableIf: 0 },
    bySource: {
      setup: 0,
      hardware: 0,
      access: 0,
      ui: 0,
      runtime: 0,
      constant: 0,
      unknown: 0,
    },
  };
}

function emptyOuter(report: AmiFirmwareImageReport): CorpusOuterImageSummary {
  return {
    container: report.container,
    amiAptioCandidate: report.amiAptioCandidate,
    intelDescriptor: report.intelDescriptor,
    firmwareVolumeOffsets: report.firmwareVolumes,
    ffs2VolumeOffsets: report.ffs2Volumes,
    ffs3VolumeOffsets: report.ffs3Volumes,
    outerSetupOffsets: report.setupFfs,
    outerAmitseOffsets: report.amitseFfs,
    guidedLzmaSectionOffsets: report.guidedLzmaSections,
    deepScanRequired: report.deepScanRequired,
  };
}

function defaultGeneration(report: AmiFirmwareImageReport): AmiGenerationAssessment {
  return {
    generation: report.generation,
    confidence: report.confidence,
    conflict: false,
  };
}

function makeStage(
  id: CorpusStageId,
  status: CorpusStageStatus,
  detail: string,
): CorpusStageResult {
  return { id, status, detail };
}

function failureCode(reason: unknown) {
  return reason instanceof FirmwareError ? reason.code : undefined;
}

function mostCommonReason(reasons: string[]) {
  const counts = new Map<string, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}

function collectNodes(nodes: MenuTreeNode[]) {
  const collected: MenuTreeNode[] = [];
  const pending = [...nodes];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    collected.push(node);
    pending.push(...node.children);
  }
  return collected;
}

function uniqueFormCount(nodes: MenuTreeNode[]) {
  return new Set(
    collectNodes(nodes).flatMap((node) =>
      node.formIndex === null ? [] : [node.formIndex],
    ),
  ).size;
}

function summarizeHii(data: Data): CorpusHiiSummary {
  const tree = buildMenuTree(data);
  const treeNodes = collectNodes([...tree.roots, ...tree.orphans]);
  const conditions = emptyConditionCounts();
  for (const condition of data.suppressions) {
    conditions.total += 1;
    conditions.byKind[condition.kind ?? "SuppressIf"] += 1;
    conditions.bySource[condition.source ?? "unknown"] += 1;
  }

  const visibility = emptyVisibilityCounts();
  for (const form of data.forms) {
    for (const child of form.children) {
      visibility[childVisibility(data, child).status] += 1;
    }
  }
  visibility.orphaned = uniqueFormCount(tree.orphans);
  visibility.broken = treeNodes.filter((node) => node.reachability === "broken").length;

  return {
    packageCount: data.ifrBinary?.packages.filter((pkg) => pkg.valid).length ?? 0,
    formSetCount: new Set(
      data.forms.flatMap((form) => (form.formSetGuid ? [form.formSetGuid] : [])),
    ).size,
    formCount: data.forms.length,
    questionCount: data.forms.reduce((total, form) => total + form.children.length, 0),
    referenceCount: data.forms.reduce(
      (total, form) =>
        total + form.children.filter((child) => child.type === "Ref").length,
      0,
    ),
    rootCount: tree.roots.length,
    profileCount: tree.profiles.length,
    detachedFormCount: uniqueFormCount(tree.orphans),
    externalReferenceCount: treeNodes.filter((node) => node.reachability === "external")
      .length,
    unresolvedReferenceCount: treeNodes.filter(
      (node) => node.reachability === "unresolved",
    ).length,
    conditions,
    visibility,
  };
}

function summarizeNavigation(data: Data): CorpusNavigationSummary {
  const rootStatus = data.rootVisibility?.status ?? "not-run";
  const singleStatus = data.singleFormSetNavigation?.status ?? "not-run";
  if (rootStatus === "detected") {
    return {
      mechanism: "multi-formset-root-vector",
      resolved: true,
      rootVisibilityStatus: rootStatus,
      rootVisibilityReason: data.rootVisibility?.reason ?? "",
      singleFormSetStatus: singleStatus,
      singleFormSetReason: data.singleFormSetNavigation?.reason ?? "",
    };
  }
  if (singleStatus === "detected") {
    return {
      mechanism: "single-formset-ifr-hub",
      resolved: true,
      rootVisibilityStatus: rootStatus,
      rootVisibilityReason: data.rootVisibility?.reason ?? "",
      singleFormSetStatus: singleStatus,
      singleFormSetReason: data.singleFormSetNavigation?.reason ?? "",
    };
  }
  if (data.menu.length > 0) {
    return {
      mechanism: "menu-evidence-only",
      resolved: false,
      rootVisibilityStatus: rootStatus,
      rootVisibilityReason: data.rootVisibility?.reason ?? "Not analysed.",
      singleFormSetStatus: singleStatus,
      singleFormSetReason: data.singleFormSetNavigation?.reason ?? "Not analysed.",
    };
  }
  return {
    mechanism: "unresolved",
    resolved: false,
    rootVisibilityStatus: rootStatus,
    rootVisibilityReason: data.rootVisibility?.reason ?? "No root evidence.",
    singleFormSetStatus: singleStatus,
    singleFormSetReason:
      data.singleFormSetNavigation?.reason ?? "No navigation evidence.",
  };
}

function locateReference(
  data: Data,
  page: AmiSingleFormSetPage,
): { formIndex: number; childIndex: number; reference: RefPrompt } | null {
  if (!page.ifrReferenceOffset) return null;
  const matches = data.forms.flatMap((form, formIndex) =>
    form.children.flatMap((child, childIndex) =>
      child.type === "Ref" && child.ifrOffset === page.ifrReferenceOffset
        ? [{ formIndex, childIndex, reference: child }]
        : [],
    ),
  );
  return matches.length === 1 ? matches[0] : null;
}

function moveCapability(
  data: Data,
  setupHex: string,
  page: AmiSingleFormSetPage,
  source: ReturnType<typeof locateReference>,
): CorpusEditCapability {
  if (!source) {
    return {
      pageName: page.name,
      formId: page.formId,
      formSetGuid: page.formSetGuid,
      kind: "move",
      mechanism: "ifr-ref-move",
      available: false,
      reason: "The page Ref could not be matched uniquely to the binary IFR stream.",
    };
  }
  const destinations = analyzeMenuMoveDestinations(
    data,
    setupHex,
    source.formIndex,
    source.childIndex,
  );
  const safe = destinations.filter(
    (destination) =>
      destination.compatibility === "safe-same-package" ||
      destination.compatibility === "safe-cross-package",
  );
  const requiresRef3 = destinations.filter(
    (destination) => destination.compatibility === "requires-ref3",
  );
  const blockedReasons = destinations
    .filter((destination) => destination.compatibility === "unavailable")
    .map((destination) => destination.reason);
  return {
    pageName: page.name,
    formId: page.formId,
    formSetGuid: page.formSetGuid,
    kind: "move",
    mechanism: "ifr-ref-move",
    available: safe.length > 0,
    safeDestinationCount: safe.length,
    requiresRef3DestinationCount: requiresRef3.length,
    reason:
      safe.length > 0
        ? `${String(safe.length)} existing Form destination(s) accept a verified fixed-size Ref move.`
        : (mostCommonReason(blockedReasons) ??
          "No existing Form accepts this Ref without changing its binary representation."),
  };
}

function summarizeEditing(data: Data, setupBytes: Uint8Array): CorpusEditSummary {
  const actions: CorpusEditCapability[] = [];
  const setupHex = bytesToHex(setupBytes);
  if (data.rootVisibility?.status === "detected") {
    for (const entry of data.rootVisibility.entries) {
      actions.push({
        pageName: entry.name,
        formId: entry.formId,
        formSetGuid: entry.formSetGuid,
        kind: entry.visible ? "hide" : "show",
        mechanism: "root-vector",
        available: true,
        reason:
          "A unique Setup-code-corroborated root-vector byte controls this existing FormSet entry.",
      });
    }
  } else if (data.singleFormSetNavigation?.status === "detected") {
    for (const page of data.singleFormSetNavigation.pages.filter(
      (candidate) =>
        candidate.role === "direct-tab" || candidate.role === "suppressed-tab",
    )) {
      const source = locateReference(data, page);
      const visible = page.role === "suppressed-tab";
      const availability = source
        ? analyzeTopLevelTabVisibilityToggle(data, setupHex, {
            sourceFormIndex: source.formIndex,
            referenceChildIndex: source.childIndex,
            visible,
          })
        : {
            available: false,
            reason: "The page Ref could not be matched uniquely to the parsed IFR.",
          };
      actions.push({
        pageName: page.name,
        formId: page.formId,
        formSetGuid: page.formSetGuid,
        kind: visible ? "show" : "hide",
        mechanism: "single-formset-ref",
        available: availability.available,
        reason: availability.reason,
      });
      actions.push(moveCapability(data, setupHex, page, source));
    }
  } else {
    const navigationReason = [
      data.rootVisibility?.reason,
      data.singleFormSetNavigation?.reason,
    ]
      .filter(Boolean)
      .join(" ");
    for (const root of buildMenuTree(data).roots) {
      actions.push({
        pageName: root.label,
        formId: root.formId,
        formSetGuid: data.forms[root.formIndex ?? -1]?.formSetGuid,
        kind: "hide",
        mechanism: "unresolved",
        available: false,
        reason:
          navigationReason ||
          "No unique binary mechanism controlling this top-level page was proven.",
      });
    }
  }

  return {
    hideAvailable: actions.filter(
      (action) => action.kind === "hide" && action.available,
    ).length,
    showAvailable: actions.filter(
      (action) => action.kind === "show" && action.available,
    ).length,
    moveAvailable: actions.filter(
      (action) => action.kind === "move" && action.available,
    ).length,
    blocked: actions.filter((action) => !action.available).length,
    fullImageReady: false,
    actions,
  };
}

function contextStatus(navigation: CorpusNavigationSummary) {
  return navigation.resolved ? "recognized" : "partial";
}

export function buildCorpusContextReport(
  artifacts: AmiFirmwareArtifacts,
  profile: AmiSetupProfileReport,
  generation: AmiGenerationAssessment,
  data: Data,
): CorpusContextReport {
  const selected = artifacts.artifactSets.find(
    (candidate) => candidate.id === artifacts.selectedArtifactSetId,
  );
  if (!selected) {
    throw new FirmwareError(
      "PARSE_FAILED",
      "The selected firmware context is absent from the extraction inventory.",
    );
  }
  const navigation = summarizeNavigation(data);
  const reconstruction = assessFirmwareReconstruction(artifacts.provenance);
  return {
    id: selected.id,
    label: selected.label,
    coherence: selected.coherence,
    warnings: selected.warnings,
    status: contextStatus(navigation),
    extractionDepth: artifacts.extractionDepth,
    hiiBytes: artifacts.hii.length,
    amitseFound: artifacts.amitse !== undefined,
    setupDataFound: artifacts.setupData !== undefined,
    spfPresent: profile.spfPresent,
    layout: profile.layout,
    generation,
    hii: summarizeHii(data),
    navigation,
    editing: summarizeEditing(data, artifacts.hii),
    reconstruction: {
      traceComplete: reconstruction.traceComplete,
      writeEnabled: false,
      compressions: reconstruction.compressions,
      blockers: reconstruction.blockers,
    },
  };
}

async function parseArtifacts(
  fileName: string,
  artifacts: AmiFirmwareArtifacts,
): Promise<Data> {
  const amitse = artifacts.amitse ?? new Uint8Array();
  const setupData = artifacts.setupData ?? new Uint8Array();
  const files: PopulatedFiles = {
    setupSctContainer: {
      file: new File([artifacts.hii], `${fileName}.setup.bin`),
      textContent: bytesToHex(artifacts.hii),
      isWrongFile: false,
    },
    setupTxtContainer: {
      file: new File([artifacts.ifrText], `${fileName}.ifr.txt`, {
        type: "text/plain",
      }),
      textContent: artifacts.ifrText,
      isWrongFile: false,
    },
    amitseSctContainer: {
      file: new File([amitse], `${fileName}.amitse.bin`),
      textContent: bytesToHex(amitse),
      isWrongFile: false,
    },
    setupdataBinContainer: {
      file: new File([setupData], `${fileName}.setupdata.bin`),
      textContent: bytesToHex(setupData),
      isWrongFile: false,
    },
    firmwareSource: { fileName, artifacts },
  };
  return parseData(files);
}

function stagesForContexts(contexts: CorpusContextReport[]): CorpusStageResult[] {
  const navigationResolved = contexts.filter(
    (context) => context.navigation.resolved,
  ).length;
  const editable = contexts.filter(
    (context) =>
      context.editing.hideAvailable +
        context.editing.showAvailable +
        context.editing.moveAvailable >
      0,
  ).length;
  const traceable = contexts.filter(
    (context) => context.reconstruction.traceComplete,
  ).length;
  return [
    makeStage(
      "extraction",
      "passed",
      `${String(contexts.length)} coherent firmware context(s) extracted without cross-slot mixing.`,
    ),
    makeStage(
      "hii",
      "passed",
      `${String(contexts.length)} context(s) produced valid parsed HII data.`,
    ),
    makeStage(
      "navigation",
      navigationResolved === contexts.length ? "passed" : "warning",
      `${String(navigationResolved)} of ${String(contexts.length)} context(s) have a proven top-level navigation mechanism.`,
    ),
    makeStage(
      "editability",
      editable > 0 ? "passed" : "blocked",
      `${String(editable)} of ${String(contexts.length)} context(s) expose at least one proven Hide, Show or Move plan.`,
    ),
    makeStage(
      "reconstruction",
      "blocked",
      `${String(traceable)} of ${String(contexts.length)} context(s) have complete provenance, but full-image writing remains disabled until bottom-up reconstruction and verification exist.`,
    ),
  ];
}

export async function analyzeCorpusFirmware(
  input: CorpusFirmwareInput,
  onProgress: (progress: CorpusProgress) => void = () => undefined,
  dependencies: CorpusAnalysisDependencies = defaultDependencies,
): Promise<CorpusFileReport> {
  const started = dependencies.now();
  onProgress({ stage: "preflight", detail: "Inspecting the outer image…" });
  const sha256 = await dependencies.hash(input.bytes);
  const outerReport = dependencies.inspect(input.bytes);
  const brand = classifyBrand(
    input.fileName,
    sha256,
    outerReport.brandMarkers,
    input.declaredBrand,
  );
  const outer = emptyOuter(outerReport);
  const preflightStage = makeStage(
    "preflight",
    outerReport.firmwareVolumes.length > 0 ? "passed" : "failed",
    outerReport.firmwareVolumes.length > 0
      ? `${String(outerReport.firmwareVolumes.length)} valid firmware volume(s) found.`
      : "No checksummed UEFI PI firmware volume was found.",
  );
  if (outerReport.firmwareVolumes.length === 0) {
    return {
      fileName: input.fileName,
      brand,
      size: input.size,
      lastModified: input.lastModified ?? null,
      sha256,
      durationMs: Math.round(dependencies.now() - started),
      status: "unsupported",
      outer,
      generation: defaultGeneration(outerReport),
      contexts: [],
      stages: [
        preflightStage,
        makeStage("extraction", "not-run", "Deep extraction was not started."),
        makeStage("hii", "not-run", "No HII artifact was extracted."),
        makeStage("navigation", "not-run", "Navigation was not analysed."),
        makeStage("editability", "not-run", "Editability was not analysed."),
        makeStage("reconstruction", "not-run", "Reconstruction was not analysed."),
      ],
      failure: {
        stage: "preflight",
        message: "No valid UEFI firmware volume was found.",
      },
    };
  }

  let failureStage: CorpusProgressStage = "extraction";
  try {
    onProgress({
      stage: "extraction",
      detail: "Recursively extracting coherent AMI Setup contexts…",
    });
    const initial = await dependencies.extract(input.bytes);
    const contextIds = initial.artifactSets.map((context) => context.id);
    const contexts: CorpusContextReport[] = [];
    for (const [contextIndex, contextId] of contextIds.entries()) {
      onProgress({
        stage: "hii",
        detail: `Parsing firmware context ${String(contextIndex + 1)} of ${String(contextIds.length)}…`,
        contextIndex,
        contextCount: contextIds.length,
      });
      const artifacts =
        contextId === initial.selectedArtifactSetId
          ? initial
          : await dependencies.extract(input.bytes, undefined, {
              artifactSetId: contextId,
            });
      const profile = inspectAmiSetupProfile(artifacts.hii, artifacts.setupData);
      const generation = reconcileAmiGeneration(outerReport, profile);
      failureStage = "hii";
      const data = await dependencies.parseArtifacts(input.fileName, artifacts);
      failureStage = "navigation";
      onProgress({
        stage: "navigation",
        detail: `Classifying navigation for context ${String(contextIndex + 1)}…`,
        contextIndex,
        contextCount: contextIds.length,
      });
      failureStage = "editability";
      contexts.push(buildCorpusContextReport(artifacts, profile, generation, data));
    }

    const generation = contexts[0]?.generation ?? defaultGeneration(outerReport);
    const allRecognized = contexts.every((context) => context.status === "recognized");
    onProgress({ stage: "complete", detail: "Local analysis complete." });
    return {
      fileName: input.fileName,
      brand: compareBrandNavigation(
        brand,
        contexts.map((context) =>
          context.navigation.resolved &&
          (context.navigation.mechanism === "multi-formset-root-vector" ||
            context.navigation.mechanism === "single-formset-ifr-hub")
            ? context.navigation.mechanism
            : "unresolved",
        ),
      ),
      size: input.size,
      lastModified: input.lastModified ?? null,
      sha256,
      durationMs: Math.round(dependencies.now() - started),
      status: allRecognized ? "recognized" : "partial",
      outer,
      generation,
      contexts,
      stages: [preflightStage, ...stagesForContexts(contexts)],
    };
  } catch (reason) {
    const expected = reason instanceof FirmwareError;
    const message = errorMessage(reason);
    return {
      fileName: input.fileName,
      brand,
      size: input.size,
      lastModified: input.lastModified ?? null,
      sha256,
      durationMs: Math.round(dependencies.now() - started),
      status: expected ? "unsupported" : "failed",
      outer,
      generation: defaultGeneration(outerReport),
      contexts: [],
      stages: [
        preflightStage,
        makeStage(
          "extraction",
          failureStage === "extraction" ? "failed" : "passed",
          failureStage === "extraction"
            ? message
            : "At least one coherent firmware context was extracted.",
        ),
        makeStage(
          "hii",
          failureStage === "hii" ? "failed" : "not-run",
          failureStage === "hii" ? message : "HII parsing did not complete.",
        ),
        makeStage(
          "navigation",
          failureStage === "navigation" ? "failed" : "not-run",
          failureStage === "navigation"
            ? message
            : "Navigation classification did not complete.",
        ),
        makeStage(
          "editability",
          failureStage === "editability" ? "failed" : "not-run",
          failureStage === "editability"
            ? message
            : "Editability analysis did not complete.",
        ),
        makeStage(
          "reconstruction",
          "not-run",
          "Reconstruction provenance was not assessed.",
        ),
      ],
      failure: { stage: failureStage, code: failureCode(reason), message },
    };
  }
}
