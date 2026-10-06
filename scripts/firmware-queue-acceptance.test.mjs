import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, it, vi } from "vitest";
import { acceptedTianoSetupImage } from "../src/components/scripts/firmwareAcceptance";
import { extractAmiFirmwareBytes } from "../src/components/scripts/amiFirmwareExtractor";
import { parseData } from "../src/components/scripts/scripts";
import { buildAmiFirmwareImage } from "../src/components/scripts/amiFirmwareRebuilder";
import { buildFirmwarePatches } from "../src/components/scripts/patcher";
import { toggleAmiRootVisibility } from "../src/components/scripts/amiRootVisibilityEditing";
import { moveMenuReference } from "../src/components/scripts/menuEditing";
import {
  createDataChangeEntry,
  projectDataChangeQueue,
} from "../src/components/ChangeQueue/dataChangeQueue";
import { analyzeIfrBinary } from "../src/components/scripts/ifrBinary";
import { bytesToHex } from "../src/components/scripts/hex";
import { sha256Hex } from "../src/components/scripts/checksum";
import { readFirmwareSection } from "../src/components/scripts/firmwareSections";
import { inspectFirmwareImageLayout } from "../src/components/scripts/firmwareImageContainer";

it("real combined queue through complete Tiano SPI reconstruction", async () => {
  const imagePath = process.env.FIRMWARE_ACCEPTANCE_IMAGE;
  const wasmDirectory = process.env.FIRMWARE_ACCEPTANCE_WASM_DIR;
  if (!imagePath || !wasmDirectory)
    throw new Error("Set FIRMWARE_ACCEPTANCE_IMAGE and FIRMWARE_ACCEPTANCE_WASM_DIR.");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    async (url) =>
      new Response(readFileSync(join(wasmDirectory, basename(String(url)))), {
        headers: { "Content-Type": "application/wasm" },
      }),
  );
  const original = new Uint8Array(readFileSync(imagePath));
  const originalHash = await sha256Hex(original);
  expect(originalHash).toBe(acceptedTianoSetupImage.sha256);
  expect(original.length).toBe(acceptedTianoSetupImage.size);
  const artifacts = await extractAmiFirmwareBytes(original);
  const container = (bytes, name, textContent = bytesToHex(bytes)) => ({
    file: new File([bytes], name),
    textContent,
    isWrongFile: false,
  });
  const filesFor = (opened, imageHash) => ({
    setupSctContainer: container(opened.hii, "setup.bin"),
    setupTxtContainer: container(
      new TextEncoder().encode(opened.ifrText),
      "setup.txt",
      opened.ifrText,
    ),
    amitseSctContainer: container(opened.amitse ?? new Uint8Array(), "amitse.bin"),
    setupdataBinContainer: container(
      opened.setupData ?? new Uint8Array(),
      "setupdata.bin",
    ),
    firmwareSource: {
      fileName: basename(imagePath),
      artifacts: opened,
      sourceSha256: imageHash,
    },
  });
  const files = filesFor(artifacts, originalHash);
  const base = await parseData(files);
  const untouchedState = JSON.stringify(base);
  const entries = [];
  let staged = base;
  const add = (next, id) => {
    const entry = createDataChangeEntry(staged, next, id);
    expect(entry).not.toBeNull();
    entries.push(entry);
    staged = next;
  };
  const guid = "08C0EEFB-0A0B-4D5F-8E52-2970881A7137";
  const sourceFormIndex = base.forms.findIndex(
    (form) => form.formId.toLowerCase() === "0x405" && form.formSetGuid === guid,
  );
  const destinationFormIndex = base.forms.findIndex(
    (form) => form.formId.toLowerCase() === "0x4cd" && form.formSetGuid === guid,
  );
  const referenceChildIndex = base.forms[sourceFormIndex].children.findIndex(
    (child) => child.type === "Ref" && child.ifrOffset?.toLowerCase() === "0x9719a",
  );
  add(
    await moveMenuReference(staged, files.setupSctContainer.textContent, {
      sourceFormIndex,
      referenceChildIndex,
      destinationFormIndex,
    }),
    "move",
  );
  const visible = structuredClone(staged);
  visible.suppressions.find(
    (condition) => condition.offset.toLowerCase() === "0x8b359",
  ).active = false;
  add(visible, "hii");
  const access = structuredClone(staged);
  const question = access.forms
    .flatMap((form) => form.children)
    .find(
      (child) =>
        child.questionId.toLowerCase() === "0x4" &&
        child.offsets?.accessLevel.toLowerCase() === "0x2f7c",
    );
  expect(question.accessLevel).toBe("01");
  question.accessLevel = "00";
  add(access, "setupdata");
  const beforeRoot = structuredClone(staged);
  const roots = structuredClone(staged);
  const rootIndex = 4;
  roots.rootVisibilityEdits = toggleAmiRootVisibility(roots, rootIndex);
  add(roots, "rootvisibility");
  expect(entries).toHaveLength(4);
  expect(JSON.stringify(base)).toBe(untouchedState);
  const projected = projectDataChangeQueue(base, entries);
  expect(projected.analysis.canApply).toBe(true);
  expect(
    projected.analysis.issues.filter((issue) => issue.severity === "error"),
  ).toEqual([]);
  expect(projected.data).toEqual(staged);
  const restored = structuredClone(projected.data);
  restored.rootVisibilityEdits = toggleAmiRootVisibility(restored, rootIndex);
  const restoreEntry = createDataChangeEntry(projected.data, restored, "restore-root");
  const incoherent = projectDataChangeQueue(base, [
    ...entries.slice(0, 3),
    restoreEntry,
  ]);
  expect(incoherent.analysis.canApply).toBe(false);
  expect(
    incoherent.analysis.issues.some((issue) => issue.code === "stale-logical-state"),
  ).toBe(true);
  const tool = structuredClone(beforeRoot);
  tool.rootVisibilityEdits = toggleAmiRootVisibility(tool, 5);
  const toolEntry = createDataChangeEntry(beforeRoot, tool, "hide-tool");
  const oversized = projectDataChangeQueue(base, [...entries.slice(0, 3), toolEntry]);
  expect(oversized.analysis.canApply).toBe(true);
  await expect(buildAmiFirmwareImage(oversized.data, files)).rejects.toThrow(
    "Compressed section cannot grow beyond its FFS allocation.",
  );
  expect(await sha256Hex(original)).toBe(originalHash);
  expect(JSON.stringify(base)).toBe(untouchedState);
  const expected = buildFirmwarePatches(
    { ...projected.data, rootVisibilityEdits: undefined },
    {
      setupSct: files.setupSctContainer.textContent,
      amitseSct: files.amitseSctContainer.textContent,
      setupdataBin: files.setupdataBinContainer.textContent,
    },
  );
  expect(expected.setupSct).toBeDefined();
  expect(expected.setupdataBin).toBeDefined();
  expect(expected.amitseSct).toBeUndefined();
  const result = await buildAmiFirmwareImage(projected.data, files);
  const reopened = await extractAmiFirmwareBytes(result.image);
  expect(await sha256Hex(reopened.hii)).toBe(await sha256Hex(expected.setupSct));
  expect(await sha256Hex(reopened.setupData)).toBe(
    await sha256Hex(expected.setupdataBin),
  );
  expect(await sha256Hex(reopened.amitse)).toBe(await sha256Hex(artifacts.amitse));
  for (const [kind, replacement] of [
    ["setup-hii", expected.setupSct],
    ["setupdata", expected.setupdataBin],
  ]) {
    const location = artifacts.provenance.artifacts.find(
      (entry) => entry.kind === kind,
    );
    const originalNode = artifacts.provenance.buffers.find(
      (node) => node.id === location.bufferId,
    );
    const expectedNode = originalNode.bytes.slice();
    expectedNode.set(replacement, location.payloadStart);
    if (kind === "setup-hii")
      expectedNode[base.rootVisibility.entries[rootIndex].bufferOffset] = 0;
    const reopenedLocation = reopened.provenance.artifacts.find(
      (entry) => entry.kind === kind,
    );
    const reopenedNode = reopened.provenance.buffers.find(
      (node) => node.id === reopenedLocation.bufferId,
    );
    expect(await sha256Hex(reopenedNode.bytes)).toBe(await sha256Hex(expectedNode));
  }
  const binary = analyzeIfrBinary(reopened.hii);
  expect(binary.packages).toHaveLength(7);
  expect(binary.packages.every((pkg) => pkg.valid)).toBe(true);
  const parsed = await parseData(filesFor(reopened, await sha256Hex(result.image)));
  expect(parsed.forms).toHaveLength(70);
  expect(reopened.formPackageCount).toBe(7);
  expect(parsed.rootVisibility.status).toBe("detected");
  expect(parsed.rootVisibility.entries.map((entry) => entry.value)).toEqual(
    Array.from({ length: 7 }, (_, index) => (index === rootIndex ? 0 : 1)),
  );
  const source = parsed.forms.find(
    (form) => form.formId.toLowerCase() === "0x405" && form.formSetGuid === guid,
  );
  const destination = parsed.forms.find(
    (form) => form.formId.toLowerCase() === "0x4cd" && form.formSetGuid === guid,
  );
  expect(
    source.children.some(
      (child) => child.type === "Ref" && child.formId.toLowerCase() === "0x4a9",
    ),
  ).toBe(false);
  expect(
    destination.children.filter(
      (child) => child.type === "Ref" && child.formId.toLowerCase() === "0x4a9",
    ),
  ).toHaveLength(1);
  const owners = ["setup-hii", "setupdata"].map((kind) => {
    const location = artifacts.provenance.artifacts.find(
      (entry) => entry.kind === kind,
    );
    let node = artifacts.provenance.buffers.find(
      (entry) => entry.id === location.bufferId,
    );
    while (node.parent.parentBufferId !== artifacts.provenance.rootBufferId) {
      node = artifacts.provenance.buffers.find(
        (entry) => entry.id === node.parent.parentBufferId,
      );
    }
    return {
      kind,
      start: node.parent.ownerFile.fileStart,
      end: node.parent.ownerFile.end,
    };
  });
  const layout = inspectFirmwareImageLayout(original);
  let changedBytes = 0;
  let changedOutsideOwner = 0;
  let changedOutsideBios = 0;
  for (let offset = 0; offset < original.length; offset++) {
    if (original[offset] === result.image[offset]) continue;
    if (offset < layout.biosStart || offset >= layout.biosEnd) changedOutsideBios++;
    if (!owners.some((owner) => offset >= owner.start && offset < owner.end))
      changedOutsideOwner++;
    changedBytes++;
  }
  expect(result.spaceReport.biosStart).toBe(layout.biosStart);
  expect(result.spaceReport.biosEnd).toBe(layout.biosEnd);
  expect(result.spaceReport.preservedOutsideBiosBytes).toBe(1572864);
  expect(result.spaceReport.affectedRanges).toEqual(
    owners.map(({ start, end }) => ({ start, end })),
  );
  expect(result.spaceReport.compressedSections).toHaveLength(2);
  for (const space of result.spaceReport.compressedSections) {
    expect(space.parentBufferId).toBe(0);
    const edge = artifacts.provenance.buffers.find(
      (node) =>
        node.parent?.sectionStart === space.sectionStart &&
        node.parent.parentBufferId === 0,
    ).parent;
    const section = readFirmwareSection(
      result.image,
      space.sectionStart,
      edge.ownerFile.end,
    );
    expect(space.originalPackedBytes).toBe(edge.payloadEnd - edge.payloadStart);
    expect(space.rebuiltPackedBytes).toBe(section.end - edge.payloadStart);
    const resized = section.end !== edge.sectionEnd;
    const capacityEnd = resized ? edge.ownerFile.end : edge.payloadEnd;
    expect(space.verifiedCapacityBytes).toBe(capacityEnd - edge.payloadStart);
    expect(space.remainingBytes).toBe(capacityEnd - section.end);
    expect(space.capacityBasis).toBe(
      resized ? "verified-terminal-padding" : "original-payload",
    );
  }
  expect(changedOutsideOwner).toBe(0);
  expect(changedOutsideBios).toBe(0);
  expect(changedBytes).toBe(140913);
  expect(await sha256Hex(result.image)).toBe(
    "264f90a0934848916bdc3e123564ce5c67c068faa6c48ee03e756f7c21f3aaae",
  );
  expect(inspectFirmwareImageLayout(result.image)).toEqual(layout);
  expect(result.image.length).toBe(original.length);
  expect(await sha256Hex(original)).toBe(originalHash);
  expect(JSON.stringify(base)).toBe(untouchedState);
  process.stdout.write(
    JSON.stringify({
      scenario: "queue",
      rootIndex,
      originalHash,
      outputHash: await sha256Hex(result.image),
      changedBytes,
      owners,
      spaceReport: result.spaceReport,
      queueTitles: entries.map((entry) => entry.title),
      changeLog: result.changeLog,
    }) + "\n",
  );
}, 300000);
