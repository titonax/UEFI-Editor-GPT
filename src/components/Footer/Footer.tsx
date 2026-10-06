import { Button, FileButton, Group, Loader, Text, TextInput } from "@mantine/core";
import { IconDownload, IconListCheck, IconUpload } from "@tabler/icons-react";
import { saveAs } from "file-saver";
import React from "react";
import type { Updater } from "use-immer";
import type { PopulatedFiles } from "../firmwareFiles";
import {
  calculateJsonChecksum,
  dataSchemaVersion,
  validateByteInput,
} from "../scripts/scripts";
import { parseDataFile } from "../scripts/dataValidation";
import { errorMessage } from "../scripts/errors";
import { hydrateIfrBinary } from "../scripts/menuEditing";
import { assertAmiRootVisibilityEditsMatch } from "../scripts/amiRootVisibilityEditing";
import { refreshSingleFormSetNavigation } from "../scripts/singleFormSetNavigation";
import type { Data } from "../scripts/types";
import s from "./Footer.module.css";
import DataChangeQueueDialog from "../ChangeQueue/DataChangeQueueDialog";
import type { DataChangeQueueController } from "../ChangeQueue/useDataChangeQueue";
import FirmwareOutputReport from "./FirmwareOutputReport";
import { useFirmwareImagePreflight } from "./useFirmwareImagePreflight";
import { hasAcceptedRootVisibilitySource } from "../scripts/firmwareAcceptance";
import { assessFirmwareReconstruction } from "../scripts/firmwareProvenance";

interface FooterProps {
  files: PopulatedFiles;
  data: Data;
  appliedData: Data;
  changeQueue: DataChangeQueueController;
  setData: Updater<Data>;
  currentFormIndex: number;
  onError: (message: string) => void;
}

