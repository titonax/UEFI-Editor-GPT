import { Accordion, Alert, ScrollArea, Stack, Table, Text } from "@mantine/core";
import type { QueueComparison } from "./queueComparison";

export default function QueueComparisonView({
  comparison,
}: {
  comparison: QueueComparison;
}) {
  return (
    <Accordion variant="contained">
      <Accordion.Item value="comparison">
        <Accordion.Control>
          Original / selected plan (
          {comparison.valid ? String(comparison.totalRows) : "unavailable"})
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {comparison.kind === "logical"
                ? "Net changes from the loaded editor state. Structured values are bounded summaries."
                : "Selected patch spans in the extracted module, with hexadecimal source and replacement bytes. These are module-relative offsets."}{" "}
              Only selected operations contribute. This preview does not verify a
              rebuilt firmware image; Apply and Check firmware output are still required
              for full-image download.
            </Text>
            {!comparison.valid ? (
              <Alert color="red">
                Resolve the queue errors to compare a coherent plan.
              </Alert>
            ) : comparison.totalRows === 0 ? (
              <Text>No net changes in the selected plan.</Text>
            ) : (
              <>
                <ScrollArea mah={300}>
                  <Table striped withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Target / field</Table.Th>
                        <Table.Th>Original</Table.Th>
                        <Table.Th>Selected plan</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {comparison.rows.map((row) => (
                        <Table.Tr key={row.key}>
                          <Table.Td>
                            <Text size="sm">{row.target}</Text>
                            <Text
                              size="xs"
                              c="dimmed"
                              style={{ overflowWrap: "anywhere" }}
                            >
                              {row.field}
                            </Text>
                          </Table.Td>
                          <Table.Td
                            style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
                          >
                            {row.before}
                          </Table.Td>
                          <Table.Td
                            style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
                          >
                            {row.after}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
                {comparison.totalRows > comparison.rows.length && (
                  <Text size="xs" c="dimmed">
                    Showing the first {String(comparison.rows.length)} of{" "}
                    {String(comparison.totalRows)} changed fields/spans.
                  </Text>
                )}
              </>
            )}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
