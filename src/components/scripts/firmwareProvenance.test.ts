import { describe, expect, it } from "vitest";
import {
  assessFirmwareReconstruction,
  type FirmwareProvenanceGraph,
} from "./firmwareProvenance";

function traceableGraph(): FirmwareProvenanceGraph {
  return {
    rootBufferId: 0,
    sourceSize: 0x1000,
    buffers: [
      { id: 0, bytes: new Uint8Array(0x1000), depth: 0 },
      {
        id: 4,
        bytes: new Uint8Array(0x300),
        depth: 1,
        parent: {
          parentBufferId: 0,
          sectionStart: 0x100,
          sectionEnd: 0x500,
          sectionHeaderSize: 4,
          sectionType: 2,
          payloadStart: 0x118,
          payloadEnd: 0x500,
          compression: "lzma",
        },
      },
      {
        id: 9,
        bytes: new Uint8Array(0x180),
        depth: 2,
        parent: {
          parentBufferId: 4,
          sectionStart: 0x20,
          sectionEnd: 0x200,
          sectionHeaderSize: 4,
          sectionType: 1,
          payloadStart: 0x29,
          payloadEnd: 0x200,
          compression: "standard",
        },
      },
    ],
    artifacts: [
      {
        kind: "setup-hii",
        bufferId: 9,
        payloadStart: 0x30,
        payloadEnd: 0x90,
        sourceFile: {
          bufferId: 4,
          guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
          volumeStart: 0,
          volumeEnd: 0x300,
          fileStart: 8,
          bodyStart: 0x20,
          end: 0x240,
          headerSize: 24,
        },
      },
    ],
  };
}

describe("firmware reconstruction provenance", () => {
  it("walks sparse buffer identifiers back to the original image", () => {
    const assessment = assessFirmwareReconstruction(traceableGraph());

    expect(assessment.traceComplete).toBe(true);
    expect(assessment.writeEnabled).toBe(false);
    expect(assessment.compressions).toEqual(["lzma", "standard"]);
    expect(assessment.traces[0].labels).toEqual([
      "Firmware image",
      "LZMA section @ 0x100",
      "EFI/Tiano section @ 0x20",
      "Setup HII",
    ]);
    expect(assessment.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("LZMA"),
        expect.stringContaining("EFI/Tiano"),
        expect.stringContaining("checksum"),
      ]),
    );
  });

  it("refuses an artifact path with a missing parent buffer", () => {
    const graph = traceableGraph();
    graph.buffers = graph.buffers.filter((node) => node.id !== 4);

    const assessment = assessFirmwareReconstruction(graph);

    expect(assessment.traceComplete).toBe(false);
    expect(assessment.blockers[0]).toMatch(/incomplete path/);
  });
});
