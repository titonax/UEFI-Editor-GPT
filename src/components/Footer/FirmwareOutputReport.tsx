import { Modal, Stack, Table, Text } from "@mantine/core";
import type { AmiFirmwareBuildResult } from "../scripts/amiFirmwareRebuilder";

const hex = (offset: number) => `0x${offset.toString(16).toUpperCase()}`;

export default function FirmwareOutputReport({
  result,
  opened,
  onClose,
}: {
  result: AmiFirmwareBuildResult;
  opened: boolean;
  onClose: () => void;
}) {
  const report = result.spaceReport;
  return (
    <Modal opened={opened} onClose={onClose} title="Verified firmware output" size="xl">
      <Stack gap="sm">
        <Text size="sm">
          {result.fileName}: {result.image.length} bytes, {result.changedByteCount}{" "}
          changed bytes. Complete image reopened and requested edits verified.
        </Text>
        <Text size="sm">
          BIOS region: [{hex(report.biosStart)}, {hex(report.biosEnd)}).{" "}
          {report.preservedOutsideBiosBytes} bytes outside BIOS preserved exactly.
        </Text>
        <Text size="sm">
          Changes confined to these source allocations:{" "}
          {report.affectedRanges
            .map((range) => `[${hex(range.start)}, ${hex(range.end)})`)
            .join(", ")}
          .
        </Text>
        {report.compressedSections.length > 0 ? (
          <Table.ScrollContainer minWidth={650}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Section / buffer</Table.Th>
                  <Table.Th>Compression</Table.Th>
                  <Table.Th>Original bytes</Table.Th>
                  <Table.Th>Rebuilt bytes</Table.Th>
                  <Table.Th>Checked capacity</Table.Th>
                  <Table.Th>Remaining bytes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {report.compressedSections.map((section) => (
                  <Table.Tr
                    key={`${String(section.parentBufferId)}:${String(section.sectionStart)}`}
                  >
                    <Table.Td>
                      {hex(section.sectionStart)} / {section.parentBufferId}
                    </Table.Td>
                    <Table.Td>{section.compression}</Table.Td>
                    <Table.Td>{section.originalPackedBytes}</Table.Td>
                    <Table.Td>{section.rebuiltPackedBytes}</Table.Td>
                    <Table.Td>
                      {section.verifiedCapacityBytes} (
                      {section.capacityBasis === "original-payload"
                        ? "original payload only"
                        : "terminal padding verified"}
                      )
                    </Table.Td>
                    <Table.Td>{section.remainingBytes}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Text size="sm">No compressed sections required rebuilding.</Text>
        )}
        <Text size="sm">
          Remaining bytes apply only to the listed section. They are not global free
          space or permission to relocate modules. Physical flashing has not been tested
          by this check.
        </Text>
      </Stack>
    </Modal>
  );
}
