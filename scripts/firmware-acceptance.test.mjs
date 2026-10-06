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
  const scenario = process.env.FIRMWARE_ACCEPTANCE_SCENARIO ?? "hii";
  expect(["hii", "setupdata"]).toContain(scenario);
  const withSetupData = scenario === "setupdata";
  const original = new Uint8Array(readFileSync(imagePath));
  const originalHash = await sha256Hex(original);
  const acceptance = [acceptedLzmaSetupImage, acceptedTianoSetupImage].find(
    (record) => record.sha256 === originalHash && record.size === original.length,
  );
  expect(acceptance).toBeDefined();
  const isTiano = originalHash === acceptedTianoSetupImage.sha256;
  if (withSetupData) expect(isTiano).toBe(true);
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
  const growthData = structuredClone(data);
  if (withSetupData) {
    const question = data.forms
      .flatMap((form) => form.children)
      .find(
        (child) =>
          child.questionId.toLowerCase() === "0x4" &&
          child.offsets?.accessLevel.toLowerCase() === "0x2f7c",
      );
    expect(question?.name).toBe("Security");
    expect(question?.accessLevel).toBe("01");
    question.accessLevel = "00";
  }
  const patches = buildFirmwarePatches(data, {
    setupSct: files.setupSctContainer.textContent,
    amitseSct: files.amitseSctContainer.textContent,
    setupdataBin: files.setupdataBinContainer.textContent,
  });
  expect(patches.amitseSct).toBeUndefined();
  if (withSetupData) expect(patches.setupdataBin).toBeDefined();
  else expect(patches.setupdataBin).toBeUndefined();
  const result = await buildAmiFirmwareImage(data, files);
  const reopened = await extractAmiFirmwareBytes(result.image);
  expect(await sha256Hex(reopened.hii)).toBe(await sha256Hex(patches.setupSct));
  expect(await sha256Hex(reopened.amitse)).toBe(await sha256Hex(artifacts.amitse));
  expect(await sha256Hex(reopened.setupData)).toBe(
    await sha256Hex(patches.setupdataBin ?? artifacts.setupData),
  );
  expect(result.image.length).toBe(original.length);
  expect(await sha256Hex(original)).toBe(originalHash);
  expect(inspectFirmwareImageLayout(result.image)).toEqual(
    inspectFirmwareImageLayout(original),
  );
  const editedKinds = withSetupData ? ["setup-hii", "setupdata"] : ["setup-hii"];
  const owners = editedKinds.map((kind) => {
    const location = artifacts.provenance.artifacts.find(
      (entry) => entry.kind === kind,
    );
    let ancestor = artifacts.provenance.buffers.find(
      (node) => node.id === location.bufferId,
    );
    while (
      ancestor.parent &&
      ancestor.parent.parentBufferId !== artifacts.provenance.rootBufferId
    ) {
      ancestor = artifacts.provenance.buffers.find(
        (node) => node.id === ancestor.parent.parentBufferId,
      );
      if (!ancestor) throw new Error("Edited artifact ancestor is missing.");
    }
    const owner = ancestor.parent?.ownerFile;
    expect(owner).toBeDefined();
    return { kind, start: owner.fileStart, end: owner.end };
  });
  let changedBytes = 0;
  let changedOutsideOwner = 0;
  let changedOutsideBios = 0;
  const layout = inspectFirmwareImageLayout(original);
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== result.image[i]) {
      if (!owners.some((owner) => i >= owner.start && i < owner.end))
        changedOutsideOwner++;
      if (i < layout.biosStart || i >= layout.biosEnd) changedOutsideBios++;
      changedBytes++;
    }
  }
  expect(changedOutsideOwner).toBe(0);
  expect(changedOutsideBios).toBe(0);
  if (isTiano) {
    expect(await sha256Hex(result.image)).toBe(
      withSetupData
        ? "e735ad0281a9e34fb139b69bbb3a675c1daca93fbb6178e2a2537cf0e55b96f9"
        : "cdc7a005905574a826460342389e53216e6c50979816271e2a0d0e2de1b6ae40",
    );
  }
  expect(changedBytes).toBeGreaterThan(0);
  if (withSetupData) {
    const growthQuestion = growthData.forms
      .flatMap((form) => form.children)
      .find(
        (child) =>
          child.questionId.toLowerCase() === "0x1" && child.offsets?.accessLevel,
      );
    expect(growthQuestion?.accessLevel).toBe("01");
    growthQuestion.accessLevel = "00";
    await expect(buildAmiFirmwareImage(growthData, files)).rejects.toThrow(
      "Compressed section cannot grow beyond its FFS allocation.",
    );
    expect(await sha256Hex(original)).toBe(originalHash);
  }
  process.stdout.write(
    JSON.stringify({
      scenario,
      originalHash,
      compression: isTiano ? "tiano" : "lzma",
      containerKind: layout.kind,
      biosStart: layout.biosStart,
      biosEnd: layout.biosEnd,
      changedOutsideBios,
      outputHash: await sha256Hex(result.image),
      imageSize: result.image.length,
      changedBytes,
      owners,
      changedOutsideOwner,
      forms: data.forms.length,
      suppressions: data.suppressions.length,
      formPackageCount: reopened.formPackageCount,
      changeLog: result.changeLog,
    }) + "\n",
  );
}, 300000);
