import { describe, expect, it } from "vitest";
import {
  extractAptioIvArtifacts,
  extractAptioIvBytes,
  selectBestIfrTexts,
} from "./aptioIvExtractor";
import { FirmwareError } from "./errors";

const setupGuid = "899407D7-99FE-43D8-9A21-79EC328CAC21";
const amitseGuid = "B1DA0ADF-4F77-4070-A88E-BFFE1C60529A";
const hiiGuid = "97E409E6-4CC1-11D9-81F6-000000000000";
const setupDataGuid = "FE612B72-203C-47B1-8560-A66D946EB371";

describe("IFR Strings package selection", () => {
  it("prefers resolved labels for the same Forms package and language", () => {
    const texts = selectBestIfrTexts([
      { name: "setup.0.0.en-US.uefi.ifr.txt", text: 'Prompt: "InvalidId"' },
      { name: "setup.0.1.en-US.uefi.ifr.txt", text: 'Prompt: "Advanced"' },
      { name: "setup.1.0.en-US.uefi.ifr.txt", text: 'Prompt: "Security"' },
      { name: "setup.0.0.fr-FR.uefi.ifr.txt", text: 'Prompt: "Avancé"' },
    ]);
    expect(texts).toEqual([
      'Prompt: "Advanced"',
      'Prompt: "Security"',
      'Prompt: "Avancé"',
    ]);
  });

  it("retains unrecognized filenames and the first variant when scores tie", () => {
    expect(
      selectBestIfrTexts([
        { name: "setup.0.0.en-US.uefi.ifr.txt", text: "First" },
        { name: "setup.0.1.en-US.uefi.ifr.txt", text: "Second" },
        { name: "legacy.ifr.txt", text: "Framework" },
      ]),
    ).toEqual(["First", "Framework"]);
  });
});

function writeGuid(bytes: Uint8Array, offset: number, guid: string) {
  const [data1, data2, data3, data4, data5] = guid.split("-");
  const view = new DataView(bytes.buffer);
  view.setUint32(offset, Number.parseInt(data1, 16), true);
  view.setUint16(offset + 4, Number.parseInt(data2, 16), true);
  view.setUint16(offset + 6, Number.parseInt(data3, 16), true);
  bytes.set(
    Uint8Array.from(`${data4}${data5}`.match(/../g) ?? [], (pair) =>
      Number.parseInt(pair, 16),
    ),
    offset + 8,
  );
}

function writeUint24(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function firmwareVolumeWithFiles(files: { guid: string; section: Uint8Array }[]) {
  const headerSize = 0x48;
  const aligned = (value: number) => (value + 7) & ~7;
  const offsets: number[] = [];
  let cursor = headerSize;
  for (const file of files) {
    offsets.push(cursor);
    cursor = aligned(cursor + 24 + file.section.length);
  }
  const volumeSize = aligned(cursor + 0x40);
  const bytes = new Uint8Array(volumeSize);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0x20, BigInt(volumeSize), true);
  bytes.set([0x5f, 0x46, 0x56, 0x48], 0x28);
  view.setUint16(0x30, headerSize, true);
  for (const [index, file] of files.entries()) {
    const fileStart = offsets[index];
    const fileSize = 24 + file.section.length;
    writeGuid(bytes, fileStart, file.guid);
    writeUint24(bytes, fileStart + 20, fileSize);
    bytes.set(file.section, fileStart + 24);
  }
  return bytes;
}

function firmwareVolumeWithFile(fileGuid: string, section: Uint8Array) {
  return firmwareVolumeWithFiles([{ guid: fileGuid, section }]);
}

function freeformSection(guid: string, payload: Uint8Array) {
  const section = new Uint8Array(4 + 16 + payload.length);
  writeUint24(section, 0, section.length);
  section[3] = 0x18;
  writeGuid(section, 4, guid);
  section.set(payload, 20);
  return section;
}

function pe32Section(payload: Uint8Array) {
  const section = new Uint8Array(4 + payload.length);
  writeUint24(section, 0, section.length);
  section[3] = 0x10;
  section.set(payload, 4);
  return section;
}

function compressedSection(payload: Uint8Array) {
  const section = new Uint8Array(9 + payload.length);
  writeUint24(section, 0, section.length);
  section[3] = 0x01;
  new DataView(section.buffer).setUint32(4, payload.length, true);
  section[8] = 1;
  section.set(payload, 9);
  return section;
}

function guidedLzmaSection(payload: Uint8Array) {
  const definition = "EE4E5898-3914-4259-9D6E-DC7BD79403CF";
  const section = new Uint8Array(24 + payload.length);
  writeUint24(section, 0, section.length);
  section[3] = 0x02;
  writeGuid(section, 4, definition);
  new DataView(section.buffer).setUint16(20, 24, true);
  section.set(payload, 24);
  return section;
}

function setupVolume(hii: Uint8Array) {
  return firmwareVolumeWithFile(setupGuid, freeformSection(hiiGuid, hii));
}

function artifactContext(marker: number) {
  return firmwareVolumeWithFiles([
    {
      guid: setupGuid,
      section: freeformSection(hiiGuid, new Uint8Array([marker, 0x01])),
    },
    {
      guid: amitseGuid,
      section: pe32Section(new Uint8Array([marker, 0x02])),
    },
    {
      guid: setupDataGuid,
      section: freeformSection(setupDataGuid, new Uint8Array([marker, 0x03])),
    },
  ]);
}

function binaryFile(bytes: Uint8Array): File {
  return {
    name: "firmware.bin",
    arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
  } as File;
}

