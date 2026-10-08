import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { expect, it, vi } from "vitest";
import { acceptedNestedLzmaSetupImage } from "../src/components/scripts/firmwareAcceptance";
import { extractAmiFirmwareBytes } from "../src/components/scripts/amiFirmwareExtractor";
import { buildAmiFirmwareImage } from "../src/components/scripts/amiFirmwareRebuilder";
import { inspectFirmwareImageLayout } from "../src/components/scripts/firmwareImageContainer";
import { assessFirmwareReconstruction } from "../src/components/scripts/firmwareProvenance";
import { analyzeIfrBinary } from "../src/components/scripts/ifrBinary";
import { parseData } from "../src/components/scripts/scripts";
import { bytesToHex } from "../src/components/scripts/hex";
import { buildFirmwarePatches } from "../src/components/scripts/patcher";
import { sha256Hex } from "../src/components/scripts/checksum";

function container(bytes, name, textContent = bytesToHex(bytes)) {
  return { file: new File([bytes], name), textContent, isWrongFile: false };
}
function changedOffsets(before, after) {
  expect(after.length).toBe(before.length);
  return Array.from(before).flatMap((byte, offset) =>
    byte !== after[offset] ? [offset] : [],
  );
}
function checksum(bytes, start, end) {
  return bytes.subarray(start, end).reduce((sum, byte) => (sum + byte) & 0xff, 0);
}
function expectFileChecksums(bytes, file) {
  const header = bytes.slice(file.fileStart, file.bodyStart);
  header[17] = 0;
  header[23] = 0;
  expect(checksum(header, 0, header.length)).toBe(0);
  if (bytes[file.fileStart + 19] & 0x40) {
    expect(
      (checksum(bytes, file.bodyStart, file.end) + bytes[file.fileStart + 17]) & 0xff,
    ).toBe(0);
  } else {
    expect(bytes[file.fileStart + 17]).toBe(0xaa);
  }
}

