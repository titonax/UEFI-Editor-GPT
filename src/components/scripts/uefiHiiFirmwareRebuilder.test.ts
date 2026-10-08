import { beforeEach, describe, expect, it, vi } from "vitest";
import { firmwareData, condition } from "../../test/fixtures";
import {
  decodeFirmwareBuffers,
  inventoryFirmwareFiles,
  type DecodedFirmwareInventory,
} from "./aptioIvExtractor";
import { inventoryUefiHiiModules } from "./uefiHiiDiscovery";
import type { UefiHiiWorkspace } from "./uefiHiiWorkspace";
import { buildUefiHiiFirmwareImage } from "./uefiHiiFirmwareRebuilder";

vi.mock("./aptioIvExtractor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./aptioIvExtractor")>();
  return { ...actual, decodeFirmwareBuffers: vi.fn(actual.decodeFirmwareBuffers) };
});

function uint24(bytes: Uint8Array, offset: number, value: number) {
  bytes.set([value & 255, (value >>> 8) & 255, (value >>> 16) & 255], offset);
}

function sum(bytes: Uint8Array) {
  return bytes.reduce((total, byte) => (total + byte) & 255, 0);
}

function formsPackage(marker: number) {
  // FormSet > Form > SuppressIf TRUE > Ref > End > End > End.
  const ops = new Uint8Array(23 + 6 + 2 + 2 + 15 + 6);
  ops.set([0x0e, 0x97]);
  ops.fill(marker, 2, 18);
  ops.set([1, 0x86, 1, 0, 1, 0], 23);
  ops.set([0x0a, 0x82, 0x46, 2], 29);
  ops.set([0x0f, 15, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0], 33);
  ops.set([0x29, 2, 0x29, 2, 0x29, 2], 48);
  const bytes = new Uint8Array(4 + ops.length);
  uint24(bytes, 0, bytes.length);
  bytes[3] = 2;
  bytes.set(ops, 4);
  return bytes;
}

function volume() {
  const bytes = new Uint8Array(0x1000).fill(0xff);
  bytes.fill(0, 0, 0x48);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0x20, BigInt(bytes.length), true);
  bytes.set(new TextEncoder().encode("_FVH"), 0x28);
  view.setUint32(0x2c, 0x800, true);
  view.setUint16(0x30, 0x48, true);
  let start = 0x48;
  for (const marker of [1, 2, 3]) {
    const pkg = formsPackage(marker);
    const size = 24 + 4 + pkg.length;
    bytes.fill(0, start, start + 24);
    bytes.fill(marker, start, start + 16);
    bytes[start + 18] = 7;
    bytes[start + 19] = 0x40;
    uint24(bytes, start + 20, size);
    bytes[start + 23] = 7;
    uint24(bytes, start + 24, pkg.length + 4);
    bytes[start + 27] = 0x10;
    bytes.set(pkg, start + 28);
    bytes[start + 17] = -sum(bytes.slice(start + 24, start + size)) & 255;
    const header = bytes.slice(start, start + 24);
    header[17] = 0;
    header[23] = 0;
    bytes[start + 16] = -sum(header) & 255;
    start = (start + size + 7) & ~7;
  }
  let headerSum = 0;
  for (let i = 0; i < 0x48; i += 2)
    headerSum = (headerSum + view.getUint16(i, true)) & 0xffff;
  view.setUint16(0x32, -headerSum & 0xffff, true);
  return bytes;
}

function wrappedVolume(inner = volume(), ownPackage = false) {
  const direct = ownPackage ? formsPackage(4) : new Uint8Array();
  const prefix = ownPackage ? (4 + direct.length + 3) & ~3 : 0;
  const end = 0x64 + prefix + inner.length;
  const bytes = new Uint8Array((end + 0xfff) & ~0xfff).fill(0xff);
  bytes.set(volume().slice(0, 0x48));
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0x20, BigInt(bytes.length), true);
  view.setUint16(0x32, 0, true);
  let total = 0;
  for (let i = 0; i < 0x48; i += 2) total = (total + view.getUint16(i, true)) & 0xffff;
  view.setUint16(0x32, -total & 0xffff, true);
  bytes.fill(0, 0x48, 0x60);
  bytes.fill(4, 0x48, 0x58);
  bytes[0x5a] = 0x0b;
  bytes[0x5b] = 0x40;
  uint24(bytes, 0x5c, end - 0x48);
  bytes[0x5f] = 7;
  if (ownPackage) {
    uint24(bytes, 0x60, direct.length + 4);
    bytes[0x63] = 0x10;
    bytes.set(direct, 0x64);
  }
  uint24(bytes, 0x60 + prefix, inner.length + 4);
  bytes[0x63 + prefix] = 3;
  bytes.set(inner, 0x64 + prefix);
  bytes[0x59] = -sum(bytes.slice(0x60, end)) & 255;
  const header = bytes.slice(0x48, 0x60);
  header[17] = 0;
  header[23] = 0;
  bytes[0x58] = -sum(header) & 255;
  return bytes;
}

