import type { CorpusFileReport, CorpusProgress } from "../scripts/corpusTypes";
import type { FirmwareBrand } from "../scripts/brandKnowledge";

export interface CorpusRunnerStartMessage {
  type: "start";
  runId: number;
  files: { file: File; declaredBrand?: FirmwareBrand }[];
}

export interface CorpusRunnerCancelMessage {
  type: "cancel";
  runId: number;
}

export type CorpusRunnerRequest = CorpusRunnerStartMessage | CorpusRunnerCancelMessage;

export type CorpusRunnerResponse =
  | {
      type: "progress";
      runId: number;
      fileIndex: number;
      fileCount: number;
      fileName: string;
      progress: CorpusProgress;
    }
  | {
      type: "result";
      runId: number;
      fileIndex: number;
      fileCount: number;
      result: CorpusFileReport;
    }
  | {
      type: "complete" | "cancelled";
      runId: number;
    }
  | {
      type: "fatal";
      runId: number;
      message: string;
    };
