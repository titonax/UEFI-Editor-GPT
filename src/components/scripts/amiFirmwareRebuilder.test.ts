import { describe, expect, it } from "vitest";
import type { PopulatedFiles } from "../firmwareFiles";
import { condition, firmwareData } from "../../test/fixtures";
import type { AmiFirmwareArtifacts } from "./amiFirmwareExtractor";
import { amiModifiedBinName, buildAmiFirmwareImage } from "./amiFirmwareRebuilder";

function fixture() {
  const image = new Uint8Array(0x300);
  const setup = Uint8Array.of(0xaa, 0xaa, 0x29, 0x02, 0xbb, 0xbb);
  image.set(setup, 0x60);
  image[0x40 + 19] = 0x40;
  image[0x40 + 23] = 0x07;
  const artifacts: AmiFirmwareArtifacts = {
    hii: setup,
    ifrText: "FormSet Guid: synthetic",
    formPackageCount: 1,
    extractionDepth: 0,
    artifactSets: [
      {
        id: "context-1",
        label: "Context 1",
        coherence: "setup-only",
        setupFile: {
          bufferId: 0,
          guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
          volumeStart: 0,
          volumeEnd: 0x200,
          fileStart: 0x40,
          bodyStart: 0x58,
          end: 0xa0,
          headerSize: 24,
        },
        warnings: [],
      },
    ],
    selectedArtifactSetId: "context-1",
    provenance: {
      rootBufferId: 0,
      sourceSize: image.length,
      buffers: [{ id: 0, bytes: image, depth: 0 }],
      artifacts: [
        {
          kind: "setup-hii",
          bufferId: 0,
          payloadStart: 0x60,
          payloadEnd: 0x66,
          sourceFile: {
            bufferId: 0,
            guid: "899407D7-99FE-43D8-9A21-79EC328CAC21",
            volumeStart: 0,
            volumeEnd: 0x200,
            fileStart: 0x40,
            bodyStart: 0x58,
            end: 0xa0,
            headerSize: 24,
          },
        },
      ],
    },
  };
  const binary = (bytes: Uint8Array, name: string) => new File([bytes], name);
  const files: PopulatedFiles = {
    setupSctContainer: {
      file: binary(setup, "setup.bin"),
      textContent: "AAAA2902BBBB",
      isWrongFile: false,
    },
    setupTxtContainer: {
      file: new File(["IFR"], "setup.txt"),
      textContent: "IFR",
      isWrongFile: false,
    },
    amitseSctContainer: {
      file: binary(new Uint8Array(), "amitse.bin"),
      textContent: "",
      isWrongFile: false,
    },
    setupdataBinContainer: {
      file: binary(new Uint8Array(), "setupdata.bin"),
      textContent: "",
      isWrongFile: false,
    },
    firmwareSource: { fileName: "board.F13d", artifacts },
  };
  return { artifacts, files };
}

describe("buildAmiFirmwareImage", () => {
  it("builds, re-opens and returns a complete same-size image", async () => {
    const { artifacts, files } = fixture();
    const result = await buildAmiFirmwareImage(
      firmwareData({ suppressions: [condition({ active: false })] }),
      files,
      (image) =>
        Promise.resolve({
          ...artifacts,
          hii: image.slice(0x60, 0x66),
        }),
    );

    expect(result.fileName).toBe("board-modified.bin");
    expect(result.image).toHaveLength(0x300);
    expect([...result.image.slice(0x60, 0x66)]).toEqual([
      0x29, 0x02, 0xaa, 0xaa, 0xbb, 0xbb,
    ]);
    expect(result.changeLog).toContain("Unsuppressed 0x0");
  });

  it("rejects root edits on a source without separate root acceptance", async () => {
    const { files } = fixture();
    await expect(
      buildAmiFirmwareImage(
        firmwareData({
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
        }),
        files,
      ),
    ).rejects.toThrow(/Root visibility reconstruction awaits real-image acceptance/);
  });

  it("rejects a changed unedited companion after independent reread", async () => {
    const { artifacts, files } = fixture();
    artifacts.amitse = Uint8Array.of(1);
    await expect(
      buildAmiFirmwareImage(
        firmwareData({ suppressions: [condition({ active: false })] }),
        files,
        (image) =>
          Promise.resolve({
            ...artifacts,
            hii: image.slice(0x60, 0x66),
            amitse: Uint8Array.of(2),
          }),
      ),
    ).rejects.toThrow("AMITSE did not match after re-opening");
  });

  it("always emits a bin name", () => {
    expect(amiModifiedBinName("dump.bin")).toBe("dump-modified.bin");
    expect(amiModifiedBinName("board.rom")).toBe("board-modified.bin");
    expect(amiModifiedBinName("firmware")).toBe("firmware-modified.bin");
  });

  it("rejects a stale source hash before compressed reconstruction", async () => {
    const { artifacts, files } = fixture();
    artifacts.provenance.buffers.push({
      id: 1,
      bytes: new Uint8Array(0x100),
      depth: 1,
      parent: {
        parentBufferId: 0,
        sectionStart: 0x58,
        sectionEnd: 0xa0,
        sectionHeaderSize: 4,
        sectionType: 2,
        payloadStart: 0x70,
        payloadEnd: 0xa0,
        compression: "lzma",
      },
    });
    artifacts.provenance.artifacts[0].bufferId = 1;
    if (!files.firmwareSource) throw new Error("Test firmware session is missing.");
    files.firmwareSource.sourceSha256 = "0".repeat(64);
    await expect(buildAmiFirmwareImage(firmwareData(), files)).rejects.toThrow(
      /source hash changed/,
    );
  });

  it("rejects a compressed image without exact real-image acceptance", async () => {
    const { artifacts, files } = fixture();
    artifacts.provenance.buffers.push({
      id: 1,
      bytes: new Uint8Array(0x100),
      depth: 1,
      parent: {
        parentBufferId: 0,
        sectionStart: 0x58,
        sectionEnd: 0xa0,
        sectionHeaderSize: 4,
        sectionType: 2,
        payloadStart: 0x70,
        payloadEnd: 0xa0,
        compression: "lzma",
      },
    });
    artifacts.provenance.artifacts[0].bufferId = 1;
    await expect(
      buildAmiFirmwareImage(
        firmwareData({ suppressions: [condition({ active: false })] }),
        files,
      ),
    ).rejects.toThrow(/awaiting real-image acceptance/);
  });
});
