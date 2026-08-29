import { Alert, Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import React from "react";
import type { Updater } from "use-immer";
import { errorMessage } from "../scripts/errors";
import { moveMenuReference } from "../scripts/menuEditing";
import type { Data } from "../scripts/types";
import type { MenuTreeNode } from "./menuTree";

interface MenuMoveDialogProps {
  data: Data;
  node: MenuTreeNode | null;
  opened: boolean;
  originalSetupSct: string;
  setData: Updater<Data>;
  onClose: () => void;
}

export default function MenuMoveDialog({
  data,
  node,
  opened,
  originalSetupSct,
  setData,
  onClose,
}: MenuMoveDialogProps) {
  const [destination, setDestination] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!opened) {
      setDestination(null);
      setError("");
      setBusy(false);
    }
  }, [opened]);

  const sourceForm =
    node?.parentFormIndex === undefined ? undefined : data.forms[node.parentFormIndex];
  const destinations = data.forms
    .map((form, index) => ({
      value: String(index),
      label: `${form.name || "Unnamed Form"} · ${form.formId}${
        form.formSetTitle ? ` · ${form.formSetTitle}` : ""
      }`,
      disabled: index === node?.parentFormIndex,
    }))
    .filter((option) => !option.disabled);

  async function applyMove() {
    if (
      node?.parentFormIndex === undefined ||
      node.referenceChildIndex === undefined ||
      destination === null
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await moveMenuReference(data, originalSetupSct, {
        sourceFormIndex: node.parentFormIndex,
        referenceChildIndex: node.referenceChildIndex,
        destinationFormIndex: Number.parseInt(destination, 10),
      });
      setData(next);
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Move HII menu" centered>
      <Stack gap="md">
        <div>
          <Text size="sm" fw={600}>
            {node?.label ?? "Selected menu"}
          </Text>
          <Text size="xs" c="dimmed">
            Current parent: {sourceForm?.name ?? "Unknown Form"}
          </Text>
        </div>

        <Select
          label="Destination Form"
          placeholder="Choose the new parent menu"
          searchable
          data={destinations}
          value={destination}
          onChange={setDestination}
          nothingFoundMessage="No destination Forms"
        />

        <Text size="xs" c="dimmed">
          This moves the complete, direct IFR Ref opcode without resizing the HII
          package. The editor rejects cross-package moves, conditional/nested Refs,
          duplicate targets and graph cycles.
        </Text>

        {error.length > 0 && (
          <Alert color="red" title="The menu could not be moved">
            {error}
          </Alert>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void applyMove()}
            disabled={destination === null}
            loading={busy}
          >
            Move menu
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