describe("Aptio IV extraction errors", () => {
  it("keeps a valid Setup context when another compressed FFS is damaged", async () => {
    const hii = new Uint8Array([0x42, 0x43]);
    const image = firmwareVolumeWithFiles([
      {
        guid: "11111111-2222-3333-4444-555555555555",
        section: compressedSection(new Uint8Array([0x00, 0x01])),
      },
      { guid: setupGuid, section: freeformSection(hiiGuid, hii) },
    ]);
    const artifacts = await extractAptioIvBytes(
      image,
      () => Promise.resolve("FormSet Guid: synthetic"),
      {},
      () =>
        Promise.reject(
          new FirmwareError("INVALID_COMPRESSED_SECTION", "Invalid stream."),
        ),
    );

    expect(artifacts.hii).toEqual(hii);
    expect(artifacts.artifactSets[0]?.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("nested section(s) could not be decoded"),
      ]),
    );
    expect(artifacts.provenance.artifacts).toHaveLength(1);
  });

  it("locates a failed guided decompression without losing another Setup context", async () => {
    const brokenGuid = "11111111-2222-3333-4444-555555555555";
    const hii = new Uint8Array([0x42, 0x43]);
    const image = firmwareVolumeWithFiles([
      { guid: brokenGuid, section: guidedLzmaSection(new Uint8Array([0, 1])) },
      { guid: setupGuid, section: freeformSection(hiiGuid, hii) },
    ]);
    const artifacts = await extractAptioIvBytes(
      image,
      () => Promise.resolve("FormSet Guid: synthetic"),
      {},
      () =>
        Promise.reject(
          new FirmwareError("INVALID_COMPRESSED_SECTION", "Invalid stream."),
        ),
    );

    expect(artifacts.hii).toEqual(hii);
    const warning = artifacts.artifactSets[0]?.warnings.join(" ") ?? "";
    expect(warning).toContain("EE4E5898-3914-4259-9D6E-DC7BD79403CF");
    expect(warning).toContain(`FFS ${brokenGuid}`);
    expect(warning).toContain("buffer 0, depth 0, offset 0x60, size 0x1A");
    expect(warning).toContain("Invalid stream.");
  });

  it("reports a typed parse failure when Setup FFS cannot be located", async () => {
    try {
      await extractAptioIvArtifacts(binaryFile(new Uint8Array(0x80)));
      throw new Error("Expected extraction to fail.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(FirmwareError);
      if (!(error instanceof FirmwareError)) {
        throw error;
      }
      expect(error.code).toBe("PARSE_FAILED");
      expect(error.message).toMatch(/Setup FFS/);
    }
  });

  it("retains the exact shared branch from a nested volume to Setup HII", async () => {
    const hii = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const innerVolume = setupVolume(hii);
    const wrapper = new Uint8Array(4 + innerVolume.length);
    writeUint24(wrapper, 0, wrapper.length);
    wrapper[3] = 0x03;
    wrapper.set(innerVolume, 4);
    const image = firmwareVolumeWithFile(
      "11111111-2222-3333-4444-555555555555",
      wrapper,
    );

    const artifacts = await extractAptioIvBytes(image, () =>
      Promise.resolve("FormSet Guid: synthetic"),
    );

    expect(artifacts.hii).toEqual(hii);
    expect(artifacts.extractionDepth).toBe(1);
    expect(artifacts.provenance.buffers).toHaveLength(2);
    expect(artifacts.provenance.buffers[1].parent).toMatchObject({
      parentBufferId: 0,
      sectionType: 0x03,
      compression: "none",
      ownerFile: {
        bufferId: 0,
        guid: "11111111-2222-3333-4444-555555555555",
      },
    });
    expect(artifacts.provenance.artifacts).toHaveLength(1);
    expect(artifacts.provenance.artifacts[0].kind).toBe("setup-hii");
    expect(artifacts.provenance.artifacts[0].bufferId).toBe(
      artifacts.provenance.buffers[1].id,
    );
    expect(artifacts.provenance.artifacts[0].sourceFile.guid).toBe(setupGuid);
  });

  it("keeps duplicated firmware slots coherent and selects them explicitly", async () => {
    const firstContext = artifactContext(0xa1);
    const secondContext = artifactContext(0xb2);
    const image = new Uint8Array(firstContext.length + secondContext.length);
    image.set(firstContext);
    image.set(secondContext, firstContext.length);
    const extractIfr = (hii: Uint8Array) =>
      Promise.resolve(`FormSet Guid: marker-${String(hii[0])}`);

    const first = await extractAptioIvBytes(image, extractIfr);

    expect(first.artifactSets).toHaveLength(2);
    expect(first.hii).toEqual(new Uint8Array([0xa1, 0x01]));
    expect(first.amitse).toEqual(new Uint8Array([0xa1, 0x02]));
    expect(first.setupData).toEqual(new Uint8Array([0xa1, 0x03]));
    expect(first.artifactSets[0]).toMatchObject({
      coherence: "same-firmware-volume",
      warnings: [],
    });
    expect(first.artifactSets[0].setupFile.volumeStart).toBe(
      first.artifactSets[0].amitseFile?.volumeStart,
    );
    expect(first.artifactSets[0].setupFile.volumeStart).toBe(
      first.artifactSets[0].setupDataFile?.volumeStart,
    );

    const secondId = first.artifactSets[1].id;
    const second = await extractAptioIvBytes(image, extractIfr, {
      artifactSetId: secondId,
    });
    expect(second.selectedArtifactSetId).toBe(secondId);
    expect(second.hii).toEqual(new Uint8Array([0xb2, 0x01]));
    expect(second.amitse).toEqual(new Uint8Array([0xb2, 0x02]));
    expect(second.setupData).toEqual(new Uint8Array([0xb2, 0x03]));
  });
});
