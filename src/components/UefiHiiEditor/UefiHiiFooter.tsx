import { Button, Group, Loader, Text } from "@mantine/core";
import { IconArrowBackUp, IconDownload, IconListCheck } from "@tabler/icons-react";
import type { Data } from "../scripts/types";
import type { UefiHiiWorkspace } from "../scripts/uefiHiiWorkspace";
import { downloadModifiedUefiHiiModules } from "../scripts/uefiHiiPatcher";
import { errorMessage } from "../scripts/errors";
import React from "react";
import s from "../Footer/Footer.module.css";
import DataChangeQueueDialog from "../ChangeQueue/DataChangeQueueDialog";
import type { DataChangeQueueController } from "../ChangeQueue/useDataChangeQueue";
import { saveAs } from "file-saver";
import { buildUefiHiiFirmwareImage } from "../scripts/uefiHiiFirmwareRebuilder";
import { useVerifiedFirmwareBuild } from "../Footer/useVerifiedFirmwareBuild";
import FirmwareOutputReport from "../Footer/FirmwareOutputReport";

interface BuildInput {
  fileName: string;
  sourceImage: Uint8Array;
  data: Data;
  workspace: UefiHiiWorkspace;
  appliedFingerprint: string | null;
}

async function build(input: BuildInput) {
  const result = await buildUefiHiiFirmwareImage(
    input.data,
    input.workspace,
    input.sourceImage,
  );
  const dot = input.fileName.lastIndexOf(".");
  const base = dot > 0 ? input.fileName.slice(0, dot) : input.fileName;
  return { ...result, fileName: `${base}-modified.bin` };
}

export default function UefiHiiFooter({
  fileName,
  sourceImage,
  moduleCount,
  warningCount,
  data,
  appliedData,
  changeQueue,
  workspace,
  onClose,
}: {
  fileName: string;
  sourceImage: Uint8Array;
  moduleCount: number;
  warningCount: number;
  data: Data;
  appliedData: Data;
  changeQueue: DataChangeQueueController;
  workspace: UefiHiiWorkspace;
  onClose: () => void;
}) {
  const [error, setError] = React.useState("");
  const [queueOpened, setQueueOpened] = React.useState(false);
  const [reportOpened, setReportOpened] = React.useState(false);
  const editCount =
    (data.ifrEdits?.length ?? 0) +
    data.suppressions.filter(
      (condition) =>
        !condition.active && (condition.kind ?? "SuppressIf") === "SuppressIf",
    ).length;
  const queueApplied =
    changeQueue.analysis.canApply &&
    changeQueue.appliedFingerprint === changeQueue.analysis.fingerprint;
  const mixedWorkspace = workspace.modules.some(
    (module) => module.nestedPayloadRanges?.length,
  );
  const input = React.useMemo(
    () => ({
      fileName,
      sourceImage,
      data: appliedData,
      workspace,
      appliedFingerprint: changeQueue.appliedFingerprint,
    }),
    [fileName, sourceImage, appliedData, workspace, changeQueue.appliedFingerprint],
  );
  const preflight = useVerifiedFirmwareBuild(
    input,
    queueApplied && editCount > 0,
    build,
  );
  const building = preflight.status === "building";
  return (
    <>
      {preflight.result && (
        <FirmwareOutputReport
          result={preflight.result}
          opened={reportOpened}
          onClose={() => {
            setReportOpened(false);
          }}
        />
      )}
      <Group className={s.root} justify="space-between" w="100%">
        <div>
          <Text size="xs" c={warningCount > 0 ? "yellow" : "dimmed"}>
            Vendor-neutral UEFI HII · {String(moduleCount)} joined module(s) ·{" "}
            {String(changeQueue.entries.length)} queued ·{" "}
            {queueApplied ? String(editCount) : "0"} applied
            {warningCount > 0 ? ` · ${String(warningCount)} warning(s)` : ""}
          </Text>
          <Text size="xs" role="status" aria-live="polite">
            {preflight.result
              ? "Verified firmware output is ready to download."
              : building
                ? "Checking allocation fit and reopening every physical HII copy…"
                : "Firmware output has not been checked for this applied queue."}
          </Text>
          {preflight.error && (
            <Text size="xs" c="red">
              Output check failed: {preflight.error}
            </Text>
          )}
          {error && (
            <Text size="xs" c="red">
              {error}
            </Text>
          )}
        </div>
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={building ? <Loader size={14} /> : <IconListCheck size={14} />}
            disabled={!queueApplied || editCount === 0 || building}
            onClick={() => {
              void preflight.check();
            }}
          >
            {building ? "Building and verifying…" : "Check firmware output"}
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload size={14} />}
            disabled={!preflight.result}
            onClick={() => {
              if (!preflight.result) return;
              saveAs(
                new Blob([preflight.result.image], {
                  type: "application/octet-stream",
                }),
                preflight.result.fileName,
              );
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
          <Button
            size="xs"
            variant="default"
            leftSection={<IconListCheck size={14} />}
            onClick={() => {
              setQueueOpened(true);
            }}
          >
            Change queue ({String(changeQueue.entries.length)})
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload size={14} />}
            disabled={!queueApplied || editCount === 0 || mixedWorkspace}
            title={
              mixedWorkspace
                ? "Mixed HII changes require the verified complete-image download."
                : queueApplied
                  ? undefined
                  : "Apply the selected change queue before exporting."
            }
            onClick={() => {
              try {
                downloadModifiedUefiHiiModules(
                  appliedData,
                  workspace.sourceBytes,
                  workspace.modules,
                );
                setError("");
              } catch (reason) {
                setError(errorMessage(reason));
              }
            }}
          >
            Modified HII modules
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconArrowBackUp size={14} />}
            onClick={onClose}
          >
            Load another firmware
          </Button>
        </Group>
      </Group>
      <DataChangeQueueDialog
        opened={queueOpened}
        queue={changeQueue}
        onClose={() => {
          setQueueOpened(false);
        }}
      />
    </>
  );
}
