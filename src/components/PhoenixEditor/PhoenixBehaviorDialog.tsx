import React from "react";
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconRoute } from "@tabler/icons-react";
import {
  analyzePhoenixSetupCallback,
  type PhoenixCallbackAnalysis,
} from "../scripts/behavior/phoenixCallbackAnalysis";
import type { PhoenixSetupItem } from "../scripts/phoenixSetupTable";

function hex(value: number, width = 4) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function instructionBytes(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
    .join(" ")
    .toUpperCase();
}

export default function PhoenixBehaviorDialog({
  templat,
  item,
}: {
  templat: Uint8Array;
  item: PhoenixSetupItem;
}) {
  const [opened, setOpened] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [analysis, setAnalysis] = React.useState<PhoenixCallbackAnalysis | null>(null);
  const [error, setError] = React.useState("");

  const runAnalysis = async () => {
    setOpened(true);
    setLoading(true);
    setError("");
    try {
      setAnalysis(await analyzePhoenixSetupCallback(templat, item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const trace = analysis?.status === "analyzed" ? analysis.trace : null;
  return (
    <>
      <Button
        size="compact-xs"
        variant="light"
        color="grape"
        leftSection={<IconRoute size={13} />}
        onClick={() => void runAnalysis()}
      >
        Trace callback
      </Button>
      <Modal
        opened={opened}
        onClose={() => {
          setOpened(false);
        }}
        title="Phoenix callback behavior"
        size="xl"
        transitionProps={{ duration: 0 }}
      >
        {loading && (
          <Group justify="center" p="xl">
            <Loader size="sm" />
            <Text size="sm">Decoding reachable 16-bit paths…</Text>
          </Group>
        )}
        {error && (
          <Alert color="red" title="Callback analysis failed">
            {error}
          </Alert>
        )}
        {!loading && analysis?.status === "not-applicable" && (
          <Alert color="gray">{analysis.reason}</Alert>
        )}
        {!loading && trace && (
          <Stack gap="sm">
            <Group gap="xs">
              <Badge color="grape">x86 real mode · 16-bit</Badge>
              <Badge color={trace.status === "complete" ? "green" : "yellow"}>
                {trace.status === "complete"
                  ? "Complete static trace"
                  : "Partial trace"}
              </Badge>
              <Badge variant="outline">Entry {hex(trace.entry)}</Badge>
            </Group>
            <Text size="sm">
              Reachable instructions and branches were decoded without executing or
              modifying the firmware. Dynamic hardware and memory inputs will be added
              by the emulation layer.
            </Text>
            <Group gap="xs">
              <Text size="sm" fw={600}>
                Reachable returns:
              </Text>
              {trace.returns.length === 0 && <Badge color="gray">None resolved</Badge>}
              {trace.returns.map((result) => (
                <Badge
                  key={`${String(result.address)}:${String(result.ax)}`}
                  color={
                    result.ax === 0 ? "green" : result.ax === null ? "gray" : "orange"
                  }
                  variant="light"
                >
                  {result.ax === null ? "AX unknown" : `AX=${hex(result.ax)}`}
                </Badge>
              ))}
            </Group>
            {trace.calls.length > 0 && (
              <Alert color="blue" title="External calls discovered">
                {trace.calls.map((address) => hex(address)).join(", ")}. Calls are
                recorded but not entered by this intraprocedural pass.
              </Alert>
            )}
            {trace.limitations.length > 0 && (
              <Alert color="yellow" title="Trace boundaries">
                {trace.limitations.join(" ")}
              </Alert>
            )}
            <ScrollArea h={420} type="always">
              <Table striped withColumnBorders stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Offset</Table.Th>
                    <Table.Th>Bytes</Table.Th>
                    <Table.Th>Instruction</Table.Th>
                    <Table.Th>Next</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {trace.instructions.map((instruction) => (
                    <Table.Tr key={instruction.address}>
                      <Table.Td>{hex(instruction.address)}</Table.Td>
                      <Table.Td>
                        <Code>{instructionBytes(instruction.bytes)}</Code>
                      </Table.Td>
                      <Table.Td>
                        <Code>
                          {instruction.mnemonic}
                          {instruction.operands ? ` ${instruction.operands}` : ""}
                        </Code>
                      </Table.Td>
                      <Table.Td>
                        {trace.edges
                          .filter((edge) => edge.from === instruction.address)
                          .map((edge) => `${edge.kind} → ${hex(edge.to)}`)
                          .join(" · ") || "return / stop"}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        )}
      </Modal>
    </>
  );
}
