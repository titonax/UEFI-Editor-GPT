import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, it, vi } from "vitest";
import {
  runStandardSectionCodec,
  decodeFirmwareBuffers,
} from "../src/components/scripts/aptioIvExtractor";
import { createStandardSectionCodec } from "../src/components/scripts/standardSectionCodec";
import { createLzmaSectionCodec } from "../src/components/scripts/lzmaSectionCodec";
import { rebuildUefiImage } from "../src/components/scripts/uefiImageRebuilder";
import { assessFirmwareReconstruction } from "../src/components/scripts/firmwareProvenance";
import { sha256Hex } from "../src/components/scripts/checksum";

function u24(bytes, offset, value) {
  bytes.set([value & 255, (value >>> 8) & 255, (value >>> 16) & 255], offset);
}
function sum(bytes) {
  return bytes.reduce((total, byte) => (total + byte) & 255, 0);
}
function fileChecksum(bytes, file) {
  bytes[file.fileStart + 16] = 0;
  bytes[file.fileStart + 17] = 0;
  const state = bytes[file.fileStart + 23];
  bytes[file.fileStart + 23] = 0;
  bytes[file.fileStart + 16] = -sum(bytes.slice(file.fileStart, file.bodyStart)) & 255;
  bytes[file.fileStart + 17] = -sum(bytes.slice(file.bodyStart, file.end)) & 255;
  bytes[file.fileStart + 23] = state;
}
function verifyChecksum(bytes, file) {
  const header = bytes.slice(file.fileStart, file.bodyStart);
  header[17] = 0;
  header[23] = 0;
  expect(sum(header)).toBe(0);
  expect(
    (sum(bytes.slice(file.bodyStart, file.end)) + bytes[file.fileStart + 17]) & 255,
  ).toBe(0);
}
function volume(bytes, start, length) {
  bytes.fill(0, start, start + 72);
  const v = new DataView(bytes.buffer);
  // EFI_FIRMWARE_FILE_SYSTEM2_GUID and a minimal valid PI FV header/block map.
  bytes.set(
    [
      0x78, 0xe5, 0x8c, 0x8c, 0x3d, 0x8a, 0x1c, 0x4f, 0x99, 0x35, 0x89, 0x61, 0x85,
      0xc3, 0x2d, 0xd3,
    ],
    start + 16,
  );
  v.setBigUint64(start + 32, BigInt(length), true);
  bytes.set([0x5f, 0x46, 0x56, 0x48], start + 40);
  v.setUint32(start + 44, 0x800, true);
  v.setUint16(start + 48, 72, true);
  bytes[start + 55] = 2;
  v.setUint32(start + 56, 1, true);
  v.setUint32(start + 60, length, true);
  let total = 0;
  for (let p = start; p < start + 72; p += 2)
    total = (total + v.getUint16(p, true)) & 65535;
  v.setUint16(start + 50, -total & 65535, true);
}
function file(bytes, bufferId, volumeStart, volumeEnd, fileStart, size, type) {
  bytes.fill(0, fileStart, fileStart + 24);
  bytes.set(
    [
      0xd7, 0x07, 0x94, 0x89, 0xfe, 0x99, 0xd8, 0x43, 0x9a, 0x21, 0x79, 0xec, 0x32,
      0x8c, 0xac, 0x21,
    ],
    fileStart,
  );
  bytes[fileStart + 18] = type;
  bytes[fileStart + 19] = 0x40;
  bytes[fileStart + 23] = 0xf8;
  u24(bytes, fileStart + 20, size);
  return {
    bufferId,
    guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
    volumeStart,
    volumeEnd,
    fileStart,
    bodyStart: fileStart + 24,
    end: fileStart + size,
    headerSize: 24,
  };
}
function lzmaSeed(size) {
  const seed = new Uint8Array(13);
  seed[0] = 0x5d;
  const view = new DataView(seed.buffer);
  view.setUint32(1, 1 << 20, true);
  view.setUint32(5, size, true);
  return seed;
}
async function encode(bytes, mode) {
  return mode === "lzma"
    ? createLzmaSectionCodec(lzmaSeed(bytes.length)).compress(bytes)
    : runStandardSectionCodec(bytes, `compress-${mode}`);
}
function section(bytes, owner, packed, decodedSize, mode) {
  const start = owner.bodyStart;
  u24(bytes, start, 9 + packed.length);
  bytes[start + 3] = 1;
  new DataView(bytes.buffer).setUint32(start + 4, decodedSize, true);
  bytes[start + 8] = mode === "lzma" ? 2 : 1;
  bytes.set(packed, start + 9);
  fileChecksum(bytes, owner);
  return {
    parentBufferId: owner.bufferId,
    sectionStart: start,
    sectionEnd: start + 9 + packed.length,
    sectionHeaderSize: 4,
    sectionType: 1,
    payloadStart: start + 9,
    payloadEnd: start + 9 + packed.length,
    compression: mode === "lzma" ? "lzma" : "standard",
    ownerFile: owner,
  };
}

