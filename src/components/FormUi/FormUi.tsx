import React from "react";
import s from "./FormUi.module.css";
import type { Updater } from "use-immer";
import {
  Alert,
  Table,
  TextInput,
  NativeSelect,
  Spoiler,
  Stack,
  Group,
  Badge,
  Button,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDebouncedState } from "@mantine/hooks";
import type {
  AmiSingleFormSetPage,
  ConditionSource,
  Data,
  FormChildren,
  VisibilityStatus,
} from "../scripts/types";
import { validateByteInput } from "../scripts/scripts";
import SearchUi from "./SearchUi/SearchUi";
import {
  childVisibility,
  conditionsForChild,
  summarizeFormBranch,
} from "../scripts/visibility";
import {
  buildMenuTree,
  findNodePath,
  type MenuTree,
  type MenuTreeNode,
} from "../Navigation/menuTree";
import MenuMoveDialog from "../Navigation/MenuMoveDialog";
import {
  desiredAmiRootVisibility,
  toggleAmiRootVisibility,
} from "../scripts/amiRootVisibilityEditing";
import {
  analyzeTopLevelTabVisibilityToggle,
  toggleTopLevelTabVisibility,
} from "../scripts/menuEditing";
import { errorMessage } from "../scripts/errors";
import { describeSetupDataFlags } from "../scripts/setupDataFlags";

const conditionSourceMeta: Record<
  ConditionSource,
  { label: string; color: string; explanation: string }
> = {
  setup: {
    label: "Setup value",
    color: "blue",
    explanation: "The condition reads a user-configurable Setup value.",
  },
  hardware: {
    label: "HW capability",
    color: "yellow",
    explanation:
      "The condition reads a firmware-populated platform or CPU capability flag.",
  },
  access: {
    label: "Access policy",
    color: "violet",
    explanation:
      "The condition depends on AMI user/admin access or security state, not hardware.",
  },
  ui: {
    label: "AMI UI state",
    color: "cyan",
    explanation: "The condition depends on AMITSE navigation or UI state.",
  },
  runtime: {
    label: "Runtime variable",
    color: "orange",
    explanation:
      "The variable is evaluated at runtime but is not classified as hardware, access, or UI state.",
  },
  constant: {
    label: "Constant",
    color: "gray",
    explanation: "The IFR expression has a constant result.",
  },
  unknown: {
    label: "Unknown source",
    color: "gray",
    explanation: "The variable source could not be resolved.",
  },
};

const visibilityColors = {
  visible: "green",
  hidden: "red",
  conditional: "orange",
  unknown: "gray",
  orphaned: "red",
  broken: "pink",
} as const;

function sameFormIdentity(
  formId: string,
  formSetGuid: string | undefined,
  expectedFormId: string,
  expectedFormSetGuid: string | undefined,
) {
  return (
    Number.parseInt(formId) === Number.parseInt(expectedFormId) &&
    (formSetGuid ?? "").toLowerCase() === (expectedFormSetGuid ?? "").toLowerCase()
  );
}

function collectMovableNodes(tree: MenuTree, formIndex: number) {
  const matches: MenuTreeNode[] = [];
  const visit = (nodes: MenuTreeNode[]) => {
    for (const node of nodes) {
      if (
        node.formIndex === formIndex &&
        node.parentFormIndex !== undefined &&
        node.referenceChildIndex !== undefined
      ) {
        matches.push(node);
      }
      visit(node.children);
    }
  };
  visit([...tree.roots, ...tree.orphans]);
  return matches;
}

