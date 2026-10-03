import type { CorpusFileReport } from "../components/scripts/corpusTypes";
import type { FirmwareStructure } from "./schema";

export const caseDraftVersion = "1.0.0";

/** A local review proposal, never an installed catalogue record. */
export interface FirmwareCaseDraft {
  schemaVersion: typeof caseDraftVersion;
  status: "draft";
  case: {
    id: string;
    label: string;
    sha256: string;
    size: number;
    fileNames: string[];
    structure: FirmwareStructure;
    source: string;
    regressionTests: string[];
    limitations: string[];
  };
  observations: {
    comparison: string;
    contexts: { id: string; structure: FirmwareStructure }[];
  };
}

export function caseDraftBlocker(file: CorpusFileReport): string | null {
  const fingerprint = file.knowledge?.fingerprint;
  if (!fingerprint?.sha256 || !fingerprint.size) {
    return "A complete SHA-256 and input size are needed before preparing a case.";
  }
  if (["known", "conflict"].includes(file.knowledge?.match.status ?? "")) {
    return "This exact image is already documented. Review its existing record or conflict.";
  }
  return null;
}

export function createCaseDraft(file: CorpusFileReport): FirmwareCaseDraft {
  const blocker = caseDraftBlocker(file);
  if (blocker) throw new Error(blocker);
  const knowledge = file.knowledge;
  if (!knowledge?.fingerprint.sha256 || !knowledge.fingerprint.size) {
    throw new Error("Incomplete case fingerprint");
  }
  return {
    schemaVersion: caseDraftVersion,
    status: "draft",
    case: {
      id: "",
      label: "",
      sha256: knowledge.fingerprint.sha256,
      size: knowledge.fingerprint.size,
      fileNames: [file.fileName],
      structure: { ...knowledge.fingerprint.structure },
      source: "",
      regressionTests: [],
      limitations: [],
    },
    observations: {
      comparison: knowledge.match.status,
      contexts: knowledge.contexts.map((context) => ({
        id: context.contextId,
        structure: { ...context.fingerprint.structure },
      })),
    },
  };
}
