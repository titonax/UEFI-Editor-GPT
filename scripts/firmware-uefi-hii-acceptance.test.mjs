import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, it, vi } from "vitest";
import { acceptedUefiHiiLzmaImage } from "../src/components/scripts/firmwareAcceptance";
import {
  decodeFirmwareBuffers,
  inventoryFirmwareFiles,
  extractIfrTextFromHii,
} from "../src/components/scripts/aptioIvExtractor";
import { inventoryUefiHiiModules } from "../src/components/scripts/uefiHiiDiscovery";
import { buildUefiHiiWorkspace } from "../src/components/scripts/uefiHiiWorkspace";
import { buildUefiHiiFirmwareImage } from "../src/components/scripts/uefiHiiFirmwareRebuilder";
import { buildUefiHiiModulePatches } from "../src/components/scripts/uefiHiiPatcher";
import {
  analyzeMenuMoveDestinations,
  moveMenuReference,
} from "../src/components/scripts/menuEditing";
import {
  createDataChangeEntry,
  projectDataChangeQueue,
} from "../src/components/ChangeQueue/dataChangeQueue";
import { analyzeIfrBinary, IFR_OPCODE } from "../src/components/scripts/ifrBinary";
import { parseIfrText } from "../src/components/scripts/ifrTextParser";
import { bytesToHex } from "../src/components/scripts/hex";
import { sha256Hex } from "../src/components/scripts/checksum";

function sameBytes(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}
function checkFile(bytes, file) {
  const sum = (input) => input.reduce((total, byte) => (total + byte) & 255, 0);
  const header = bytes.slice(file.fileStart, file.bodyStart);
  header[17] = 0;
  header[23] = 0;
  expect(sum(header)).toBe(0);
  if (bytes[file.fileStart + 19] & 0x40)
    expect(
      (sum(bytes.subarray(file.bodyStart, file.end)) + bytes[file.fileStart + 17]) &
        255,
    ).toBe(0);
  else expect(bytes[file.fileStart + 17]).toBe(0xaa);
}

