import React from "react";
import { Button, Group, Loader, Modal, Stack, Text } from "@mantine/core";
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
import { useVerifiedFirmwareBuild } from "../Footer/useVerifiedFirmwareBuild";
import ChangeQueueDialog from "../ChangeQueue/ChangeQueueDialog";
import s from "../Footer/Footer.module.css";

interface BuildInput {
  fileName: string;
  sourceBytes: Uint8Array;
  inventory: PhoenixSetupInventory;
  appliedItems: PhoenixSetupItem[];
  appliedFingerprint: string | null;
}
function build(input: BuildInput) {
  return rebuildPhoenixFirmware(input.sourceBytes, input.inventory, input.appliedItems);
}

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
  onMove,
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
  onMove: (id: string, direction: -1 | 1) => void;
  onClear: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const [queueOpened, setQueueOpened] = React.useState(false);
  const [reportOpened, setReportOpened] = React.useState(false);
  const isApplied = analysis.canApply && appliedFingerprint === analysis.fingerprint;
  const input = React.useMemo(
    () => ({ fileName, sourceBytes, inventory, appliedItems, appliedFingerprint }),
    [fileName, sourceBytes, inventory, appliedItems, appliedFingerprint],
  );
  const preflight = useVerifiedFirmwareBuild(
    input,
    isApplied && appliedItems.length > 0,
    build,
  );
  const building = preflight.status === "building";
  return (
    <>
      <Modal
        opened={reportOpened && !!preflight.result}
        onClose={() => {
          setReportOpened(false);
        }}
        title="Verified Phoenix output"
      >
        {preflight.result && (
          <Stack gap="sm">
            <Text>
              {phoenixModifiedFileName(fileName)}: {preflight.result.image.length}{" "}
              bytes.
            </Text>
            <Text>
              LH5 payload: {preflight.result.compressedSize} /{" "}
              {preflight.result.allocationSize} bytes;{" "}
              {preflight.result.allocationSize - preflight.result.compressedSize} bytes
              remaining in its existing allocation.
            </Text>
            <Text>
              {preflight.result.verifiedItemCount} item(s) verified after reopening the
              complete image.
            </Text>
            <Text>
              Changes confined to [0x
              {preflight.result.changedOffset.toString(16).toUpperCase()}, 0x
              {(preflight.result.changedOffset + preflight.result.changedLength)
                .toString(16)
                .toUpperCase()}
              ). {preflight.result.image.length - preflight.result.changedLength} bytes
              outside this allocation preserved exactly.
            </Text>
          </Stack>
        )}
      </Modal>
      <Group className={s.root} justify="space-between" w="100%">
        <div>
          <Text size="xs" c="dimmed">
            Phoenix Setup editor · {String(entries.length)} queued ·{" "}
            {isApplied ? String(appliedItems.length) : "0"} applied
          </Text>
          <Text size="xs" role="status" aria-live="polite">
            {preflight.result
              ? "Verified firmware output is ready to download."
              : building
                ? "Checking allocation fit and reopening the rebuilt image…"
                : "Firmware output has not been checked for this applied queue."}
          </Text>
          {preflight.error && (
            <Text size="xs" c="red">
              {preflight.error}
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
            leftSection={building ? <Loader size={14} /> : <IconListCheck size={14} />}
            disabled={!isApplied || appliedItems.length === 0 || building}
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
                phoenixModifiedFileName(fileName),
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
        onMove={onMove}
        onClear={onClear}
        onApply={onApply}
      />
    </>
  );
}