function spi(bios = volume()) {
  const bytes = new Uint8Array(0x5000).fill(0xa5);
  const view = new DataView(bytes.buffer);
  view.setUint32(0x10, 0x0ff0a55a, true);
  view.setUint32(0x14, 4 << 16, true);
  bytes.fill(0xff, 0x40, 0x80);
  view.setUint32(0x40, 0, true);
  view.setUint32(0x44, 2 | (4 << 16), true);
  view.setUint32(0x48, 1 | (1 << 16), true);
  bytes.set(bios, 0x2000);
  return bytes;
}

async function workspaceFor(image: Uint8Array, decoded?: DecodedFirmwareInventory) {
  const inventory = inventoryUefiHiiModules(
    decoded ?? (await decodeFirmwareBuffers(image)),
  );
  let start = 0;
  // Leave a third module outside the editor; the complete-image re-read must
  // prove that this unselected sibling is preserved.
  const modules = inventory.modules.slice(0, 2).map((module) => {
    const summary = {
      id: module.id,
      name: module.name,
      fileGuid: module.file.guid,
      formSetGuids: module.formSetGuids,
      formCount: module.formCount,
      referenceCount: module.referenceCount,
      mirroredBufferIds: module.duplicateBufferIds,
      sourceStart: start,
      sourceEnd: start + module.bytes.length,
    };
    start = summary.sourceEnd;
    return summary;
  });
  const sourceBytes = new Uint8Array(start);
  for (const [index, module] of modules.entries())
    sourceBytes.set(inventory.modules[index].bytes, module.sourceStart);
  const data = firmwareData({
    firmwareFamily: "uefi-hii",
    forms: [],
    suppressions: modules.map((module) =>
      condition({
        active: false,
        offset: `0x${(module.sourceStart + 37).toString(16)}`,
        start: `0x${(module.sourceStart + 41).toString(16)}`,
        end: `0x${(module.sourceStart + 56).toString(16)}`,
      }),
    ),
  });
  const workspace: UefiHiiWorkspace = { data, modules, sourceBytes, warnings: [] };
  return { data, workspace, inventory };
}

beforeEach(() => {
  vi.mocked(decodeFirmwareBuffers).mockClear();
});

