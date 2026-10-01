import { describe, expect, it } from "vitest";
import type {
  FirmwareFileReference,
  FirmwareProvenanceGraph,
} from "./firmwareProvenance";
import { rebuildUefiImage } from "./uefiImageRebuilder";

function fileReference(
  bufferId: number,
  fileStart: number,
  end: number,
): FirmwareFileReference {
  return {
    bufferId,
    guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
    volumeStart: 0,
    volumeEnd: end + 0x40,
    fileStart,
    bodyStart: fileStart + 24,
    end,
    headerSize: 24,
  };
}

function initializeFile(bytes: Uint8Array, file: FirmwareFileReference) {
  bytes[file.fileStart + 19] = 0x40;
  bytes[file.fileStart + 23] = 0x07;
  bytes.fill(0x31, file.bodyStart, file.end);
}

function directGraph(source = new Uint8Array(0x300)) {
  const file = fileReference(0, 0x40, 0xa0);
  initializeFile(source, file);
  const graph: FirmwareProvenanceGraph = {
    rootBufferId: 0,
    sourceSize: source.length,
    buffers: [{ id: 0, bytes: source, depth: 0 }],
    artifacts: [
      {
        kind: "setup-hii",
        bufferId: 0,
        payloadStart: 0x60,
        payloadEnd: 0x68,
        sourceFile: file,
      },
    ],
  };
  return { graph, file };
}

function sum8(bytes: Uint8Array, start: number, end: number) {
  let sum = 0;
  for (let offset = start; offset < end; offset += 1) {
    sum = (sum + bytes[offset]) & 0xff;
  }
  return sum;
}

describe("rebuildUefiImage", () => {
  it("patches a direct HII payload, repairs FFS checksums and preserves its surroundings", () => {
    const { graph, file } = directGraph();
    const source = graph.buffers[0].bytes.slice();
    const result = rebuildUefiImage(graph, {
      "setup-hii": Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8),
    });

    expect(result.replacedArtifacts).toEqual(["setup-hii"]);
    expect(result.image.subarray(0, file.fileStart)).toEqual(
      source.subarray(0, file.fileStart),
    );
    expect(result.image.subarray(file.end)).toEqual(source.subarray(file.end));
    expect(
      (sum8(result.image, file.bodyStart, file.end) +
        result.image[file.fileStart + 17]) &
        0xff,
    ).toBe(0);
    const header = result.image.slice(file.fileStart, file.bodyStart);
    header[17] = 0;
    header[23] = 0;
    expect(sum8(header, 0, header.length)).toBe(0);
  });

  it("rebuilds an uncompressed child before repairing its owning outer FFS", () => {
    const root = new Uint8Array(0x300);
    const outerFile = fileReference(0, 0x40, 0x100);
    initializeFile(root, outerFile);
    const child = root.slice(0x60, 0xe0);
    const innerFile = fileReference(1, 0x08, 0x60);
    innerFile.volumeEnd = child.length;
    initializeFile(child, innerFile);
    root.set(child, 0x60);
    const graph: FirmwareProvenanceGraph = {
      rootBufferId: 0,
      sourceSize: root.length,
      buffers: [
        { id: 0, bytes: root, depth: 0 },
        {
          id: 1,
          bytes: child,
          depth: 1,
          parent: {
            parentBufferId: 0,
            sectionStart: 0x58,
            sectionEnd: 0xe0,
            sectionHeaderSize: 4,
            sectionType: 3,
            payloadStart: 0x60,
            payloadEnd: 0xe0,
            compression: "none",
            ownerFile: outerFile,
          },
        },
      ],
      artifacts: [
        {
          kind: "setup-hii",
          bufferId: 1,
          payloadStart: 0x28,
          payloadEnd: 0x30,
          sourceFile: innerFile,
        },
      ],
    };
    const result = rebuildUefiImage(graph, {
      "setup-hii": new Uint8Array(8).fill(0xa5),
    });

    expect(result.image.slice(0x88, 0x90)).toEqual(new Uint8Array(8).fill(0xa5));
    expect(
      (sum8(result.image, outerFile.bodyStart, outerFile.end) +
        result.image[outerFile.fileStart + 17]) &
        0xff,
    ).toBe(0);
  });

  it("preserves descriptor, ME and all bytes outside the BIOS region of a full SPI", () => {
    const source = new Uint8Array(0x5000);
    const view = new DataView(source.buffer);
    view.setUint32(0x10, 0x0ff0a55a, true);
    view.setUint32(0x14, 4 << 16, true);
    view.setUint32(0x40, 0, true);
    view.setUint32(0x44, 2 | (4 << 16), true);
    view.setUint32(0x48, 1 | (1 << 16), true);
    const file = fileReference(0, 0x2100, 0x2180);
    file.volumeStart = 0x2000;
    file.volumeEnd = 0x3000;
    initializeFile(source, file);
    const graph: FirmwareProvenanceGraph = {
      rootBufferId: 0,
      sourceSize: source.length,
      buffers: [{ id: 0, bytes: source, depth: 0 }],
      artifacts: [
        {
          kind: "setup-hii",
          bufferId: 0,
          payloadStart: 0x2140,
          payloadEnd: 0x2148,
          sourceFile: file,
        },
      ],
    };
    const result = rebuildUefiImage(graph, {
      "setup-hii": new Uint8Array(8).fill(0x44),
    });

    expect(result.image.subarray(0, 0x2000)).toEqual(source.subarray(0, 0x2000));
    expect(result.image).toHaveLength(source.length);
  });

  it("rejects a compressed ancestry until its codec is enabled", () => {
    const { graph } = directGraph();
    const source = graph.buffers[0].bytes;
    const child = source.slice(0x60, 0x80);
    graph.buffers.push({
      id: 1,
      bytes: child,
      depth: 1,
      parent: {
        parentBufferId: 0,
        sectionStart: 0x58,
        sectionEnd: 0x80,
        sectionHeaderSize: 4,
        sectionType: 1,
        payloadStart: 0x60,
        payloadEnd: 0x80,
        compression: "lzma",
      },
    });
    graph.artifacts[0] = {
      ...graph.artifacts[0],
      bufferId: 1,
      payloadStart: 0,
      payloadEnd: 8,
    };

    expect(() =>
      rebuildUefiImage(graph, { "setup-hii": new Uint8Array(8).fill(1) }),
    ).toThrow(/LZMA recompression/);
  });
});
