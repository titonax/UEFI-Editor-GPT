import { Button, Group, Text } from "@mantine/core";
import { IconArrowBackUp, IconDownload } from "@tabler/icons-react";
import type { Data } from "../scripts/types";
import type { UefiHiiWorkspace } from "../scripts/uefiHiiWorkspace";
import { downloadModifiedUefiHiiModules } from "../scripts/uefiHiiPatcher";
import { errorMessage } from "../scripts/errors";
import React from "react";
import s from "../Footer/Footer.module.css";

export default function UefiHiiFooter({
  moduleCount,
  warningCount,
  data,
  workspace,
  onClose,
}: {
  moduleCount: number;
  warningCount: number;
  data: Data;
  workspace: UefiHiiWorkspace;
  onClose: () => void;
}) {
  const [error, setError] = React.useState("");
  const editCount =
    (data.ifrEdits?.length ?? 0) +
    data.suppressions.filter(
      (condition) =>
        !condition.active && (condition.kind ?? "SuppressIf") === "SuppressIf",
    ).length;
  return (
    <Group className={s.root} justify="space-between" w="100%">
      <div>
        <Text size="xs" c={warningCount > 0 ? "yellow" : "dimmed"}>
          Vendor-neutral UEFI HII · {String(moduleCount)} joined module(s) ·{" "}
          {String(editCount)} staged edit(s)
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
          leftSection={<IconDownload size={14} />}
          disabled={editCount === 0}
          onClick={() => {
            try {
              downloadModifiedUefiHiiModules(
                data,
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
  );
}
