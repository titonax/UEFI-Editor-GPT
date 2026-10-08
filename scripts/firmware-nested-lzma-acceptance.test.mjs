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
import {
  createDataChangeEntry,
  projectDataChangeQueue,
} from "../src/components/ChangeQueue/dataChangeQueue";
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

const scenarios =
  process.env.FIRMWARE_ACCEPTANCE_SCENARIO === "nested-lzma-setupdata"
    ? [
        {
          kind: "setupdata",
          changedBytes: 850465,
          packedBytes: 1493534,
          outputSha: "608b856032c975aac208c5912464ca3f83243a3425308225d796ee85115f2194",
        },
        {
          kind: "combined",
          changedBytes: 850450,
          packedBytes: 1493479,
          outputSha: "8d1ce0151c08d4937e2c5f4fd0309f95219d98f1190eee94a3e96a293cd71d28",
        },
      ]
    : [
        {
          kind: "hii",
          changedBytes: 140878,
          packedBytes: 1494085,
          outputSha: "6920f3fed99e90f52c264c0a8b466293f934f652f1fe13d02485d889072d0c0b",
        },
      ];

it.each(scenarios)(
  "rebuilds nested-FV LZMA SPI with $kind through queue and AMI output",
  async ({ kind, changedBytes, packedBytes, outputSha }) => {
    const withHii = kind !== "setupdata";
    const withSetupData = kind !== "hii";
    const imagePath = process.env.FIRMWARE_ACCEPTANCE_IMAGE;
    const wasmDirectory = process.env.FIRMWARE_ACCEPTANCE_WASM_DIR;
    if (!imagePath || !wasmDirectory)
      throw new Error(
        "Set FIRMWARE_ACCEPTANCE_IMAGE and FIRMWARE_ACCEPTANCE_WASM_DIR.",
      );
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
    const base = await parseData(files);
    expect(base.forms).toHaveLength(68);
    const baseSnapshot = JSON.stringify(base);
    const entries = [];
    let staged = base;
    const add = (next, id) => {
      const entry = createDataChangeEntry(staged, next, id);
      expect(entry).not.toBeNull();
      entries.push(entry);
      staged = next;
    };
    const condition = base.suppressions.find(
      (entry) => entry.offset.toLowerCase() === "0x2b15a",
    );
    expect(condition).toMatchObject({
      kind: "SuppressIf",
      active: true,
      constant: true,
    });
    if (withHii) {
      const next = structuredClone(staged);
      next.suppressions.find(
        (entry) => entry.offset.toLowerCase() === "0x2b15a",
      ).active = false;
      add(next, "hii");
    }
    const findQuestion = (data) =>
      data.forms
        .flatMap((form) => form.children)
        .find(
          (child) =>
            child.questionId.toLowerCase() === "0x1" &&
            child.offsets?.accessLevel.toLowerCase() === "0x29ec",
        );
    const question = findQuestion(base);
    expect(question).toMatchObject({ name: "System Language", accessLevel: "01" });
    if (withSetupData) {
      const next = structuredClone(staged);
      findQuestion(next).accessLevel = "00";
      add(next, "setupdata");
      const reverted = structuredClone(staged);
      findQuestion(reverted).accessLevel = "01";
      const revertEntry = createDataChangeEntry(staged, reverted, "restore-access");
      const incoherent = projectDataChangeQueue(base, [revertEntry]);
      expect(incoherent.analysis.canApply).toBe(false);
      expect(
        incoherent.analysis.issues.some(
          (issue) => issue.code === "stale-logical-state",
        ),
      ).toBe(true);
    }
    const projected = projectDataChangeQueue(base, entries);
    expect(projected.analysis.canApply).toBe(true);
    expect(projected.data).toEqual(staged);
    const data = projected.data;
    expect(JSON.stringify(base)).toBe(baseSnapshot);
    const patches = buildFirmwarePatches(data, {
      setupSct: files.setupSctContainer.textContent,
      amitseSct: files.amitseSctContainer.textContent,
      setupdataBin: files.setupdataBinContainer.textContent,
    });
    expect(patches.amitseSct).toBeUndefined();
    if (withHii) expect(patches.setupSct).toBeDefined();
    else expect(patches.setupSct).toBeUndefined();
    if (withSetupData) {
      expect(patches.setupdataBin).toBeDefined();
      expect(changedOffsets(artifacts.setupData, patches.setupdataBin)).toEqual([
        0x29ec,
      ]);
    } else expect(patches.setupdataBin).toBeUndefined();
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
    expect(reopened.hii).toEqual(patches.setupSct ?? artifacts.hii);
    expect(reopened.amitse).toEqual(artifacts.amitse);
    expect(reopened.setupData).toEqual(patches.setupdataBin ?? artifacts.setupData);
    const rereadData = await parseData({
      ...files,
      setupdataBinContainer: container(reopened.setupData, "setupdata.bin"),
      amitseSctContainer: container(reopened.amitse, "amitse.bin"),
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
    if (withHii) {
      // The editor retains SuppressIf and its expression, moving End directly
      // after the expression so no menu/question remains inside the hidden scope.
      expect(rereadCondition.matchingEndOffset).toBe(
        Number.parseInt(condition.start, 16),
      );
      expect(
        reopened.hii.slice(
          Number.parseInt(condition.start, 16),
          Number.parseInt(condition.start, 16) + 2,
        ),
      ).toEqual(Uint8Array.of(0x29, 0x02));
    } else
      expect(rereadCondition.matchingEndOffset).toBe(
        Number.parseInt(condition.end, 16),
      );
    expect(findQuestion(rereadData).accessLevel).toBe(withSetupData ? "00" : "01");
    const rereadLocation = reopened.provenance.artifacts.find(
      (entry) => entry.kind === "setup-hii",
    );
    const rereadInner = reopened.provenance.buffers.find(
      (node) => node.id === rereadLocation.bufferId,
    );
    const rereadVolume = reopened.provenance.buffers.find(
      (node) => node.id === rereadInner.parent.parentBufferId,
    );
    const editedKinds = [
      ...(withHii ? ["setup-hii"] : []),
      ...(withSetupData ? ["setupdata"] : []),
    ];
    const filesInVolume = editedKinds.map(
      (artifactKind) =>
        graph.artifacts.find((entry) => entry.kind === artifactKind).sourceFile,
    );
    expect(filesInVolume.every((file) => file.bufferId === volumeNode.id)).toBe(true);
    const decodedChanges = changedOffsets(volumeNode.bytes, rereadVolume.bytes);
    expect(decodedChanges.length).toBeGreaterThan(0);
    expect(
      decodedChanges.every((offset) =>
        filesInVolume.some((file) => offset >= file.fileStart && offset < file.end),
      ),
    ).toBe(true);
    for (const artifactKind of editedKinds) {
      const beforeLocation = graph.artifacts.find(
        (entry) => entry.kind === artifactKind,
      );
      const beforeNode = graph.buffers.find(
        (node) => node.id === beforeLocation.bufferId,
      );
      const afterLocation = reopened.provenance.artifacts.find(
        (entry) => entry.kind === artifactKind,
      );
      const afterNode = reopened.provenance.buffers.find(
        (node) => node.id === afterLocation.bufferId,
      );
      const expectedNode = beforeNode.bytes.slice();
      expectedNode.set(
        artifactKind === "setup-hii" ? patches.setupSct : patches.setupdataBin,
        beforeLocation.payloadStart,
      );
      expect(afterNode.bytes).toEqual(expectedNode);
      expectFileChecksums(rereadVolume.bytes, afterLocation.sourceFile);
    }
    expectFileChecksums(result.image, owner);
    const layout = inspectFirmwareImageLayout(original);
    expect(layout.kind).toBe("intel-spi");
    expect(inspectFirmwareImageLayout(result.image)).toEqual(layout);
    const changes = changedOffsets(original, result.image);
    expect(changes).toHaveLength(changedBytes);
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
        rebuiltPackedBytes: packedBytes,
        verifiedCapacityBytes: 1494108,
        remainingBytes: 1494108 - packedBytes,
      }),
    ]);
    const outputHash = await sha256Hex(result.image);
    expect(outputHash).toBe(outputSha);
    expect(JSON.stringify(base)).toBe(baseSnapshot);
    expect(await sha256Hex(original)).toBe(originalHash);
    expect(await sha256Hex(volumeNode.bytes)).toBe(originalVolumeHash);
    expect(await sha256Hex(innerNode.bytes)).toBe(originalInnerHash);
    process.stdout.write(
      JSON.stringify({
        scenario: kind,
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
  },
  300000,
);
