import React from "react";
import { ActionIcon, AppShell, Group, ScrollArea, Text, Tooltip } from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronRight,
  IconFileDescription,
  IconFolder,
  IconFolderOpen,
  IconListTree,
  IconArrowsMove,
  IconRefresh,
  IconSearch,
  IconSitemap,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import type { Updater } from "use-immer";
import s from "./Navigation.module.css";
import type { Data } from "../scripts/types";
import { buildMenuTree, findNodePath, type MenuTreeNode } from "./menuTree";
import MenuMoveDialog from "./MenuMoveDialog";
import {
  analyzeUefiHiiMenuVisibility,
  toggleUefiHiiMenuVisibility,
} from "../scripts/uefiHiiEditing";
import {
  analyzeUefiHiiSuppressionToggle,
  toggleUefiHiiSuppressions,
} from "../scripts/uefiHiiSuppressionEditing";

interface NavigationProps {
  data: Data;
  currentFormIndex: number;
  setCurrentFormIndex: React.Dispatch<React.SetStateAction<number>>;
  setData: Updater<Data>;
  originalSetupSct: string;
  readOnly?: boolean;
}

export default function Navigation({
  data,
  currentFormIndex,
  setCurrentFormIndex,
  setData,
  originalSetupSct,
  readOnly = false,
}: NavigationProps) {
  const tree = React.useMemo(() => buildMenuTree(data), [data]);
  const [moveNode, setMoveNode] = React.useState<MenuTreeNode | null>(null);
  const [visibilityBusy, setVisibilityBusy] = React.useState("");
  const [visibilityError, setVisibilityError] = React.useState("");

  function referenceVisibilityControl(node: MenuTreeNode) {
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

  function applySuppressionVisibility(
    offsets: string[],
    active: boolean,
    visibilityKey: string,
  ) {
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
    setVisibilityBusy(visibilityKey);
    setVisibilityError("");
    void toggleUefiHiiSuppressions(data, offsets, active)
      .then(setData)
      .catch((reason: unknown) => {
        setVisibilityError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        setVisibilityBusy("");
      });
  }

  const activePath = React.useMemo(() => {
    if (currentFormIndex < 0) {
      return [];
    }

    const rootPath = findNodePath(tree.roots, currentFormIndex);
    return rootPath.length > 0
      ? rootPath
      : findNodePath(tree.orphans, currentFormIndex);
  }, [currentFormIndex, tree.orphans, tree.roots]);
  const activePathKey = activePath.map((node) => node.key).join("\u0000");
  const [expansion, setExpansion] = React.useState(() => ({
    activePathKey,
    keys: new Set(tree.roots.map((node) => node.key)),
  }));

  if (expansion.activePathKey !== activePathKey) {
    const keys = new Set(expansion.keys);
    for (const node of activePath.slice(0, -1)) {
      keys.add(node.key);
    }
    setExpansion({ activePathKey, keys });
  }

  const expanded = expansion.keys;

  function toggleNode(key: string) {
    setExpansion((current) => {
      const next = new Set(current.keys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { ...current, keys: next };
    });
  }

  function renderNode(node: MenuTreeNode, depth: number) {
    const hasChildren = node.children.length > 0;
    const opened = expanded.has(node.key);
    const active = node.formIndex === currentFormIndex;
    const isPrimaryNode =
      node.formIndex !== null &&
      tree.firstKeyByFormIndex.get(node.formIndex) === node.key;
    const title =
      node.label === node.formName
        ? `${node.formName} (${node.formId})`
        : `${node.label} — ${node.formName} (${node.formId})`;
    const gateClass = {
      visible: s.statusVisible,
      hidden: s.statusHidden,
      conditional: s.statusConditional,
      unknown: s.statusUnknown,
      orphaned: s.statusHidden,
      broken: s.statusBroken,
    }[node.status];
    const iconClass =
      node.reachability === "detached"
        ? s.statusDetached
        : node.reachability === "external" || node.reachability === "unresolved"
          ? s.statusUnknown
          : node.status === "visible" && node.profileAssessment === "probable-fallback"
            ? s.statusProfileFallback
            : gateClass;
    const semanticTitle = `${title}${node.profileLabel ? `\n${node.profileLabel}` : ""}\n${node.reachabilityLabel}\n${node.parentageLabel}\n${node.statusLabel}${
      node.conditionSummary ? `: ${node.conditionSummary}` : ""
    }`;
    const canEditReference =
      !readOnly &&
      node.parentFormIndex !== undefined &&
      node.referenceChildIndex !== undefined &&
      !node.missing;
    const visibilityControl = referenceVisibilityControl(node);
    const visibilityKey = `${String(node.parentFormIndex ?? -1)}:${String(
      node.referenceChildIndex ?? -1,
    )}`;

    return (
      <div
        key={node.key}
        role="treeitem"
        aria-expanded={hasChildren ? opened : undefined}
      >
        <div
          id={
            isPrimaryNode && node.formIndex !== null
              ? `nav-${String(node.formIndex)}`
              : undefined
          }
          className={[
            s.treeRow,
            active ? s.selected : "",
            node.missing ? s.missing : "",
            node.reachability === "external" || node.reachability === "unresolved"
              ? s.external
              : "",
            node.reachability === "detached" ? s.detachedRow : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ paddingLeft: `${String(depth * 16 + 6)}px` }}
          title={semanticTitle}
        >
          <button
            type="button"
            className={s.expander}
            disabled={!hasChildren}
            aria-label={opened ? "Collapse branch" : "Expand branch"}
            onClick={() => {
              if (hasChildren) {
                toggleNode(node.key);
              }
            }}
          >
            {hasChildren && (
              <IconChevronRight
                size={14}
                className={opened ? s.chevronOpen : s.chevron}
              />
            )}
          </button>

          {node.missing ? (
            <IconAlertTriangle
              size={16}
              className={
                node.reachability === "external" || node.reachability === "unresolved"
                  ? s.externalIcon
                  : s.warningIcon
              }
            />
          ) : node.cycle ? (
            <IconRefresh size={16} className={s.mutedIcon} />
          ) : hasChildren ? (
            opened ? (
              <IconFolderOpen size={17} className={`${s.folderIcon} ${iconClass}`} />
            ) : (
              <IconFolder size={17} className={`${s.folderIcon} ${iconClass}`} />
            )
          ) : (
            <IconFileDescription size={16} className={`${s.formIcon} ${iconClass}`} />
          )}

          <button
            type="button"
            className={s.nodeLabel}
            disabled={node.formIndex === null}
            onClick={() => {
              if (node.formIndex !== null) {
                setCurrentFormIndex(node.formIndex);
              }
            }}
            onDoubleClick={() => {
              if (hasChildren) {
                toggleNode(node.key);
              }
            }}
          >
            <span className={s.nodeName}>{node.label}</span>
            <span className={s.formId}>{node.formId}</span>
            {(node.reachability === "root" ||
              (node.reachability === "detached" && depth === 0) ||
              node.reachability === "external" ||
              node.reachability === "unresolved" ||
              node.reachability === "broken") && (
              <span className={s.reachabilityLabel}>
                {node.reachabilityLabel}
                {node.pageMask ? ` ${node.pageMask}` : ""}
              </span>
            )}
            {(node.status === "hidden" ||
              node.status === "conditional" ||
              node.rootVisibilityPending) && (
              <span className={`${s.statusLabel} ${gateClass}`}>
                {node.statusLabel}
              </span>
            )}
            {node.hardwareDependent && (
              <span className={s.hardwareLabel}>HW capability</span>
            )}
            {node.accessDependent && (
              <span className={s.accessLabel}>Access policy</span>
            )}
            {node.uiStateDependent && <span className={s.uiStateLabel}>UI state</span>}
          </button>

          {canEditReference && data.firmwareFamily === "uefi-hii" && (
            <Tooltip
              label={
                visibilityControl.show
                  ? "Show this menu by safely escaping its proven SuppressIf scope."
                  : visibilityControl.inactive.length > 0
                    ? "Hide this menu again by restoring its original SuppressIf scope."
                    : "Hide this menu by parking its Ref in a proven constant-true SuppressIf."
              }
            >
              <ActionIcon
                className={s.moveAction}
                size="sm"
                variant="subtle"
                color={visibilityControl.show ? "green" : "red"}
                aria-label={`${visibilityControl.show ? "Show" : "Hide"} ${node.label}`}
                loading={visibilityBusy === visibilityKey}
                onClick={(event) => {
                  event.stopPropagation();
                  if (
                    node.parentFormIndex === undefined ||
                    node.referenceChildIndex === undefined
                  ) {
                    return;
                  }
                  if (visibilityControl.show) {
                    if (visibilityControl.hasConstant) {
                      const structural = analyzeUefiHiiMenuVisibility(
                        data,
                        originalSetupSct,
                        node.parentFormIndex,
                        node.referenceChildIndex,
                        true,
                      );
                      if (structural.available) {
                        setVisibilityBusy(visibilityKey);
                        setVisibilityError("");
                        void toggleUefiHiiMenuVisibility(
                          data,
                          originalSetupSct,
                          node.parentFormIndex,
                          node.referenceChildIndex,
                          true,
                        )
                          .then(setData)
                          .catch((reason: unknown) => {
                            setVisibilityError(
                              reason instanceof Error ? reason.message : String(reason),
                            );
                          })
                          .finally(() => {
                            setVisibilityBusy("");
                          });
                        return;
                      }
                    }
                    applySuppressionVisibility(
                      visibilityControl.active,
                      false,
                      visibilityKey,
                    );
                    return;
                  }
                  if (visibilityControl.inactive.length > 0) {
                    applySuppressionVisibility(
                      visibilityControl.inactive,
                      true,
                      visibilityKey,
                    );
                    return;
                  }
                  const visible = false;
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
                  setVisibilityBusy(visibilityKey);
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
                      setVisibilityError(
                        reason instanceof Error ? reason.message : String(reason),
                      );
                    })
                    .finally(() => {
                      setVisibilityBusy("");
                    });
                }}
              >
                {visibilityControl.show ? (
                  <IconEye size={14} />
                ) : (
                  <IconEyeOff size={14} />
                )}
              </ActionIcon>
            </Tooltip>
          )}

          {canEditReference && (
            <Tooltip label="Move this menu to another Form">
              <ActionIcon
                className={s.moveAction}
                size="sm"
                variant="subtle"
                color="blue"
                aria-label={`Move ${node.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setMoveNode(node);
                }}
              >
                <IconArrowsMove size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>

        {hasChildren && opened && (
          <div role="group" className={s.children}>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {!readOnly && moveNode && (
        <MenuMoveDialog
          data={data}
          tree={tree}
          node={moveNode}
          opened
          originalSetupSct={originalSetupSct}
          setData={setData}
          onClose={() => {
            setMoveNode(null);
          }}
        />
      )}
      <AppShell.Section className={s.treeHeader}>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <IconListTree size={20} className={s.headerIcon} />
            <div>
              <Text size="sm" fw={600}>
                {data.firmwareFamily === "uefi-hii"
                  ? "UEFI HII menu tree"
                  : "BIOS menu tree"}
              </Text>
              <Text size="xs" c="dimmed">
                {data.forms.length} forms
              </Text>
            </div>
          </Group>
          <Group gap={2} wrap="nowrap">
            <Tooltip label="Expand all">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label="Expand all menu branches"
                onClick={() => {
                  setExpansion((current) => ({
                    ...current,
                    keys: new Set(tree.expandableKeys),
                  }));
                }}
              >
                <IconArrowsMaximize size={15} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Collapse all">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label="Collapse all menu branches"
                onClick={() => {
                  setExpansion((current) => ({ ...current, keys: new Set() }));
                }}
              >
                <IconArrowsMinimize size={15} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Section>

      <AppShell.Section
        className={[s.navElement, s.menu, currentFormIndex === -1 ? s.selected : ""]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          setCurrentFormIndex(-1);
        }}
      >
        <IconSitemap size={17} />
        <span>Top-level menu</span>
      </AppShell.Section>

      {visibilityError && (
        <AppShell.Section px="xs" pb={4}>
          <Text size="xs" c="red" lineClamp={3} title={visibilityError}>
            {visibilityError}
          </Text>
        </AppShell.Section>
      )}

      <AppShell.Section
        grow
        component={ScrollArea}
        type="always"
        className={s.treeScroll}
      >
        <div role="tree" aria-label="BIOS forms" className={s.tree}>
          {tree.profiles.map((profile) => (
            <React.Fragment key={profile.id}>
              <Tooltip label={profile.evidence.join(" ")} multiline w={440}>
                <div className={s.profileLabel}>
                  <span>{profile.label}</span>
                  <span
                    className={
                      profile.assessment === "probable-live"
                        ? s.profileLive
                        : profile.assessment === "probable-fallback"
                          ? s.profileFallback
                          : s.profileUnresolved
                    }
                  >
                    {profile.confidence} confidence
                  </span>
                </div>
              </Tooltip>
              {profile.roots.map((node) => renderNode(node, 0))}
            </React.Fragment>
          ))}

          {tree.orphans.length > 0 && (
            <>
              <div className={s.sectionLabel}>Detached / unreferenced components</div>
              {tree.orphans.map((node) => renderNode(node, 0))}
            </>
          )}
        </div>
      </AppShell.Section>

      <AppShell.Section
        className={[s.navElement, s.search, currentFormIndex === -2 ? s.selected : ""]
          .filter(Boolean)
          .join(" ")}
        onClick={() => {
          setCurrentFormIndex(-2);
        }}
      >
        <IconSearch size={17} />
        <span>Search</span>
      </AppShell.Section>
    </>
  );
}
