import { Stack, Table, Text } from "@mantine/core";
import type { FirmwareImageComparison } from "../scripts/firmwareImageComparison";

const hex = (value: number) => `0x${value.toString(16).toUpperCase()}`;
const bytes = (values: number[]) =>
  values.map((value) => value.toString(16).toUpperCase().padStart(2, "0")).join(" ");
export default function FirmwareImageComparisonView({
  comparison,
}: {
  comparison: FirmwareImageComparison;
}) {
  return (
    <Stack gap="xs">
      <Text fw={600}>Complete-image byte comparison</Text>
      <Text size="sm">
        {comparison.changedByteCount} of {comparison.imageSize} bytes changed;{" "}
        {comparison.unchangedByteCount} unchanged. {comparison.changedRangeCount}{" "}
        contiguous changed ranges.
      </Text>
      <Text size="sm">
        Offsets refer to the complete physical image. Compression, padding and checksum
        repairs can change bytes beyond the edited fields.
      </Text>
      {comparison.changedRangeCount === 0 ? (
        <Text size="sm">Original and rebuilt images are byte-identical.</Text>
      ) : (
        <>
          <Text size="sm">
            Showing {comparison.ranges.length} of {comparison.changedRangeCount} ranges.
            Each byte sample shows at most 16 bytes from the start of its range.
          </Text>
          <Table.ScrollContainer minWidth={650}>
            <Table aria-label="Complete-image changed bytes">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Start / end (exclusive)</Table.Th>
                  <Table.Th>Changed bytes</Table.Th>
                  <Table.Th>Original sample</Table.Th>
                  <Table.Th>Rebuilt sample</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {comparison.ranges.map((range) => (
                  <Table.Tr key={range.start}>
                    <Table.Td>
                      {hex(range.start)} / {hex(range.end)}
                    </Table.Td>
                    <Table.Td>{range.end - range.start}</Table.Td>
                    <Table.Td>
                      <Text size="xs" ff="monospace">
                        {bytes(range.original)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" ff="monospace">
                        {bytes(range.rebuilt)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </Stack>
  );
}
