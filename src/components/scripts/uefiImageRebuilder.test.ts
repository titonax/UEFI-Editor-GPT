import { describe, expect, it } from "vitest";
import type {
  FirmwareFileReference,
  FirmwareProvenanceGraph,
} from "./firmwareProvenance";
import { rebuildUefiImage } from "./uefiImageRebuilder";
import { readFirmwareSection } from "./firmwareSections";

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
  it("patches a direct HII payload, repairs FFS checksums and preserves its surroundings", async () => {
    const { graph, file } = directGraph();
    const source = graph.buffers[0].bytes.slice();
    const result = await rebuildUefiImage(graph, {
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

  it("rebuilds an uncompressed child before repairing its owning outer FFS", async () => {
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
    const result = await rebuildUefiImage(graph, {
      "setup-hii": new Uint8Array(8).fill(0xa5),
    });

    expect(result.image.slice(0x88, 0x90)).toEqual(new Uint8Array(8).fill(0xa5));
    expect(
      (sum8(result.image, outerFile.bodyStart, outerFile.end) +
        result.image[outerFile.fileStart + 17]) &
        0xff,
    ).toBe(0);
  });

  it("preserves descriptor, ME and all bytes outside the BIOS region of a full SPI", async () => {
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
    const result = await rebuildUefiImage(graph, {
      "setup-hii": new Uint8Array(8).fill(0x44),
    });

    expect(result.image.subarray(0, 0x2000)).toEqual(source.subarray(0, 0x2000));
    expect(result.image).toHaveLength(source.length);
  });

  it("rejects a compressed ancestry until its codec is enabled", async () => {
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

    await expect(
      rebuildUefiImage(graph, { "setup-hii": new Uint8Array(8).fill(1) }),
    ).rejects.toThrow(/LZMA recompression/);
  });

  it("rebuilds a synthetic compressed section only with exact size and independent round-trip", async () => {
    const root = new Uint8Array(0x300).fill(0xff);
    const outerFile = fileReference(0, 0x40, 0x100);
    initializeFile(root, outerFile);
    const decoded = new Uint8Array(0x40).fill(0x31);
    const innerFile = fileReference(1, 0x08, 0x38);
    innerFile.volumeEnd = decoded.length;
    initializeFile(decoded, innerFile);
    const payloadStart = 0x69;
    const packed = Uint8Array.from(decoded, (byte) => byte ^ 0xa5);
    root.set([0x49, 0, 0, 1, 0x40, 0, 0, 0, 1], 0x60);
    root.set(packed, payloadStart);
    const graph: FirmwareProvenanceGraph = {
      rootBufferId: 0,
      sourceSize: root.length,
      buffers: [
        { id: 0, bytes: root, depth: 0 },
        {
          id: 1,
          bytes: decoded,
          depth: 1,
          parent: {
            parentBufferId: 0,
            sectionStart: 0x60,
            sectionEnd: 0xa9,
            sectionHeaderSize: 4,
            sectionType: 1,
            payloadStart,
            payloadEnd: 0xa9,
            compression: "standard",
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
    const codec = {
      compression: "standard" as const,
      compress: (bytes: Uint8Array) => Uint8Array.from(bytes, (byte) => byte ^ 0xa5),
      decompress: (bytes: Uint8Array) => Uint8Array.from(bytes, (byte) => byte ^ 0xa5),
    };
    const replacement = new Uint8Array(8).fill(0x70);
    const result = await rebuildUefiImage(
      graph,
      { "setup-hii": replacement },
      { standard: codec },
    );
    expect(
      codec.decompress(result.image.slice(payloadStart, 0xa9)).slice(0x28, 0x30),
    ).toEqual(replacement);
    expect(result.image.slice(0, outerFile.fileStart)).toEqual(
      root.slice(0, outerFile.fileStart),
    );
    expect(result.image.slice(outerFile.end)).toEqual(root.slice(outerFile.end));
    expect(result.image).toHaveLength(root.length);
    expect(
      (sum8(result.image, outerFile.bodyStart, outerFile.end) +
        result.image[outerFile.fileStart + 17]) &
        0xff,
    ).toBe(0);

    await expect(
      rebuildUefiImage(
        graph,
        { "setup-hii": replacement },
        {
          standard: { ...codec, compress: (bytes) => new Uint8Array(bytes.length) },
        },
      ),
    ).rejects.toThrow(/round-trip/);
    graph.buffers[1].bytes[0] ^= 1;
    await expect(
      rebuildUefiImage(graph, { "setup-hii": replacement }, { standard: codec }),
    ).rejects.toThrow(/decoded provenance/);
  });

  it("shrinks a terminal section and replaces its abandoned bytes with proven erase padding", async () => {
    const root = new Uint8Array(0x300).fill(0x31);
    const outer = fileReference(0, 0x40, 0x200);
    initializeFile(root, outer);
    root.set([0xc0, 0x01, 0], outer.fileStart + 20);
    root.set([8, 0, 0, 0x19, 0, 0, 0, 0], 0x58);
    const child = Uint8Array.from({ length: 0x100 }, (_, i) => (i % 251) + 1);
    const inner = fileReference(1, 0, child.length);
    inner.volumeEnd = child.length;
    const codec = {
      compression: "standard" as const,
      compress(bytes: Uint8Array) {
        const packed: number[] = [];
        for (let i = 0; i < bytes.length; i += 1) {
          if (bytes[i] === 0) {
            let count = 1;
            while (count < 255 && bytes[i + count] === 0) count += 1;
            packed.push(0, count);
            i += count - 1;
          } else packed.push(bytes[i]);
        }
        return Uint8Array.from(packed);
      },
      decompress(bytes: Uint8Array) {
        const decoded: number[] = [];
        for (let i = 0; i < bytes.length; i += 1) {
          if (bytes[i] === 0) decoded.push(...new Array<number>(bytes[++i]).fill(0));
          else decoded.push(bytes[i]);
        }
        return Uint8Array.from(decoded);
      },
    };
    root.set([0x09, 0x01, 0, 1, 0, 1, 0, 0, 1], 0x60);
    root.set(codec.compress(child), 0x69);
    root.fill(0xff, 0x169, outer.end);
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
            sectionStart: 0x60,
            sectionEnd: 0x169,
            sectionHeaderSize: 4,
            sectionType: 1,
            payloadStart: 0x69,
            payloadEnd: 0x169,
            compression: "standard",
            ownerFile: outer,
          },
        },
      ],
      artifacts: [
        {
          kind: "setup-hii",
          bufferId: 1,
          payloadStart: 0x40,
          payloadEnd: 0xc0,
          sourceFile: inner,
        },
      ],
    };
    const result = await rebuildUefiImage(
      graph,
      { "setup-hii": new Uint8Array(0x80) },
      { standard: codec },
    );
    const section = readFirmwareSection(result.image, 0x60, outer.end);
    expect(section?.end).toBeLessThan(0x169);
    if (!section) throw new Error("Compressed section is missing.");
    expect(
      codec.decompress(result.image.slice(0x69, section.end)).slice(0x40, 0xc0),
    ).toEqual(new Uint8Array(0x80));
    expect(result.image.slice(section.end, outer.end)).toEqual(
      new Uint8Array(outer.end - section.end).fill(0xff),
    );
    expect(result.image.slice(0x58, 0x60)).toEqual(root.slice(0x58, 0x60));
    expect(result.image.slice(outer.end)).toEqual(root.slice(outer.end));
    expect(root.slice(0x169, outer.end)).toEqual(
      new Uint8Array(outer.end - 0x169).fill(0xff),
    );
  });
});
