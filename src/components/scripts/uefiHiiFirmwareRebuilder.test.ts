import { beforeEach, describe, expect, it, vi } from "vitest";
import { firmwareData, condition } from "../../test/fixtures";
import { analyzeIfrBinary, IFR_OPCODE } from "./ifrBinary";
import { buildUefiHiiWorkspace } from "./uefiHiiWorkspace";
import { moveMenuReference } from "./menuEditing";
import { bytesToHex } from "./hex";
import {
  createDataChangeEntry,
  projectDataChangeQueue,
} from "../ChangeQueue/dataChangeQueue";
import {
  decodeFirmwareBuffers,
  inventoryFirmwareFiles,
  type DecodedFirmwareInventory,
} from "./aptioIvExtractor";
import { inventoryUefiHiiModules } from "./uefiHiiDiscovery";
import type { UefiHiiWorkspace } from "./uefiHiiWorkspace";
import { buildUefiHiiFirmwareImage } from "./uefiHiiFirmwareRebuilder";
import { createUefiHiiOwnedPackageView } from "./uefiHiiOwnership";
import {
  buildUefiHiiModulePatches,
  createUefiHiiEditorBytes,
  downloadModifiedUefiHiiModules,
} from "./uefiHiiPatcher";

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

function wrappedVolume(inner = volume(), ownPackage: boolean | Uint8Array = false) {
  const direct =
    ownPackage instanceof Uint8Array
      ? ownPackage
      : ownPackage
        ? formsPackage(4)
        : new Uint8Array();
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
  const carrier = inventory.modules.find((module) => module.ownership);
  const selected = carrier
    ? [carrier, ...inventory.modules.filter((module) => !module.ownership).slice(0, 1)]
    : inventory.modules.slice(0, 2);
  const modules = selected.map((module) => {
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
      ownedPackages: module.packages.map(({ offset, end }) => ({ offset, end })),
      nestedPayloadRanges: module.nestedPayloadRanges,
    };
    start = summary.sourceEnd;
    return summary;
  });
  const sourceBytes = new Uint8Array(start);
  for (const [index, module] of modules.entries())
    sourceBytes.set(selected[index].bytes, module.sourceStart);
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
  const workspace: UefiHiiWorkspace = {
    data,
    modules,
    sourceBytes,
    editorBytes: createUefiHiiEditorBytes(sourceBytes, modules),
    warnings: [],
  };
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
      // Summary claims cannot remove or widen the builder's freshly derived
      // package bounds. Source ownership comes from independent discovery.
      workspace.modules[0].ownedPackages = [];
      workspace.modules[1].ownedPackages = [
        {
          offset: 0,
          end: workspace.modules[1].sourceEnd - workspace.modules[1].sourceStart,
        },
      ];
      const original = image.slice();
      const sourceBytes = workspace.sourceBytes.slice();
      vi.mocked(decodeFirmwareBuffers).mockClear();
      const result = await buildUefiHiiFirmwareImage(data, workspace, image);
      expect(decodeFirmwareBuffers).toHaveBeenCalledTimes(2);
      expect(result.image).toHaveLength(image.length);
      expect(result.modifiedModuleIds).toEqual(
        workspace.modules.map((module) => module.id),
      );
      expect(result.verifiedModules).toEqual(
        workspace.modules.map((module) => ({
          moduleId: module.id,
          name: module.name,
          fileGuid: module.fileGuid,
          physicalCopies: [
            {
              bufferId: inventory.modules.find(
                (candidate) => candidate.id === module.id,
              )?.file.bufferId,
              fileStart: inventory.modules.find(
                (candidate) => candidate.id === module.id,
              )?.file.fileStart,
            },
          ],
        })),
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

  it.each([
    "raw-parent",
    "raw-child",
    "raw-both",
    "spi-parent",
    "spi-child",
    "spi-both",
    "double-spi-parent",
    "double-spi-child",
    "double-spi-both",
  ])(
    "combines mixed identity edits and independently verifies %s output",
    async (kind) => {
      const bios = wrappedVolume(volume(), true);
      const image = kind.startsWith("double")
        ? spi(wrappedVolume(bios))
        : kind.startsWith("spi")
          ? spi(bios)
          : bios;
      const original = image.slice();
      const { data, workspace, inventory } = await workspaceFor(image);
      expect(inventory.modules).toHaveLength(4);
      const carrier = inventory.modules.find((module) => module.ownership);
      expect(carrier).toMatchObject({
        ownership: "mixed-direct-nested",
        formCount: 1,
        referenceCount: 1,
        formSetGuids: ["04040404-0404-0404-0404-040404040404"],
        packages: [{ offset: 4, end: 62 }],
      });
      expect(carrier?.bytes).toEqual(bios.slice(0x60, 0x64 + 64 + 0x1000));
      const inner = inventory.modules.filter((module) => !module.ownership);
      expect(inner).toHaveLength(3);
      expect(inner.every((module) => module.ownership === undefined)).toBe(true);
      expect(inner.flatMap((module) => module.formSetGuids)).not.toContain(
        carrier?.formSetGuids[0],
      );
      if (!carrier) throw new Error("missing mixed carrier");
      const view = createUefiHiiOwnedPackageView(carrier);
      expect(view.ownedPackages).toEqual([{ offset: 4, end: 62 }]);
      expect(view.bytes.slice(68)).toEqual(new Uint8Array(0x1000));
      expect(inventory.decodeFailures).toEqual([]);
      if (kind.endsWith("parent")) data.suppressions[1].active = true;
      if (kind.endsWith("child")) data.suppressions[0].active = true;
      const result = await buildUefiHiiFirmwareImage(data, workspace, image);
      const reopened = inventoryUefiHiiModules(
        await decodeFirmwareBuffers(result.image),
      );
      expect(reopened.modules).toHaveLength(4);
      expect(reopened.decodeFailures).toEqual([]);
      for (const [index, summary] of workspace.modules.entries()) {
        const module = reopened.modules.find(
          (candidate) => candidate.id === summary.id,
        );
        expect(module?.bytes.slice(41, 43)).toEqual(
          data.suppressions[index].active
            ? Uint8Array.of(0x0f, 15)
            : Uint8Array.of(0x29, 2),
        );
      }
      for (const module of inventory.modules.filter(
        (candidate) =>
          !workspace.modules.some((summary) => summary.id === candidate.id),
      )) {
        expect(
          reopened.modules.find((candidate) => candidate.id === module.id)?.bytes,
        ).toEqual(module.bytes);
      }
      expect(result.image).toHaveLength(image.length);
      expect(result.modifiedModuleIds).toHaveLength(kind.endsWith("both") ? 2 : 1);
      if (kind.includes("spi")) {
        expect(result.image.slice(0, 0x2000)).toEqual(original.slice(0, 0x2000));
        expect(result.spaceReport.preservedOutsideBiosBytes).toBe(0x2000);
      }
      expect(workspace.editorBytes).toEqual(
        createUefiHiiEditorBytes(workspace.sourceBytes, workspace.modules),
      );
      expect(image).toEqual(original);
    },
  );

  it("queues a parent Ref move plus child Show through the isolated workspace and complete SPI rebuild", async () => {
    const pkg = new Uint8Array(68);
    uint24(pkg, 0, pkg.length);
    pkg[3] = 2;
    pkg.set([0x0e, 0x97], 4);
    pkg.fill(4, 6, 22);
    pkg.set([1, 0x86, 1, 0, 1, 0], 27);
    pkg.set([0x0f, 15, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 3, 0], 33);
    pkg.set(
      [0x29, 2, 1, 0x86, 2, 0, 2, 0, 0x29, 2, 1, 0x86, 3, 0, 3, 0, 0x29, 2, 0x29, 2],
      48,
    );
    const image = spi(wrappedVolume(volume(), pkg));
    const inventory = inventoryUefiHiiModules(await decodeFirmwareBuffers(image));
    const carrier = inventory.modules.find((module) => module.ownership);
    const child = inventory.modules.find((module) => !module.ownership);
    if (!carrier || !child) throw new Error("missing owners");
    carrier.name = "SetupCarrier";
    child.name = "SetupChild";
    const workspace = await buildUefiHiiWorkspace(inventory, (view) => {
      const model = analyzeIfrBinary(view);
      expect(model.packages).toHaveLength(1);
      const text = model.packages[0].opcodes
        .map((span) => {
          const bytes =
            bytesToHex(view.slice(span.offset, span.end))
              .toUpperCase()
              .match(/../g)
              ?.join(" ") ?? "";
          const prefix = `0x${span.offset.toString(16)}:`;
          if (span.opcode === IFR_OPCODE.FORM_SET)
            return `${prefix} FormSet Guid: ${span.formSetGuid ?? ""}, Title: "Setup", Help: "" { ${bytes} }`;
          if (span.opcode === IFR_OPCODE.FORM)
            return `${prefix} Form FormId: 0x${span.formId?.toString(16) ?? ""}, Title: "Form ${String(span.formId)}" { ${bytes} }`;
          if (span.opcode === IFR_OPCODE.REF)
            return `${prefix} Ref Prompt: "Target", Help: "", QuestionFlags: 0x0, QuestionId: 0x1, VarStoreId: 0x0, VarStoreInfo: 0x0, FormId: 0x${span.formId?.toString(16) ?? ""} { ${bytes} }`;
          return `${prefix} ${span.name} { ${bytes} }`;
        })
        .join("\n");
      return Promise.resolve(text);
    });
    expect(workspace.modules).toHaveLength(2);
    expect(workspace.data.ifrBinary?.packages).toHaveLength(2);
    const base = workspace.data;
    const childSummary = workspace.modules.find((module) => module.id === child.id);
    if (!childSummary || !workspace.editorBytes)
      throw new Error("missing workspace ownership");
    base.suppressions = [
      condition({
        offset: `0x${(childSummary.sourceStart + 37).toString(16)}`,
        start: `0x${(childSummary.sourceStart + 41).toString(16)}`,
        end: `0x${(childSummary.sourceStart + 56).toString(16)}`,
      }),
    ];
    const sourceFormIndex = base.forms.findIndex(
      (form) =>
        form.sourceModuleId === carrier.id && Number.parseInt(form.formId) === 1,
    );
    const destinationFormIndex = base.forms.findIndex(
      (form) =>
        form.sourceModuleId === carrier.id && Number.parseInt(form.formId) === 2,
    );
    const moved = await moveMenuReference(base, bytesToHex(workspace.editorBytes), {
      sourceFormIndex,
      referenceChildIndex: 0,
      destinationFormIndex,
    });
    const shown = structuredClone(moved);
    shown.suppressions[0].active = false;
    const moveEntry = createDataChangeEntry(base, moved, "parent-move");
    const showEntry = createDataChangeEntry(moved, shown, "child-show");
    if (!moveEntry || !showEntry) throw new Error("missing queue entries");
    const applied = projectDataChangeQueue(base, [moveEntry, showEntry]);
    expect(applied.analysis.canApply).toBe(true);
    const result = await buildUefiHiiFirmwareImage(applied.data, workspace, image);
    expect(result.modifiedModuleIds).toHaveLength(2);
    const reopened = inventoryUefiHiiModules(await decodeFirmwareBuffers(result.image));
    const parentOutput = reopened.modules.find((module) => module.id === carrier.id);
    const childOutput = reopened.modules.find((module) => module.id === child.id);
    if (!parentOutput || !childOutput) throw new Error("missing output owners");
    const refs = parentOutput.packages[0].opcodes.filter(
      (span) => span.opcode === IFR_OPCODE.REF,
    );
    expect(refs).toMatchObject([{ formId: 3, ownerFormId: 2 }]);
    expect(childOutput.bytes.slice(41, 43)).toEqual(Uint8Array.of(0x29, 2));
    expect(result.image.slice(0, 0x2000)).toEqual(image.slice(0, 0x2000));
  });

  it("preserves an unselected mixed parent while rebuilding its independently selected child", async () => {
    const image = wrappedVolume(volume(), true);
    const { data, workspace, inventory } = await workspaceFor(image);
    const child = workspace.modules[1];
    const childBytes = workspace.sourceBytes.slice(child.sourceStart, child.sourceEnd);
    const childData = firmwareData({
      firmwareFamily: "uefi-hii",
      forms: [],
      suppressions: [
        condition({ active: false, offset: "0x25", start: "0x29", end: "0x38" }),
      ],
    });
    const childWorkspace: UefiHiiWorkspace = {
      data: childData,
      modules: [{ ...child, sourceStart: 0, sourceEnd: childBytes.length }],
      sourceBytes: childBytes,
      editorBytes: childBytes.slice(),
      warnings: [],
    };
    const result = await buildUefiHiiFirmwareImage(childData, childWorkspace, image);
    const reopened = inventoryUefiHiiModules(await decodeFirmwareBuffers(result.image));
    const parent = inventory.modules.find((module) => module.ownership);
    const parentOutput = reopened.modules.find((module) => module.id === parent?.id);
    if (!parent || !parentOutput) throw new Error("missing parent");
    expect(createUefiHiiOwnedPackageView(parentOutput).bytes).toEqual(
      createUefiHiiOwnedPackageView(parent).bytes,
    );
    expect(
      reopened.modules.find((module) => module.id === child.id)?.bytes.slice(41, 43),
    ).toEqual(Uint8Array.of(0x29, 2));
    expect(data).toEqual(workspace.data);
  });

  it("rejects a stale editor view and rederives omitted summary envelopes", async () => {
    const image = wrappedVolume(volume(), true);
    const { data, workspace } = await workspaceFor(image);
    if (!workspace.editorBytes) throw new Error("missing editor view");
    workspace.editorBytes[68] = 1;
    await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
      /editor view/,
    );
    workspace.editorBytes[68] = 0;
    delete workspace.modules[0].nestedPayloadRanges;
    await expect(
      buildUefiHiiFirmwareImage(data, workspace, image),
    ).resolves.toHaveProperty("containerKind", "bios-image");
  });

  it.each([
    "outside",
    "fv-header",
    "checksum",
    "header-checksum",
    "data-checksum",
    "edited-body",
    "provenance",
    "missing-node",
  ])("independently rejects %s corruption in a mixed read-back", async (problem) => {
    const image = wrappedVolume(volume(), true);
    const { data, workspace } = await workspaceFor(image);
    const original = await decodeFirmwareBuffers(image);
    const { decodeFirmwareBuffers: actualDecode } =
      await vi.importActual<typeof import("./aptioIvExtractor")>("./aptioIvExtractor");
    vi.mocked(decodeFirmwareBuffers)
      .mockResolvedValueOnce(original)
      .mockImplementationOnce(async (bytes) => {
        const result = await actualDecode(bytes);
        const child = result.buffers.find((node) => node.parent);
        if (!child?.parent) throw new Error("missing child");
        if (problem === "outside")
          result.buffers[0].bytes[result.buffers[0].bytes.length - 1] ^= 1;
        if (problem === "fv-header") child.bytes[0x10] ^= 1;
        if (problem === "checksum") child.bytes[0x48 + 16] ^= 1;
        if (problem === "header-checksum") result.buffers[0].bytes[0x48 + 16] ^= 1;
        if (problem === "data-checksum") result.buffers[0].bytes[0x48 + 17] ^= 1;
        if (problem === "edited-body") {
          child.bytes[0x60 + 45] ^= 1;
          for (const file of inventoryFirmwareFiles(child)) {
            child.bytes[file.fileStart + 17] =
              -sum(child.bytes.slice(file.bodyStart, file.end)) & 255;
            const header = child.bytes.slice(file.fileStart, file.bodyStart);
            header[17] = 0;
            header[23] = 0;
            header[16] = 0;
            child.bytes[file.fileStart + 16] = -sum(header) & 255;
          }
          const parent = result.buffers[0];
          parent.bytes.set(child.bytes, child.parent.payloadStart);
          const file = child.parent.ownerFile;
          if (!file) throw new Error("missing owner");
          parent.bytes[file.fileStart + 17] =
            -sum(parent.bytes.slice(file.bodyStart, file.end)) & 255;
          const header = parent.bytes.slice(file.fileStart, file.bodyStart);
          header[17] = 0;
          header[23] = 0;
          header[16] = 0;
          parent.bytes[file.fileStart + 16] = -sum(header) & 255;
        }
        if (problem === "provenance") child.parent.sectionEnd--;
        if (problem === "missing-node") result.buffers.pop();
        return result;
      });
    await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
      /unowned decoded byte|payload does not match|did not match|provenance changed|inventory changed|checksum is invalid/,
    );
  });

  it("confines staged mixed-carrier patches to its own package without exporting an image", async () => {
    const image = wrappedVolume(volume(), true);
    const original = image.slice();
    const inventory = inventoryUefiHiiModules(await decodeFirmwareBuffers(image));
    const carrier = inventory.modules.find((module) => module.ownership);
    if (!carrier) throw new Error("missing carrier");
    const { ownedPackages } = createUefiHiiOwnedPackageView(carrier);
    const summary = {
      id: carrier.id,
      name: carrier.name,
      fileGuid: carrier.file.guid,
      formSetGuids: carrier.formSetGuids,
      formCount: 1,
      referenceCount: 1,
      mirroredBufferIds: [],
      sourceStart: 0,
      sourceEnd: carrier.bytes.length,
      ownedPackages,
      nestedPayloadRanges: carrier.nestedPayloadRanges,
    };
    const data = firmwareData({
      firmwareFamily: "uefi-hii",
      forms: [],
      suppressions: [
        condition({ active: false, offset: "0x25", start: "0x29", end: "0x38" }),
      ],
    });
    const patches = buildUefiHiiModulePatches(data, carrier.bytes, [summary]);
    expect(patches).toHaveLength(1);
    expect(patches[0].bytes.slice(41, 43)).toEqual(Uint8Array.of(0x29, 2));
    expect(patches[0].bytes.slice(62)).toEqual(carrier.bytes.slice(62));
    const nestedBase = 68 + 0x60;
    data.suppressions = [
      condition({
        active: false,
        offset: `0x${(nestedBase + 37).toString(16)}`,
        start: `0x${(nestedBase + 41).toString(16)}`,
        end: `0x${(nestedBase + 56).toString(16)}`,
      }),
    ];
    expect(() => buildUefiHiiModulePatches(data, carrier.bytes, [summary])).toThrow(
      /closing End/,
    );
    data.suppressions = [
      condition({ active: false, offset: "0x25", start: "0x29", end: "0x38" }),
    ];
    expect(() => {
      downloadModifiedUefiHiiModules(data, carrier.bytes, [summary]);
    }).toThrow(/complete-image download/);
    expect(image).toEqual(original);
  });

  it("blocks a valid HII package crossing a truncated nested FFS allocation", async () => {
    const image = wrappedVolume();
    uint24(image, 0x64 + 0x48 + 20, 44);
    const { data, workspace, inventory } = await workspaceFor(image);
    expect(inventory.decodeFailures).toEqual([
      expect.stringContaining("crossing or unowned HII packages"),
    ]);
    await expect(buildUefiHiiFirmwareImage(data, workspace, image)).rejects.toThrow(
      /unresolved ownership/,
    );
  });

  it("does not assign a package in nested FV free space to the outer carrier", async () => {
    const image = wrappedVolume(volume(), true);
    image.set(formsPackage(5), 0x64 + 64 + 0x500);
    const { data, workspace, inventory } = await workspaceFor(image);
    expect(inventory.modules).toHaveLength(3);
    expect(inventory.modules.every((module) => module.bufferId === 1)).toBe(true);
    expect(inventory.decodeFailures).toEqual([
      expect.stringContaining("crossing or unowned HII packages"),
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

  it("verifies a mixed ancestor using the PI fixed 0xAA data-checksum convention", async () => {
    const image = wrappedVolume(volume(), true);
    image[0x5b] &= ~0x40;
    image[0x59] = 0xaa;
    const header = image.slice(0x48, 0x60);
    header[16] = 0;
    header[17] = 0;
    header[23] = 0;
    image[0x58] = -sum(header) & 255;
    const { data, workspace } = await workspaceFor(image);
    const result = await buildUefiHiiFirmwareImage(data, workspace, image);
    expect(result.image[0x59]).toBe(0xaa);
  });

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
