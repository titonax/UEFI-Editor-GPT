import { Button, Group, Text } from "@mantine/core";
import { IconArrowBackUp, IconDownload, IconListCheck } from "@tabler/icons-react";
import type { Data } from "../scripts/types";
import type { UefiHiiWorkspace } from "../scripts/uefiHiiWorkspace";
import { downloadModifiedUefiHiiModules } from "../scripts/uefiHiiPatcher";
import { errorMessage } from "../scripts/errors";
import React from "react";
import s from "../Footer/Footer.module.css";
import DataChangeQueueDialog from "../ChangeQueue/DataChangeQueueDialog";
import type { DataChangeQueueController } from "../ChangeQueue/useDataChangeQueue";

export default function UefiHiiFooter({
  moduleCount,
  warningCount,
  data,
  appliedData,
  changeQueue,
  workspace,
  onClose,
}: {
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
  const editCount =
    (data.ifrEdits?.length ?? 0) +
    data.suppressions.filter(
      (condition) =>
        !condition.active && (condition.kind ?? "SuppressIf") === "SuppressIf",
    ).length;
  const queueApplied =
    changeQueue.analysis.canApply &&
    changeQueue.appliedFingerprint === changeQueue.analysis.fingerprint;
  return (
    <>
      <Group className={s.root} justify="space-between" w="100%">
        <div>
          <Text size="xs" c={warningCount > 0 ? "yellow" : "dimmed"}>
            Vendor-neutral UEFI HII · {String(moduleCount)} joined module(s) ·{" "}
            {String(changeQueue.entries.length)} queued ·{" "}
            {queueApplied ? String(editCount) : "0"} applied
            {warningCount > 0 ? ` · ${String(warningCount)} warning(s)` : ""}
          </Text>
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
            disabled={!queueApplied || editCount === 0}
            title={
              queueApplied
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
