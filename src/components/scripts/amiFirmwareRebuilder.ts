import type { PopulatedFiles } from "../firmwareFiles";
import {
  extractAmiFirmwareBytes,
  type AmiFirmwareArtifacts,
} from "./amiFirmwareExtractor";
import { inspectFirmwareImageLayout } from "./firmwareImageContainer";
import { sha256Hex } from "./checksum";
import { assertAcceptedCompressedArtifactEdits } from "./firmwareAcceptance";
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
  const patches = buildFirmwarePatches(data, {
    setupSct: files.setupSctContainer.textContent,
    amitseSct: files.amitseSctContainer.textContent,
    setupdataBin: files.setupdataBinContainer.textContent,
  });
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
  const rebuilt = await rebuildUefiImage(graph, replacements, {
    lzma: createLzmaSectionCodec,
    standard: createStandardSectionCodec,
  });
  const reopened = await reextract(rebuilt.image, session.artifacts);
  for (const [kind, expected, actual] of [
    ["Setup HII", patches.setupSct, reopened.hii],
    ["AMITSE", patches.amitseSct, reopened.amitse],
    ["SetupData", patches.setupdataBin, reopened.setupData],
  ] as const) {
    if (expected && !equalBytes(expected, actual)) {
      throw new FirmwareError(
        "PATCH_FAILED",
        `${kind} did not match after re-opening the rebuilt firmware.`,
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
    changeLog: patches.changeLog,
    containerKind: before.kind,
  };
}

export { modifiedBinName as amiModifiedBinName };
