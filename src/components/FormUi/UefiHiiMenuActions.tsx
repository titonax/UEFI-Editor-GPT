import React from "react";
import { Alert, Button, Group, Tooltip } from "@mantine/core";
import type { Updater } from "use-immer";
import type { Data } from "../scripts/types";
import type { MenuTree, MenuTreeNode } from "../Navigation/menuTree";
import MenuMoveDialog from "../Navigation/MenuMoveDialog";
import {
  analyzeUefiHiiMenuVisibility,
  toggleUefiHiiMenuVisibility,
} from "../scripts/uefiHiiEditing";
import {
  analyzeUefiHiiSuppressionToggle,
  toggleUefiHiiSuppressions,
} from "../scripts/uefiHiiSuppressionEditing";
import { errorMessage } from "../scripts/errors";

interface UefiHiiMenuActionsProps {
  data: Data;
  tree: MenuTree;
  node: MenuTreeNode;
  originalSetupSct?: string;
  setData: Updater<Data>;
  enabled: boolean;
}

function referenceVisibilityControl(data: Data, node: MenuTreeNode) {
  if (node.parentFormIndex === undefined || node.referenceChildIndex === undefined) {
    return { show: false, active: [], inactive: [], hasConstant: false };
  }
  const child = data.forms[node.parentFormIndex]?.children[node.referenceChildIndex];
  if (child?.type !== "Ref") {
    return { show: false, active: [], inactive: [], hasConstant: false };
  }
  const conditions = (child.suppressIf ?? []).flatMap((offset) => {
    const condition = data.suppressions.find(
      (candidate) =>
        candidate.offset === offset &&
        (candidate.kind ?? "SuppressIf") === "SuppressIf",
    );
    return condition ? [condition] : [];
  });
  const active = conditions
    .filter((condition) => condition.active)
    .map((condition) => condition.offset);
  const inactive = conditions
    .filter((condition) => !condition.active)
    .map((condition) => condition.offset);
  return {
    show: active.length > 0,
    active,
    inactive,
    hasConstant: conditions.some(
      (condition) => condition.active && condition.constant === true,
    ),
  };
}

export default function UefiHiiMenuActions({
  data,
  tree,
  node,
  originalSetupSct,
  setData,
  enabled,
}: UefiHiiMenuActionsProps) {
  const [moveOpened, setMoveOpened] = React.useState(false);
  const [visibilityBusy, setVisibilityBusy] = React.useState(false);
  const [visibilityError, setVisibilityError] = React.useState("");
  const hasReference =
    node.parentFormIndex !== undefined && node.referenceChildIndex !== undefined;
  const canEdit = enabled && hasReference && originalSetupSct !== undefined;
  const visibility = referenceVisibilityControl(data, node);
  const visibilityLabel = visibility.show ? "Show" : "Hide";
  const unavailableReason = !enabled
    ? "Navigation editing is disabled."
    : !hasReference
      ? "This Form has no unique parent IFR Ref to edit safely."
      : originalSetupSct === undefined
        ? "The original HII workspace is required."
        : undefined;

  function applySuppressions(offsets: string[], active: boolean) {
    if (!originalSetupSct) return;
    const availability = analyzeUefiHiiSuppressionToggle(
      data,
      originalSetupSct,
      offsets,
      active,
    );
    if (!availability.available) {
      setVisibilityError(availability.reason);
      return;
    }
    setVisibilityBusy(true);
    setVisibilityError("");
    void toggleUefiHiiSuppressions(data, offsets, active)
      .then(setData)
      .catch((reason: unknown) => {
        setVisibilityError(errorMessage(reason));
      })
      .finally(() => {
        setVisibilityBusy(false);
      });
  }

  function toggleVisibility() {
    if (
      !canEdit ||
      !originalSetupSct ||
      node.parentFormIndex === undefined ||
      node.referenceChildIndex === undefined
    ) {
      return;
    }

    if (visibility.show) {
      if (visibility.hasConstant) {
        const structural = analyzeUefiHiiMenuVisibility(
          data,
          originalSetupSct,
          node.parentFormIndex,
          node.referenceChildIndex,
          true,
        );
        if (structural.available) {
          applyStructuralVisibility(true);
          return;
        }
      }
      applySuppressions(visibility.active, false);
      return;
    }

    if (visibility.inactive.length > 0) {
      applySuppressions(visibility.inactive, true);
      return;
    }
    applyStructuralVisibility(false);
  }

  function applyStructuralVisibility(visible: boolean) {
    if (
      !originalSetupSct ||
      node.parentFormIndex === undefined ||
      node.referenceChildIndex === undefined
    ) {
      return;
    }
    const availability = analyzeUefiHiiMenuVisibility(
      data,
      originalSetupSct,
      node.parentFormIndex,
      node.referenceChildIndex,
      visible,
    );
    if (!availability.available) {
      setVisibilityError(availability.reason);
      return;
    }
    setVisibilityBusy(true);
    setVisibilityError("");
    void toggleUefiHiiMenuVisibility(
      data,
      originalSetupSct,
      node.parentFormIndex,
      node.referenceChildIndex,
      visible,
    )
      .then(setData)
      .catch((reason: unknown) => {
        setVisibilityError(errorMessage(reason));
      })
      .finally(() => {
        setVisibilityBusy(false);
      });
  }

  return (
    <>
      {moveOpened && canEdit && originalSetupSct && (
        <MenuMoveDialog
          data={data}
          tree={tree}
          node={node}
          opened
          originalSetupSct={originalSetupSct}
          setData={setData}
          onClose={() => {
            setMoveOpened(false);
          }}
        />
      )}
      <Group gap="xs">
        <Tooltip
          label={
            unavailableReason ??
            (visibility.show
              ? "Show this menu by safely escaping its proven SuppressIf scope."
              : "Hide this menu while preserving its original binary position.")
          }
          multiline
          w={360}
        >
          <Button
            size="compact-sm"
            color={visibility.show ? "green" : "red"}
            disabled={!canEdit}
            loading={visibilityBusy}
            aria-label={`${visibilityLabel} ${node.label} menu`}
            onClick={toggleVisibility}
          >
            {visibilityLabel}
          </Button>
        </Tooltip>
        <Tooltip
          label={
            unavailableReason ??
            "Move this existing Ref to another compatible Form in the same HII module."
          }
          multiline
          w={360}
        >
          <Button
            size="compact-sm"
            color="blue"
            variant="light"
            disabled={!canEdit}
            aria-label={`Move ${node.label} menu`}
            onClick={() => {
              setMoveOpened(true);
            }}
          >
            Move…
          </Button>
        </Tooltip>
      </Group>
      {visibilityError && (
        <Alert color="red" title="The menu visibility could not be changed">
          {visibilityError}
        </Alert>
      )}
    </>
  );
}
