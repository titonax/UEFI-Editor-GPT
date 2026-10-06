import type { PopulatedFiles } from "../firmwareFiles";
import {
  extractAmiFirmwareBytes,
  type AmiFirmwareArtifacts,
} from "./amiFirmwareExtractor";
import { inspectFirmwareImageLayout } from "./firmwareImageContainer";
import { sha256Hex } from "./checksum";
import {
  assertAcceptedCompressedArtifactEdits,
  hasAcceptedRootVisibilitySource,
} from "./firmwareAcceptance";
import { planAmiRootVisibilityPatches } from "./amiRootVisibilityPatcher";
import { inspectAmiRootVisibility } from "./amiRootVisibility";
import { parseData } from "./scripts";
import { bytesToHex } from "./hex";
import {
  assessFirmwareReconstruction,
  type FirmwareArtifactKind,
} from "./firmwareProvenance";
import { createLzmaSectionCodec } from "./lzmaSectionCodec";
import { createStandardSectionCodec } from "./standardSectionCodec";
import { FirmwareError } from "./errors";
import { buildFirmwarePatches } from "./patcher";
import type { Data } from "./types";
import {
  rebuildUefiImage,
  type FirmwareArtifactReplacements,
  type UefiImageBuildResult,
} from "./uefiImageRebuilder";

export interface AmiFirmwareBuildResult extends UefiImageBuildResult {
  fileName: string;
  changeLog: string;
  containerKind: "bios-image" | "intel-spi";
}

type AmiReextractor = (
  image: Uint8Array,
  artifacts: AmiFirmwareArtifacts,
) => Promise<AmiFirmwareArtifacts>;

function equalBytes(left: Uint8Array | undefined, right: Uint8Array | undefined) {
  if (!left || !right) return left === right;
  return (
    left.length === right.length && left.every((byte, index) => byte === right[index])
  );
}