// Synthetic PI/SPI bytes only. These are codec/provenance fixtures, not real
// firmware acceptance and not a claim that the raw payload is semantic HII.
it.each([
  ["lzma", "efi"],
  ["efi", "lzma"],
  ["lzma", "tiano"],
  ["tiano", "lzma"],
])(
  "rebuilds synthetic %s -> %s with actual browser WASI codecs",
  async (outerMode, innerMode) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const directory = process.env.FIRMWARE_CODEC_WASM_DIR;
    if (!directory)
      throw new Error("Set FIRMWARE_CODEC_WASM_DIR to the built Pages assets.");
    vi.stubGlobal(
      "fetch",
      async (url) =>
        new Response(readFileSync(join(directory, basename(String(url)))), {
          headers: { "Content-Type": "application/wasm" },
        }),
    );
    const leaf = new Uint8Array(2052);
    u24(leaf, 0, leaf.length);
    leaf[3] = 0x19;
    leaf.fill(0x31, 4);
    const decoded = new Uint8Array(0x4000).fill(0xff);
    volume(decoded, 0, decoded.length);
    const inner = file(decoded, 1, 0, decoded.length, 72, 0x400, 7);
    const innerEdge = section(
      decoded,
      inner,
      await encode(leaf, innerMode),
      leaf.length,
      innerMode,
    );
    const root = new Uint8Array(0x10000).fill(0xff);
    const view = new DataView(root.buffer);
    view.setUint32(0x10, 0x0ff0a55a, true);
    view.setUint32(0x14, 4 << 16, true);
    view.setUint32(0x40, 0, true);
    view.setUint32(0x44, 2 | (15 << 16), true);
    view.setUint32(0x48, 1 | (1 << 16), true);
    for (let i = 3; i < 8; i++) view.setUint32(0x40 + 4 * i, 0x00000fff, true);
    volume(root, 0x2000, 0xe000);
    const outer = file(root, 0, 0x2000, root.length, 0x2048, 0x3000, 0x0b);
    const outerEdge = section(
      root,
      outer,
      await encode(decoded, outerMode),
      decoded.length,
      outerMode,
    );
    const graph = {
      rootBufferId: 0,
      sourceSize: root.length,
      buffers: [
        { id: 0, bytes: root, depth: 0 },
        { id: 1, bytes: decoded, depth: 1, parent: outerEdge },
        { id: 2, bytes: leaf, depth: 2, parent: innerEdge },
      ],
      artifacts: [
        {
          kind: "setup-hii",
          bufferId: 2,
          payloadStart: 4,
          payloadEnd: leaf.length,
          sourceFile: inner,
        },
      ],
    };
    // Successful synthetic integration cannot grant app output acceptance.
    expect(assessFirmwareReconstruction(graph).writeEnabled).toBe(false);
    const originalHashes = await Promise.all(
      graph.buffers.map((node) => sha256Hex(node.bytes)),
    );
    const replacement = leaf.slice(4);
    replacement.fill(0x42, 17, 113);
    const result = await rebuildUefiImage(
      graph,
      { "setup-hii": replacement },
      { lzma: createLzmaSectionCodec, standard: createStandardSectionCodec },
    );
    const reopened = await decodeFirmwareBuffers(result.image);
    expect(reopened.decodeFailures).toEqual([]);
    const reopenedLeaf = reopened.buffers.find((node) => node.depth === 2);
    const reopenedVolume = reopened.buffers.find((node) => node.depth === 1);
    expect(reopenedLeaf).toBeDefined();
    expect(reopenedVolume).toBeDefined();
    const expected = leaf.slice();
    expected.set(replacement, 4);
    expect(reopenedLeaf.bytes).toEqual(expected);
    expect(reopenedVolume.bytes.slice(inner.end)).toEqual(decoded.slice(inner.end));
    expect(reopenedVolume.bytes.slice(0, inner.fileStart)).toEqual(
      decoded.slice(0, inner.fileStart),
    );
    expect(result.image.slice(0, outer.fileStart)).toEqual(
      root.slice(0, outer.fileStart),
    );
    verifyChecksum(result.image, outer);
    verifyChecksum(reopenedVolume.bytes, inner);
    expect(result.spaceReport.biosStart).toBe(0x2000);
    expect(result.spaceReport.preservedOutsideBiosBytes).toBe(0x2000);
    expect(result.image.length).toBe(root.length);
    expect(result.image.slice(0, 0x2000)).toEqual(root.slice(0, 0x2000));
    expect(result.image.slice(outer.end)).toEqual(root.slice(outer.end));
    expect(result.spaceReport.compressedSections).toHaveLength(2);
    expect(
      result.spaceReport.compressedSections.map((item) => item.compression),
    ).toEqual([innerEdge.compression, outerEdge.compression]);
    expect(
      result.spaceReport.compressedSections.every((item) => item.remainingBytes >= 0),
    ).toBe(true);
    const random = new Uint8Array(replacement.length);
    let state = 123456789;
    for (let i = 0; i < random.length; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      random[i] = state & 255;
    }
    await expect(
      rebuildUefiImage(
        graph,
        { "setup-hii": random },
        { lzma: createLzmaSectionCodec, standard: createStandardSectionCodec },
      ),
    ).rejects.toThrow(/proven FFS allocation|grow beyond its FFS allocation/);
    expect(
      await Promise.all(graph.buffers.map((node) => sha256Hex(node.bytes))),
    ).toEqual(originalHashes);
  },
  30000,
);