export default function Footer({
  files,
  currentFormIndex,
  data,
  appliedData,
  changeQueue,
  setData,
  onError,
}: FooterProps) {
  const resetRef = React.useRef<() => void>(null);
  const [input, setInput] = React.useState("05");
  const [queueOpened, setQueueOpened] = React.useState(false);
  const [reportOpened, setReportOpened] = React.useState(false);
  const queueApplied =
    changeQueue.analysis.canApply &&
    changeQueue.appliedFingerprint === changeQueue.analysis.fingerprint;
  const reconstruction = files.firmwareSource
    ? assessFirmwareReconstruction(
        files.firmwareSource.artifacts.provenance,
        files.firmwareSource.sourceSha256,
      )
    : null;

  const rootEditsBlocked =
    (appliedData.rootVisibilityEdits?.length ?? 0) > 0 &&
    !hasAcceptedRootVisibilitySource(
      files.firmwareSource?.sourceSha256,
      files.firmwareSource?.artifacts.provenance.sourceSize ?? 0,
    );

  const preflight = useFirmwareImagePreflight(
    appliedData,
    files,
    queueApplied &&
      !!files.firmwareSource &&
      !!reconstruction?.writeEnabled &&
      !rootEditsBlocked,
  );
  const building = preflight.status === "building";

  return (
    <div className={s.root}>
      {preflight.result && (
        <FirmwareOutputReport
          result={preflight.result}
          opened={reportOpened}
          onClose={() => {
            setReportOpened(false);
          }}
        />
      )}
      <Group justify="space-between" gap={"xs"} className={s.maxWidth}>
        <Group gap={"xs"}>
          <FileButton
            resetRef={resetRef}
            accept=".json"
            onChange={(file) => {
              if (file) {
                void (async () => {
                  const fileData = await file.text();
                  let jsonData = parseDataFile(fileData);

                  if (
                    jsonData.version === dataSchemaVersion &&
                    jsonData.hashes.setupTxt === data.hashes.setupTxt &&
                    jsonData.hashes.setupSct === data.hashes.setupSct &&
                    jsonData.hashes.amitseSct === data.hashes.amitseSct &&
                    jsonData.hashes.setupdataBin === data.hashes.setupdataBin &&
                    (await calculateJsonChecksum(
                      jsonData.menu,
                      jsonData.forms,
                      jsonData.suppressions,
                    )) === jsonData.hashes.offsetChecksum
                  ) {
                    // Binary provenance is rebuilt from the opened source. Stored
                    // edit plans are replayed only when every byte precondition holds.
                    jsonData = hydrateIfrBinary(
                      jsonData,
                      files.setupSctContainer.textContent,
                    );
                    // Root-vector evidence is derived from the currently opened
                    // firmware provenance and is never trusted from imported JSON.
                    jsonData.rootVisibility = data.rootVisibility;
                    assertAmiRootVisibilityEditsMatch(
                      jsonData.rootVisibilityEdits,
                      jsonData.rootVisibility,
                    );
                    refreshSingleFormSetNavigation(
                      jsonData,
                      data.singleFormSetNavigation,
                    );
                    setData(jsonData);
                    onError("");
                  } else {
                    onError(
                      "Wrong data.json version, source hashes, or offset checksum.",
                    );
                  }

                  resetRef.current?.();
                })().catch((reason: unknown) => {
                  onError(errorMessage(reason));
                  resetRef.current?.();
                });
              }
            }}
          >
            {(props) => (
              <Button
                {...props}
                size="xs"
                leftSection={<IconUpload />}
                variant="default"
              >
                data.json
              </Button>
            )}
          </FileButton>

          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload />}
            onClick={() => {
              saveAs(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "text/plain",
                }),
                "data.json",
              );
            }}
          >
            data.json
          </Button>

          <Button
            size="xs"
            variant="default"
            leftSection={<IconListCheck />}
            onClick={() => {
              setQueueOpened(true);
            }}
          >
            Change queue ({String(changeQueue.entries.length)})
          </Button>

          <Button
            size="xs"
            variant="default"
            leftSection={building ? <Loader size={16} /> : <IconListCheck />}
            disabled={
              !queueApplied ||
              !files.firmwareSource ||
              !reconstruction?.writeEnabled ||
              rootEditsBlocked ||
              building
            }
            title={
              !queueApplied
                ? "Apply the selected change queue before exporting."
                : !files.firmwareSource
                  ? "Load a complete firmware image before exporting."
                  : rootEditsBlocked
                    ? "Root visibility output has no real-image acceptance for this source."
                    : !reconstruction?.writeEnabled
                      ? reconstruction?.blockers.join(" ")
                      : undefined
            }
            onClick={() => {
              void preflight.check();
            }}
          >
            {building ? "Building and verifying…" : "Check firmware output"}
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload />}
            disabled={!preflight.result}
            title="Check the applied queue before downloading its verified image."
            onClick={() => {
              const result = preflight.result;
              if (!result) return;
              saveAs(
                new Blob([result.image], { type: "application/octet-stream" }),
                result.fileName,
              );
              saveAs(
                new Blob([result.changeLog], { type: "text/plain" }),
                "changelog.txt",
              );
              onError("");
            }}
          >
            Modified firmware image
          </Button>
          <Button
            size="xs"
            variant="default"
            disabled={!preflight.result}
            onClick={() => {
              setReportOpened(true);
            }}
          >
            Output details
          </Button>
          <Text size="xs" role="status" aria-live="polite">
            {preflight.result
              ? `Verified ${String(preflight.result.image.length)}-byte image; ${String(preflight.result.changedByteCount)} changed bytes. Ready to download.`
              : preflight.error
                ? `Output check failed: ${preflight.error}`
                : building
                  ? "Checking allocation fit and reopening the rebuilt image…"
                  : "Firmware output has not been checked for this applied queue."}
          </Text>
        </Group>

        {currentFormIndex >= 0 && (
          <Group gap={"xs"}>
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                setData((draft) => {
                  for (const child of data.forms[currentFormIndex].children) {
                    if (child.suppressIf) {
                      for (const suppressionOffset of child.suppressIf) {
                        const suppression = draft.suppressions.find(
                          (candidate) => candidate.offset === suppressionOffset,
                        );
                        if (suppression) suppression.active = false;
                      }
                    }
                  }
                });
              }}
            >
              Unsuppress all Items in this Form
            </Button>

            <Button
              size="xs"
              variant="default"
              onClick={() => {
                setData((draft) => {
                  for (const child of draft.forms[currentFormIndex].children) {
                    if (child.accessLevel !== null) {
                      child.accessLevel = input;
                    }
                  }
                });
              }}
            >
              Change all Access Levels in this Form to
            </Button>

            <TextInput
              className={s.textInput}
              size="xs"
              value={input}
              onChange={(ev) => {
                const value = ev.target.value.toUpperCase();

                if (validateByteInput(value)) {
                  setInput(value);
                }
              }}
            />
          </Group>
        )}
      </Group>
      <DataChangeQueueDialog
        opened={queueOpened}
        queue={changeQueue}
        onClose={() => {
          setQueueOpened(false);
        }}
      />
    </div>
  );
}
