import { Alert, Badge, Group, Stack, Table, Text } from "@mantine/core";
import type { PhoenixSetupItem, PhoenixSetupMenu } from "../scripts/phoenixSetupTable";
import s from "../FormUi/FormUi.module.css";
import PhoenixBehaviorDialog from "./PhoenixBehaviorDialog";

function label(value: string | null) {
  const normalized = value?.replace(/\r/g, " ").trim();
  return normalized && normalized.length > 0 ? normalized : "—";
}

function typeLabel(type: PhoenixSetupItem["type"]) {
  return (
    {
      "pick-field": "Selection",
      "generic-text": "Text",
      information: "Submenu",
      time: "Time",
      date: "Date",
      action: "Action",
      "boot-device-slot": "Boot device",
      "free-form-hex": "Hex",
    } satisfies Record<PhoenixSetupItem["type"], string>
  )[type];
}

function visibility(item: PhoenixSetupItem) {
  if (!item.visibilityPatch) return { color: "gray", label: "No verified callback" };
  if (item.visibilityPatch.hiddenImmediate === 0)
    return { color: "green", label: "Ungated callback" };
  return { color: "orange", label: "Conditional callback" };
}

export default function PhoenixFormUi({
  menu,
  templat,
  currentSectionIndex,
}: {
  menu: PhoenixSetupMenu;
  templat: Uint8Array;
  currentSectionIndex: number;
}) {
  const sections = menu.sections.filter((section) => section.items.length > 0);
  if (currentSectionIndex < 0) {
    return (
      <Stack gap="md" p="md">
        <Group gap="xs">
          <Badge color="grape">Phoenix Setup</Badge>
          <Badge
            color={menu.source === "root-table" ? "green" : "yellow"}
            variant="outline"
          >
            {menu.source === "root-table"
              ? "Verified root/tab table"
              : "Inferred contiguous groups"}
          </Badge>
        </Group>
        {menu.source !== "root-table" && (
          <Alert color="yellow" title="Tab identity is unresolved">
            The template has no recognized root table. These groups are valid decoded
            item runs, but they are not claimed as real BIOS tabs.
          </Alert>
        )}
        <Table striped withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Screen</Table.Th>
              <Table.Th>Template offset</Table.Th>
              <Table.Th>Items</Table.Th>
              <Table.Th>Conditional callbacks</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sections.map((section, index) => (
              <Table.Tr key={section.offset}>
                <Table.Td>
                  {section.name ? label(section.name) : `Group ${String(index + 1)}`}
                </Table.Td>
                <Table.Td>0x{section.offset.toString(16).toUpperCase()}</Table.Td>
                <Table.Td>{String(section.items.length)}</Table.Td>
                <Table.Td>
                  {String(
                    section.items.filter(
                      (item) => item.visibilityPatch?.hiddenImmediate,
                    ).length,
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    );
  }
  const section = sections[currentSectionIndex];
  if (!section) return null;
  const callbackCount = section.items.filter(
    (item) => item.visibilityPatch !== null,
  ).length;
  return (
    <Stack gap={0}>
      <Stack gap={4} className={s.visibilitySummary}>
        <Group gap="xs">
          <Text size="sm" fw={600}>
            Selected path:
          </Text>
          <Badge color="grape" variant="light">
            Phoenix Setup
          </Badge>
          <Badge
            color={menu.source === "root-table" ? "green" : "yellow"}
            variant="outline"
          >
            {menu.source === "root-table" ? "Verified tab" : "Inferred group"}
          </Badge>
        </Group>
        <Group gap="xs">
          <Text size="sm" fw={600}>
            This page:
          </Text>
          <Badge color="blue">{String(section.items.length)} items</Badge>
          <Badge color={callbackCount ? "orange" : "gray"}>
            {String(callbackCount)} visibility callbacks
          </Badge>
          <Text size="xs" c="dimmed">
            Template offset 0x{section.offset.toString(16).toUpperCase()}
          </Text>
        </Group>
      </Stack>
      <Table stickyHeader stickyHeaderOffset={150} striped withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Visibility</Table.Th>
            <Table.Th>Available options</Table.Th>
            <Table.Th>Help</Table.Th>
            <Table.Th>Template offset</Table.Th>
            <Table.Th>Behavior</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody className={s.striped}>
          {section.items.map((item) => {
            const state = visibility(item);
            return (
              <Table.Tr key={item.offset} className={s.memoRow}>
                <Table.Td
                  fw={
                    item.type === "generic-text" || item.type === "information"
                      ? 700
                      : undefined
                  }
                >
                  {label(item.prompt)}
                </Table.Td>
                <Table.Td>{typeLabel(item.type)}</Table.Td>
                <Table.Td>
                  <Badge color={state.color} variant="light">
                    {state.label}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {item.options.map((option) => label(option)).join(" · ") || "—"}
                </Table.Td>
                <Table.Td>{label(item.help)}</Table.Td>
                <Table.Td>0x{item.offset.toString(16).toUpperCase()}</Table.Td>
                <Table.Td>
                  {item.visibilityPatch ? (
                    <PhoenixBehaviorDialog templat={templat} item={item} />
                  ) : (
                    "—"
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
