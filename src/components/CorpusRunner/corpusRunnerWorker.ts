/// <reference lib="webworker" />

import { analyzeCorpusFirmware } from "../scripts/corpusAnalysis";
import { createCorpusInputFailure } from "../scripts/corpusReport";
import { MAX_CORPUS_FILE_BYTES } from "../scripts/corpusTypes";
import type { CorpusRunnerRequest, CorpusRunnerResponse } from "./protocol";

const scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;
let activeRunId: number | null = null;
let cancelledRunId: number | null = null;

function send(message: CorpusRunnerResponse) {
  scope.postMessage(message);
}

async function run(message: Extract<CorpusRunnerRequest, { type: "start" }>) {
  if (activeRunId !== null) {
    send({
      type: "fatal",
      runId: message.runId,
      message: "A corpus analysis is already running in this worker.",
    });
    return;
  }
  activeRunId = message.runId;
  cancelledRunId = null;
  try {
    for (const [fileIndex, selected] of message.files.entries()) {
      const { file, declaredBrand } = selected;
      if (cancelledRunId === message.runId) break;
      send({
        type: "progress",
        runId: message.runId,
        fileIndex,
        fileCount: message.files.length,
        fileName: file.name,
        progress: {
          stage: "reading",
          detail: `Reading ${file.name} locally…`,
        },
      });
      let result;
      if (file.size > MAX_CORPUS_FILE_BYTES) {
        result = createCorpusInputFailure(
          file,
          "The firmware exceeds the 512 MiB per-file safety limit.",
          declaredBrand,
        );
      } else {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          result = await analyzeCorpusFirmware(
            {
              fileName: file.name,
              declaredBrand,
              size: file.size,
              lastModified: file.lastModified,
              bytes,
            },
            (progress) => {
              send({
                type: "progress",
                runId: message.runId,
                fileIndex,
                fileCount: message.files.length,
                fileName: file.name,
                progress,
              });
            },
          );
        } catch (reason) {
          result = createCorpusInputFailure(
            file,
            reason instanceof Error ? reason.message : String(reason),
            declaredBrand,
          );
        }
      }
      send({
        type: "result",
        runId: message.runId,
        fileIndex,
        fileCount: message.files.length,
        result,
      });
    }
    send({
      type: cancelledRunId === message.runId ? "cancelled" : "complete",
      runId: message.runId,
    });
  } catch (reason) {
    send({
      type: "fatal",
      runId: message.runId,
      message: reason instanceof Error ? reason.message : String(reason),
    });
  } finally {
    activeRunId = null;
    cancelledRunId = null;
  }
}

scope.onmessage = (event: MessageEvent<CorpusRunnerRequest>) => {
  if (event.data.type === "cancel") {
    if (activeRunId === event.data.runId) cancelledRunId = event.data.runId;
    return;
  }
  void run(event.data);
};

export {};
