import React from "react";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  List,
  NativeSelect,
  Progress,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconBinary, IconPlayerPlay, IconUpload } from "@tabler/icons-react";
import {
  classifyBrand,
  supportedBrands,
  type FirmwareBrand,
} from "../scripts/brandKnowledge";
import { sha256Hex } from "../scripts/checksum";
import {
  formatHexOffset,
  firmwareFamilyLabels,
  frameworkIfrInventory,
  ifrExtractionMode,
  inspectAmiFirmwareBytes,
  inspectAmiSetupProfile,
  reconcileAmiGeneration,
  withParsedAmiContext,
  type AmiFirmwareImageReport,
  type AmiGenerationAssessment,
  type AmiSetupLayout,
  type AmiSetupProfileReport,
  type FirmwareContainer,
} from "../scripts/amiFirmwareImage";
import {
  extractAmiFirmwareBytes,
  type AmiFirmwareArtifacts,
} from "../scripts/amiFirmwareExtractor";
import { assessFirmwareReconstruction } from "../scripts/firmwareProvenance";
import {
  inspectPhoenixSetupMenu,
  type PhoenixSetupInventory,
} from "../scripts/phoenixSetupMenu";
import type { PopulatedFiles } from "../firmwareFiles";
import PhoenixSetupMenuPanel from "./PhoenixSetupMenuPanel";

const MAX_FIRMWARE_BYTES = 512 * 1024 * 1024;

function offsets(values: number[]) {
  return values.length === 0 ? "Not found" : values.map(formatHexOffset).join(", ");
}

function outerModuleOffsets(values: number[]) {
  return values.length === 0
    ? "Not visible before deep scan"
    : values.map(formatHexOffset).join(", ");
}

interface BiosImageUploadProps {
  onExtracted: (files: PopulatedFiles) => Promise<void>;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) =>
    byte.toString(16).toUpperCase().padStart(2, "0"),
  ).join("");
}

