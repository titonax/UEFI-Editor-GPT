import React from "react";
import type { Updater } from "use-immer";
import { FileInput, Stack, LoadingOverlay } from "@mantine/core";
import { IconUpload } from "@tabler/icons-react";
import { parseData } from "../scripts/scripts";
import { errorMessage, FirmwareError } from "../scripts/errors";
import type { Data } from "../scripts/types";
import {
  fileContainers,
  isPopulatedFiles,
  type FileContainer,
  type Files,
} from "./fileModel";
const hexWorker = () => new Worker(new URL("../scripts/hexWorker.ts", import.meta.url));
const MAX_INPUT_BYTES = 512 * 1024 * 1024;

export interface FileUploadsProps {
  files: Files;
  setFiles: Updater<Files>;
  setData: Updater<Data>;
  onError: (message: string) => void;
}

function fileToHex(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = hexWorker();
    worker.onmessage = (event: MessageEvent<string>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(
        new FirmwareError(
          "INVALID_INPUT",
          `Could not read ${file.name}: ${event.message}`,
        ),
      );
    };
    worker.postMessage(file);
  });
}

export default function FileUploads({
  files,
  setFiles,
  setData,
  onError,
}: FileUploadsProps) {
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (isPopulatedFiles(files)) {
      let cancelled = false;
      setIsLoading(true);
      onError("");

      const selectedFiles = [
        files.setupSctContainer.file,
        files.setupTxtContainer.file,
        files.amitseSctContainer.file,
        files.setupdataBinContainer.file,
      ];
      if (selectedFiles.some((file) => file.size > MAX_INPUT_BYTES)) {
        onError("One of the selected files exceeds the 512 MiB safety limit.");
        setIsLoading(false);
        return;
      }

      if (
        fileContainers(files).every(
          (fileContainer: FileContainer) => !fileContainer.textContent,
        )
      ) {
        void Promise.all([
          files.setupTxtContainer.file.text(),
          ...[
            files.setupSctContainer.file,
            files.amitseSctContainer.file,
            files.setupdataBinContainer.file,
          ].map(fileToHex),
        ])
          .then((values) => {
            if (cancelled) return;
            setFiles((draft) => {
              draft.setupTxtContainer.textContent = values[0];
              draft.setupSctContainer.textContent = values[1];
              draft.amitseSctContainer.textContent = values[2];
              draft.setupdataBinContainer.textContent = values[3];
            });
          })
          .catch((reason: unknown) => {
            if (!cancelled) onError(errorMessage(reason));
          })
          .finally(() => {
            if (!cancelled) setIsLoading(false);
          });
      } else {
        void parseData(files)
          .then((data) => {
            if (cancelled) return;
            setData(data);
          })
          .catch((reason: unknown) => {
            if (!cancelled) onError(errorMessage(reason));
          })
          .finally(() => {
            if (!cancelled) setIsLoading(false);
          });
      }

      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [files, onError, setFiles, setData]);

  return (
    <>
      <LoadingOverlay visible={isLoading} loaderProps={{ size: "xl" }} />
      <Stack>
        <FileInput
          leftSection={<IconUpload />}
          size="lg"
          placeholder="Setup HII / SCT"
          accept=".sct,.bin"
          value={files.setupSctContainer.file}
          error={files.setupSctContainer.isWrongFile}
          onChange={(file) => {
            if (file) {
              const name = file.name.toLowerCase();

              setFiles((draft) => {
                draft.setupSctContainer = {
                  file,
                  isWrongFile: !(
                    (name.includes("setup") && name.endsWith(".sct")) ||
                    name.endsWith(".bin")
                  ),
                };
              });
            }
          }}
        />

        <FileInput
          leftSection={<IconUpload />}
          size="lg"
          placeholder="IFR Extractor output TXT(s)"
          accept=".txt"
          multiple
          value={files.setupTxtContainer.file ? [files.setupTxtContainer.file] : []}
          error={files.setupTxtContainer.isWrongFile}
          onChange={(selectedFiles) => {
            if (selectedFiles.length !== 0) {
              const sortedFiles = [...selectedFiles].sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true }),
              );
              const isWrongFile = sortedFiles.some((file) => {
                const name = file.name.toLowerCase();
                return !(name.includes("ifr") && name.endsWith(".txt"));
              });
              const combinedFile = new File(
                sortedFiles.flatMap((file) => [file, "\n"]),
                `combined-${String(sortedFiles.length)}-ifr-outputs.txt`,
                { type: "text/plain" },
              );

              setFiles((draft) => {
                draft.setupTxtContainer = {
                  file: combinedFile,
                  isWrongFile,
                };
              });
            }
          }}
        />

        <FileInput
          leftSection={<IconUpload />}
          size="lg"
          placeholder="AMITSE PE32 / SCT"
          accept=".sct,.bin"
          value={files.amitseSctContainer.file}
          error={files.amitseSctContainer.isWrongFile}
          onChange={(file) => {
            if (file) {
              const name = file.name.toLowerCase();

              setFiles((draft) => {
                draft.amitseSctContainer = {
                  file,
                  isWrongFile: !(
                    (name.includes("amitse") && name.endsWith(".sct")) ||
                    name.endsWith(".bin")
                  ),
                };
              });
            }
          }}
        />

        <FileInput
          leftSection={<IconUpload />}
          size="lg"
          placeholder="Setupdata BIN"
          accept=".bin"
          value={files.setupdataBinContainer.file}
          error={files.setupdataBinContainer.isWrongFile}
          onChange={(file) => {
            if (file) {
              const name = file.name.toLowerCase();

              setFiles((draft) => {
                draft.setupdataBinContainer = {
                  file,
                  isWrongFile: !(name.includes("setupdata") && name.endsWith(".bin")),
                };
              });
            }
          }}
        />
      </Stack>
    </>
  );
}
