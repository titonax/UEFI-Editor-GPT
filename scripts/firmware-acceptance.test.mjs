import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { basename, join } from "node:path";
import {
  acceptedLzmaSetupImage,
  acceptedTianoSetupImage,
} from "../src/components/scripts/firmwareAcceptance";
import { runStandardSectionCodec } from "../src/components/scripts/aptioIvExtractor";
import { extractAmiFirmwareBytes } from "../src/components/scripts/amiFirmwareExtractor";
import { parseData } from "../src/components/scripts/scripts";
import { buildAmiFirmwareImage } from "../src/components/scripts/amiFirmwareRebuilder";
import { buildFirmwarePatches } from "../src/components/scripts/patcher";
import { bytesToHex } from "../src/components/scripts/hex";
import { sha256Hex } from "../src/components/scripts/checksum";
import { inspectFirmwareImageLayout } from "../src/components/scripts/firmwareImageContainer";
it("accepted real compressed image through normal patch and full-image builder", async () => {
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
  const acceptance = [acceptedLzmaSetupImage, acceptedTianoSetupImage].find(
    (record) => record.sha256 === originalHash && record.size === original.length,
  );
  expect(acceptance).toBeDefined();
  const isTiano = originalHash === acceptedTianoSetupImage.sha256;
  const artifacts = await extractAmiFirmwareBytes(original);
  const container = (bytes, name, textContent = bytesToHex(bytes)) => ({
    file: new File([bytes], name),
    textContent,
    isWrongFile: false,
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
    firmwareSource: {
      fileName: basename(imagePath),
      artifacts,
      sourceSha256: originalHash,
    },
  };
  const setupLocation = artifacts.provenance.artifacts.find(
    (a) => a.kind === "setup-hii",
  );
  const setupNode = artifacts.provenance.buffers.find(
    (node) => node.id === setupLocation.bufferId,
  );
  if (isTiano) {
    expect(setupNode.parent.compression).toBe("standard");
    const packed = original.slice(
      setupNode.parent.payloadStart,
      setupNode.parent.payloadEnd,
    );
    expect(await sha256Hex(await runStandardSectionCodec(packed, "tiano"))).toBe(
      await sha256Hex(setupNode.bytes),
    );
    expect(inspectFirmwareImageLayout(original).kind).toBe("intel-spi");
  }
  const data = await parseData(files);
  const suppression = data.suppressions.find(
    (x) => x.offset.toLowerCase() === (isTiano ? "0x8b359" : "0x5b2d9"),
  );
  expect(suppression).toBeDefined();
  suppression.active = false;
  const patches = buildFirmwarePatches(data, {
    setupSct: files.setupSctContainer.textContent,
    amitseSct: files.amitseSctContainer.textContent,
    setupdataBin: files.setupdataBinContainer.textContent,
  });
  expect(patches.amitseSct).toBeUndefined();
  expect(patches.setupdataBin).toBeUndefined();
  const result = await buildAmiFirmwareImage(data, files);
  const reopened = await extractAmiFirmwareBytes(result.image);
  expect(await sha256Hex(reopened.hii)).toBe(await sha256Hex(patches.setupSct));
  expect(await sha256Hex(reopened.amitse)).toBe(await sha256Hex(artifacts.amitse));
  expect(await sha256Hex(reopened.setupData)).toBe(
    await sha256Hex(artifacts.setupData),
  );
  expect(result.image.length).toBe(original.length);
  expect(await sha256Hex(original)).toBe(originalHash);
  expect(inspectFirmwareImageLayout(result.image)).toEqual(
    inspectFirmwareImageLayout(original),
  );
  let ancestor = setupNode;
  while (
    ancestor.parent &&
    ancestor.parent.parentBufferId !== artifacts.provenance.rootBufferId
  ) {
    const parent = artifacts.provenance.buffers.find(
      (node) => node.id === ancestor.parent.parentBufferId,
    );
    if (!parent) throw new Error("Setup ancestor is missing.");
    ancestor = parent;
  }
  const rootFile = ancestor.parent?.ownerFile;
  expect(rootFile).toBeDefined();
  let changedBytes = 0;
  let changedOutsideOwner = 0;
  let changedOutsideBios = 0;
  const layout = inspectFirmwareImageLayout(original);
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== result.image[i]) {
      if (i < rootFile.fileStart || i >= rootFile.end) changedOutsideOwner++;
      if (i < layout.biosStart || i >= layout.biosEnd) changedOutsideBios++;
      changedBytes++;
    }
  }
  expect(changedOutsideOwner).toBe(0);
  expect(changedOutsideBios).toBe(0);
  if (isTiano) {
    expect(await sha256Hex(result.image)).toBe(
      "cdc7a005905574a826460342389e53216e6c50979816271e2a0d0e2de1b6ae40",
    );
  }
  expect(changedBytes).toBeGreaterThan(0);
  process.stdout.write(
    JSON.stringify({
      originalHash,
      compression: isTiano ? "tiano" : "lzma",
      containerKind: layout.kind,
      biosStart: layout.biosStart,
      biosEnd: layout.biosEnd,
      changedOutsideBios,
      outputHash: await sha256Hex(result.image),
      imageSize: result.image.length,
      changedBytes,
      ownerStart: rootFile.fileStart,
      ownerEnd: rootFile.end,
      forms: data.forms.length,
      suppressions: data.suppressions.length,
      formPackageCount: reopened.formPackageCount,
      changeLog: result.changeLog,
    }) + "\n",
  );
}, 300000);
