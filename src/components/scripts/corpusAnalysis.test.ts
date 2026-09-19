import { describe, expect, it, vi } from "vitest";
import { firmwareData, form, prompt } from "../../test/fixtures";
import type { AmiFirmwareImageReport, AmiSetupProfileReport } from "./amiFirmwareImage";
import type { AmiFirmwareArtifacts } from "./amiFirmwareExtractor";
import { analyzeCorpusFirmware, buildCorpusContextReport } from "./corpusAnalysis";
import { firstRecognitionBlocker } from "./corpusDashboard";
import {
  corpusRunToCsv,
  createCorpusInputFailure,
  createCorpusRunReport,
  summarizeCorpusRun,
} from "./corpusReport";
import { FirmwareError } from "./errors";
import type { CorpusFileReport, CorpusStageResult } from "./corpusTypes";
import type { Data } from "./types";

const guidA = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
const guidB = "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB";

function outerReport(
  overrides: Partial<AmiFirmwareImageReport> = {},
): AmiFirmwareImageReport {
  return {
    size: 64,
    container: "firmware-volume-image",
    intelDescriptor: false,
    firmwareVolumes: [0],
    ffs2Volumes: [0],
    ffs3Volumes: [],
    setupFfs: [24],
    amitseFfs: [],
    guidedLzmaSections: [],
    setupDataProfiles: [],
    nestedFirmwareCandidate: false,
    deepScanRequired: true,
    amiAptioCandidate: true,
    generation: "unresolved",
    confidence: "unresolved",
    evidence: [],
    brandMarkers: [],
    ...overrides,
  };
}

function profile(
  overrides: Partial<AmiSetupProfileReport> = {},
): AmiSetupProfileReport {
  return {
    spfPresent: false,
    spfField04: null,
    spfField08: null,
    formPackageCount: 1,
    formSetGuids: [guidA],
    layout: "unresolved",
    generation: "unresolved",
    confidence: "unresolved",
    evidence: [],
    ...overrides,
  };
}

function artifacts(id = "context-1"): AmiFirmwareArtifacts {
  const source = new Uint8Array(64);
  const setupFile = {
    bufferId: 0,
    guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
    volumeStart: 0,
    volumeEnd: 64,
    fileStart: 0,
    bodyStart: 24,
    end: 64,
    headerSize: 24,
  };
  return {
    hii: new Uint8Array([0]),
    ifrText: "IFR",
    formPackageCount: 1,
    extractionDepth: 0,
    artifactSets: [
      {
        id,
        label: "Firmware context 1",
        coherence: "same-firmware-volume",
        setupFile,
        warnings: [],
      },
    ],
    selectedArtifactSetId: id,
    provenance: {
      rootBufferId: 0,
      sourceSize: source.length,
      buffers: [{ id: 0, bytes: source, depth: 0 }],
      artifacts: [
        {
          kind: "setup-hii",
          bufferId: 0,
          payloadStart: 24,
          payloadEnd: 25,
          sourceFile: setupFile,
        },
      ],
    },
  };
}

function multiFormSetData(): Data {
  return firmwareData({
    menu: [
      { name: "Main", formId: "0x1", formSetGuid: guidA, offset: null },
      { name: "Advanced", formId: "0x2", formSetGuid: guidB, offset: null },
    ],
    forms: [
      form({ name: "Main", formSetGuid: guidA }),
      form({ name: "Advanced", formId: "0x2", formSetGuid: guidB }),
    ],
    rootVisibility: {
      status: "detected",
      mechanism: "setup-pe32-root-byte-vector",
      confidence: "corroborated",
      reason: "Unique test vector",
      vector: {
        bufferId: 0,
        offset: 10,
        length: 2,
        codeReferenceOffset: 20,
        pageTableOffset: 30,
        countEvidence: "immediate",
      },
      entries: [
        {
          rootIndex: 0,
          name: "Main",
          formId: "0x1",
          formSetGuid: guidA,
          value: 1,
          visible: true,
          bufferOffset: 10,
        },
        {
          rootIndex: 1,
          name: "Advanced",
          formId: "0x2",
          formSetGuid: guidB,
          value: 0,
          visible: false,
          bufferOffset: 11,
        },
      ],
    },
  });
}

