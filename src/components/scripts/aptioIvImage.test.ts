import { describe, expect, it } from "vitest";
import { inspectAptioIvImage } from "./aptioIvImage";

function binaryFile(bytes: Uint8Array, name: string): File {
  return {
    name,
    arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
  } as File;
}

function validFirmwareVolumeImage() {
  const bytes = new Uint8Array(0x100);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0x20, 0x80n, true);
  bytes.set([0x5f, 0x46, 0x56, 0x48], 0x28);
  view.setUint16(0x30, 0x38, true);

  let checksum = 0;
  for (let offset = 0; offset < 0x38; offset += 2) {
    checksum = (checksum + view.getUint16(offset, true)) & 0xffff;
  }
  view.setUint16(0x32, -checksum & 0xffff, true);

  bytes.set(
    [
      0xd7, 0x07, 0x94, 0x89, 0xfe, 0x99, 0xd8, 0x43, 0x9a, 0x21, 0x79, 0xec, 0x32,
      0x8c, 0xac, 0x21,
    ],
    0x40,
  );
  return bytes;
}

describe("Aptio IV image inspection", () => {
  it("detects a checksummed firmware volume and aligned Setup FFS GUID", async () => {
    const report = await inspectAptioIvImage(
      binaryFile(validFirmwareVolumeImage(), "firmware.bin"),
    );

    expect(report.firmwareVolumes).toEqual([0]);
    expect(report.setupFfs).toEqual([0x40]);
    expect(report.aptioIvCandidate).toBe(true);
  });

  it("rejects signature-shaped data with an invalid FV checksum", async () => {
    const bytes = validFirmwareVolumeImage();
    bytes[0] = 1;

    const report = await inspectAptioIvImage(binaryFile(bytes, "invalid.bin"));
    expect(report.firmwareVolumes).toEqual([]);
  });
});