it("rebuilds the accepted P53 SPI through one queued Ref move in both LZMA copies", async () => {
  const imagePath = process.env.FIRMWARE_ACCEPTANCE_IMAGE;
  const wasmDirectory = process.env.FIRMWARE_ACCEPTANCE_WASM_DIR;
  if (!imagePath || !wasmDirectory)
    throw Error("Set FIRMWARE_ACCEPTANCE_IMAGE and FIRMWARE_ACCEPTANCE_WASM_DIR.");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    async (url) =>
      new Response(readFileSync(join(wasmDirectory, basename(String(url)))), {
        headers: { "Content-Type": "application/wasm" },
      }),
  );
  const image = new Uint8Array(readFileSync(imagePath));
  expect(await sha256Hex(image)).toBe(acceptedUefiHiiLzmaImage.sha256);
  expect(image.length).toBe(acceptedUefiHiiLzmaImage.size);
  const decoded = await decodeFirmwareBuffers(image);
  const inventory = inventoryUefiHiiModules(decoded);
  expect(inventory.decodeFailures).toEqual([]);
  expect(inventory.modules).toHaveLength(25);
  const workspace = await buildUefiHiiWorkspace(inventory);
  const base = workspace.data;
  expect(workspace.modules).toHaveLength(9);
  expect(base.forms).toHaveLength(187);
  const sourceFormIndex = base.forms.findIndex(
    (form) =>
      form.name === "Intel Advanced Menu" &&
      form.sourceModuleId === workspace.modules[0].id,
  );
  const referenceChildIndex = base.forms[sourceFormIndex].children.findIndex(
    (child) => child.type === "Ref" && child.ifrOffset.toLowerCase() === "0x6ab87",
  );
  const source = base.forms[sourceFormIndex];
  const ref = source.children[referenceChildIndex];
  expect(ref.name).toBe("Debug Settings");
  const destinationFormIndex = base.forms.findIndex(
    (form) =>
      form.name === "PCI Subsystem Settings" && form.formSetGuid === source.formSetGuid,
  );
  expect(
    analyzeMenuMoveDestinations(
      base,
      bytesToHex(workspace.editorBytes ?? workspace.sourceBytes),
      sourceFormIndex,
      referenceChildIndex,
    )[destinationFormIndex].compatibility,
  ).toBe("safe-same-package");
  const staged = await moveMenuReference(
    base,
    bytesToHex(workspace.editorBytes ?? workspace.sourceBytes),
    {
      sourceFormIndex,
      referenceChildIndex,
      destinationFormIndex,
    },
  );
  const entry = createDataChangeEntry(base, staged, "move-debug");
  expect(entry).not.toBeNull();
  const applied = projectDataChangeQueue(base, [entry]);
  expect(applied.analysis.canApply).toBe(true);
  const patches = buildUefiHiiModulePatches(
    applied.data,
    workspace.sourceBytes,
    workspace.modules,
  );
  expect(patches).toHaveLength(1);
  expect(patches[0].module.fileGuid).toBe(acceptedUefiHiiLzmaImage.fileGuid);
  const otherGate = base.suppressions.find(
    (condition) =>
      condition.constant === true &&
      condition.kind === "SuppressIf" &&
      workspace.modules.some(
        (module) =>
          module.fileGuid !== acceptedUefiHiiLzmaImage.fileGuid &&
          Number.parseInt(condition.offset, 16) >= module.sourceStart &&
          Number.parseInt(condition.end, 16) < module.sourceEnd,
      ),
  );
  expect(otherGate).toBeDefined();
  const otherDriver = structuredClone(base);
  otherDriver.suppressions.find(
    (condition) => condition.offset === otherGate.offset,
  ).active = false;
  await expect(
    buildUefiHiiFirmwareImage(otherDriver, workspace, image),
  ).rejects.toThrow(/Only the accepted Setup FFS/);
  const result = await buildUefiHiiFirmwareImage(applied.data, workspace, image);
  expect(await sha256Hex(result.image)).toBe(
    "4c52549b9df88a7763eedf4fa0cf842909d800431b10a88c76d73c851792d10b",
  );
  expect(result.changedByteCount).toBe(8991518);
  expect(result.image.length).toBe(image.length);
  expect(result.containerKind).toBe("intel-spi");
  expect(result.modifiedModuleIds).toEqual([workspace.modules[0].id]);
  expect(result.verifiedModules).toEqual([
    {
      moduleId: workspace.modules[0].id,
      name: workspace.modules[0].name,
      fileGuid: acceptedUefiHiiLzmaImage.fileGuid,
      physicalCopies: [
        { bufferId: 2, fileStart: 4127440 },
        { bufferId: 4, fileStart: 4127440 },
      ],
    },
  ]);
  expect(result.spaceReport.preservedOutsideBiosBytes).toBe(10485760);
  expect(result.spaceReport.affectedRanges).toEqual([
    { start: 13238344, end: 17752012 },
    { start: 21495880, end: 26009548 },
  ]);
  for (const section of result.spaceReport.compressedSections)
    expect(section).toMatchObject({
      compression: "lzma",
      originalPackedBytes: 4513620,
      rebuiltPackedBytes: 4491300,
      verifiedCapacityBytes: 4513620,
      remainingBytes: 22320,
    });
  expect(result.spaceReport.compressedSections).toHaveLength(2);
  let cursor = 0;
  for (const range of result.spaceReport.affectedRanges) {
    expect(
      sameBytes(
        image.subarray(cursor, range.start),
        result.image.subarray(cursor, range.start),
      ),
    ).toBe(true);
    cursor = range.end;
  }
  expect(sameBytes(image.subarray(cursor), result.image.subarray(cursor))).toBe(true);
  expect(await sha256Hex(image)).toBe(acceptedUefiHiiLzmaImage.sha256);
  const reopened = await decodeFirmwareBuffers(result.image);
  expect(reopened.decodeFailures).toEqual([]);
  expect(inventoryUefiHiiModules(reopened).modules).toHaveLength(25);
  const move = applied.data.ifrEdits[0];
  for (const bufferId of [2, 4]) {
    const node = reopened.buffers.find((node) => node.id === bufferId);
    const file = inventoryFirmwareFiles(node).find(
      (file) => file.guid === acceptedUefiHiiLzmaImage.fileGuid,
    );
    const body = node.bytes.slice(file.bodyStart, file.end);
    expect(sameBytes(body, patches[0].bytes)).toBe(true);
    checkFile(node.bytes, file);
    checkFile(result.image, node.parent.ownerFile);
    const model = analyzeIfrBinary(body);
    expect(model.packages.every((pkg) => pkg.valid)).toBe(true);
    const refs = model.packages
      .flatMap((pkg) => pkg.opcodes)
      .filter(
        (span) =>
          span.opcode === IFR_OPCODE.REF &&
          span.formId === 0x1006 &&
          span.ownerFormSetGuid === source.formSetGuid &&
          sameBytes(body.slice(span.offset, span.end), Uint8Array.from(move.expected)),
      );
    expect(refs).toHaveLength(1);
    expect(refs[0].ownerFormId).toBe(
      Number.parseInt(base.forms[destinationFormIndex].formId),
    );
    const reread = parseIfrText(await extractIfrTextFromHii(body), "");
    const count = (forms, form) =>
      forms
        .find(
          (candidate) =>
            candidate.formId === form.formId &&
            candidate.formSetGuid === form.formSetGuid,
        )
        .children.filter(
          (child) =>
            child.type === "Ref" &&
            child.formId === ref.formId &&
            child.name === ref.name,
        ).length;
    expect(count(reread.forms, source)).toBe(count(base.forms, source) - 1);
    expect(count(reread.forms, base.forms[destinationFormIndex])).toBe(
      count(base.forms, base.forms[destinationFormIndex]) + 1,
    );
  }
  const stale = structuredClone(applied.data);
  stale.ifrEdits[0].expected[0] ^= 1;
  await expect(buildUefiHiiFirmwareImage(stale, workspace, image)).rejects.toThrow(
    /IFR move precondition failed/,
  );
  const incomplete = { ...workspace, modules: structuredClone(workspace.modules) };
  incomplete.modules[0].mirroredBufferIds = [];
  await expect(
    buildUefiHiiFirmwareImage(applied.data, incomplete, image),
  ).rejects.toThrow(/Mirrored/);
  const changed = image.slice();
  changed[0x2000] ^= 1;
  await expect(
    buildUefiHiiFirmwareImage(applied.data, workspace, changed),
  ).rejects.toThrow(/Mirrored/);
}, 300000);