export default function BiosImageUpload({ onExtracted }: BiosImageUploadProps) {
  const operation = React.useRef(0);
  const firmwareBytes = React.useRef<Uint8Array | null>(null);
  const artifactCache = React.useRef(new Map<string, AmiFirmwareArtifacts>());
  const [file, setFile] = React.useState<File | null>(null);
  const [imageHash, setImageHash] = React.useState("");
  const [declaredBrand, setDeclaredBrand] = React.useState<FirmwareBrand | undefined>();
  const [report, setReport] = React.useState<AmiFirmwareImageReport | null>(null);
  const [artifacts, setArtifacts] = React.useState<AmiFirmwareArtifacts | null>(null);
  const [profile, setProfile] = React.useState<AmiSetupProfileReport | null>(null);
  const [phoenixMenu, setPhoenixMenu] = React.useState<PhoenixSetupInventory | null>(
    null,
  );
  const [selectedArtifactSetId, setSelectedArtifactSetId] = React.useState<
    string | null
  >(null);
  const [loading, setLoading] = React.useState(false);
  const [stage, setStage] = React.useState("");
  const [error, setError] = React.useState("");

  const startAnalysis = async () => {
    if (!artifacts || !selectedArtifactSetId) return;
    const currentOperation = operation.current;
    setLoading(true);
    setError("");
    try {
      setStage("Decoding IFR and building the menu tree…");
      const setupFile = new File([artifacts.hii], "setup-ami-aptio.bin");
      const ifrFile = new File([artifacts.ifrText], "setup-ami-aptio.ifr.txt", {
        type: "text/plain",
      });
      const amitseBytes = artifacts.amitse ?? new Uint8Array();
      const setupDataBytes = artifacts.setupData ?? new Uint8Array();
      await onExtracted({
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
        firmwareSource: {
          fileName: file?.name ?? "firmware.bin",
          artifacts,
        },
      });
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

  const inspectFirmware = async (selected: File | null) => {
    const currentOperation = ++operation.current;
    setFile(selected);
    setImageHash("");
    setDeclaredBrand(undefined);
    setReport(null);
    setArtifacts(null);
    setProfile(null);
    setPhoenixMenu(null);
    setSelectedArtifactSetId(null);
    firmwareBytes.current = null;
    artifactCache.current.clear();
    setError("");
    if (!selected) return;
    if (selected.size > MAX_FIRMWARE_BYTES) {
      setError("The selected firmware exceeds the 512 MiB safety limit.");
      return;
    }

    setLoading(true);
    try {
      setStage("Reading the firmware locally…");
      const image = new Uint8Array(await selected.arrayBuffer());
      if (currentOperation !== operation.current) return;
      firmwareBytes.current = image;

      setStage("Validating firmware volumes and the outer container…");
      const imageReport = inspectAmiFirmwareBytes(image);
      if (currentOperation !== operation.current) return;
      setReport(imageReport);
      setImageHash(await sha256Hex(image));
      if (currentOperation !== operation.current) return;
      let classified = imageReport;
      if (
        !imageReport.amiAptioCandidate &&
        ["phoenix", "phoenix-uefi", "unidentified", "uefi-unidentified"].includes(
          imageReport.family.family,
        )
      ) {
        setStage("Locating Phoenix Setup template and strings…");
        const inventory = await inspectPhoenixSetupMenu(image);
        if (currentOperation !== operation.current) return;
        // The module pair alone is insufficient: require resolved Setup text
        // before attributing an otherwise unidentified image to Phoenix.
        if (
          inventory?.menu.sections.some((section) =>
            section.items.some((item) => item.prompt !== null),
          )
        ) {
          setPhoenixMenu(inventory);
          if (
            imageReport.family.family === "unidentified" ||
            imageReport.family.family === "uefi-unidentified"
          ) {
            classified = {
              ...imageReport,
              container: "phoenix-rom",
              family: {
                family: "phoenix",
                confidence: "confirmed",
                conflict: false,
                signals: [
                  ...imageReport.family.signals,
                  {
                    code: "phoenix-setup-table",
                    detail: "Decoded a Phoenix TEMPLAT/STRINGS Setup table.",
                  },
                ],
              },
            };
            setReport(classified);
          }
        }
      }
      if (classified.firmwareVolumes.length === 0) return;
      // An unresolved UEFI image may hide AMI Setup in a nested volume.
      // A positively identified other family only needs the AMI scan when
      // there is competing AMI evidence in this very image.
      if (
        !classified.amiAptioCandidate &&
        classified.family.family !== "uefi-unidentified" &&
        classified.family.family !== "unidentified" &&
        !classified.family.conflict
      )
        return;

      setStage("Decompressing nested volumes and locating AMI Setup data…");
      const extracted = await extractAmiFirmwareBytes(image);
      if (currentOperation !== operation.current) return;

      setStage("Inspecting $SPF and the HII Forms layout…");
      const setupProfile = inspectAmiSetupProfile(extracted.hii, extracted.setupData);
      if (currentOperation !== operation.current) return;
      setArtifacts(extracted);
      setProfile(setupProfile);
      artifactCache.current.set(extracted.selectedArtifactSetId, extracted);
      setSelectedArtifactSetId(
        extracted.artifactSets.length === 1 ? extracted.selectedArtifactSetId : null,
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

  const selectArtifactSet = async (artifactSetId: string | null) => {
    if (!artifactSetId || !firmwareBytes.current) return;
    if (artifacts?.selectedArtifactSetId === artifactSetId) {
      setSelectedArtifactSetId(artifactSetId);
      return;
    }
    const currentOperation = operation.current;
    setLoading(true);
    setError("");
    try {
      setStage("Loading the selected firmware context…");
      const cached = artifactCache.current.get(artifactSetId);
      const extracted =
        cached ??
        (await extractAmiFirmwareBytes(firmwareBytes.current, undefined, {
          artifactSetId,
        }));
      if (currentOperation !== operation.current) return;
      const setupProfile = inspectAmiSetupProfile(extracted.hii, extracted.setupData);
      artifactCache.current.set(artifactSetId, extracted);
      setArtifacts(extracted);
      setProfile(setupProfile);
      setSelectedArtifactSetId(artifactSetId);
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

  const assessment: AmiGenerationAssessment = report
    ? reconcileAmiGeneration(report, profile)
    : { generation: "unresolved", confidence: "unresolved", conflict: false };
  const family = report
    ? artifacts
      ? withParsedAmiContext(report.family)
      : report.family
    : null;
  const showAmiPanel = Boolean(
    artifacts !== null ||
    family?.family === "ami-aptio" ||
    family?.family === "uefi-unidentified" ||
    (report?.firmwareVolumes.length &&
      (family?.family === "unidentified" || family?.conflict)),
  );
  const brand =
    report && file
      ? classifyBrand(file.name, imageHash, report.brandMarkers, declaredBrand)
      : null;
  const evidence = report
    ? [
        ...report.evidence.filter(
          (entry) => entry.code !== "spf-profile" || !profile?.spfPresent,
        ),
        ...(profile?.evidence ?? []),
      ]
    : [];
  const reconstruction = artifacts
    ? assessFirmwareReconstruction(artifacts.provenance)
    : null;
  const ifrMode = artifacts ? ifrExtractionMode(artifacts.ifrText) : "unknown";
  const frameworkInventory =
    ifrMode === "framework" && artifacts
      ? frameworkIfrInventory(artifacts.ifrText)
      : null;
  const selectedArtifactSet = artifacts?.artifactSets.find(
    (candidate) => candidate.id === artifacts.selectedArtifactSetId,
  );

  return (
    <Stack>
      <Group gap="xs">
        <IconBinary />
        <Text fw={700}>Complete BIOS / firmware image</Text>
      </Group>
      <FileInput
        leftSection={<IconUpload />}
        size="lg"
        placeholder="Complete BIOS/firmware image (any filename extension)"
        value={file}
        disabled={loading}
        onChange={(selected) => void inspectFirmware(selected)}
      />
      {file && (
        <NativeSelect
          label="Manufacturer (optional)"
          description="Select it when the firmware does not identify its manufacturer."
          data={[
            { value: "", label: "Detect manufacturer" },
            ...supportedBrands.map((name) => ({ value: name, label: name })),
          ]}
          value={declaredBrand ?? ""}
          onChange={(event) => {
            setDeclaredBrand(
              event.currentTarget.value
                ? (event.currentTarget.value as FirmwareBrand)
                : undefined,
            );
          }}
        />
      )}
      <Text size="xs" c="dimmed">
        Local-only analysis: the firmware stays in this browser and is never uploaded.
      </Text>
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
            title={
              family?.family === "ami-aptio"
                ? detectionLabel(assessment.generation, assessment.conflict)
                : firmwareFamilyLabels[family?.family ?? "unidentified"]
            }
          >
            {!showAmiPanel
              ? phoenixMenu
                ? "Phoenix Setup screens and items are decoded below. Full-image writing is not available."
                : report.phoenixLegacy
                  ? "Phoenix modules are inventoried below. This image did not yield a readable Setup menu."
                  : "The detected family and its evidence are shown below. AMI Aptio fields do not apply to this image."
              : assessment.conflict
                ? "Outer metadata and the extracted HII layout disagree. The application will not force a generation."
                : profile
                  ? assessment.generation === "unresolved"
                    ? "AMI Aptio structures were found, but the shared IV/V layout does not justify forcing a generation."
                    : "The generation is a corpus-backed profile match, not a vendor declaration. It does not unlock a generation-specific write path."
                  : report.phoenixLegacy
                    ? "Phoenix 4.0 module directory recognized. Setup, template and strings modules are inventoried below; Phoenix menu editing is not yet available."
                    : report.phoenixUefi?.secureCore && !report.amiAptioCandidate
                      ? "Phoenix SecCore module provenance was found in UEFI firmware. The Setup implementation still needs its own verified parser."
                      : family?.family !== "ami-aptio" &&
                          report.firmwareVolumes.length === 0
                        ? "No validated UEFI firmware volume was found; the family is based on the evidence shown below. AMI HII analysis is unavailable."
                        : report.amiAptioCandidate
                          ? "AMI Aptio evidence was found. The local deep scan is needed before assigning a probable generation."
                          : report.firmwareVolumes.length > 0
                            ? "A valid UEFI image was found, but AMI Aptio evidence is still insufficient. Deep analysis can continue safely."
                            : "No valid UEFI firmware volumes were found. HII analysis is unavailable for this input."}
          </Alert>
          <Group gap="xs">
            {family && (
              <Badge variant="light" color={family.conflict ? "orange" : "blue"}>
                {firmwareFamilyLabels[family.family]} · {family.confidence}
              </Badge>
            )}
            <Badge variant="light">{containerLabel(report.container)}</Badge>
            {brand && (
              <Badge variant="light" color={brand.brand ? "blue" : "gray"}>
                {brand.brand ?? "manufacturer unknown"} · {brand.basis}
              </Badge>
            )}
            {showAmiPanel && (
              <Badge
                variant="light"
                color={
                  assessment.confidence === "confirmed"
                    ? "green"
                    : assessment.confidence === "probable"
                      ? "blue"
                      : "gray"
                }
              >
                {assessment.confidence} confidence
              </Badge>
            )}
            {showAmiPanel && assessment.conflict && (
              <Badge variant="light" color="orange">
                conflicting evidence
              </Badge>
            )}
            {artifacts && <Badge variant="light">local deep scan complete</Badge>}
            {reconstruction && (
              <Badge
                variant="light"
                color={reconstruction.traceComplete ? "gray" : "orange"}
              >
                {reconstruction.traceComplete
                  ? "reconstruction provenance captured"
                  : "incomplete reconstruction provenance"}
              </Badge>
            )}
          </Group>
          <Table striped withColumnBorders>
            <Table.Tbody>
              {family && (
                <Table.Tr>
                  <Table.Th>Firmware family evidence</Table.Th>
                  <Table.Td>
                    {family.signals.length > 0
                      ? family.signals
                          .map(
                            (signal) =>
                              `${signal.detail}${signal.offset === undefined ? "" : ` at ${formatHexOffset(signal.offset)}`}`,
                          )
                          .join("; ")
                      : "No vendor-specific signature verified"}
                    {family.conflict ? " · competing vendor evidence" : ""}
                  </Table.Td>
                </Table.Tr>
              )}
              <Table.Tr>
                <Table.Th>Image size</Table.Th>
                <Table.Td>{report.size.toLocaleString()} bytes</Table.Td>
              </Table.Tr>
              {brand && showAmiPanel && (
                <Table.Tr>
                  <Table.Th>Manufacturer lead</Table.Th>
                  <Table.Td>
                    {String(brand.documentedSamples)} documented sample(s) ·{" "}
                    {brand.observedGenerations.length > 0
                      ? `${brand.observedGenerations.map((item) => `${item.generation} (${String(item.samples)})`).join(", ")} · `
                      : ""}
                    {brand.observedContainers.length > 0
                      ? `${brand.observedContainers.map((item) => `${item.container} (${String(item.samples)})`).join(", ")} · `
                      : ""}
                    {brand.observedLayouts.length > 0
                      ? `${brand.observedLayouts.map((item) => `${item.layout} (${String(item.samples)})`).join(", ")} · `
                      : ""}
                    {brand.navigationPrior.length > 0
                      ? brand.navigationPrior
                          .map(
                            (item) =>
                              `${item.mechanism} (${String(item.samples)} verified)`,
                          )
                          .join(", ")
                      : "no verified navigation pattern yet"}
                    {brand.signals.some((signal) => signal.brand !== brand.brand)
                      ? " · conflicting brand clues"
                      : ""}
                  </Table.Td>
                </Table.Tr>
              )}
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
              {showAmiPanel && (
                <>
                  <Table.Tr>
                    <Table.Th>FFS2 / FFS3 volumes</Table.Th>
                    <Table.Td>
                      {String(report.ffs2Volumes.length)} /{" "}
                      {String(report.ffs3Volumes.length)}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>Setup FFS (outer image)</Table.Th>
                    <Table.Td>{outerModuleOffsets(report.setupFfs)}</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>AMITSE FFS (outer image)</Table.Th>
                    <Table.Td>{outerModuleOffsets(report.amitseFfs)}</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>LZMA GUID-defined sections</Table.Th>
                    <Table.Td>{offsets(report.guidedLzmaSections)}</Table.Td>
                  </Table.Tr>
                </>
              )}
              {artifacts && profile && (
                <>
                  <Table.Tr>
                    <Table.Th>Extracted AMI modules</Table.Th>
                    <Table.Td>
                      Setup HII ({artifacts.hii.length.toLocaleString()} bytes) · AMITSE{" "}
                      {artifacts.amitse ? "found" : "not found"} · SetupData{" "}
                      {artifacts.setupData ? "found" : "not found"}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>Firmware contexts</Table.Th>
                    <Table.Td>
                      {String(artifacts.artifactSets.length)} coherent Setup set
                      {artifacts.artifactSets.length === 1 ? "" : "s"}
                    </Table.Td>
                  </Table.Tr>
                  {selectedArtifactSet && (
                    <Table.Tr>
                      <Table.Th>Previewed context</Table.Th>
                      <Table.Td>
                        {selectedArtifactSet.label} ·{" "}
                        {coherenceLabel(selectedArtifactSet.coherence)}
                      </Table.Td>
                    </Table.Tr>
                  )}
                  <Table.Tr>
                    <Table.Th>$SPF SetupData</Table.Th>
                    <Table.Td>{spfLabel(profile)}</Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>HII Forms layout</Table.Th>
                    <Table.Td>
                      {String(profile.formPackageCount)} package(s) ·{" "}
                      {String(profile.formSetGuids.length)} FormSet GUID(s) ·{" "}
                      {layoutLabel(profile.layout)}
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Th>Extraction depth</Table.Th>
                    <Table.Td>
                      {artifacts.extractionDepth === 0
                        ? "Outer firmware volume"
                        : `${String(artifacts.extractionDepth)} nested layer(s)`}
                    </Table.Td>
                  </Table.Tr>
                  {reconstruction && (
                    <Table.Tr>
                      <Table.Th>Reconstruction trace</Table.Th>
                      <Table.Td>
                        {reconstruction.traceComplete ? "Complete" : "Incomplete"}
                        {reconstruction.compressions.length > 0
                          ? ` · ${reconstruction.compressions
                              .map(compressionName)
                              .join(" / ")}`
                          : " · no encapsulation"}
                      </Table.Td>
                    </Table.Tr>
                  )}
                </>
              )}
            </Table.Tbody>
          </Table>
          {showAmiPanel &&
            report.amiAptioCandidate &&
            report.deepScanRequired &&
            !profile && (
              <Alert color="blue" title="Nested firmware requires HII analysis">
                Setup or AMITSE is not visible in the outer byte stream. The local
                preflight is decompressing nested firmware before deciding that a module
                is absent.
              </Alert>
            )}
          {artifacts && artifacts.artifactSets.length > 1 && (
            <Alert color="orange" title="Multiple firmware contexts detected">
              <Stack gap="xs">
                <Text size="sm">
                  This image contains repeated AMI Setup modules in separate decoded
                  buffers or firmware volumes. Choose the context to analyse; Setup,
                  AMITSE and SetupData will never be mixed across equally plausible
                  slots.
                </Text>
                <NativeSelect
                  label="Firmware context / slot"
                  data={[
                    {
                      value: "",
                      label: "Choose one context",
                      disabled: true,
                    },
                    ...artifacts.artifactSets.map((candidate) => ({
                      value: candidate.id,
                      label: candidate.label,
                    })),
                  ]}
                  value={selectedArtifactSetId ?? ""}
                  disabled={loading}
                  onChange={(event) =>
                    void selectArtifactSet(event.currentTarget.value || null)
                  }
                />
              </Stack>
            </Alert>
          )}
          {selectedArtifactSet && selectedArtifactSet.warnings.length > 0 && (
            <Alert color="yellow" title="Firmware context caveats">
              <List size="sm" spacing="xs">
                {selectedArtifactSet.warnings.map((warning) => (
                  <List.Item key={warning}>{warning}</List.Item>
                ))}
              </List>
            </Alert>
          )}
          {frameworkInventory && (
            <Alert color="orange" title="Framework IFR detected">
              Found {String(frameworkInventory.formSets)} FormSets,{" "}
              {String(frameworkInventory.forms)} forms and{" "}
              {String(frameworkInventory.references)} references in the AMI Setup
              payload. This editor requires UEFI HII packages to build and validate edit
              plans for this image.
            </Alert>
          )}
          {report.phoenixLegacy && (
            <Alert color="blue" title="Phoenix 4.0 module inventory">
              <Text size="sm">
                {report.phoenixLegacy.buildCode || "Unknown build"} ·{" "}
                {report.phoenixLegacy.buildDate || "undated"} ·{" "}
                {String(report.phoenixLegacy.modules.length)} modules ·{" "}
                {String(report.phoenixLegacy.volumeCount)} directory entries. Setup,
                template and strings are separate modules; menu interpretation and
                firmware writing require further validation.
              </Text>
              <Accordion variant="contained" mt="sm">
                <Accordion.Item value="modules">
                  <Accordion.Control>Inspect modules and offsets</Accordion.Control>
                  <Accordion.Panel>
                    <List size="sm">
                      {report.phoenixLegacy.modules.map((module) => (
                        <List.Item key={`${module.name}:${String(module.offset)}`}>
                          {module.name} · {formatHexOffset(module.offset)} ·{" "}
                          {String(module.size)} bytes · {module.compression}
                          {module.unpackedSize
                            ? ` → ${String(module.unpackedSize)} bytes`
                            : ""}
                        </List.Item>
                      ))}
                    </List>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
              {report.phoenixLegacy.warnings.length > 0 && (
                <Text size="xs" mt="xs">
                  {report.phoenixLegacy.warnings.join(" ")}
                </Text>
              )}
            </Alert>
          )}
          {report.phoenixUefi?.secureCore && (
            <Alert color="blue" title="Phoenix UEFI module provenance">
              Phoenix SecCore and {String(report.phoenixUefi.debugModules.length - 1)}{" "}
              other module name(s) were found in debug records:{" "}
              {report.phoenixUefi.debugModules.join(", ")}.{" "}
              {family?.conflict
                ? "Another vendor string is also present; Setup ownership remains unresolved."
                : "Setup ownership is not yet verified."}
            </Alert>
          )}
          {phoenixMenu && <PhoenixSetupMenuPanel menu={phoenixMenu.menu} />}
          {evidence.length > 0 && (
            <List size="sm" spacing="xs">
              {evidence.map((entry) => (
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
          {reconstruction && (
            <Alert
              color={reconstruction.traceComplete ? "gray" : "orange"}
              title={
                reconstruction.traceComplete
                  ? "Full-image reconstruction — trace captured"
                  : "Full-image reconstruction — not traceable"
              }
            >
              <Stack gap="xs">
                {reconstruction.traces.map((trace) => (
                  <Text size="sm" key={trace.kind}>
                    {trace.labels.join(" → ")}
                  </Text>
                ))}
                <Text size="xs" c="dimmed">
                  Writing remains disabled: {reconstruction.blockers.join(" ")}
                </Text>
              </Stack>
            </Alert>
          )}
          {showAmiPanel && (
            <Button
              size="lg"
              leftSection={<IconPlayerPlay />}
              disabled={
                loading ||
                !artifacts ||
                !profile ||
                selectedArtifactSetId === null ||
                ifrMode === "framework"
              }
              onClick={() => void startAnalysis()}
            >
              Start HII analysis
            </Button>
          )}
        </>
      )}
    </Stack>
  );
}

function detectionLabel(
  generation: AmiSetupProfileReport["generation"],
  conflict: boolean,
) {
  if (conflict) return "AMI Aptio — generation signals conflict";
  if (generation === "aptio-iv") return "AMI Aptio IV — probable HII profile";
  if (generation === "aptio-v") return "AMI Aptio V — probable HII profile";
  return "AMI Aptio — generation unresolved";
}

function layoutLabel(layout: AmiSetupLayout) {
  if (layout === "split-form-packages") return "split legacy profile";
  if (layout === "unified-setup-formset") return "unified Setup profile";
  return "unresolved profile";
}

function spfLabel(profile: AmiSetupProfileReport) {
  if (!profile.spfPresent) return "Not found";
  const fields = [
    profile.spfField04 === null
      ? null
      : `field +0x04 ${formatProfileValue(profile.spfField04)}`,
    profile.spfField08 === null
      ? null
      : `field +0x08 ${formatProfileValue(profile.spfField08)}`,
  ].filter(Boolean);
  return fields.length === 0 ? "Found" : `Found · ${fields.join(" · ")}`;
}

function formatProfileValue(value: number) {
  return `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

function compressionName(compression: "none" | "standard" | "lzma") {
  if (compression === "lzma") return "LZMA";
  if (compression === "standard") return "EFI/Tiano";
  return "uncompressed wrapper";
}

function coherenceLabel(
  coherence: NonNullable<AmiFirmwareArtifacts["artifactSets"]>[number]["coherence"],
) {
  if (coherence === "same-firmware-volume") return "same firmware volume";
  if (coherence === "same-decoded-buffer") return "same decoded buffer";
  if (coherence === "shared-encapsulation-branch") {
    return "shared encapsulation branch";
  }
  return "Setup only";
}

function containerLabel(container: FirmwareContainer) {
  if (container === "intel-flash") return "Complete Intel flash";
  if (container === "phoenix-rom") return "Phoenix module ROM";
  if (container === "firmware-volume-image") return "Raw firmware volume image";
  if (container === "vendor-image") return "Vendor update image";
  return "Unknown container";
}
