import { describe, expect, it } from "vitest";
import { planAmiRootVisibilityPatches } from "./amiRootVisibilityPatcher";
import { toggleAmiRootVisibility } from "./amiRootVisibilityEditing";
import type { AmiRootVisibilityReport } from "./types";
import type { FirmwareProvenanceGraph } from "./firmwareProvenance";

function fixture() {
  const graph: FirmwareProvenanceGraph = {
    rootBufferId: 0,
    sourceSize: 16,
    buffers: [
      {
        id: 0,
        depth: 0,
        bytes: Uint8Array.from([1, 1, ...new Array<number>(14).fill(0)]),
      },
    ],
    artifacts: [],
  };
  const report: AmiRootVisibilityReport = {
    status: "detected",
    mechanism: "setup-pe32-root-byte-vector",
    confidence: "corroborated",
    reason: "Synthetic corroborated report",
    vector: {
      bufferId: 0,
      offset: 0,
      length: 2,
      codeReferenceOffset: 8,
      pageTableOffset: 12,
      countEvidence: "immediate",
    },
    entries: [0, 1].map((rootIndex) => ({
      rootIndex,
      name: `Root ${String(rootIndex)}`,
      formId: `0x${String(rootIndex)}`,
      formSetGuid: `guid-${String(rootIndex)}`,
      value: 1,
      visible: true,
      bufferOffset: rootIndex,
    })),
  };
  const edits = toggleAmiRootVisibility({ rootVisibility: report }, 0);
  if (!edits) throw new Error("Expected a pending root edit.");
  return { graph, report, edits };
}

describe("root visibility patch planning", () => {
  it("plans one immutable provenance-bound byte and cancels a reversed toggle", () => {
    const { graph, report, edits } = fixture();
    expect(planAmiRootVisibilityPatches(edits, report, graph)).toEqual([
      {
        artifactKind: "setup-hii",
        bufferId: 0,
        offset: 0,
        expected: Uint8Array.of(1),
        replacement: Uint8Array.of(0),
      },
    ]);
    expect(graph.buffers[0].bytes[0]).toBe(1);
    expect(
      toggleAmiRootVisibility(
        { rootVisibility: report, rootVisibilityEdits: edits },
        0,
      ),
    ).toBeUndefined();
  });

  it("rejects stale identities, missing evidence and changed source bytes", () => {
    const { graph, report, edits } = fixture();
    expect(() => planAmiRootVisibilityPatches(edits, undefined, graph)).toThrow(
      /detected vector/,
    );
    for (const stale of [
      { ...edits[0], bufferId: 9 },
      { ...edits[0], bufferOffset: 8 },
      { ...edits[0], formSetGuid: "other" },
      { ...edits[0], expected: 0 as const },
    ])
      expect(() => planAmiRootVisibilityPatches([stale], report, graph)).toThrow(
        /does not match/,
      );
    expect(() =>
      planAmiRootVisibilityPatches([edits[0], edits[0]], report, graph),
    ).toThrow(/duplicate/);
    graph.buffers[0].bytes[0] = 0;
    expect(() => planAmiRootVisibilityPatches(edits, report, graph)).toThrow(
      /source bytes changed/,
    );
  });

  it("rejects non-Boolean values and disabling every root", () => {
    const { graph, report, edits } = fixture();
    const nonBoolean = { ...edits[0], replacement: 2 as 0 };
    expect(() => planAmiRootVisibilityPatches([nonBoolean], report, graph)).toThrow(
      /zero or one/,
    );
    const allDisabled = toggleAmiRootVisibility(
      { rootVisibility: report, rootVisibilityEdits: edits },
      1,
    );
    if (!allDisabled) throw new Error("Expected pending root edits.");
    expect(() => planAmiRootVisibilityPatches(allDisabled, report, graph)).toThrow(
      /At least one/,
    );
  });
});