function singleFormSetData(): Data {
  return firmwareData({
    menu: [{ name: "Setup", formId: "0x1", formSetGuid: guidA, offset: null }],
    forms: [
      form({
        name: "Setup",
        formSetGuid: guidA,
        children: [
          prompt({
            type: "Ref",
            name: "Main",
            formId: "0x2",
            ifrOffset: "0x10",
            pageId: null,
          }),
        ],
      }),
      form({ name: "Main", formId: "0x2", formSetGuid: guidA }),
    ],
    singleFormSetNavigation: {
      status: "detected",
      mechanism: "single-formset-ifr-hub",
      confidence: "ifr-only",
      reason: "Direct hub",
      formSetGuid: guidA,
      hubFormId: "0x1",
      hubName: "Setup",
      pages: [
        {
          name: "Setup",
          formId: "0x1",
          formSetGuid: guidA,
          role: "hub",
          registeredInAmitse: false,
          registrationOffsets: [],
          parentFormIds: [],
        },
        {
          name: "Main",
          formId: "0x2",
          formSetGuid: guidA,
          role: "direct-tab",
          registeredInAmitse: false,
          registrationOffsets: [],
          ifrReferenceOffset: "0x10",
          parentFormIds: ["0x1"],
        },
      ],
    },
  });
}

