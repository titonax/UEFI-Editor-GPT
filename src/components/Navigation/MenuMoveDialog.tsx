import { Alert, Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import React from "react";
import type { Updater } from "use-immer";
import { errorMessage } from "../scripts/errors";
import { analyzeMenuMoveDestinations, moveMenuReference } from "../scripts/menuEditing";
import type { Data } from "../scripts/types";
import type { MenuTree, MenuTreeNode } from "./menuTree";

interface MenuMoveDialogProps {
  data: Data;
  tree: MenuTree;
  node: MenuTreeNode | null;
  opened: boolean;
  originalSetupSct: string;
  setData: Updater<Data>;
  onClose: () => void;
}

export default function MenuMoveDialog({
  data,
  tree,
  node,
  opened,
  originalSetupSct,
  setData,
  onClose,
}: MenuMoveDialogProps) {
  const [destination, setDestination] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const sourceForm =
    node?.parentFormIndex === undefined ? undefined : data.forms[node.parentFormIndex];
  const compatibility = React.useMemo(
    () =>
      node?.parentFormIndex === undefined || node.referenceChildIndex === undefined
        ? []
        : analyzeMenuMoveDestinations(
            data,
            originalSetupSct,
            node.parentFormIndex,
            node.referenceChildIndex,
          ),
    [data, node, originalSetupSct],
  );
  const compatibilityByIndex = new Map(
    compatibility.map((result) => [result.formIndex, result]),
  );
  const destinationStates = React.useMemo(() => {
    const nodesByForm = new Map<number, MenuTreeNode[]>();
    const visit = (nodes: MenuTreeNode[]) => {
      for (const candidate of nodes) {
        if (candidate.formIndex !== null) {
          const entries = nodesByForm.get(candidate.formIndex) ?? [];
          entries.push(candidate);
          nodesByForm.set(candidate.formIndex, entries);
        }
        visit(candidate.children);
      }
    };
    visit([...tree.roots, ...tree.orphans]);
    return new Map(
      [...nodesByForm].map(([formIndex, nodes]) => {
        const state = nodes.every((candidate) => candidate.reachability === "detached")
          ? "detached"
          : nodes.some((candidate) => candidate.status === "visible")
            ? "visible"
            : nodes.some((candidate) => candidate.status === "conditional")
              ? "conditional"
              : nodes.some((candidate) => candidate.status === "hidden")
                ? "hidden"
                : "unknown";
        return [formIndex, state] as const;
      }),
    );
  }, [tree]);
  const destinations = data.forms.map((form, index) => {
    const result = compatibilityByIndex.get(index);
    const safe = result?.compatibility.startsWith("safe-") ?? false;
    const status = {
      "safe-same-package": "Safe",
      "safe-cross-package": "Safe across packages",
      "requires-ref3": "Needs REF3",
      unavailable: "Unavailable",
    }[result?.compatibility ?? "unavailable"];
    return {
      value: String(index),
      label: `${status} · ${form.name || "Unnamed Form"} · ${form.formId}${
        form.formSetTitle ? ` · ${form.formSetTitle}` : ""
      } · ${destinationStates.get(index) ?? "unknown"}${
        form.referencedIn.length === 0 ? " · no incoming Ref" : ""
      }${!safe && result?.reason ? ` — ${result.reason}` : ""}`,
      disabled: !safe,
    };
  });
  const safeDestinations = compatibility.filter((result) =>
    result.compatibility.startsWith("safe-"),
  ).length;
  const ref3Destinations = compatibility.filter(
    (result) => result.compatibility === "requires-ref3",
  ).length;
  const selectedCompatibility =
    destination === null
      ? undefined
      : compatibilityByIndex.get(Number.parseInt(destination, 10));

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
          {safeDestinations} safe destination{safeDestinations === 1 ? "" : "s"}
          {ref3Destinations > 0
            ? ` · ${String(ref3Destinations)} require REF3 conversion`
            : ""}
        </Text>

        {selectedCompatibility && (
          <Alert color="blue" title="Validated destination">
            {selectedCompatibility.reason}
          </Alert>
        )}

        <Text size="xs" c="dimmed">
          This moves the existing direct IFR Ref without changing the Setup HII size.
          Cross-package moves rebalance the proven package headers. Destinations that
          need opcode growth, have ambiguous provenance, duplicate the target or create
          a graph cycle remain disabled.
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