it("rebuilds the accepted nested-FV LZMA SPI through the normal AMI output path", async () => {
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
  expect(originalHash).toBe(acceptedNestedLzmaSetupImage.sha256);
  expect(original.length).toBe(acceptedNestedLzmaSetupImage.size);
  const artifacts = await extractAmiFirmwareBytes(original);
  const graph = artifacts.provenance;
  const assessment = assessFirmwareReconstruction(graph, originalHash);
  expect(assessment.writeEnabled).toBe(true);
  expect(
    assessment.traces.find((trace) => trace.kind === "setup-hii").compressions,
  ).toEqual(["lzma", "none"]);
  const location = graph.artifacts.find((entry) => entry.kind === "setup-hii");
  const innerNode = graph.buffers.find((node) => node.id === location.bufferId);
  const volumeNode = graph.buffers.find(
    (node) => node.id === innerNode.parent.parentBufferId,
  );
  expect(volumeNode.id).toBe(location.sourceFile.bufferId);
  expect(volumeNode.parent.parentBufferId).toBe(0);
  const originalVolumeHash = await sha256Hex(volumeNode.bytes);
  const originalInnerHash = await sha256Hex(innerNode.bytes);
  const owner = volumeNode.parent.ownerFile;
  expect({ start: owner.fileStart, end: owner.end }).toEqual({
    start: 1704008,
    end: 3198149,
  });
  const files = {
    setupSctContainer: container(artifacts.hii, "setup.bin"),
    setupTxtContainer: container(
      new TextEncoder().encode(artifacts.ifrText),
      "setup.txt",
      artifacts.ifrText,
    ),
    amitseSctContainer: container(artifacts.amitse ?? new Uint8Array(), "amitse.bin"),
    setupdataBinContainer: container(
      artifacts.setupData ?? new Uint8Array(),
      "setupdata.bin",
    ),
    firmwareSource: { fileName: "source.bin", artifacts, sourceSha256: originalHash },
  };
  const data = await parseData(files);
  expect(data.forms).toHaveLength(68);
  const condition = data.suppressions.find(
    (entry) => entry.offset.toLowerCase() === "0x2b15a",
  );
  expect(condition).toMatchObject({ kind: "SuppressIf", active: true, constant: true });
  condition.active = false;
  const patches = buildFirmwarePatches(data, {
    setupSct: files.setupSctContainer.textContent,
    amitseSct: files.amitseSctContainer.textContent,
    setupdataBin: files.setupdataBinContainer.textContent,
  });
  expect(patches.amitseSct).toBeUndefined();
  expect(patches.setupdataBin).toBeUndefined();
  // A stale session hash must reject before encoding and leave the source untouched.
  await expect(
    buildAmiFirmwareImage(data, {
      ...files,
      firmwareSource: { ...files.firmwareSource, sourceSha256: "0".repeat(64) },
    }),
  ).rejects.toThrow("Firmware source hash changed.");
  const result = await buildAmiFirmwareImage(data, files);
  expect(result.containerKind).toBe("intel-spi");
  expect(result.image.length).toBe(original.length);
  const reopened = await extractAmiFirmwareBytes(result.image);
  expect(reopened.hii).toEqual(patches.setupSct);
  expect(reopened.amitse).toEqual(artifacts.amitse);
  expect(reopened.setupData).toEqual(artifacts.setupData);
  const rereadData = await parseData({
    ...files,
    setupSctContainer: container(reopened.hii, "setup.bin"),
    setupTxtContainer: container(
      new TextEncoder().encode(reopened.ifrText),
      "setup.txt",
      reopened.ifrText,
    ),
    firmwareSource: {
      ...files.firmwareSource,
      artifacts: reopened,
      sourceSha256: await sha256Hex(result.image),
    },
  });
  expect(rereadData.forms).toHaveLength(68);
  const model = analyzeIfrBinary(reopened.hii);
  expect(model.packages.every((pkg) => pkg.valid)).toBe(true);
  const rereadCondition = model.packages
    .flatMap((pkg) => pkg.opcodes)
    .find((span) => span.offset === 0x2b15a);
  // The editor retains SuppressIf and its expression, moving End directly
  // after the expression so no menu/question remains inside the hidden scope.
  expect(rereadCondition.matchingEndOffset).toBe(Number.parseInt(condition.start, 16));
  expect(
    reopened.hii.slice(
      Number.parseInt(condition.start, 16),
      Number.parseInt(condition.start, 16) + 2,
    ),
  ).toEqual(Uint8Array.of(0x29, 0x02));
  const rereadLocation = reopened.provenance.artifacts.find(
    (entry) => entry.kind === "setup-hii",
  );
  const rereadInner = reopened.provenance.buffers.find(
    (node) => node.id === rereadLocation.bufferId,
  );
  const rereadVolume = reopened.provenance.buffers.find(
    (node) => node.id === rereadInner.parent.parentBufferId,
  );
  const decodedChanges = changedOffsets(volumeNode.bytes, rereadVolume.bytes);
  expect(decodedChanges.length).toBeGreaterThan(0);
  expect(
    decodedChanges.every(
      (offset) =>
        offset >= location.sourceFile.fileStart && offset < location.sourceFile.end,
    ),
  ).toBe(true);
  expectFileChecksums(rereadVolume.bytes, rereadLocation.sourceFile);
  expectFileChecksums(result.image, owner);
  const layout = inspectFirmwareImageLayout(original);
  expect(layout.kind).toBe("intel-spi");
  expect(inspectFirmwareImageLayout(result.image)).toEqual(layout);
  const changes = changedOffsets(original, result.image);
  expect(changes).toHaveLength(140878);
  expect(
    changes.every(
      (offset) =>
        offset >= owner.fileStart &&
        offset < owner.end &&
        offset >= layout.biosStart &&
        offset < layout.biosEnd,
    ),
  ).toBe(true);
  expect(result.image.subarray(0, layout.biosStart)).toEqual(
    original.subarray(0, layout.biosStart),
  );
  expect(result.spaceReport.compressedSections).toEqual([
    expect.objectContaining({
      compression: "lzma",
      originalPackedBytes: 1494108,
      rebuiltPackedBytes: 1494085,
      verifiedCapacityBytes: 1494108,
      remainingBytes: 23,
    }),
  ]);
  const outputHash = await sha256Hex(result.image);
  expect(outputHash).toBe(
    "6920f3fed99e90f52c264c0a8b466293f934f652f1fe13d02485d889072d0c0b",
  );
  expect(await sha256Hex(original)).toBe(originalHash);
  expect(await sha256Hex(volumeNode.bytes)).toBe(originalVolumeHash);
  expect(await sha256Hex(innerNode.bytes)).toBe(originalInnerHash);
  process.stdout.write(
    JSON.stringify({
      originalHash,
      outputHash,
      imageSize: result.image.length,
      forms: rereadData.forms.length,
      changedBytes: changes.length,
      decodedChangedBytes: decodedChanges.length,
      changedOutsideOwner: 0,
      changedOutsideBios: 0,
      spaceReport: result.spaceReport,
    }) + "\n",
  );
}, 300000);
