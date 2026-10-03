import type { CorpusFileReport } from "../components/scripts/corpusTypes";
import { matchFirmwareCases } from "./caseMatcher";
import { firmwareCases } from "./cases";
import { createFirmwareFingerprint } from "./fingerprint";
import type {
  FirmwareCase,
  FirmwareCaseMatchResult,
  FirmwareFingerprint,
  FirmwareStructure,
} from "./schema";

export type CorpusKnowledgeStatus = FirmwareCaseMatchResult["status"] | "not-assessed";
export const corpusKnowledgeStatuses: readonly CorpusKnowledgeStatus[] = [
  "known",
  "similar",
  "novel",
  "insufficient-evidence",
  "conflict",
  "not-assessed",
];
export const corpusKnowledgeLabels: Record<CorpusKnowledgeStatus, string> = {
  known: "Known case",
  similar: "Similar structure",
  novel: "New pattern",
  "insufficient-evidence": "Insufficient evidence",
  conflict: "Catalogue conflict",
  "not-assessed": "Not assessed",
};

export interface CorpusKnowledgeReport {
  fingerprint: FirmwareFingerprint;
  match: FirmwareCaseMatchResult;
  contexts: {
    contextId: string;
    fingerprint: FirmwareFingerprint;
    match: FirmwareCaseMatchResult;
  }[];
}

/** Read-only comparison of completed measurements, never a parser/write policy. */
export function analyzeCorpusKnowledge(
  file: CorpusFileReport,
  catalogue: readonly FirmwareCase[] = firmwareCases,
): CorpusKnowledgeReport {
  const measuredOuter = file.stages.some(
    (stage) => stage.id === "preflight" && stage.status !== "not-run",
  );
  const structure: FirmwareStructure = measuredOuter
    ? {
        family:
          file.family.confidence === "confirmed" && !file.family.conflict
            ? file.family.family
            : undefined,
        container: file.outer.container,
        intelDescriptor: file.outer.intelDescriptor,
        firmwareVolumeCount: file.outer.firmwareVolumeOffsets.length,
        ffs2VolumeCount: file.outer.ffs2VolumeOffsets.length,
        ffs3VolumeCount: file.outer.ffs3VolumeOffsets.length,
        outerSetupCount: file.outer.outerSetupOffsets.length,
        outerAmitseCount: file.outer.outerAmitseOffsets.length,
        guidedLzmaSectionCount: file.outer.guidedLzmaSectionOffsets.length,
        legacyModuleCount:
          file.awardLegacy?.modules.length ?? file.phoenixLegacy?.modules.length,
      }
    : {};
  const contexts = file.contexts.map((context) => {
    const fingerprint = createFirmwareFingerprint({
      // The complete image hash does not identify an individual extracted slot.
      structure: {
        ...structure,
        formSetCount: context.hii.formSetCount,
        formCount: context.hii.formCount,
        layout: context.layout,
        navigation: context.navigation.resolved
          ? context.navigation.mechanism
          : undefined,
      },
    });
    return {
      contextId: context.id,
      fingerprint,
      match: matchFirmwareCases(fingerprint, catalogue),
    };
  });
  const fingerprint = createFirmwareFingerprint({
    sha256: file.sha256,
    size: file.size > 0 ? file.size : undefined,
    // Only a single coherent parsed context can corroborate an image's HII
    // record. Never sum multiple firmware slots into an invented structure.
    structure: contexts.length === 1 ? contexts[0].fingerprint.structure : structure,
  });
  return { fingerprint, match: matchFirmwareCases(fingerprint, catalogue), contexts };
}

export function withCorpusKnowledge(file: CorpusFileReport): CorpusFileReport {
  return { ...file, knowledge: analyzeCorpusKnowledge(file) };
}
