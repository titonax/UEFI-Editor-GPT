import { describe, expect, it } from "vitest";
import { createLzmaSectionCodec } from "./lzmaSectionCodec";
import type { FirmwareProvenanceGraph } from "./firmwareProvenance";
import { rebuildUefiImage } from "./uefiImageRebuilder";

// Generated independently with Python's liblzma FORMAT_ALONE encoder, using a
// 1 MiB dictionary and its documented decoded length in the 13-byte header.
const externalFixture = Uint8Array.of(
  93,
  0,
  0,
  16,
  0,
  112,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  42,
  145,
  68,
  227,
  134,
  52,
  125,
  107,
  128,
  134,
  179,
  181,
  88,
  46,
  106,
  174,
  208,
  99,
  63,
  190,
  183,
  105,
  67,
  29,
  64,
  24,
  153,
  24,
  89,
  246,
  247,
  203,
  183,
  74,
  163,
  255,
  255,
  253,
  219,
  192,
  0,
);
const decodedFixture = Uint8Array.from(
  Array.from({ length: 4 }, () => [
    ...new TextEncoder().encode("UEFI LZMA section fixture"),
    0,
    1,
    255,
  ]).flat(),
);

describe("LZMA section codec", () => {
  it("reads an independently encoded stream and deterministically encodes its binary payload", async () => {
    const codec = createLzmaSectionCodec(externalFixture);
    await expect(codec.decompress(externalFixture)).resolves.toEqual(decodedFixture);
    const first = await codec.compress(decodedFixture);
    const second = await codec.compress(decodedFixture);
    expect(first).toEqual(second);
    expect(first.slice(0, 13)).toEqual(externalFixture.slice(0, 13));
    await expect(codec.decompress(first)).resolves.toEqual(decodedFixture);
  });

  it("rejects unsupported headers, altered properties and decoded lengths", async () => {
    const codec = createLzmaSectionCodec(externalFixture);
    expect(() => createLzmaSectionCodec(new Uint8Array(12))).toThrow(/header/);
    const unknownDictionary = externalFixture.slice();
    unknownDictionary[1] = 3;
    expect(() => createLzmaSectionCodec(unknownDictionary)).toThrow(/dictionary/);
    const unknownSize = externalFixture.slice();
    unknownSize.fill(0xff, 5, 13);
    expect(() => createLzmaSectionCodec(unknownSize)).toThrow(/size/);
    await expect(codec.compress(decodedFixture.slice(1))).rejects.toThrow(/length/);
    const changedDictionary = externalFixture.slice();
    changedDictionary[3] = 1;
    await expect(codec.decompress(changedDictionary)).rejects.toThrow(/properties/);
  });

  it("does not export an image when a real LZMA encoder exceeds its fixed section", async () => {
    const root = new Uint8Array(0x200).fill(0x31);
    root.set([64, 0, 0, 1, 112, 0, 0, 0, 2], 0x38);
    root.set(externalFixture, 0x41);
    const outer = {
      bufferId: 0,
      guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
      volumeStart: 0,
      volumeEnd: root.length,
      fileStart: 0x20,
      bodyStart: 0x38,
      end: 0xc0,
      headerSize: 24,
    };
    const graph: FirmwareProvenanceGraph = {
      rootBufferId: 0,
      sourceSize: root.length,
      buffers: [
        { id: 0, bytes: root, depth: 0 },
        {
          id: 1,
          bytes: decodedFixture,
          depth: 1,
          parent: {
            parentBufferId: 0,
            sectionStart: 0x38,
            sectionEnd: 0x78,
            sectionHeaderSize: 4,
            sectionType: 1,
            payloadStart: 0x41,
            payloadEnd: 0x78,
            compression: "lzma",
            ownerFile: outer,
          },
        },
      ],
      artifacts: [
        {
          kind: "setup-hii",
          bufferId: 1,
          payloadStart: 24,
          payloadEnd: 32,
          sourceFile: {
            ...outer,
            bufferId: 1,
            volumeEnd: decodedFixture.length,
            fileStart: 0,
            bodyStart: 24,
            end: decodedFixture.length,
          },
        },
      ],
    };
    const replacement = decodedFixture.slice(24, 32);
    replacement[0] ^= 1;
    const untouched = root.slice();
    await expect(
      rebuildUefiImage(
        graph,
        { "setup-hii": replacement },
        { lzma: createLzmaSectionCodec },
      ),
    ).rejects.toThrow(/fixed payload/);
    expect(root).toEqual(untouched);
  });
});