function movableNodeForSingleFormSetPage(
  data: Data,
  tree: MenuTree,
  page: AmiSingleFormSetPage,
) {
  const formIndex = data.forms.findIndex((form) =>
    sameFormIdentity(form.formId, form.formSetGuid, page.formId, page.formSetGuid),
  );
  if (formIndex < 0) return undefined;

  let matches = collectMovableNodes(tree, formIndex);
  if (page.ifrReferenceOffset) {
    matches = matches.filter((node) => {
      if (
        node.parentFormIndex === undefined ||
        node.referenceChildIndex === undefined
      ) {
        return false;
      }
      const child =
        data.forms[node.parentFormIndex]?.children[node.referenceChildIndex];
      return child?.type === "Ref" && child.ifrOffset === page.ifrReferenceOffset;
    });
  } else if (page.parentFormIds.length === 1) {
    matches = matches.filter((node) => {
      const parent =
        node.parentFormIndex === undefined
          ? undefined
          : data.forms[node.parentFormIndex];
      return (
        parent !== undefined &&
        Number.parseInt(parent.formId) === Number.parseInt(page.parentFormIds[0])
      );
    });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function formatBufferOffset(offset: number) {
  return "0x" + offset.toString(16).toUpperCase();
}

function RootVisibilityAnalysis({
  data,
  setData,
}: {
  data: Data;
  setData: Updater<Data>;
}) {
  const report = data.rootVisibility;
  if (!report) return null;

  if (report.status !== "detected") {
    return (
      <Alert
        color={report.status === "ambiguous" ? "orange" : "gray"}
        title={
          report.status === "not-applicable"
            ? "Root visibility — single-FormSet layout"
            : report.status === "ambiguous"
              ? "Root visibility vector — ambiguous"
              : "Root visibility vector — unresolved"
        }
      >
        {report.reason}
      </Alert>
    );
  }

  const originalVisible = report.entries.filter((entry) => entry.visible).length;
  const desiredVisible = report.entries.filter(
    (entry) => desiredAmiRootVisibility(data, entry) === 1,
  ).length;
  const pending = data.rootVisibilityEdits?.length ?? 0;
  return (
    <Alert color="blue" title="Root visibility vector — code corroborated">
      <Stack gap="xs">
        <Text size="sm">{report.reason}</Text>
        <Group gap="xs">
          <Badge color="green">{String(desiredVisible)} desired shown</Badge>
          <Badge color="red">
            {String(report.entries.length - desiredVisible)} desired hidden
          </Badge>
          {pending > 0 && <Badge color="yellow">{String(pending)} pending</Badge>}
          {report.vector && (
            <Badge color="gray" variant="light">
              Buffer {String(report.vector.bufferId)} @{" "}
              {formatBufferOffset(report.vector.offset)}
            </Badge>
          )}
        </Group>
        <Table striped withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>IFR order</Table.Th>
              <Table.Th>Root FormSet</Table.Th>
              <Table.Th>Original BIOS</Table.Th>
              <Table.Th>Desired state</Table.Th>
              <Table.Th>Vector byte</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {report.entries.map((entry) => {
              const desired = desiredAmiRootVisibility(data, entry);
              const changed = desired !== entry.value;
              return (
                <Table.Tr key={entry.formSetGuid ?? String(entry.rootIndex)}>
                  <Table.Td>{String(entry.rootIndex)}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{entry.name}</Text>
                    {entry.formSetGuid && (
                      <Text size="xs" c="dimmed">
                        {entry.formSetGuid}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={entry.visible ? "green" : "red"} variant="light">
                      {entry.visible ? "Visible (01)" : "Hidden (00)"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip
                      label={`Press to make this root ${desired === 1 ? "hidden" : "visible"}.`}
                    >
                      <Button
                        size="compact-xs"
                        color={desired === 1 ? "green" : "red"}
                        variant={changed ? "filled" : "light"}
                        aria-label={`Desired root state for ${entry.name}: ${desired === 1 ? "visible" : "hidden"}`}
                        onClick={() => {
                          setData((draft) => {
                            draft.rootVisibilityEdits = toggleAmiRootVisibility(
                              draft,
                              entry.rootIndex,
                            );
                          });
                        }}
                      >
                        {desired === 1 ? "Visible (01)" : "Hidden (00)"}
                      </Button>
                    </Tooltip>
                    {changed && (
                      <Text size="xs" c="yellow" mt={3}>
                        Pending change
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{formatBufferOffset(entry.bufferOffset)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        {pending > 0 && (
          <Group justify="space-between" gap="xs">
            <Text size="xs" c="yellow">
              Desired state differs from the original BIOS in {String(pending)} root
              {pending === 1 ? "" : "s"}.
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                setData((draft) => {
                  draft.rootVisibilityEdits = undefined;
                });
              }}
            >
              Reset root changes
            </Button>
          </Group>
        )}
        {desiredVisible === 0 && (
          <Text size="xs" c="red">
            Warning: the desired plan hides every root FormSet and could leave Setup
            without a usable top-level page.
          </Text>
        )}
        <Text size="xs" c="dimmed">
          Original evidence remains immutable. Buttons record a reversible desired state
          in the pending change set. Full-image writing remains disabled until the
          reconstruction path can rebuild and verify every enclosing firmware layer. The
          original BIOS contains {String(originalVisible)} visible roots.
        </Text>
      </Stack>
    </Alert>
  );
}

const singleFormSetRoleMeta = {
  hub: { label: "IFR navigation hub", color: "blue" },
  "direct-tab": { label: "Current top-level tab", color: "green" },
  "suppressed-tab": { label: "Suppressed top-level page", color: "red" },
  descendant: { label: "Registered descendant", color: "violet" },
  "registered-only": { label: "Registered only", color: "gray" },
} as const;

function SingleFormSetNavigationAnalysis({
  data,
  tree,
  canEdit,
  originalSetupSct,
  setData,
  onMovePage,
}: {
  data: Data;
  tree: MenuTree;
  canEdit: boolean;
  originalSetupSct?: string;
  setData: Updater<Data>;
  onMovePage: (page: AmiSingleFormSetPage, node: MenuTreeNode) => void;
}) {
  const [visibilityBusy, setVisibilityBusy] = React.useState("");
  const [visibilityError, setVisibilityError] = React.useState("");
  const report = data.singleFormSetNavigation;
  if (!report || report.status === "not-applicable") return null;
  if (report.status !== "detected") {
    return (
      <Alert
        color={report.status === "ambiguous" ? "orange" : "gray"}
        title={
          report.status === "ambiguous"
            ? "Single-FormSet navigation — ambiguous"
            : "Single-FormSet navigation — unresolved"
        }
      >
        {report.reason}
      </Alert>
    );
  }

  const tabs = report.pages.filter((page) => page.role === "direct-tab");
  const registrations = report.pages.filter((page) => page.registeredInAmitse);
  const registeredNonTabs = registrations.filter((page) => page.role !== "direct-tab");
  return (
    <Alert
      color={report.confidence === "corroborated" ? "blue" : "cyan"}
      title="Single-FormSet navigation — IFR hub detected"
    >
      <Stack gap="xs">
        <Text size="sm">{report.reason}</Text>
        <Group gap="xs">
          <Badge color="blue">Hub {report.hubFormId}</Badge>
          <Badge color="green">{String(tabs.length)} current tabs</Badge>
          <Badge color="cyan">{String(registrations.length)} AMITSE pages</Badge>
          {registeredNonTabs.length > 0 && (
            <Badge color="gray">
              {String(registeredNonTabs.length)} registered non-tabs
            </Badge>
          )}
        </Group>
        <Table striped withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Page</Table.Th>
              <Table.Th>Form Id</Table.Th>
              <Table.Th>IFR role</Table.Th>
              <Table.Th>AMITSE evidence</Table.Th>
              <Table.Th>Tab placement</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {report.pages.map((page) => {
              const role = singleFormSetRoleMeta[page.role];
              const movableNode = movableNodeForSingleFormSetPage(data, tree, page);
              const disabled = !canEdit || movableNode === undefined;
              const visibilityRequest =
                movableNode?.parentFormIndex !== undefined &&
                movableNode.referenceChildIndex !== undefined &&
                (page.role === "direct-tab" || page.role === "suppressed-tab")
                  ? {
                      sourceFormIndex: movableNode.parentFormIndex,
                      referenceChildIndex: movableNode.referenceChildIndex,
                      visible: page.role === "suppressed-tab",
                    }
                  : undefined;
              const visibilityAvailability =
                originalSetupSct !== undefined && visibilityRequest
                  ? analyzeTopLevelTabVisibilityToggle(
                      data,
                      originalSetupSct,
                      visibilityRequest,
                    )
                  : undefined;
              const control =
                page.role === "hub"
                  ? {
                      label: "Navigation hub",
                      color: "blue",
                      explanation:
                        "The hub itself cannot be hidden through its own child Ref list.",
                    }
                  : page.role === "direct-tab"
                    ? {
                        label: "Move…",
                        color: "green",
                        explanation:
                          "Move this existing Ref from the Setup hub to another existing Form.",
                      }
                    : page.role === "suppressed-tab"
                      ? {
                          label: "Hidden by SuppressIf",
                          color: "red",
                          explanation:
                            "This registered page has a Ref inside a constant-true SuppressIf scope.",
                        }
                      : page.role === "descendant"
                        ? {
                            label: "Not a tab · promote/move",
                            color: "violet",
                            explanation:
                              "Move this existing Ref to the Setup hub to make it a top-level tab, or choose another proven parent.",
                          }
                        : {
                            label: "No IFR Ref",
                            color: "gray",
                            explanation:
                              "AMITSE registers this page, but no unique existing IFR Ref is available to move safely.",
                          };
              return (
                <Table.Tr key={`${page.formSetGuid}:${page.formId}`}>
                  <Table.Td>{page.name}</Table.Td>
                  <Table.Td>{page.formId}</Table.Td>
                  <Table.Td>
                    <Badge color={role.color} variant="light">
                      {role.label}
                    </Badge>
                    {page.ifrReferenceOffset && (
                      <Text size="xs" c="dimmed" mt={3}>
                        Direct Ref {page.ifrReferenceOffset}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {page.registeredInAmitse ? (
                      <>
                        <Badge color="cyan" variant="outline">
                          Registered
                        </Badge>
                        <Text size="xs" c="dimmed" mt={3}>
                          {page.registrationOffsets.join(", ")}
                        </Text>
                      </>
                    ) : (
                      <Badge color="gray" variant="outline">
                        Not found
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group gap={5} wrap="nowrap">
                      {(page.role === "direct-tab" ||
                        page.role === "suppressed-tab") && (
                        <Tooltip
                          label={
                            !canEdit
                              ? "The original Setup binary is required."
                              : (visibilityAvailability?.reason ??
                                "The visibility edit is unavailable.")
                          }
                          multiline
                          w={360}
                        >
                          <Button
                            size="compact-xs"
                            color={page.role === "direct-tab" ? "red" : "green"}
                            variant="filled"
                            disabled={disabled || !visibilityAvailability?.available}
                            loading={
                              visibilityBusy === `${page.formSetGuid}:${page.formId}`
                            }
                            aria-label={
                              page.role === "direct-tab"
                                ? `Hide ${page.name} top-level tab`
                                : `Show ${page.name} as top-level tab`
                            }
                            onClick={() => {
                              if (!visibilityRequest || !originalSetupSct) return;
                              const key = `${page.formSetGuid}:${page.formId}`;
                              setVisibilityBusy(key);
                              setVisibilityError("");
                              void toggleTopLevelTabVisibility(
                                data,
                                originalSetupSct,
                                visibilityRequest,
                              )
                                .then((next) => {
                                  setData(next);
                                })
                                .catch((reason: unknown) => {
                                  setVisibilityError(errorMessage(reason));
                                })
                                .finally(() => {
                                  setVisibilityBusy("");
                                });
                            }}
                          >
                            {page.role === "direct-tab" ? "Hide" : "Show"}
                          </Button>
                        </Tooltip>
                      )}
                      {page.role !== "suppressed-tab" && (
                        <Tooltip
                          label={
                            !canEdit
                              ? "The original Setup binary is required to validate and apply a fixed-size Ref move."
                              : control.explanation
                          }
                          multiline
                          w={340}
                        >
                          <Button
                            size="compact-xs"
                            color={control.color}
                            variant="light"
                            disabled={page.role === "hub" || disabled}
                            aria-label={
                              page.role === "direct-tab"
                                ? `Move ${page.name} top-level tab`
                                : page.role === "descendant"
                                  ? `Promote or relocate ${page.name} as top-level tab`
                                  : control.label
                            }
                            onClick={() => {
                              if (movableNode) onMovePage(page, movableNode);
                            }}
                          >
                            {control.label}
                          </Button>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        {visibilityError && (
          <Alert color="red" title="The tab visibility could not be changed">
            {visibilityError}
          </Alert>
        )}
        <Text size="xs" c="dimmed">
          Hide parks the existing hub Ref inside a proven constant-true SuppressIf; Show
          returns that same Ref to the hub. Move keeps the page reachable under another
          existing Form. All three operations preserve the HII byte length; no FormSet
          or new menu is created.
        </Text>
      </Stack>
    </Alert>
  );
}

function ConditionDetails({
  child,
  data,
  setData,
  readOnly,
}: {
  child: FormChildren;
  data: Data;
  setData: Updater<Data>;
  readOnly: boolean;
}) {
  const conditions = conditionsForChild(data, child);
  if (conditions.length === 0 && child.accessLevel === null) {
    return (
      <Text size="xs" c="dimmed">
        No condition
      </Text>
    );
  }

  return (
    <Stack gap={5} className={s.conditionList}>
      {conditions.map((condition) => {
        const index = data.suppressions.indexOf(condition);
        const kind = condition.kind ?? "SuppressIf";
        const source = condition.source ?? "unknown";
        const sourceMeta = conditionSourceMeta[source];
        return (
          <div key={condition.offset} className={s.conditionCard}>
            <Group gap={5} justify="space-between" wrap="nowrap">
              <Group gap={5} wrap="wrap">
                <Badge size="xs" color={kind === "SuppressIf" ? "red" : "orange"}>
                  {kind}
                </Badge>
                <Tooltip
                  label={`${sourceMeta.explanation}${
                    condition.varStoreNames?.length
                      ? ` VarStore: ${condition.varStoreNames.join(", ")}.`
                      : ""
                  }`}
                  multiline
                  w={340}
                >
                  <Badge size="xs" variant="outline" color={sourceMeta.color}>
                    {sourceMeta.label}
                  </Badge>
                </Tooltip>
              </Group>
              {kind === "SuppressIf" && !readOnly ? (
                <Tooltip label="Disable this suppression in the generated change set">
                  <Button
                    size="compact-xs"
                    color={condition.active ? "red" : "green"}
                    variant={condition.active ? "light" : "filled"}
                    onClick={() => {
                      if (index < 0) {
                        return;
                      }
                      setData((draft) => {
                        draft.suppressions[index].active = !condition.active;
                      });
                    }}
                  >
                    {condition.active ? "Force visible" : "Visibility forced"}
                  </Button>
                </Tooltip>
              ) : (
                <Badge size="xs" color="gray" variant="light">
                  Read-only
                </Badge>
              )}
            </Group>
            <Text size="xs" mt={4} className={s.conditionExpression}>
              {condition.expression ?? `Condition at ${condition.offset}`}
            </Text>
            <Text size="xs" c="dimmed" mt={3}>
              {kind === "SuppressIf"
                ? "This expression hides the item when true."
                : "This expression disables or grays the item when true."}{" "}
              IFR condition offset: {condition.offset}
            </Text>
            {condition.varStoreNames?.length ? (
              <Text size="xs" c="dimmed" mt={3}>
                VarStore: {condition.varStoreNames.join(", ")}
              </Text>
            ) : null}
          </div>
        );
      })}
      {child.accessLevel !== null ? (
        <div className={s.conditionCard}>
          <Badge size="xs" color="gray" variant="outline">
            AMI SetupData flags
          </Badge>
          <Text size="xs" mt={4} className={s.conditionExpression}>
            {describeSetupDataFlags(child.accessLevel)}
          </Text>
          <Text size="xs" c="dimmed" mt={3}>
            Shown as evidence only; see docs/ami/setupdata-control-flags.md.
          </Text>
        </div>
      ) : null}
    </Stack>
  );
}

interface TableRowProps {
  child: FormChildren;
  index: number;
  handleRefClick: (formId: string, formSetGuid?: string) => void;
  data: Data;
  setData: Updater<Data>;
  currentFormIndex: number;
  readOnly: boolean;
}

const TableRow = React.memo(
  function TableRow({
    child,
    index,
    handleRefClick,
    data,
    setData,
    currentFormIndex,
    readOnly,
  }: TableRowProps) {
    const type = child.type;
    const visibility = childVisibility(data, child);
    const info = [];

    if (type === "CheckBox" || type === "OneOf" || type === "Numeric") {
      if (type === "OneOf") {
        for (const option of child.options) {
          info.push([option.option, option.value]);
        }

        info.push(["newline"]);
      }

      if (type === "Numeric") {
        info.push(
          ["Min", child.min],
          ["Max", child.max],
          ["Step", child.step],
          ["newline"],
        );
      }

      if (child.defaults) {
        for (const def of child.defaults) {
          info.push([`DefaultId ${def.defaultId}`, def.value]);
        }

        if (type !== "CheckBox") {
          info.push(["newline"]);
        }
      }

      if (type === "CheckBox") {
        const def = /\bDefault: (Enabled|Disabled)/.exec(child.flags);
        if (def) {
          info.push(["Default", def[1] === "Enabled" ? "1" : "0"]);
        }

        const mfgDef = /MfgDefault: (Enabled|Disabled)/.exec(child.flags);
        if (mfgDef) {
          info.push(["MfgDefault", mfgDef[1] === "Enabled" ? "1" : "0"]);
        }

        if (def ?? mfgDef ?? child.defaults) {
          info.push(["newline"]);
        }
      }

      info.push(
        ["QuestionId", child.questionId],
        ["VarStoreId", child.varStoreId],
        ["VarStoreName", child.varStoreName],
        ["VarOffset", child.varOffset],
      );

      if (type !== "CheckBox") {
        info.push(["Size (bits)", child.size]);
      }
    }

    return (
      <tr className={s.memoRow}>
        <td
          className={type === "Ref" ? s.pointer : undefined}
          onClick={() => {
            if (type === "Ref") {
              handleRefClick(child.formId, child.targetFormSetGuid);
            }
          }}
        >
          {child.name}
        </td>
        <td>{type}</td>
        <td>
          <Tooltip label={visibility.explanation} multiline w={320}>
            <Badge color={visibilityColors[visibility.status]} variant="light">
              {visibility.label}
            </Badge>
          </Tooltip>
        </td>
        <td className={s.width}>
          {child.accessLevel !== null && (
            <TextInput
              disabled={readOnly}
              value={child.accessLevel}
              onChange={(ev) => {
                const value = ev.target.value.toUpperCase();

                if (validateByteInput(value)) {
                  setData((draft) => {
                    draft.forms[currentFormIndex].children[index].accessLevel = value;
                  });
                }
              }}
            />
          )}
        </td>
        <td className={s.width}>
          {child.failsafe !== null && (
            <TextInput
              disabled={readOnly}
              value={child.failsafe}
              onChange={(ev) => {
                const value = ev.target.value.toUpperCase();

                if (validateByteInput(value)) {
                  setData((draft) => {
                    draft.forms[currentFormIndex].children[index].failsafe = value;
                  });
                }
              }}
            />
          )}
        </td>
        <td className={s.width}>
          {child.optimal !== null && (
            <TextInput
              disabled={readOnly}
              value={child.optimal}
              onChange={(ev) => {
                const value = ev.target.value.toUpperCase();

                if (validateByteInput(value)) {
                  setData((draft) => {
                    draft.forms[currentFormIndex].children[index].optimal = value;
                  });
                }
              }}
            />
          )}
        </td>
        <td>
          <ConditionDetails
            child={child}
            data={data}
            setData={setData}
            readOnly={readOnly}
          />
        </td>
        <td>
          <Spoiler
            transitionDuration={0}
            maxHeight={70}
            showLabel=".........."
            hideLabel="....."
          >
            <Stack>
              {child.description && (
                <div>
                  {child.description
                    .split("<br>")
                    .filter((line) => line !== "")
                    .map((line, index) => (
                      <div key={index.toString() + line.slice(0, 10)}>{line}</div>
                    ))}
                </div>
              )}
              {info.length > 0 && (
                <div>
                  {info.map((item, index) => (
                    <div
                      key={index.toString() + item.toString().slice(0, 10)}
                      className={s.infoRow}
                    >
                      {item[0] === "newline" ? (
                        <br />
                      ) : (
                        <>
                          <div>{item[0]}</div>
                          <div>{item[1]}</div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Stack>
          </Spoiler>
        </td>
      </tr>
    );
  },
  (oldProps: TableRowProps, newProps: TableRowProps) => {
    const oldChild =
      oldProps.data.forms[oldProps.currentFormIndex].children[oldProps.index];
    const newChild =
      newProps.data.forms[newProps.currentFormIndex].children[newProps.index];

    return (
      oldProps.readOnly === newProps.readOnly &&
      oldChild.accessLevel === newChild.accessLevel &&
      oldChild.failsafe === newChild.failsafe &&
      oldChild.optimal === newChild.optimal &&
      JSON.stringify(
        (oldChild.conditions ?? oldChild.suppressIf ?? []).map(
          (offset) =>
            oldProps.data.suppressions.find(
              (suppression) => suppression.offset === offset,
            )?.active,
        ),
      ) ===
        JSON.stringify(
          (newChild.conditions ?? newChild.suppressIf ?? []).map(
            (offset) =>
              newProps.data.suppressions.find(
                (suppression) => suppression.offset === offset,
              )?.active,
          ),
        )
    );
  },
);

interface FormUiProps {
  data: Data;
  setData: Updater<Data>;
  originalSetupSct?: string;
  currentFormIndex: number;
  setCurrentFormIndex: React.Dispatch<React.SetStateAction<number>>;
  readOnly?: boolean;
}

export default function FormUi({
  data,
  setData,
  originalSetupSct,
  currentFormIndex,
  setCurrentFormIndex,
  readOnly = false,
}: FormUiProps) {
  const [search, setSearch] = useDebouncedState("", 200);
  const semanticTree = React.useMemo(() => buildMenuTree(data), [data]);
  const [menuMove, setMenuMove] = React.useState<{
    node: MenuTreeNode;
    intent: "demote-tab" | "promote-tab";
    initialDestinationFormIndex?: number;
  } | null>(null);

  function handleRefClick(formId: string, formSetGuid?: string) {
    const sourceFormSetGuid =
      formSetGuid ??
      (currentFormIndex >= 0 ? data.forms[currentFormIndex].formSetGuid : undefined);
    let formIndex = data.forms.findIndex(
      (form) =>
        form.formSetGuid === sourceFormSetGuid &&
        parseInt(form.formId) === parseInt(formId),
    );

    if (formIndex < 0) {
      formIndex = data.forms.findIndex(
        (form) => parseInt(form.formId) === parseInt(formId),
      );
    }

    if (formIndex >= 0) {
      setCurrentFormIndex(formIndex);

      document.getElementById(`nav-${formIndex.toString()}`)?.scrollIntoView();
    }
  }

  if (currentFormIndex === -2) {
    return (
      <SearchUi
        data={data}
        handleRefClick={handleRefClick}
        search={search}
        setSearch={setSearch}
      />
    );
  }

  if (currentFormIndex === -1) {
    const navigation = data.singleFormSetNavigation;
    const hubFormIndex =
      navigation?.status === "detected" &&
      navigation.hubFormId &&
      navigation.formSetGuid
        ? data.forms.findIndex((form) =>
            sameFormIdentity(
              form.formId,
              form.formSetGuid,
              navigation.hubFormId ?? "",
              navigation.formSetGuid,
            ),
          )
        : -1;
    return (
      <Stack>
        {!readOnly && menuMove && originalSetupSct !== undefined && (
          <MenuMoveDialog
            data={data}
            tree={semanticTree}
            node={menuMove.node}
            opened
            originalSetupSct={originalSetupSct}
            setData={setData}
            initialDestinationFormIndex={menuMove.initialDestinationFormIndex}
            intent={menuMove.intent}
            onClose={() => {
              setMenuMove(null);
            }}
          />
        )}
        <RootVisibilityAnalysis data={data} setData={setData} />
        <SingleFormSetNavigationAnalysis
          data={data}
          tree={semanticTree}
          canEdit={!readOnly && originalSetupSct !== undefined}
          originalSetupSct={originalSetupSct}
          setData={setData}
          onMovePage={(page, node) => {
            setMenuMove({
              node,
              intent: page.role === "direct-tab" ? "demote-tab" : "promote-tab",
              initialDestinationFormIndex:
                page.role === "descendant" && hubFormIndex >= 0
                  ? hubFormIndex
                  : undefined,
            });
          }}
        />
        {data.firmwareFamily === "uefi-hii" && (
          <Alert
            color="blue"
            title="Vendor-neutral UEFI HII graph · safe navigation editing"
          >
            Forms, strings and submenu references were joined across Setup-related FFS
            modules. Use the tree controls to Hide, Show or Move proven menu Refs.
            Question fields remain read-only, and full-image writing stays disabled
            until every enclosing compressed section can be rebuilt and verified.
          </Alert>
        )}
        <Table striped withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Form Id</Table.Th>
              <Table.Th>Root evidence</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.menu.map((entry, index) => (
              <Table.Tr
                key={index.toString() + (entry.offset ?? "readonly") + entry.formId}
              >
                <Table.Td
                  className={s.pointer}
                  onClick={() => {
                    handleRefClick(entry.formId, entry.formSetGuid);
                  }}
                >
                  {entry.name}
                </Table.Td>
                <Table.Td className={s.formIdWidth}>
                  <NativeSelect
                    className={s.formIdChildWidth}
                    disabled={entry.offset === null}
                    value={entry.formId}
                    data={data.forms
                      .filter(
                        (form) =>
                          !entry.formSetGuid || form.formSetGuid === entry.formSetGuid,
                      )
                      .map((form) => form.formId)}
                    onChange={(ev) => {
                      const value = ev.target.value;
                      const selectedName = data.forms.find(
                        (form) =>
                          (!entry.formSetGuid ||
                            form.formSetGuid === entry.formSetGuid) &&
                          parseInt(form.formId) === parseInt(value),
                      )?.name;

                      if (!selectedName) return;

                      setData((draft) => {
                        draft.menu[index].formId = value;
                        draft.menu[index].name = selectedName;
                      });
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <Group gap={5}>
                    <Tooltip
                      label={
                        entry.source === "setupdata"
                          ? `This root is registered in the AMITSE SetupData page list${entry.pageMask ? ` with page selector ${entry.pageMask}` : ""}.`
                          : entry.source === "ifr-hub"
                            ? "This is the single FormSet entry and IFR navigation hub. Its direct Ref children define the current top-level tabs."
                            : entry.source === "amitse" || entry.offset !== null
                              ? "This root is present in the AMITSE executable menu table."
                              : "This is the entry form declared by its HII FormSet. It is structural evidence, not a runtime visibility condition."
                      }
                      multiline
                      w={360}
                    >
                      <Badge
                        color={
                          entry.source === "setupdata"
                            ? "cyan"
                            : entry.source === "ifr-hub"
                              ? "blue"
                              : entry.source === "amitse" || entry.offset !== null
                                ? "green"
                                : "blue"
                        }
                        variant="light"
                      >
                        {entry.source === "setupdata"
                          ? `SetupData page ${entry.pageMask ?? ""}`
                          : entry.source === "ifr-hub"
                            ? "IFR navigation hub"
                            : entry.source === "amitse" || entry.offset !== null
                              ? "AMITSE menu"
                              : "HII FormSet entry"}
                      </Badge>
                    </Tooltip>
                    {data.rootVisibility?.status !== "detected" &&
                      semanticTree.roots[index]?.profileLabel && (
                        <Badge
                          size="xs"
                          color={
                            semanticTree.roots[index].profileAssessment ===
                            "probable-live"
                              ? "green"
                              : semanticTree.roots[index].profileAssessment ===
                                  "probable-fallback"
                                ? "orange"
                                : "gray"
                          }
                          variant="outline"
                        >
                          {semanticTree.roots[index].profileLabel}
                        </Badge>
                      )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    );
  }

  const currentPath = findNodePath(semanticTree.roots, currentFormIndex);
  const orphanPath =
    currentPath.length === 0
      ? findNodePath(semanticTree.orphans, currentFormIndex)
      : [];
  const activePath = currentPath.length > 0 ? currentPath : orphanPath;
  const pageNode = activePath[activePath.length - 1];
  const activeProfile = semanticTree.profiles.find(
    (profile) => profile.id === pageNode.profileId,
  );
  const pageStatus = pageNode.status;
  const visibilitySummary = summarizeFormBranch(data, currentFormIndex, pageStatus);

  function summaryBadges(counts: Record<VisibilityStatus, number>) {
    return (
      <>
        <Badge color="green">{counts.visible} ungated</Badge>
        <Badge color="red">{counts.hidden} hidden / affected</Badge>
        <Badge color="orange">{counts.conditional} unavailable / affected</Badge>
        {counts.orphaned > 0 && <Badge color="red">{counts.orphaned} orphaned</Badge>}
        {counts.broken > 0 && <Badge color="pink">{counts.broken} broken</Badge>}
        {counts.unknown > 0 && <Badge color="gray">{counts.unknown} unresolved</Badge>}
      </>
    );
  }

  function sourceBadges(counts: Record<ConditionSource, number>) {
    return (
      <>
        {counts.hardware > 0 && (
          <Badge color="yellow" variant="outline">
            {counts.hardware} HW capability
          </Badge>
        )}
        {counts.access > 0 && (
          <Badge color="violet" variant="outline">
            {counts.access} access policy
          </Badge>
        )}
        {counts.ui > 0 && (
          <Badge color="cyan" variant="outline">
            {counts.ui} UI state
          </Badge>
        )}
        {counts.setup > 0 && (
          <Badge color="blue" variant="outline">
            {counts.setup} Setup value
          </Badge>
        )}
        {counts.runtime > 0 && (
          <Badge color="orange" variant="outline">
            {counts.runtime} other runtime
          </Badge>
        )}
      </>
    );
  }

  return (
    <Stack gap={0}>
      <Stack gap={4} className={s.visibilitySummary}>
        <Group gap="xs">
          <Text size="sm" fw={600}>
            Selected path:
          </Text>
          <Tooltip
            label={pageNode.conditionSummary ?? pageNode.reachabilityLabel}
            multiline
            w={420}
          >
            <Badge
              color={pageNode.reachability === "detached" ? "gray" : "blue"}
              variant="light"
            >
              {pageNode.reachabilityLabel}
            </Badge>
          </Tooltip>
          {activeProfile && (
            <Tooltip label={activeProfile.evidence.join(" ")} multiline w={460}>
              <Badge
                color={
                  activeProfile.assessment === "probable-live"
                    ? "green"
                    : activeProfile.assessment === "probable-fallback"
                      ? "orange"
                      : "gray"
                }
                variant="outline"
              >
                {activeProfile.label}
              </Badge>
            </Tooltip>
          )}
          {data.forms[currentFormIndex].sourceModuleName && (
            <Tooltip
              label={`FFS owner: ${data.forms[currentFormIndex].sourceModuleName}`}
            >
              <Badge color="violet" variant="outline">
                {data.forms[currentFormIndex].sourceModuleName}
              </Badge>
            </Tooltip>
          )}
          {(pageStatus === "hidden" || pageStatus === "conditional") && (
            <Tooltip label={pageNode.conditionSummary} multiline w={420}>
              <Badge color={visibilityColors[pageStatus]} variant="light">
                {pageNode.statusLabel}
              </Badge>
            </Tooltip>
          )}
          {pageNode.hardwareDependent && (
            <Badge color="yellow" variant="outline">
              HW capability
            </Badge>
          )}
          {pageNode.accessDependent && (
            <Badge color="violet" variant="outline">
              Access policy
            </Badge>
          )}
          {pageNode.uiStateDependent && (
            <Badge color="cyan" variant="outline">
              AMI UI state
            </Badge>
          )}
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" fw={600}>
            Parentage:
          </Text>
          <Tooltip
            label={`${String(pageNode.incomingReferenceCount)} incoming IFR Ref(s); ${String(pageNode.outgoingReferenceCount)} outgoing IFR Ref(s).`}
          >
            <Text size="xs" c="dimmed">
              {pageNode.parentageLabel}
            </Text>
          </Tooltip>
        </Group>
        <Group gap="xs">
          <Text size="sm" fw={600}>
            This page:
          </Text>
          {summaryBadges(visibilitySummary.direct)}
          {sourceBadges(visibilitySummary.directSources)}
        </Group>
        <Group gap="xs">
          <Tooltip label="Includes controls and Ref targets in every nested page">
            <Text size="sm" fw={600}>
              Whole branch:
            </Text>
          </Tooltip>
          {summaryBadges(visibilitySummary.branch)}
          {sourceBadges(visibilitySummary.branchSources)}
          <Text size="xs" c="dimmed">
            {visibilitySummary.descendantForms} nested pages
          </Text>
        </Group>
      </Stack>
      <Table stickyHeader stickyHeaderOffset={150} striped withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>HII effect</Table.Th>
            <Table.Th>SetupData flags</Table.Th>
            <Table.Th>Failsafe</Table.Th>
            <Table.Th>Optimal</Table.Th>
            <Table.Th>Condition</Table.Th>
            <Table.Th>Info</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody className={s.striped}>
          {data.forms[currentFormIndex].children.map((child, index) => (
            <TableRow
              key={index.toString() + child.questionId}
              child={child}
              index={index}
              handleRefClick={handleRefClick}
              data={data}
              setData={setData}
              currentFormIndex={currentFormIndex}
              readOnly={readOnly}
            />
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
