import {
  Accordion,
  Alert,
  Badge,
  Button,
  Divider,
  FileInput,
  Group,
  List,
  NativeSelect,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import {
  IconBinary,
  IconDownload,
  IconPlayerPlay,
  IconPlayerStop,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { saveAs } from "file-saver";
import React from "react";
import { supportedBrands, type FirmwareBrand } from "../scripts/brandKnowledge";
import { firmwareFamilyLabels } from "../scripts/amiFirmwareImage";
import { buildCorpusDashboard } from "../scripts/corpusDashboard";
import {
  corpusRunToCsv,
  createCorpusRunReport,
  summarizeCorpusRun,
} from "../scripts/corpusReport";
import {
  corpusStageLabels,
  corpusStatusLabels,
  type CorpusContextReport,
  type CorpusFileReport,
  type CorpusFileStatus,
  type CorpusProgressStage,
  type CorpusRunReport,
  type CorpusStageStatus,
} from "../scripts/corpusTypes";
import type { CorpusRunnerRequest, CorpusRunnerResponse } from "./protocol";
import CorpusDashboard from "./CorpusDashboard";
import s from "./CorpusRunner.module.css";

interface CorpusWorkerLike {
  onmessage: ((event: MessageEvent<CorpusRunnerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: CorpusRunnerRequest) => void;
  terminate: () => void;
}

export interface CorpusRunnerProps {
  createWorker?: () => CorpusWorkerLike;
}

const stageProgress: Record<CorpusProgressStage, number> = {
  reading: 0.05,
  preflight: 0.15,
  extraction: 0.45,
  hii: 0.65,
  navigation: 0.8,
  editability: 0.92,
  complete: 1,
};

function defaultWorker(): CorpusWorkerLike {
  return new Worker(new URL("./corpusRunnerWorker.ts", import.meta.url), {
    type: "module",
  });
}

function statusColor(status: CorpusFileStatus) {
  if (status === "recognized") return "green";
  if (status === "partial") return "yellow";
  if (status === "unsupported") return "gray";
  return "red";
}

function stageColor(status: CorpusStageStatus) {
  if (status === "passed") return "green";
  if (status === "warning") return "yellow";
  if (status === "failed") return "red";
  if (status === "blocked") return "orange";
  return "gray";
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function generationLabel(file: CorpusFileReport) {
  const value = file.generation.generation;
  if (file.generation.conflict) return "generation conflict";
  if (value === "aptio-iv") return "probable Aptio IV";
  if (value === "aptio-v") return "probable Aptio V";
  return "generation unresolved";
}

function contextTotals(file: CorpusFileReport) {
  return file.contexts.reduce(
    (total, context) => ({
      forms: total.forms + context.hii.formCount,
      refs: total.refs + context.hii.referenceCount,
      hide: total.hide + context.editing.hideAvailable,
      show: total.show + context.editing.showAvailable,
      move: total.move + context.editing.moveAvailable,
      blocked: total.blocked + context.editing.blocked,
    }),
    { forms: 0, refs: 0, hide: 0, show: 0, move: 0, blocked: 0 },
  );
}

function ContextDetails({ context }: { context: CorpusContextReport }) {
  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Badge variant="light">{context.coherence}</Badge>
        <Badge variant="light">{context.layout}</Badge>
        <Badge variant="light" color={context.navigation.resolved ? "green" : "yellow"}>
          {context.navigation.mechanism}
        </Badge>
        <Badge
          variant="light"
          color={context.reconstruction.traceComplete ? "blue" : "orange"}
        >
          provenance {context.reconstruction.traceComplete ? "complete" : "incomplete"}
        </Badge>
      </Group>
      <Text size="sm" fw={600}>
        {context.label}
      </Text>
      {context.warnings.length > 0 && (
        <List size="sm" c="yellow">
          {context.warnings.map((warning) => (
            <List.Item key={warning}>{warning}</List.Item>
          ))}
        </List>
      )}
      <SimpleGrid cols={{ base: 2, sm: 4, lg: 7 }} spacing="xs">
        <Metric label="Forms" value={context.hii.formCount} />
        <Metric label="FormSets" value={context.hii.formSetCount} />
        <Metric label="Refs" value={context.hii.referenceCount} />
        <Metric label="Conditions" value={context.hii.conditions.total} />
        <Metric label="Detached" value={context.hii.detachedFormCount} />
        <Metric label="External refs" value={context.hii.externalReferenceCount} />
        <Metric label="Unresolved refs" value={context.hii.unresolvedReferenceCount} />
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        Root vector: {context.navigation.rootVisibilityStatus} —{" "}
        {context.navigation.rootVisibilityReason}
      </Text>
      <Text size="xs" c="dimmed">
        Single-FormSet navigation: {context.navigation.singleFormSetStatus} —{" "}
        {context.navigation.singleFormSetReason}
      </Text>
      {context.editing.actions.length > 0 && (
        <ScrollArea>
          <Table striped withColumnBorders className={s.detailsTable}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Page</Table.Th>
                <Table.Th>Operation</Table.Th>
                <Table.Th>Availability</Table.Th>
                <Table.Th>Reason</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {context.editing.actions.map((action, index) => (
                <Table.Tr
                  key={`${action.formSetGuid ?? ""}:${action.formId}:${action.kind}:${String(index)}`}
                >
                  <Table.Td>
                    {action.pageName}{" "}
                    <Text span c="dimmed" size="xs">
                      {action.formId}
                    </Text>
                  </Table.Td>
                  <Table.Td>{action.kind}</Table.Td>
                  <Table.Td>
                    <Badge color={action.available ? "green" : "gray"} variant="light">
                      {action.available ? "available" : "blocked"}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{action.reason}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
      <Alert color="gray" title="Full-image output remains blocked">
        {context.reconstruction.blockers.join(" ")}
      </Alert>
    </Stack>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={s.summary}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700}>{value}</Text>
    </div>
  );
}

function FileDetails({ file }: { file: CorpusFileReport }) {
  const brand = file.brand;
  return (
    <Stack gap="md">
      <Text size="xs" c="dimmed" className={s.hash}>
        SHA-256: {file.sha256 || "not calculated"}
      </Text>
      <Group gap="xs">
        <Badge variant="light" color={file.family.conflict ? "orange" : "blue"}>
          {firmwareFamilyLabels[file.family.family]} · {file.family.confidence}
        </Badge>
        <Badge variant="light">{brand.brand ?? "Manufacturer unknown"}</Badge>
        {file.ifrFormat !== "unknown" && (
          <Badge variant="light" color={file.ifrFormat === "uefi" ? "green" : "orange"}>
            {file.ifrFormat} IFR
          </Badge>
        )}
        <Text size="sm">
          {brand.basis} · {String(brand.documentedSamples)} documented sample(s)
        </Text>
        {brand.signals.some((signal) => signal.brand !== brand.brand) && (
          <Badge variant="light" color="orange">
            conflicting brand clues
          </Badge>
        )}
      </Group>
      {brand.signals.length > 0 && (
        <Text size="xs" c="dimmed">
          Evidence:{" "}
          {brand.signals
            .map(
              (signal) =>
                `${signal.brand}: ${signal.detail}${signal.offset === undefined ? "" : ` at 0x${signal.offset.toString(16).toUpperCase()}`}`,
            )
            .join("; ")}
        </Text>
      )}
      {file.family.signals.length > 0 && (
        <Text size="xs" c="dimmed">
          Firmware family evidence:{" "}
          {file.family.signals
            .map(
              (signal) =>
                `${signal.detail}${signal.offset === undefined ? "" : ` at 0x${signal.offset.toString(16).toUpperCase()}`}`,
            )
            .join("; ")}
        </Text>
      )}
      {file.frameworkInventory && (
        <Text size="sm">
          Framework IFR inventory: {String(file.frameworkInventory.formSets)} FormSets,{" "}
          {String(file.frameworkInventory.forms)} forms,{" "}
          {String(file.frameworkInventory.references)} references. Editing requires a
          separate Framework parser.
        </Text>
      )}
      {file.phoenixLegacy && (
        <Stack gap="xs">
          <Text size="sm">
            Phoenix {file.phoenixLegacy.format}:{" "}
            {String(file.phoenixLegacy.modules.length)} modules, including{" "}
            {file.phoenixLegacy.modules
              .filter((item) => /^(SETUP|TEMPLAT|STRINGS)/.test(item.name))
              .map((item) => item.name)
              .join(", ") || "no verified Setup/template/strings"}
            .
          </Text>
          <Text size="xs" c="dimmed">
            {file.phoenixLegacy.modules
              .map(
                (item) =>
                  `${item.name} @ 0x${item.offset.toString(16).toUpperCase()} (${item.compression})`,
              )
              .join(" · ")}
          </Text>
        </Stack>
      )}
      {file.phoenixUefi?.secureCore && (
        <Text size="sm">
          Phoenix SecCore debug provenance: {file.phoenixUefi.debugModules.join(", ")}.
          Setup ownership and editability remain unverified.
        </Text>
      )}
      <Text size="sm">
        {brand.navigationPrior.length > 0
          ? `Navigation lead: ${brand.navigationPrior.map((item) => `${item.mechanism} (${String(item.samples)} verified)`).join(", ")} · ${brand.navigationOutcome}`
          : "No verified navigation pattern for this manufacturer yet."}
      </Text>
      {brand.observedGenerations.length > 0 && (
        <Text size="xs" c="dimmed">
          Documented Aptio generations:{" "}
          {brand.observedGenerations
            .map((item) => `${item.generation} (${String(item.samples)})`)
            .join(", ")}
        </Text>
      )}
      {brand.observedContainers.length > 0 && (
        <Text size="xs" c="dimmed">
          Documented containers:{" "}
          {brand.observedContainers
            .map((item) => `${item.container} (${String(item.samples)})`)
            .join(", ")}
        </Text>
      )}
      {brand.observedLayouts.length > 0 && (
        <Text size="xs" c="dimmed">
          Documented Setup layouts:{" "}
          {brand.observedLayouts
            .map((item) => `${item.layout} (${String(item.samples)})`)
            .join(", ")}
        </Text>
      )}
      <ScrollArea>
        <Table striped withColumnBorders className={s.detailsTable}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Stage</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Detail</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {file.stages.map((stage) => (
              <Table.Tr key={stage.id}>
                <Table.Td>{stage.id}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={stageColor(stage.status)}>
                    {stage.status}
                  </Badge>
                </Table.Td>
                <Table.Td>{stage.detail}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {file.failure && (
        <Alert
          color="red"
          title={`${file.failure.stage}${file.failure.code ? ` · ${file.failure.code}` : ""}`}
        >
          {file.failure.message}
        </Alert>
      )}
      {file.contexts.map((context, index) => (
        <React.Fragment key={context.id}>
          {index > 0 && <Divider />}
          <ContextDetails context={context} />
        </React.Fragment>
      ))}
    </Stack>
  );
}

export default function CorpusRunner({
  createWorker = defaultWorker,
}: CorpusRunnerProps) {
  const worker = React.useRef<CorpusWorkerLike | null>(null);
  const runId = React.useRef(0);
  const collectedResults = React.useRef<CorpusFileReport[]>([]);
  const [files, setFiles] = React.useState<File[]>([]);
  const [declaredBrands, setDeclaredBrands] = React.useState<
    Record<number, FirmwareBrand | undefined>
  >({});
  const [results, setResults] = React.useState<CorpusFileReport[]>([]);
  const [report, setReport] = React.useState<CorpusRunReport | null>(null);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [progressText, setProgressText] = React.useState("");
  const [error, setError] = React.useState("");
  const [cancelled, setCancelled] = React.useState(false);

  React.useEffect(
    () => () => {
      worker.current?.terminate();
    },
    [],
  );

  const finish = React.useCallback((wasCancelled: boolean, selected: number) => {
    setRunning(false);
    setCancelled(wasCancelled);
    setReport(createCorpusRunReport(collectedResults.current, undefined, selected));
    setProgress(wasCancelled ? 0 : 100);
    setProgressText(wasCancelled ? "Analysis cancelled." : "Corpus analysis complete.");
    worker.current?.terminate();
    worker.current = null;
  }, []);

  const start = () => {
    if (files.length === 0 || running) return;
    const currentRunId = runId.current + 1;
    runId.current = currentRunId;
    collectedResults.current = [];
    setResults([]);
    setReport(null);
    setError("");
    setCancelled(false);
    setProgress(0);
    setProgressText("Starting local analysis…");
    setRunning(true);
    const currentWorker = createWorker();
    worker.current = currentWorker;
    currentWorker.onmessage = (event) => {
      const message = event.data;
      if (message.runId !== runId.current) return;
      if (message.type === "progress") {
        const value =
          ((message.fileIndex + stageProgress[message.progress.stage]) /
            message.fileCount) *
          100;
        setProgress(value);
        setProgressText(
          `${message.fileName} · ${corpusStageLabels[message.progress.stage]} · ${message.progress.detail}`,
        );
      } else if (message.type === "result") {
        collectedResults.current = [...collectedResults.current, message.result];
        setResults(collectedResults.current);
        setProgress(((message.fileIndex + 1) / message.fileCount) * 100);
      } else if (message.type === "complete") {
        finish(false, files.length);
      } else if (message.type === "cancelled") {
        finish(true, files.length);
      } else if (message.type === "fatal") {
        setError(message.message);
        finish(true, files.length);
      }
    };
    currentWorker.onerror = (event) => {
      setError(event.message || "The local corpus worker failed.");
      finish(true, files.length);
    };
    currentWorker.postMessage({
      type: "start",
      runId: currentRunId,
      files: files.map((file, index) => ({
        file,
        declaredBrand: declaredBrands[index],
      })),
    });
  };

  const reset = () => {
    worker.current?.terminate();
    worker.current = null;
    setFiles([]);
    setDeclaredBrands({});
    setResults([]);
    setReport(null);
    setRunning(false);
    setProgress(0);
    setProgressText("");
    setError("");
    setCancelled(false);
    collectedResults.current = [];
  };

  const summary = summarizeCorpusRun(results);
  const dashboard = buildCorpusDashboard(results, files.length);

  return (
    <Stack className={s.root} gap="md">
      <Group gap="xs">
        <IconBinary />
        <div>
          <Title order={3}>Local firmware corpus runner</Title>
          <Text size="sm" c="dimmed">
            Batch-measure extraction, HII navigation and safe edit availability.
          </Text>
        </div>
      </Group>
      <Alert color="blue" title="Local-only by design">
        Firmware files stay in this browser. Exported reports contain filenames, SHA-256
        hashes, structural metrics and diagnostic reasons, but no firmware bytes.
      </Alert>
      <FileInput
        leftSection={<IconUpload />}
        size="lg"
        multiple
        clearable
        placeholder="Select multiple BIOS/firmware images"
        value={files}
        disabled={running}
        onChange={(selected) => {
          setFiles(selected);
          setDeclaredBrands({});
          setResults([]);
          setReport(null);
          setError("");
          setCancelled(false);
        }}
      />
      {files.length > 0 && (
        <Stack gap="xs">
          <Text size="sm">
            {String(files.length)} file(s) selected ·{" "}
            {formatBytes(files.reduce((total, file) => total + file.size, 0))} total
          </Text>
          {files.map((selected, index) => (
            <Group key={`${selected.name}:${String(index)}`} gap="sm">
              <Text size="sm" className={s.fileName}>
                {selected.name}
              </Text>
              <NativeSelect
                aria-label={`Manufacturer for ${selected.name}`}
                data={[
                  { value: "", label: "Detect manufacturer" },
                  ...supportedBrands.map((brand) => ({ value: brand, label: brand })),
                ]}
                value={declaredBrands[index] ?? ""}
                disabled={running}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setDeclaredBrands((current) => ({
                    ...current,
                    [index]: value ? (value as FirmwareBrand) : undefined,
                  }));
                  setResults([]);
                  setReport(null);
                }}
              />
            </Group>
          ))}
        </Stack>
      )}
      <Group>
        <Button
          leftSection={<IconPlayerPlay />}
          disabled={files.length === 0 || running}
          onClick={start}
        >
          Run local corpus analysis
        </Button>
        {running && (
          <Button
            color="orange"
            variant="light"
            leftSection={<IconPlayerStop />}
            onClick={() => {
              worker.current?.postMessage({ type: "cancel", runId: runId.current });
              setProgressText(
                "Cancellation requested; finishing the current safe step…",
              );
            }}
          >
            Cancel
          </Button>
        )}
        <Button
          variant="default"
          leftSection={<IconTrash />}
          disabled={running || (files.length === 0 && results.length === 0)}
          onClick={reset}
        >
          Clear
        </Button>
      </Group>
      {(running || progressText) && (
        <Stack gap="xs">
          <Progress value={progress} animated={running} />
          <Text size="sm">{progressText}</Text>
        </Stack>
      )}
      {error && (
        <Alert color="red" title="Corpus runner failed">
          {error}
        </Alert>
      )}
      {cancelled && results.length > 0 && (
        <Alert color="yellow" title="Partial report">
          The run was cancelled. Completed firmware results remain available for export.
        </Alert>
      )}
      {results.length > 0 && (
        <>
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
            <Metric label="Recognized files" value={summary.recognized} />
            <Metric label="Partial files" value={summary.partial} />
            <Metric label="Unsupported files" value={summary.unsupported} />
            <Metric label="Failed files" value={summary.failed} />
          </SimpleGrid>
          <CorpusDashboard dashboard={dashboard} />
          <Group>
            <Button
              variant="default"
              leftSection={<IconDownload />}
              disabled={!report}
              onClick={() => {
                if (!report) return;
                saveAs(
                  new Blob([JSON.stringify(report, null, 2)], {
                    type: "application/json",
                  }),
                  "uefi-editor-corpus-report.json",
                );
              }}
            >
              Export JSON report
            </Button>
            <Button
              variant="default"
              leftSection={<IconDownload />}
              disabled={!report}
              onClick={() => {
                if (!report) return;
                saveAs(
                  new Blob([corpusRunToCsv(report)], { type: "text/csv" }),
                  "uefi-editor-corpus-report.csv",
                );
              }}
            >
              Export CSV summary
            </Button>
          </Group>
          <Accordion variant="separated" multiple>
            {results.map((file, fileIndex) => {
              const totals = contextTotals(file);
              return (
                <Accordion.Item
                  value={`${file.sha256 || file.fileName}:${String(fileIndex)}`}
                  key={`${file.fileName}:${String(fileIndex)}`}
                >
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap">
                      <div className={s.fileName}>
                        <Text fw={600}>{file.fileName}</Text>
                        <Text size="xs" c="dimmed">
                          {formatBytes(file.size)} ·{" "}
                          {firmwareFamilyLabels[file.family.family]} ·{" "}
                          {file.outer.container} · {generationLabel(file)} ·{" "}
                          {String(file.contexts.length)} context(s)
                        </Text>
                      </div>
                      <Group gap="xs" wrap="nowrap">
                        {file.contexts.length > 0 && (
                          <Badge variant="light">
                            {String(totals.forms)} forms · {String(totals.refs)} refs
                          </Badge>
                        )}
                        {totals.hide + totals.show + totals.move > 0 && (
                          <Badge color="blue" variant="light">
                            H {String(totals.hide)} · S {String(totals.show)} · M{" "}
                            {String(totals.move)}
                          </Badge>
                        )}
                        <Badge color={statusColor(file.status)}>
                          {corpusStatusLabels[file.status]}
                        </Badge>
                      </Group>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <FileDetails file={file} />
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        </>
      )}
    </Stack>
  );
}