describe("local firmware corpus analysis", () => {
  it("summarizes code-corroborated visible and hidden multi-FormSet roots", () => {
    const context = buildCorpusContextReport(
      artifacts(),
      profile({ formSetGuids: [guidA, guidB], formPackageCount: 2 }),
      { generation: "aptio-iv", confidence: "probable", conflict: false },
      multiFormSetData(),
    );

    expect(context.status).toBe("recognized");
    expect(context.navigation.mechanism).toBe("multi-formset-root-vector");
    expect(context.editing).toMatchObject({
      hideAvailable: 1,
      showAvailable: 1,
      fullImageReady: false,
    });
    expect(context.editing.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pageName: "Main", kind: "hide", available: true }),
        expect.objectContaining({
          pageName: "Advanced",
          kind: "show",
          available: true,
        }),
      ]),
    );
  });

  it("records exact blockers when a single-FormSet Ref cannot be edited", () => {
    const context = buildCorpusContextReport(
      artifacts(),
      profile(),
      { generation: "aptio-v", confidence: "probable", conflict: false },
      singleFormSetData(),
    );

    expect(context.status).toBe("recognized");
    expect(context.navigation.mechanism).toBe("single-formset-ifr-hub");
    expect(context.editing.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "hide", available: false }),
        expect.objectContaining({ kind: "move", available: false }),
      ]),
    );
    expect(context.editing.actions.every((action) => action.reason.length > 0)).toBe(
      true,
    );
  });

  it("runs every analysis layer with injectable local dependencies", async () => {
    let now = 0;
    const progress: string[] = [];
    const extracted = artifacts();
    const result = await analyzeCorpusFirmware(
      {
        fileName: "board.bin",
        size: 64,
        lastModified: 123,
        bytes: new Uint8Array(64),
      },
      (entry) => progress.push(entry.stage),
      {
        inspect: () => outerReport(),
        extract: vi.fn().mockResolvedValue(extracted),
        parseArtifacts: vi.fn().mockResolvedValue(multiFormSetData()),
        hash: vi.fn().mockResolvedValue("abc123"),
        now: () => {
          now += 5;
          return now;
        },
      },
    );

    expect(result).toMatchObject({
      fileName: "board.bin",
      sha256: "abc123",
      durationMs: 5,
      status: "recognized",
    });
    expect(result.contexts).toHaveLength(1);
    expect(progress).toEqual(
      expect.arrayContaining([
        "preflight",
        "extraction",
        "hii",
        "navigation",
        "complete",
      ]),
    );
  });

  it("stops cleanly when no valid firmware volume exists", async () => {
    const extract = vi.fn();
    const result = await analyzeCorpusFirmware(
      {
        fileName: "not-firmware.bin",
        size: 4,
        bytes: new Uint8Array(4),
      },
      undefined,
      {
        inspect: () =>
          outerReport({
            container: "unknown",
            firmwareVolumes: [],
            ffs2Volumes: [],
            amiAptioCandidate: false,
          }),
        extract,
        parseArtifacts: vi.fn(),
        hash: vi.fn().mockResolvedValue("deadbeef"),
        now: () => 0,
      },
    );

    expect(result.status).toBe("unsupported");
    expect(result.failure?.stage).toBe("preflight");
    expect(extract).not.toHaveBeenCalled();
  });

  it("checks a brand prior against the navigation actually parsed from HII", async () => {
    const result = await analyzeCorpusFirmware(
      {
        fileName: "renamed.bin",
        size: 64,
        bytes: new Uint8Array(64),
      },
      undefined,
      {
        inspect: () => outerReport(),
        extract: vi.fn().mockResolvedValue(artifacts()),
        parseArtifacts: vi.fn().mockResolvedValue(multiFormSetData()),
        hash: vi
          .fn()
          .mockResolvedValue(
            "e862e5b0fdce10e44764be6072dd5b8017544264353dbfa02c8074e0ccc15190",
          ),
        now: () => 0,
      },
    );

    expect(result.brand).toMatchObject({
      brand: "ASUS",
      basis: "documented-hash",
      navigationPrior: [{ mechanism: "single-formset-ifr-hub", samples: 2 }],
      navigationOutcome: "new-pattern",
    });
    expect(result.contexts[0]?.navigation.mechanism).toBe("multi-formset-root-vector");
    expect(result.contexts[0]?.editing.fullImageReady).toBe(false);
  });

  it("classifies expected extraction failures without hiding their stage", async () => {
    const result = await analyzeCorpusFirmware(
      {
        fileName: "missing-setup.bin",
        size: 64,
        bytes: new Uint8Array(64),
      },
      undefined,
      {
        inspect: () => outerReport(),
        extract: vi
          .fn()
          .mockRejectedValue(
            new FirmwareError("PARSE_FAILED", "Setup FFS was not found."),
          ),
        parseArtifacts: vi.fn(),
        hash: vi.fn().mockResolvedValue("deadbeef"),
        now: () => 0,
      },
    );

    expect(result.status).toBe("unsupported");
    expect(result.failure).toEqual({
      stage: "extraction",
      code: "PARSE_FAILED",
      message: "Setup FFS was not found.",
    });
  });

  it("does not mark an empty extraction as parsed or navigation-proven", async () => {
    const result = await analyzeCorpusFirmware(
      { fileName: "empty.bin", size: 64, bytes: new Uint8Array(64) },
      undefined,
      {
        inspect: () => outerReport(),
        extract: vi.fn().mockResolvedValue({ ...artifacts(), artifactSets: [] }),
        parseArtifacts: vi.fn(),
        hash: vi.fn().mockResolvedValue("empty"),
        now: () => 0,
      },
    );
    expect(result.failure).toMatchObject({ stage: "extraction", code: "PARSE_FAILED" });
    expect(result.stages.find((stage) => stage.id === "extraction")?.status).toBe(
      "failed",
    );
    expect(result.stages.find((stage) => stage.id === "navigation")?.status).toBe(
      "not-run",
    );
  });

  it("reports unique hashes, layer-specific rates and CSV-safe filenames", () => {
    const file = new File([], 'board,"one".bin');
    const failed = createCorpusInputFailure(file, "Could not read input");
    const recognized = {
      ...failed,
      fileName: "board.bin",
      sha256: "same",
      status: "recognized" as const,
      contexts: [
        buildCorpusContextReport(
          artifacts(),
          profile(),
          { generation: "aptio-iv", confidence: "probable", conflict: false },
          multiFormSetData(),
        ),
      ],
      failure: undefined,
    };
    const duplicate = { ...recognized, fileName: "board-copy.bin" };
    const report = createCorpusRunReport(
      [recognized, duplicate, failed],
      "2026-09-18T00:00:00.000Z",
    );

    expect(summarizeCorpusRun(report.files)).toMatchObject({
      files: 3,
      uniqueFiles: 2,
      duplicates: 1,
      recognized: 2,
      failed: 1,
      extractionRate: 66.7,
      navigationRate: 100,
      hiiEditRate: 100,
      fullImageRate: 0,
    });
    expect(corpusRunToCsv(report)).toContain('"board,""one"".bin"');
    expect(report.privacy).toBe("metadata-only-no-firmware-bytes");
  });

  it("measures unique cases by eligible layer and separates recognition from write blockers", () => {
    const baselineStages: CorpusStageResult[] = [
      { id: "preflight", status: "passed", detail: "Valid volume" },
      { id: "extraction", status: "passed", detail: "Context found" },
      { id: "hii", status: "passed", detail: "Parsed" },
      { id: "navigation", status: "passed", detail: "Root proven" },
      { id: "editability", status: "passed", detail: "Hide plan" },
      { id: "reconstruction", status: "blocked", detail: "Write disabled" },
    ];
    const context = buildCorpusContextReport(
      artifacts(),
      profile(),
      { generation: "aptio-iv", confidence: "probable", conflict: false },
      multiFormSetData(),
    );
    const base = createCorpusInputFailure(
      new File([], "asus.bin"),
      "Unreadable",
      "ASUS",
    );
    const recognized: CorpusFileReport = {
      ...base,
      sha256: "ABC123",
      status: "recognized",
      failure: undefined,
      outer: { ...base.outer, container: "firmware-volume-image" },
      generation: { generation: "aptio-iv", confidence: "probable", conflict: false },
      contexts: [context],
      stages: baselineStages,
    };
    const duplicate = { ...recognized, fileName: "asus-copy.bin", sha256: "abc123" };
    const preflight: CorpusFileReport = {
      ...createCorpusInputFailure(new File([], "opaque.bin"), "No UEFI volume"),
      sha256: "different",
      status: "unsupported",
      stages: [
        { id: "preflight", status: "failed", detail: "No UEFI volume" },
        ...base.stages.slice(1),
      ],
      failure: { stage: "preflight", message: "No UEFI volume" },
    };
    const hii: CorpusFileReport = {
      ...recognized,
      fileName: "intel-hii.bin",
      brand: createCorpusInputFailure(new File([], "intel.bin"), "", "Intel").brand,
      sha256: "hii",
      status: "unsupported",
      contexts: [],
      stages: baselineStages.map((stage) => ({
        ...stage,
        status:
          stage.id === "hii"
            ? "failed"
            : stage.id === "navigation" ||
                stage.id === "editability" ||
                stage.id === "reconstruction"
              ? "not-run"
              : stage.status,
      })),
      failure: { stage: "hii", code: "PARSE_FAILED", message: "IFR invalid" },
    };
    const nav: CorpusFileReport = {
      ...hii,
      fileName: "intel-nav.bin",
      sha256: "nav",
      status: "partial",
      contexts: [
        { ...context, navigation: { ...context.navigation, resolved: false } },
      ],
      stages: baselineStages.map((stage) => ({
        ...stage,
        status:
          stage.id === "navigation"
            ? "warning"
            : stage.id === "editability"
              ? "blocked"
              : stage.status,
      })),
      failure: undefined,
    };
    const noEdit: CorpusFileReport = {
      ...recognized,
      fileName: "asus-no-edit.bin",
      sha256: "no-edit",
      contexts: [
        {
          ...context,
          editing: { ...context.editing, hideAvailable: 0, showAvailable: 0 },
        },
      ],
      stages: baselineStages.map((stage) => ({
        ...stage,
        status: stage.id === "editability" ? "blocked" : stage.status,
      })),
    };
    const reading = createCorpusInputFailure(
      new File([], "unreadable.bin"),
      "Read failed",
    );
    const report = createCorpusRunReport(
      [recognized, duplicate, preflight, hii, nav, noEdit, reading],
      "2026-09-18T00:00:00.000Z",
      8,
    );
    const dashboard = report.dashboard;

    expect(report.schemaVersion).toBe("0.3.0");
    expect(dashboard).toMatchObject({
      selected: 8,
      completed: 7,
      uniqueCases: 6,
      duplicateHashes: 1,
      unhashedCases: 1,
      noHiiEdit: 1,
      fullImageBlocked: 3,
      unknownManufacturer: 2,
    });
    expect(report.summary.uniqueFiles).toBe(6);
    expect(dashboard.stages).toEqual([
      expect.objectContaining({
        id: "preflight",
        eligible: 6,
        passed: 4,
        failed: 1,
        notRun: 1,
      }),
      expect.objectContaining({ id: "extraction", eligible: 4, passed: 4 }),
      expect.objectContaining({ id: "hii", eligible: 4, passed: 3, failed: 1 }),
      expect.objectContaining({ id: "navigation", eligible: 3, passed: 2, warning: 1 }),
      expect.objectContaining({
        id: "editability",
        eligible: 3,
        passed: 1,
        blocked: 2,
      }),
      expect.objectContaining({ id: "reconstruction", eligible: 3, blocked: 3 }),
    ]);
    expect(
      dashboard.recognitionBlockers.map(({ category, cases }) => [category, cases]),
    ).toEqual([
      ["reading", 1],
      ["preflight", 1],
      ["extraction", 0],
      ["hii", 1],
      ["navigation", 1],
      ["none", 2],
    ]);
    expect(dashboard.failureCodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "hii", code: "PARSE_FAILED", cases: 1 }),
        expect.objectContaining({ stage: "reading", code: "NO_CODE", cases: 1 }),
      ]),
    );
    expect(dashboard.manufacturers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "ASUS", cases: 2, extracted: 2 }),
        expect.objectContaining({ label: "Intel", cases: 2, extracted: 2 }),
        expect.objectContaining({ label: "Unknown", cases: 2 }),
      ]),
    );
    expect(firstRecognitionBlocker(noEdit)).toBe("none");
    const csv = corpusRunToCsv(report);
    expect(csv).toContain("first_recognition_blocker,duplicate_sha256");
    expect(csv).toContain("asus-copy.bin,abc123");
  });
});
