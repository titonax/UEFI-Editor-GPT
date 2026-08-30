import React from "react";
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  List,
  Progress,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconBinary, IconPlayerPlay, IconUpload } from "@tabler/icons-react";
import {
  formatHexOffset,
  inspectAmiFirmwareImage,
  type AmiFirmwareGeneration,
  type AmiFirmwareImageReport,
  type FirmwareContainer,
} from "../scripts/amiFirmwareImage";
import { extractAmiFirmwareArtifacts } from "../scripts/amiFirmwareExtractor";
import type { PopulatedFiles } from "../FileUploads/fileModel";

const MAX_FIRMWARE_BYTES = 512 * 1024 * 1024;

function offsets(values: number[]) {
  return values.length === 0 ? "Not found" : values.map(formatHexOffset).join(", ");
}

interface BiosImageUploadProps {
  onExtracted: (
    files: PopulatedFiles,
    generation: AmiFirmwareGeneration,
  ) => Promise<void>;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function BiosImageUpload({ onExtracted }: BiosImageUploadProps) {
  const operation = React.useRef(0);
  const [file, setFile] = React.useState<File | null>(null);
  const [report, setReport] = React.useState<AmiFirmwareImageReport | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [stage, setStage] = React.useState("");
  const [error, setError] = React.useState("");

  const startAnalysis = async () => {
    if (!file || !report || report.firmwareVolumes.length === 0) return;
    const currentOperation = operation.current;
    setLoading(true);
    setError("");
    try {
      setStage("Decompressing nested volumes and locating Setup…");
      const artifacts = await extractAmiFirmwareArtifacts(file);
      if (currentOperation !== operation.current) return;
      setStage("Decoding IFR and building the menu tree…");
      const setupFile = new File([artifacts.hii], "setup-ami-aptio.bin");
      const ifrFile = new File([artifacts.ifrText], "setup-ami-aptio.ifr.txt", {
        type: "text/plain",
      });
      const amitseBytes = artifacts.amitse ?? new Uint8Array();
      const setupDataBytes = artifacts.setupData ?? new Uint8Array();
      await onExtracted(
        {
          setupSctContainer: {
            file: setupFile,
            textContent: toHex(artifacts.hii),
            isWrongFile: false,
          },
          setupTxtContainer: {
            file: ifrFile,
            textContent: artifacts.ifrText,
            isWrongFile: false,
          },
          amitseSctContainer: {
            file: new File([amitseBytes], "amitse-ami-aptio.bin"),
            textContent: toHex(amitseBytes),
            isWrongFile: false,
          },
          setupdataBinContainer: {
            file: new File([setupDataBytes], "setupdata-ami-aptio.bin"),
            textContent: toHex(setupDataBytes),
            isWrongFile: false,
          },
        },
        report.generation,
      );
    } catch (reason: unknown) {
      if (currentOperation === operation.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (currentOperation === operation.current) {
        setLoading(false);
        setStage("");
      }
    }
  };

  return (
    <Stack>
      <Group gap="xs">
        <IconBinary />
        <Text fw={700}>Complete AMI UEFI image</Text>
      </Group>
      <FileInput
        leftSection={<IconUpload />}
        size="lg"
        placeholder="Complete BIOS image (.bin/.rom/.cap/.fd/.bio/.u1l)"
        accept=".bin,.rom,.cap,.fd,.bio,.u1l"
        value={file}
        disabled={loading}
        onChange={(selected) => {
          const currentOperation = ++operation.current;
          setFile(selected);
          setReport(null);
          setError("");
          if (selected) {
            if (selected.size > MAX_FIRMWARE_BYTES) {
              setError("The selected firmware exceeds the 512 MiB safety limit.");
              return;
            }
            setLoading(true);
            setStage("Inspecting firmware volumes…");
            void inspectAmiFirmwareImage(selected)
              .then((imageReport) => {
                if (currentOperation !== operation.current) return;
                setReport(imageReport);
              })
              .catch((reason: unknown) => {
                if (currentOperation === operation.current) {
                  setError(reason instanceof Error ? reason.message : String(reason));
                }
              })
              .finally(() => {
                if (currentOperation === operation.current) {
                  setLoading(false);
                  setStage("");
                }
              });
          }
        }}
      />
      {loading && (
        <Stack gap="xs">
          <Progress value={100} animated />
          <Text size="sm">{stage}</Text>
        </Stack>
      )}
      {error && (
        <Alert color="red" title="Firmware analysis failed">
          {error}
        </Alert>
      )}
      {report && (
        <>
          <Alert
            color={
              report.amiAptioCandidate
                ? "green"
                : report.firmwareVolumes.length > 0
                  ? "blue"
                  : "yellow"
            }
            title={detectionLabel(report.generation)}
          >
            {report.amiAptioCandidate
              ? report.generation === "unresolved"
                ? "AMI Aptio structures were found, but the shared IV/V layout does not justify forcing a generation."
                : `The ${report.confidence} detection is based on the evidence listed below.`
              : report.firmwareVolumes.length > 0
                ? "A valid UEFI image was found, but AMI Aptio evidence is still insufficient. Deep analysis can continue safely."
                : "No valid UEFI firmware volumes were found. HII analysis is unavailable for this input."}
          </Alert>
          <Group gap="xs">
            <Badge variant="light">{containerLabel(report.container)}</Badge>
            <Badge
              variant="light"
              color={
                report.confidence === "confirmed"
                  ? "green"
                  : report.confidence === "probable"
                    ? "blue"
                    : "gray"
              }
            >
              {report.confidence} confidence
            </Badge>
          </Group>
          <Table striped withColumnBorders>
            <Table.Tbody>
              <Table.Tr>
                <Table.Th>Image size</Table.Th>
                <Table.Td>{report.size.toLocaleString()} bytes</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>Intel descriptor</Table.Th>
                <Table.Td>
                  {report.intelDescriptor ? "Present" : "Not detected"}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>Firmware volumes</Table.Th>
                <Table.Td>{offsets(report.firmwareVolumes)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>FFS2 / FFS3 volumes</Table.Th>
                <Table.Td>
                  {String(report.ffs2Volumes.length)} /{" "}
                  {String(report.ffs3Volumes.length)}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>Setup FFS</Table.Th>
                <Table.Td>{offsets(report.setupFfs)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>AMITSE FFS</Table.Th>
                <Table.Td>{offsets(report.amitseFfs)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
          {report.evidence.length > 0 && (
            <List size="sm" spacing="xs">
              {report.evidence.map((entry) => (
                <List.Item key={entry.code}>
                  <Text span fw={600}>
                    {entry.summary}:{" "}
                  </Text>
                  <Text span c="dimmed">
                    {entry.detail}
                  </Text>
                </List.Item>
              ))}
            </List>
          )}
          <Button
            size="lg"
            leftSection={<IconPlayerPlay />}
            disabled={loading || report.firmwareVolumes.length === 0}
            onClick={() => void startAnalysis()}
          >
            Start HII analysis
          </Button>
        </>
      )}
    </Stack>
  );
}

function detectionLabel(generation: AmiFirmwareGeneration) {
  if (generation === "aptio-iv") return "AMI Aptio IV profile detected";
  if (generation === "aptio-v") return "AMI Aptio V profile detected";
  return "AMI Aptio — generation unresolved";
}

function containerLabel(container: FirmwareContainer) {
  if (container === "intel-flash") return "Complete Intel flash";
  if (container === "firmware-volume-image") return "Raw firmware volume image";
  if (container === "vendor-image") return "Vendor update image";
  return "Unknown container";
}
