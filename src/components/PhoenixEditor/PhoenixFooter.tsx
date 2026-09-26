import React from "react";
import { Button, Group, Text } from "@mantine/core";
import { IconArrowBackUp, IconDownload, IconRestore } from "@tabler/icons-react";
import type { PhoenixSetupItem } from "../scripts/phoenixSetupTable";
import { savePhoenixSetupChanges } from "../scripts/phoenixSetupTable";
import { errorMessage } from "../scripts/errors";
import s from "../Footer/Footer.module.css";

export default function PhoenixFooter({
  templat,
  forcedVisibleItems,
  onReset,
  onClose,
}: {
  templat: Uint8Array;
  forcedVisibleItems: PhoenixSetupItem[];
  onReset: () => void;
  onClose: () => void;
}) {
  const [error, setError] = React.useState("");
  return (
    <Group className={s.root} justify="space-between" w="100%">
      <div>
        <Text size="xs" c="dimmed">
          Phoenix Setup editor · {String(forcedVisibleItems.length)} staged edit(s)
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
          leftSection={<IconRestore size={14} />}
          disabled={forcedVisibleItems.length === 0}
          onClick={onReset}
        >
          Reset changes
        </Button>
        <Button
          size="xs"
          variant="default"
          leftSection={<IconDownload size={14} />}
          disabled={forcedVisibleItems.length === 0}
          onClick={() => {
            try {
              savePhoenixSetupChanges(templat, forcedVisibleItems);
              setError("");
            } catch (reason) {
              setError(errorMessage(reason));
            }
          }}
        >
          Modified TEMPLAT00.ROM
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
