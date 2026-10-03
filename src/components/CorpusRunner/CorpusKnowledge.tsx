import { Badge, Group, List, Stack, Text, Title } from "@mantine/core";
import {
  corpusKnowledgeLabels,
  type CorpusKnowledgeReport,
  type CorpusKnowledgeStatus,
} from "../../knowledge/corpusKnowledge";
import { firmwareCases } from "../../knowledge/cases";
import type {
  FirmwareCaseMatchResult,
  FirmwareStructure,
} from "../../knowledge/schema";

const explanations: Record<CorpusKnowledgeStatus, string> = {
  known:
    "The complete image hash matches a documented sample. Unmeasured fields remain unverified.",
  similar:
    "Measured structures resemble documented cases. This is a lead, not an exact image identity.",
  novel:
    "No documented case matches enough of the measured structure. This is new to this catalogue, not necessarily an unsupported firmware format.",
  "insufficient-evidence":
    "There are not enough comparable measurements to identify a structural lead.",
  conflict:
    "The image identity and measured structure disagree with the catalogue. Review the conflicting fields before drawing conclusions.",
  "not-assessed": "This result has no catalogue assessment.",
};

const fieldLabels: Record<keyof FirmwareStructure | "size", string> = {
  family: "firmware family",
  container: "input container",
  intelDescriptor: "Intel descriptor",
  firmwareVolumeCount: "outer firmware volumes",
  ffs2VolumeCount: "outer FFS2 volumes",
  ffs3VolumeCount: "outer FFS3 volumes",
  outerSetupCount: "outer Setup modules",
  outerAmitseCount: "outer AMITSE modules",
  guidedLzmaSectionCount: "outer LZMA sections",
  formSetCount: "FormSets in this context",
  formCount: "forms in this context",
  layout: "Setup layout",
  navigation: "navigation mechanism",
  legacyModuleCount: "legacy modules",
  size: "input size",
};

export function KnowledgeBadge({ status }: { status: CorpusKnowledgeStatus }) {
  const color =
    status === "known"
      ? "blue"
      : status === "similar"
        ? "cyan"
        : status === "novel"
          ? "violet"
          : status === "conflict"
            ? "orange"
            : "gray";
  return (
    <Badge color={color} variant="light">
      {corpusKnowledgeLabels[status]}
    </Badge>
  );
}

function MatchDetails({ match }: { match: FirmwareCaseMatchResult }) {
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <KnowledgeBadge status={match.status} />
      </Group>
      <Text size="sm">{explanations[match.status]}</Text>
      {match.matches.map((candidate) => {
        const entry = firmwareCases.find((item) => item.id === candidate.caseId);
        return (
          <Stack key={candidate.caseId} gap={4}>
            <Text size="sm" fw={600}>
              {entry?.label ?? candidate.caseId}
            </Text>
            <Text size="xs" c="dimmed">
              {candidate.basis === "exact-sha256"
                ? "Exact SHA-256"
                : "Structural similarity"}
              {candidate.matchedFields.length > 0 &&
                ` · Matches: ${candidate.matchedFields.map((field) => fieldLabels[field]).join(", ")}`}
            </Text>
            {candidate.missingFields.length > 0 && (
              <Text size="xs" c="dimmed">
                Not measured:{" "}
                {candidate.missingFields.map((field) => fieldLabels[field]).join(", ")}
              </Text>
            )}
            {candidate.conflictingFields.length > 0 && (
              <Text size="sm" c="orange">
                Conflicts:{" "}
                {candidate.conflictingFields
                  .map((field) => fieldLabels[field])
                  .join(", ")}
              </Text>
            )}
            {entry && (
              <List size="xs" c="dimmed">
                {entry.limitations.map((limitation) => (
                  <List.Item key={limitation}>{limitation}</List.Item>
                ))}
              </List>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

export default function CorpusKnowledge({
  knowledge,
}: {
  knowledge?: CorpusKnowledgeReport;
}) {
  return (
    <Stack gap="sm">
      <Title order={5}>Case catalogue comparison</Title>
      {knowledge ? (
        <>
          <MatchDetails match={knowledge.match} />
          {knowledge.contexts.length > 1 && (
            <>
              <Text size="sm" fw={600}>
                Separate Setup contexts
              </Text>
              <Text size="xs" c="dimmed">
                The complete image hash identifies the file; context comparisons use
                their own structure. Form counts are never added across slots.
              </Text>
              {knowledge.contexts.map((context) => (
                <Stack key={context.contextId} gap="xs">
                  <Text size="sm">{context.contextId}</Text>
                  <MatchDetails match={context.match} />
                </Stack>
              ))}
            </>
          )}
        </>
      ) : (
        <Text size="sm">{explanations["not-assessed"]}</Text>
      )}
      <Text size="xs" c="dimmed">
        Catalogue matches do not enable editing or full-image output. The analysis
        stages and blockers below describe this input's actual capabilities.
      </Text>
    </Stack>
  );
}