function modifiedBinName(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${base}-modified.bin`;
}

async function defaultReextractor(image: Uint8Array, artifacts: AmiFirmwareArtifacts) {
  return extractAmiFirmwareBytes(image, () => Promise.resolve(artifacts.ifrText), {
    artifactSetId: artifacts.selectedArtifactSetId,
  });
}

/** Builds a complete AMI BIOS/SPI image and independently re-extracts edits. */
export async function buildAmiFirmwareImage(
  data: Data,
  files: PopulatedFiles,
  reextract: AmiReextractor = defaultReextractor,
): Promise<AmiFirmwareBuildResult> {
  const session = files.firmwareSource;
  if (!session) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Complete-image output requires the original firmware session.",
    );
  }
  const graph = session.artifacts.provenance;
  const initialAssessment = assessFirmwareReconstruction(graph);
  const hasCompression = initialAssessment.compressions.some(
    (compression) => compression !== "none",
  );
  const rootBytes = graph.buffers.find((node) => node.id === graph.rootBufferId)?.bytes;
  if (!rootBytes) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "Original firmware bytes are missing.",
    );
  }
  const sourceHash = hasCompression ? await sha256Hex(rootBytes) : undefined;
  if (sourceHash && session.sourceSha256 && sourceHash !== session.sourceSha256) {
    throw new FirmwareError("INTEGRITY_MISMATCH", "Firmware source hash changed.");
  }
  const assessment = assessFirmwareReconstruction(graph, sourceHash);
  if (!assessment.writeEnabled) {
    throw new FirmwareError(
      "PATCH_FAILED",
      `Full-image reconstruction is blocked: ${assessment.blockers.join(" ")}`,
    );
  }
  const rootEdits = data.rootVisibilityEdits ?? [];
  if (
    rootEdits.length &&
    !hasAcceptedRootVisibilitySource(sourceHash, graph.sourceSize)
  ) {
    throw new FirmwareError(
      "PATCH_FAILED",
      "Root visibility reconstruction awaits real-image acceptance for this source.",
    );
  }
  const sourceContainer = (
    bytes: Uint8Array,
    name: string,
    textContent = bytesToHex(bytes),
  ) => ({
    file: new File([bytes], name),
    textContent,
    isWrongFile: false,
  });
  const freshData = rootEdits.length
    ? await parseData({
        ...files,
        setupSctContainer: sourceContainer(session.artifacts.hii, "setup.bin"),
        setupTxtContainer: sourceContainer(
          new TextEncoder().encode(session.artifacts.ifrText),
          "setup.txt",
          session.artifacts.ifrText,
        ),
        amitseSctContainer: sourceContainer(
          session.artifacts.amitse ?? new Uint8Array(),
          "amitse.bin",
        ),
        setupdataBinContainer: sourceContainer(
          session.artifacts.setupData ?? new Uint8Array(),
          "setupdata.bin",
        ),
      })
    : undefined;
  const rootPatches = rootEdits.length
    ? planAmiRootVisibilityPatches(rootEdits, freshData?.rootVisibility, graph)
    : [];
  const patches = buildFirmwarePatches(
    { ...data, rootVisibilityEdits: undefined },
    {
      setupSct: files.setupSctContainer.textContent,
      amitseSct: files.amitseSctContainer.textContent,
      setupdataBin: files.setupdataBinContainer.textContent,
    },
  );
  const replacements: FirmwareArtifactReplacements = {
    ...(patches.setupSct ? { "setup-hii": patches.setupSct } : {}),
    ...(patches.amitseSct ? { amitse: patches.amitseSct } : {}),
    ...(patches.setupdataBin ? { setupdata: patches.setupdataBin } : {}),
  };
  if (hasCompression) {
    assertAcceptedCompressedArtifactEdits(
      sourceHash,
      graph.sourceSize,
      Object.keys(replacements) as FirmwareArtifactKind[],
    );
  }
  const rebuilt = await rebuildUefiImage(
    graph,
    replacements,
    {
      lzma: createLzmaSectionCodec,
      standard: createStandardSectionCodec,
    },
    rootPatches,
  );
  const reopened = await reextract(rebuilt.image, session.artifacts);
  for (const [kind, expected, actual] of [
    ["Setup HII", patches.setupSct ?? session.artifacts.hii, reopened.hii],
    ["AMITSE", patches.amitseSct ?? session.artifacts.amitse, reopened.amitse],
    [
      "SetupData",
      patches.setupdataBin ?? session.artifacts.setupData,
      reopened.setupData,
    ],
  ] as const) {
    if (!equalBytes(expected, actual)) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `${kind} did not match after re-opening the rebuilt firmware.`,
      );
    }
  }
  if (rootPatches.length && freshData) {
    const report = inspectAmiRootVisibility(
      freshData.formSetRoots ?? [],
      reopened.provenance,
    );
    if (
      report.status !== "detected" ||
      report.entries.length !== freshData.rootVisibility?.entries.length ||
      report.entries.some((entry, index) => {
        const original = freshData.rootVisibility?.entries[index];
        const expected =
          rootEdits.find((edit) => edit.rootIndex === entry.rootIndex)?.replacement ??
          original?.value;
        return (
          entry.formId !== original?.formId ||
          entry.formSetGuid !== original.formSetGuid ||
          entry.value !== expected
        );
      })
    ) {
      throw new FirmwareError(
        "INTEGRITY_MISMATCH",
        "Root visibility did not match after re-opening the rebuilt firmware.",
      );
    }
  }
  const before = inspectFirmwareImageLayout(
    session.artifacts.provenance.buffers.find((node) => node.id === 0)?.bytes ??
      new Uint8Array(),
  );
  const after = inspectFirmwareImageLayout(rebuilt.image);
  if (
    before.kind !== after.kind ||
    before.imageSize !== after.imageSize ||
    before.biosStart !== after.biosStart ||
    before.biosEnd !== after.biosEnd
  ) {
    throw new FirmwareError(
      "INTEGRITY_MISMATCH",
      "The rebuilt firmware changed its outer BIOS/SPI layout.",
    );
  }
  return {
    ...rebuilt,
    fileName: modifiedBinName(session.fileName),
    changeLog: [patches.changeLog, ...rootEdits.map((edit) => edit.description)]
      .filter(Boolean)
      .join("\n"),
    containerKind: before.kind,
  };
}

export { modifiedBinName as amiModifiedBinName };
