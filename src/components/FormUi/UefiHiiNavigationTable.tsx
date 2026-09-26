import { Badge, Table, Text, Tooltip } from "@mantine/core";
import type { Updater } from "use-immer";
import type { MenuTree, MenuTreeNode } from "../Navigation/menuTree";
import type { Data, VisibilityStatus } from "../scripts/types";
import UefiHiiMenuActions from "./UefiHiiMenuActions";

interface UefiHiiNavigationTableProps {
  data: Data;
  tree: MenuTree;
  originalSetupSct?: string;
  setData: Updater<Data>;
  setCurrentFormIndex: React.Dispatch<React.SetStateAction<number>>;
  enabled: boolean;
}

const statusColors: Record<VisibilityStatus, string> = {
  visible: "green",
  hidden: "red",
  conditional: "orange",
  unknown: "gray",
  orphaned: "red",
  broken: "pink",
};

function editableReferences(tree: MenuTree) {
  const references: MenuTreeNode[] = [];
  const visited = new Set<string>();
  const visit = (node: MenuTreeNode) => {
    if (visited.has(node.key)) return;
    visited.add(node.key);
    if (
      node.formIndex !== null &&
      node.parentFormIndex !== undefined &&
      node.referenceChildIndex !== undefined &&
      !node.missing
    ) {
      references.push(node);
    }
    node.children.forEach(visit);
  };
  tree.roots.forEach(visit);
  tree.orphans.forEach(visit);
  return references;
}

export default function UefiHiiNavigationTable({
  data,
  tree,
  originalSetupSct,
  setData,
  setCurrentFormIndex,
  enabled,
}: UefiHiiNavigationTableProps) {
  const references = editableReferences(tree);
  if (references.length === 0) return null;

  return (
    <>
      <Text fw={600} size="sm">
        HII navigation references · {String(references.length)} editable menu links
      </Text>
      <Table striped withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Menu</Table.Th>
            <Table.Th>Form Id</Table.Th>
            <Table.Th>Parent</Table.Th>
            <Table.Th>Visibility</Table.Th>
            <Table.Th>HII module</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {references.map((node) => {
            const parent = data.forms[node.parentFormIndex ?? -1];
            const target =
              node.formIndex === null ? undefined : data.forms[node.formIndex];
            return (
              <Table.Tr key={node.key}>
                <Table.Td>
                  <Text
                    component="button"
                    type="button"
                    td="underline"
                    onClick={() => {
                      if (node.formIndex !== null) {
                        setCurrentFormIndex(node.formIndex);
                      }
                    }}
                  >
                    {node.label}
                  </Text>
                </Table.Td>
                <Table.Td>{node.formId}</Table.Td>
                <Table.Td>
                  <Text size="sm">{parent?.name ?? "Unknown parent"}</Text>
                  {parent && (
                    <Text size="xs" c="dimmed">
                      {parent.formId}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Tooltip
                    label={node.conditionSummary ?? node.reachabilityLabel}
                    multiline
                    w={360}
                  >
                    <Badge color={statusColors[node.status]} variant="light">
                      {node.statusLabel}
                    </Badge>
                  </Tooltip>
                </Table.Td>
                <Table.Td>
                  <Text size="xs">
                    {target?.sourceModuleName ?? parent?.sourceModuleName ?? "Unknown"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <UefiHiiMenuActions
                    data={data}
                    tree={tree}
                    node={node}
                    originalSetupSct={originalSetupSct}
                    setData={setData}
                    enabled={enabled}
                  />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </>
  );
}
