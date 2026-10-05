import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { basename, join } from "node:path";
import { acceptedLzmaSetupImage } from "../src/components/scripts/firmwareAcceptance";
import { extractAmiFirmwareBytes } from "../src/components/scripts/amiFirmwareExtractor";
import { parseData } from "../src/components/scripts/scripts";
import { buildAmiFirmwareImage } from "../src/components/scripts/amiFirmwareRebuilder";
import { buildFirmwarePatches } from "../src/components/scripts/patcher";
import { bytesToHex } from "../src/components/scripts/hex";
import { sha256Hex } from "../src/components/scripts/checksum";
import { inspectFirmwareImageLayout } from "../src/components/scripts/firmwareImageContainer";
it("real compressed image through normal patch and full-image builder", async () => {
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
  expect(originalHash).toBe(acceptedLzmaSetupImage.sha256);
  expect(original.length).toBe(acceptedLzmaSetupImage.size);
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
    firmwareSource: { fileName: "16M.BIN", artifacts, sourceSha256: originalHash },
  };
  const data = await parseData(files);
  const suppression = data.suppressions.find(
    (x) => x.offset.toLowerCase() === "0x5b2d9",
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
  const rootFile = artifacts.provenance.buffers.find(
    (n) => n.parent?.parentBufferId === 0 && n.parent.ownerFile,
  )?.parent?.ownerFile;
  expect(rootFile).toBeDefined();
  let changedBytes = 0;
  let changedOutsideOwner = 0;
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== result.image[i]) {
      if (i < rootFile.fileStart || i >= rootFile.end) changedOutsideOwner++;
      changedBytes++;
    }
  }
  expect(changedOutsideOwner).toBe(0);
  expect(changedBytes).toBeGreaterThan(0);
  process.stdout.write(
    JSON.stringify({
      originalHash,
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
