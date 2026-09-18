import { describe, expect, it, vi } from "vitest";
import { firmwareData, form, prompt } from "../../test/fixtures";
import type { AmiFirmwareImageReport, AmiSetupProfileReport } from "./amiFirmwareImage";
import type { AmiFirmwareArtifacts } from "./amiFirmwareExtractor";
import { analyzeCorpusFirmware, buildCorpusContextReport } from "./corpusAnalysis";
import {
  corpusRunToCsv,
  createCorpusInputFailure,
  createCorpusRunReport,
  summarizeCorpusRun,
} from "./corpusReport";
import { FirmwareError } from "./errors";
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
});
