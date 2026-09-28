import React from "react";
import { Button, Group, Loader, Text } from "@mantine/core";
import { IconArrowBackUp, IconDownload, IconListCheck } from "@tabler/icons-react";
import { saveAs } from "file-saver";
import type { ChangeQueueAnalysis, ChangeQueueEntry } from "../scripts/changeQueue";
import type { PhoenixVisibilityPayload } from "../scripts/phoenixChangeQueue";
import type { PhoenixSetupItem } from "../scripts/phoenixSetupTable";
import type { PhoenixSetupInventory } from "../scripts/phoenixSetupMenu";
import {
  phoenixModifiedFileName,
  rebuildPhoenixFirmware,
} from "../scripts/phoenixFirmwareRebuilder";
import { errorMessage } from "../scripts/errors";
import ChangeQueueDialog from "../ChangeQueue/ChangeQueueDialog";
import s from "../Footer/Footer.module.css";

export default function PhoenixFooter({
  fileName,
  sourceBytes,
  inventory,
  entries,
  analysis,
  appliedFingerprint,
  appliedItems,
  onToggleEnabled,
  onRemove,
  onClear,
  onApply,
  onClose,
}: {
  fileName: string;
  sourceBytes: Uint8Array;
  inventory: PhoenixSetupInventory;
  entries: ChangeQueueEntry<PhoenixVisibilityPayload>[];
  analysis: ChangeQueueAnalysis<PhoenixVisibilityPayload>;
  appliedFingerprint: string | null;
  appliedItems: PhoenixSetupItem[];
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const [error, setError] = React.useState("");
  const [building, setBuilding] = React.useState(false);
  const [queueOpened, setQueueOpened] = React.useState(false);
  const isApplied = analysis.canApply && appliedFingerprint === analysis.fingerprint;
  return (
    <>
      <Group className={s.root} justify="space-between" w="100%">
        <div>
          <Text size="xs" c="dimmed">
            Phoenix Setup editor · {String(entries.length)} queued ·{" "}
            {isApplied ? String(appliedItems.length) : "0"} applied
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
            Change queue ({String(entries.length)})
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={building ? <Loader size={14} /> : <IconDownload size={14} />}
            disabled={!isApplied || appliedItems.length === 0 || building}
            onClick={() => {
              setBuilding(true);
              try {
                void rebuildPhoenixFirmware(sourceBytes, inventory, appliedItems)
                  .then((result) => {
                    saveAs(
                      new Blob([result.image], { type: "application/octet-stream" }),
                      phoenixModifiedFileName(fileName),
                    );
                    setError("");
                  })
                  .catch((reason: unknown) => {
                    setError(errorMessage(reason));
                  })
                  .finally(() => {
                    setBuilding(false);
                  });
              } catch (reason: unknown) {
                setError(errorMessage(reason));
                setBuilding(false);
              }
            }}
          >
            {building ? "Building and verifying…" : "Modified firmware image"}
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
      <ChangeQueueDialog
        opened={queueOpened}
        entries={entries}
        analysis={analysis}
        appliedFingerprint={appliedFingerprint}
        onClose={() => {
          setQueueOpened(false);
        }}
        onToggleEnabled={onToggleEnabled}
        onRemove={onRemove}
        onClear={onClear}
        onApply={onApply}
      />
    </>
  );
}