describe("generic HII complete-image foundation", () => {
  it.each(["raw", "spi", "nested-raw", "nested-spi", "double-nested-spi"])(
    "reintegrates two exact FFS owners and independently re-opens a %s image",
    async (kind) => {
      const image =
        kind === "raw"
          ? volume()
          : kind === "spi"
            ? spi()
            : kind === "nested-raw"
              ? wrappedVolume()
              : kind === "nested-spi"
                ? spi(wrappedVolume())
                : spi(wrappedVolume(wrappedVolume()));
      const originalDecoded = await decodeFirmwareBuffers(image);
      const { data, workspace, inventory } = await workspaceFor(image);
      const original = image.slice();
      const sourceBytes = workspace.sourceBytes.slice();
      vi.mocked(decodeFirmwareBuffers).mockClear();
      const result = await buildUefiHiiFirmwareImage(data, workspace, image);
      expect(decodeFirmwareBuffers).toHaveBeenCalledTimes(2);
      expect(result.image).toHaveLength(image.length);
      expect(result.modifiedModuleIds).toEqual(
        workspace.modules.map((module) => module.id),
      );
      expect(result.spaceReport.compressedSections).toEqual([]);
      expect(result.spaceReport.affectedRanges).toHaveLength(
        kind.includes("nested") ? 1 : 2,
      );
      const reopenedDecoded = await decodeFirmwareBuffers(result.image);
      const reopened = inventoryUefiHiiModules(reopenedDecoded);
      expect(reopened.modules).toHaveLength(3);
      expect(reopened.decodeFailures).toEqual([]);
      expect(
        reopened.modules.every(
          (module) =>
            module.depth ===
            (kind.startsWith("double") ? 2 : kind.includes("nested") ? 1 : 0),
        ),
      ).toBe(true);
      for (const module of reopened.modules.slice(0, 2)) {
        expect(module.bytes.slice(41, 43)).toEqual(Uint8Array.of(0x29, 2));
      }
      for (const node of reopenedDecoded.buffers) {
        const originalNode = originalDecoded.buffers.find(
          (candidate) => candidate.id === node.id,
        );
        expect(originalNode).toBeDefined();
        for (const file of inventoryFirmwareFiles(node)) {
          expect(
            (sum(node.bytes.slice(file.bodyStart, file.end)) +
              node.bytes[file.fileStart + 17]) &
              255,
          ).toBe(0);
          const header = node.bytes.slice(file.fileStart, file.bodyStart);
          header[17] = 0;
          header[23] = 0;
          expect(sum(header)).toBe(0);
          expect(node.bytes.slice(file.volumeStart, file.volumeStart + 0x48)).toEqual(
            originalNode?.bytes.slice(file.volumeStart, file.volumeStart + 0x48),
          );
        }
      }
      expect(reopened.modules[2].bytes).toEqual(inventory.modules[2].bytes);
      for (let offset = 0; offset < image.length; offset++) {
        if (
          result.spaceReport.affectedRanges.some(
            (range) => offset >= range.start && offset < range.end,
          )
        )
          continue;
        expect(result.image[offset]).toBe(image[offset]);
      }
      expect(image).toEqual(original);
      expect(workspace.sourceBytes).toEqual(sourceBytes);
      expect(result.containerKind).toBe(
        kind.includes("spi") ? "intel-spi" : "bios-image",
      );
      if (kind.includes("spi"))
        expect(result.spaceReport.preservedOutsideBiosBytes).toBe(0x2000);
    },
  );

  it("retains direct HII inside an identity section when there is no nested FFS owner", async () => {
    const image = volume();
    image[0x63] = 3;
    const inventory = inventoryUefiHiiModules(await decodeFirmwareBuffers(image));
    expect(inventory.modules).toHaveLength(3);
    expect(inventory.modules.every((module) => module.bufferId === 0)).toBe(true);
    expect(inventory.decodeFailures).toEqual([]);
  });

  it("blocks mixed direct/nested HII ownership rather than joining overlapping carrier views", async () => {
    const image = wrappedVolume(volume(), true);
    const { data, workspace, inventory } = await workspaceFor(image);
    expect(inventory.modules).toHaveLength(3);
    expect(inventory.modules.every((module) => module.bufferId === 1)).toBe(true);
    expect(inventory.decodeFailures).toEqual([
      expect.stringContaining("mixed or crossing HII ownership"),
    ]);
    await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
      /unresolved ownership/,
    );
  });

  it("blocks a valid HII package crossing a truncated nested FFS allocation", async () => {
    const image = wrappedVolume();
    uint24(image, 0x64 + 0x48 + 20, 44);
    const { data, workspace, inventory } = await workspaceFor(image);
    expect(inventory.decodeFailures).toEqual([
      expect.stringContaining("mixed or crossing HII ownership"),
    ]);
    await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
      /unresolved ownership/,
    );
  });

  it("does not discard HII owners on contradictory nested provenance", async () => {
    const decoded = await decodeFirmwareBuffers(wrappedVolume());
    const child = decoded.buffers.find((node) => node.parent);
    expect(child?.parent).toBeDefined();
    if (!child?.parent) throw new Error("missing fixture edge");
    child.parent.sectionEnd--;
    const inventory = inventoryUefiHiiModules(decoded);
    expect(inventory.modules.some((module) => module.bufferId === 0)).toBe(true);
  });

  it.each(["bytes", "guid", "id", "bounds", "duplicate", "mirror"])(
    "rejects stale/ambiguous workspace %s without changing the image",
    async (problem) => {
      const image = volume();
      const { data, workspace } = await workspaceFor(image);
      const original = image.slice();
      switch (problem) {
        case "bytes":
          workspace.sourceBytes[8] ^= 1;
          break;
        case "guid":
          workspace.modules[0].fileGuid = "wrong";
          break;
        case "id":
          workspace.modules[0].id = "wrong";
          break;
        case "bounds":
          workspace.modules[0].sourceEnd++;
          break;
        case "duplicate":
          workspace.modules.push({ ...workspace.modules[0] });
          break;
        case "mirror":
          workspace.modules[0].mirroredBufferIds = [1];
          break;
      }
      await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
        /identity|overlap|Mirrored/,
      );
      expect(image).toEqual(original);
    },
  );

  it("rejects overlapping workspace ranges even when both FFS bodies are byte-identical", async () => {
    const image = volume();
    const decoded = await decodeFirmwareBuffers(image);
    const modules = inventoryUefiHiiModules(decoded).modules;
    image.set(modules[0].bytes, modules[1].file.bodyStart);
    const { data, workspace } = await workspaceFor(image);
    workspace.modules[1].sourceStart = 0;
    workspace.modules[1].sourceEnd = workspace.modules[0].sourceEnd;
    await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
      /ranges overlap/,
    );
  });

  it("blocks identical FFS copies in the same buffer despite discovery deduplication", async () => {
    const image = volume();
    const modules = inventoryUefiHiiModules(await decodeFirmwareBuffers(image)).modules;
    image.set(modules[0].bytes, modules[1].file.bodyStart);
    image.set(
      image.slice(modules[0].file.fileStart, modules[0].file.fileStart + 16),
      modules[1].file.fileStart,
    );
    const { data, workspace } = await workspaceFor(image);
    expect(workspace.modules[0].mirroredBufferIds).toEqual([]);
    await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
      /Mirrored/,
    );
  });

  it("blocks wrappers, missing edits, unproven closing End and unsupported root plans", async () => {
    const image = volume();
    const { data, workspace } = await workspaceFor(image);
    const wrapped = new Uint8Array(image.length + 32);
    wrapped.set(image, 32);
    await expect(buildUefiHiiFirmwareImage(data, workspace, wrapped)).rejects.toThrow(
      /raw PI/,
    );
    await expect(
      buildUefiHiiFirmwareImage(
        { ...data, firmwareFamily: "aptio-v" },
        workspace,
        image,
      ),
    ).rejects.toThrow(/vendor-neutral/);
    await expect(
      buildUefiHiiFirmwareImage(
        {
          ...data,
          rootVisibilityEdits: [
            {
              kind: "set-root-visibility",
              rootIndex: 0,
              formId: "0x1",
              bufferId: 0,
              bufferOffset: 0x70,
              expected: 1,
              replacement: 0,
              description: "Hide root",
            },
          ],
        },
        workspace,
        image,
      ),
    ).rejects.toThrow(/vendor-neutral/);
    const unchanged = structuredClone(data);
    unchanged.suppressions.forEach((item) => {
      item.active = true;
    });
    await expect(
      buildUefiHiiFirmwareImage(unchanged, workspace, image),
    ).rejects.toThrow(/No HII/);
    const stale = structuredClone(data);
    stale.suppressions[0].end = "0x20";
    await expect(buildUefiHiiFirmwareImage(stale, workspace, image)).rejects.toThrow(
      /closing End/,
    );
  });

  it("blocks incomplete or compressed provenance even when decoding returned a valid HII inventory", async () => {
    const image = spi();
    image.fill(0xff, 0x2000, 0x3000);
    for (const compression of ["none", "lzma", "standard"] as const) {
      const decoded: DecodedFirmwareInventory = {
        buffers: [
          { id: 0, bytes: image, depth: 0 },
          {
            id: 1,
            bytes: volume(),
            depth: 1,
            ...(compression !== "none"
              ? {
                  parent: {
                    parentBufferId: 0,
                    sectionStart: 0x2000,
                    sectionEnd: 0x3000,
                    sectionHeaderSize: 4,
                    sectionType: 1,
                    payloadStart: 0x2009,
                    payloadEnd: 0x3000,
                    compression,
                  },
                }
              : {}),
          },
        ],
        decodeFailures: [],
      };
      const { data, workspace } = await workspaceFor(image, decoded);
      vi.mocked(decodeFirmwareBuffers).mockResolvedValueOnce(decoded);
      await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
        /complete uncompressed provenance/,
      );
    }
  });

  it("rejects failed source decode and independently detects wrong re-opened bytes or inventory", async () => {
    const image = volume();
    const { data, workspace } = await workspaceFor(image);
    const decoded = await decodeFirmwareBuffers(image);
    vi.mocked(decodeFirmwareBuffers).mockResolvedValueOnce({
      ...decoded,
      decodeFailures: ["unsupported"],
    });
    await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
      /decoding failures/,
    );
    vi.mocked(decodeFirmwareBuffers)
      .mockResolvedValueOnce(decoded)
      .mockResolvedValueOnce(decoded);
    await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
      /did not match/,
    );
    vi.mocked(decodeFirmwareBuffers)
      .mockResolvedValueOnce(decoded)
      .mockResolvedValueOnce({ buffers: [], decodeFailures: [] });
    await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
      /inventory changed/,
    );
  });
});
