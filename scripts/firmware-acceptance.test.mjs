import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { basename, join } from "node:path";
import {
  acceptedLzmaSetupImage,
  acceptedTianoSetupImage,
} from "../src/components/scripts/firmwareAcceptance";
import { toggleAmiRootVisibility } from "../src/components/scripts/amiRootVisibilityEditing";
import { analyzeIfrBinary, IFR_OPCODE } from "../src/components/scripts/ifrBinary";
import {
  analyzeMenuMoveDestinations,
  moveMenuReference,
} from "../src/components/scripts/menuEditing";
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
  expect(["hii", "setupdata", "refmove", "rootvisibility"]).toContain(scenario);
  const withSetupData = scenario === "setupdata";
  const withRefMove = scenario === "refmove";
  const withRootVisibility = scenario === "rootvisibility";
  const original = new Uint8Array(readFileSync(imagePath));
  const originalHash = await sha256Hex(original);
  const acceptance = [acceptedLzmaSetupImage, acceptedTianoSetupImage].find(
    (record) => record.sha256 === originalHash && record.size === original.length,
  );
  expect(acceptance).toBeDefined();
  const isTiano = originalHash === acceptedTianoSetupImage.sha256;
  if (withSetupData || withRefMove || withRootVisibility) expect(isTiano).toBe(true);
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
  let data = await parseData(files);
  const originalData = structuredClone(data);
  const suppression = data.suppressions.find(
    (x) => x.offset.toLowerCase() === (isTiano ? "0x8b359" : "0x5b2d9"),
  );
  expect(suppression).toBeDefined();
  if (!withRefMove && !withRootVisibility) suppression.active = false;
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
  let rootEvidence;
  if (withRootVisibility) {
    const report = data.rootVisibility;
    expect(report.status).toBe("detected");
    expect(report.vector.length).toBe(7);
    const tool = report.entries.find((entry) => entry.name === "Tool");
    expect(tool.rootIndex).toBe(5);
    expect(tool.bufferOffset).toBe(92081);
    expect(tool.value).toBe(1);
    data.rootVisibilityEdits = toggleAmiRootVisibility(data, tool.rootIndex);
    const stale = structuredClone(data);
    stale.rootVisibilityEdits[0].expected = 0;
    await expect(buildAmiFirmwareImage(stale, files)).rejects.toThrow(/does not match/);
    const allDisabled = structuredClone(originalData);
    for (const entry of report.entries) {
      allDisabled.rootVisibilityEdits = toggleAmiRootVisibility(
        allDisabled,
        entry.rootIndex,
      );
    }
    await expect(buildAmiFirmwareImage(allDisabled, files)).rejects.toThrow(
      "At least one root FormSet must remain enabled.",
    );
    expect(await sha256Hex(original)).toBe(originalHash);
    await expect(
      buildAmiFirmwareImage(data, files, () => Promise.resolve(artifacts)),
    ).rejects.toThrow("Root visibility did not match after re-opening");
    data.rootVisibility.entries[5].value = 0;
    rootEvidence = {
      rootIndex: tool.rootIndex,
      formId: tool.formId,
      formSetGuid: tool.formSetGuid,
      bufferOffset: tool.bufferOffset,
      expected: 1,
      replacement: 0,
    };
  }
  let moveEvidence;
  let movedReferenceBytes;
  if (withRefMove) {
    const sourceGuid = "08C0EEFB-0A0B-4D5F-8E52-2970881A7137";
    const sourceFormIndex = data.forms.findIndex(
      (form) =>
        form.formId.toLowerCase() === "0x405" && form.formSetGuid === sourceGuid,
    );
    const destinationFormIndex = data.forms.findIndex(
      (form) =>
        form.formId.toLowerCase() === "0x4cd" && form.formSetGuid === sourceGuid,
    );
    expect(data.forms[sourceFormIndex]?.name).toBe("Ai Tweaker");
    expect(data.forms[destinationFormIndex]?.name).toBe("CPU Power Management");
    const referenceChildIndex = data.forms[sourceFormIndex].children.findIndex(
      (child) => child.type === "Ref" && child.ifrOffset?.toLowerCase() === "0x9719a",
    );
    const reference = data.forms[sourceFormIndex].children[referenceChildIndex];
    expect(reference?.name).toBe("DRAM Timing Control");
    expect(reference?.formId.toLowerCase()).toBe("0x4a9");
    const request = { sourceFormIndex, referenceChildIndex, destinationFormIndex };
    const destinations = analyzeMenuMoveDestinations(
      data,
      files.setupSctContainer.textContent,
      sourceFormIndex,
      referenceChildIndex,
    );
    expect(destinations[destinationFormIndex].compatibility).toBe("safe-same-package");
    const unchangedState = JSON.stringify(data);
    const targetIndex = data.forms.findIndex(
      (form) =>
        form.formId.toLowerCase() === "0x4a9" && form.formSetGuid === sourceGuid,
    );
    await expect(
      moveMenuReference(data, files.setupSctContainer.textContent, {
        ...request,
        destinationFormIndex: targetIndex,
      }),
    ).rejects.toThrow(/cycle/i);
    const crossFormSetIndex = data.forms.findIndex(
      (form) => form.formSetGuid !== sourceGuid,
    );
    expect(destinations[crossFormSetIndex].compatibility).toBe("requires-ref3");
    await expect(
      moveMenuReference(data, files.setupSctContainer.textContent, {
        ...request,
        destinationFormIndex: crossFormSetIndex,
      }),
    ).rejects.toThrow(/without an explicit FormSetGuid/);
    expect(JSON.stringify(data)).toBe(unchangedState);
    data = await moveMenuReference(data, files.setupSctContainer.textContent, request);
    expect(data.ifrEdits).toHaveLength(1);
    const edit = data.ifrEdits[0];
    expect(edit.sourceOffset).toBe(0x9719a);
    expect(edit.sourceEnd - edit.sourceOffset).toBe(15);
    expect(edit.destinationOffset).toBe(0x98798);
    moveEvidence = {
      sourceGuid,
      sourceFormId: 0x405,
      destinationFormId: 0x4cd,
      targetFormId: 0x4a9,
    };
    movedReferenceBytes = edit.expected;
    const stale = structuredClone(data);
    stale.ifrEdits[0].expected[0] ^= 1;
    await expect(buildAmiFirmwareImage(stale, files)).rejects.toThrow(
      "IFR move precondition failed at 0x9719A.",
    );
    expect(await sha256Hex(original)).toBe(originalHash);
  }
  const patches = buildFirmwarePatches(
    { ...data, rootVisibilityEdits: undefined },
    {
      setupSct: files.setupSctContainer.textContent,
      amitseSct: files.amitseSctContainer.textContent,
      setupdataBin: files.setupdataBinContainer.textContent,
    },
  );
  expect(patches.amitseSct).toBeUndefined();
  if (withSetupData) expect(patches.setupdataBin).toBeDefined();
  else expect(patches.setupdataBin).toBeUndefined();
  const result = await buildAmiFirmwareImage(data, files);
  const reopened = await extractAmiFirmwareBytes(result.image);
  expect(await sha256Hex(reopened.hii)).toBe(
    await sha256Hex(patches.setupSct ?? artifacts.hii),
  );
  expect(await sha256Hex(reopened.amitse)).toBe(await sha256Hex(artifacts.amitse));
  expect(await sha256Hex(reopened.setupData)).toBe(
    await sha256Hex(patches.setupdataBin ?? artifacts.setupData),
  );
  if (withRootVisibility) {
    const originalNode = artifacts.provenance.buffers.find(
      (node) => node.id === originalData.rootVisibility.vector.bufferId,
    );
    const reopenedNode = reopened.provenance.buffers.find(
      (node) =>
        node.id ===
        reopened.provenance.artifacts.find((artifact) => artifact.kind === "setup-hii")
          .bufferId,
    );
    expect(reopenedNode.bytes.length).toBe(originalNode.bytes.length);
    const logicalChanges = Array.from(originalNode.bytes).flatMap((byte, offset) =>
      byte !== reopenedNode.bytes[offset] ? [offset] : [],
    );
    expect(logicalChanges).toEqual([rootEvidence.bufferOffset]);
    expect(reopenedNode.bytes[rootEvidence.bufferOffset]).toBe(0);
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
    expect(rereadData.rootVisibility.status).toBe("detected");
    expect(rereadData.rootVisibility.entries.map((entry) => entry.value)).toEqual([
      1, 1, 1, 1, 1, 0, 1,
    ]);
    expect(rereadData.rootVisibility.entries[5].formSetGuid).toBe(
      rootEvidence.formSetGuid,
    );
    expect(reopened.formPackageCount).toBe(7);
    expect(rereadData.forms.length).toBe(70);
  }
  if (withRefMove) {
    const model = analyzeIfrBinary(reopened.hii);
    expect(model.packages).toHaveLength(7);
    expect(model.packages.every((pkg) => pkg.valid)).toBe(true);
    const matchingRefs = model.packages
      .flatMap((pkg) => pkg.opcodes)
      .filter(
        (span) =>
          span.opcode === IFR_OPCODE.REF &&
          Array.from(reopened.hii.slice(span.offset, span.end)).every(
            (byte, index) => byte === movedReferenceBytes[index],
          ) &&
          span.length === movedReferenceBytes.length,
      );
    expect(matchingRefs).toHaveLength(1);
    const reference = matchingRefs[0];
    expect(reference.ownerFormId).toBe(moveEvidence.destinationFormId);
    expect(reference.ownerFormSetGuid).toBe(moveEvidence.sourceGuid);
    expect(reference.formId).toBe(moveEvidence.targetFormId);
    expect(reference.offset).toBe(0x98789);
    const destination = model.packages
      .flatMap((pkg) => pkg.opcodes)
      .find(
        (span) =>
          span.opcode === IFR_OPCODE.FORM &&
          span.formId === moveEvidence.destinationFormId &&
          span.ownerFormSetGuid === moveEvidence.sourceGuid,
      );
    expect(reference.parentOffset).toBe(destination.offset);
    const rereadFiles = {
      ...files,
      setupSctContainer: container(reopened.hii, "setup.bin"),
      setupTxtContainer: container(
        new TextEncoder().encode(reopened.ifrText),
        "setup.txt",
        reopened.ifrText,
      ),
    };
    const rereadData = await parseData(rereadFiles);
    expect(rereadData.forms).toHaveLength(originalData.forms.length);
    const rereadSource = rereadData.forms.find(
      (form) =>
        form.formId.toLowerCase() === "0x405" &&
        form.formSetGuid === moveEvidence.sourceGuid,
    );
    const rereadDestination = rereadData.forms.find(
      (form) =>
        form.formId.toLowerCase() === "0x4cd" &&
        form.formSetGuid === moveEvidence.sourceGuid,
    );
    expect(
      rereadSource.children.some(
        (child) => child.type === "Ref" && child.formId.toLowerCase() === "0x4a9",
      ),
    ).toBe(false);
    expect(
      rereadDestination.children.filter(
        (child) => child.type === "Ref" && child.formId.toLowerCase() === "0x4a9",
      ),
    ).toHaveLength(1);
  }
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
      withRootVisibility
        ? "88f522a7878449df6710bb09a8496fa376629f2a93a730bd6ec5e10ae796fe66"
        : withRefMove
          ? "b1d6224b3ff47692e56ee5c42e7e9055c2154fccfcb3b79ac9fe713df745705f"
          : withSetupData
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
      moveEvidence,
      rootEvidence,
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
