import { Badge, Table, Text } from "@mantine/core";
import type { Data } from "../scripts/types";
import { analyzeUefiHiiRoots } from "../scripts/uefiHiiRootEvidence";

export default function UefiHiiRootsTable({
  data,
  setCurrentFormIndex,
}: {
  data: Data;
  setCurrentFormIndex: React.Dispatch<React.SetStateAction<number>>;
}) {
  const roots = analyzeUefiHiiRoots(data);
  return (
    <>
      <Text fw={600} size="sm">
        HII FormSet entries · structural evidence
      </Text>
      <Text size="sm" c="dimmed">
        These are the first parsed forms in their FormSets. An incoming Ref proves a
        static link; its absence does not prove a hidden menu. Runtime registration and
        visibility remain unproven. Root registration controls are unavailable.
      </Text>
      <Table striped withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>FormSet / Form Id</Table.Th>
            <Table.Th>HII module</Table.Th>
            <Table.Th>Static Ref evidence</Table.Th>
            <Table.Th>Runtime registration / visibility</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {roots.map((root) => (
            <Table.Tr key={`${root.formSetGuid ?? ""}:${root.formId}`}>
              <Table.Td>
                <Text
                  component="button"
                  type="button"
                  td="underline"
                  disabled={root.formIndex === null}
                  onClick={() => {
                    if (root.formIndex !== null) setCurrentFormIndex(root.formIndex);
                  }}
                >
                  {root.name} · {root.formId}
                </Text>
                <Text size="xs" c="dimmed">
                  {root.formSetGuid ?? "FormSet GUID unavailable"}
                </Text>
              </Table.Td>
              <Table.Td>{root.moduleName ?? "Unresolved module"}</Table.Td>
              <Table.Td>
                {root.staticEntry === "missing"
                  ? "Entry form missing"
                  : root.staticEntry === "ambiguous"
                    ? "Ambiguous entry identity"
                    : root.staticEntry === "referenced"
                      ? `${String(root.incomingReferenceCount)} incoming IFR Ref(s)`
                      : "No incoming IFR Ref"}
              </Table.Td>
              <Table.Td>
                <Badge color="gray" variant="light">
                  Unproven
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}
