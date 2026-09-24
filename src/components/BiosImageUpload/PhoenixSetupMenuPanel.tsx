import React from "react";
import {
  Alert,
  Badge,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import type { PhoenixSetupItem, PhoenixSetupMenu } from "../scripts/phoenixSetupTable";

function itemType(type: PhoenixSetupItem["type"]) {
  const labels: Record<PhoenixSetupItem["type"], string> = {
    "pick-field": "Selection",
    "generic-text": "Text",
    information: "Submenu",
    time: "Time",
    date: "Date",
    action: "Action",
    "boot-device-slot": "Boot device",
    "free-form-hex": "Hex",
  };
  return labels[type];
}

function display(value: string | null) {
  const text = value?.replace(/\r/g, " ").trim();
  if (!text) return "—";
  return text;
}

export default function PhoenixSetupMenuPanel({ menu }: { menu: PhoenixSetupMenu }) {
  const sections = menu.sections.filter((section) => section.items.length > 0);
  const [selectedOffset, setSelectedOffset] = React.useState<number | null>(
    sections[0]?.offset ?? null,
  );
  const selected =
    sections.find((section) => section.offset === selectedOffset) ?? sections[0];
  if (!selected) return null;
  const realTabs = menu.source === "root-table";
  const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Badge variant="light" color="grape">
          Phoenix Setup · {String(sections.length)} screens · {String(totalItems)} items
        </Badge>
        <Badge variant="light" color={realTabs ? "teal" : "yellow"}>
          {realTabs ? "Verified tab table" : "Inferred item groups"}
        </Badge>
      </Group>
      {!realTabs && (
        <Alert color="yellow">
          This image has no recognized root tab table. The groups below are contiguous
          item runs; their names and membership are not verified Setup tabs.
        </Alert>
      )}
      <Group align="flex-start" gap="md" wrap="wrap">
        <ScrollArea.Autosize mah={480} miw={210} maw={240}>
          <Stack gap={2}>
            {sections.map((section, index) => (
              <NavLink
                key={section.offset}
                label={
                  section.name ? display(section.name) : `Group ${String(index + 1)}`
                }
                description={`${String(section.items.length)} items`}
                active={section.offset === selected.offset}
                onClick={() => {
                  setSelectedOffset(section.offset);
                }}
                variant="light"
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
        <ScrollArea.Autosize mah={480} style={{ flex: 1, minWidth: 260 }}>
          <Table striped withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Type</Table.Th>
                <Table.Th>Prompt</Table.Th>
                <Table.Th>Help</Table.Th>
                <Table.Th>Available options</Table.Th>
                <Table.Th>Visibility evidence</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {selected.items.map((item) => (
                <Table.Tr key={item.offset}>
                  <Table.Td>{itemType(item.type)}</Table.Td>
                  <Table.Td
                    fw={
                      item.type === "generic-text" || item.type === "information"
                        ? 700
                        : undefined
                    }
                  >
                    {display(item.prompt)}
                  </Table.Td>
                  <Table.Td>{display(item.help)}</Table.Td>
                  <Table.Td>{item.options.map(display).join(" · ") || "—"}</Table.Td>
                  <Table.Td>
                    {item.visibilityPatch
                      ? item.visibilityPatch.hiddenImmediate === 0
                        ? "Callback hide path neutralized"
                        : "Conditional callback found"
                      : "No verified callback"}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      </Group>
      <Text size="xs" c="dimmed">
        Options are listed from the firmware template. The currently selected value
        lives in runtime settings and cannot be read from this image. Conditional
        visibility depends on firmware execution.
      </Text>
    </Stack>
  );
}
